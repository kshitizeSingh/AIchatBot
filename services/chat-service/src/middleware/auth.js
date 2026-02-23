const jwt = require('jsonwebtoken');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retryAuthService } = require('../utils/retry');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

// Circuit breaker implementation for Auth Service calls
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || config.AUTH_CB_FAILURE_THRESHOLD;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs || config.AUTH_CB_RECOVERY_MS;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - Auth Service unavailable');
      }
      this.state = 'HALF_OPEN';
      logger.debug('Circuit breaker state changed to HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.debug('Circuit breaker recovered - state changed to CLOSED');
    }
  }

  onFailure(error) {
    const statusCode = error.response?.status;
    const isInfraFailure = !statusCode || statusCode >= 500;
    
    if (isInfraFailure) {
      this.failureCount++;
      
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = Date.now() + this.recoveryTimeoutMs;
        
        logger.error('Circuit breaker opened', {
          failureCount: this.failureCount,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
        });
      }
    }
  }
}

// Global circuit breaker instance
const authServiceCircuitBreaker = new CircuitBreaker();

// Validate JWT with Auth Service
async function validateJWTWithAuthService(token) {
  const response = await axios.post(
    `${config.AUTH_SERVICE_URL}/v1/auth/validate-jwt`,
    {},
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: config.AUTH_HMAC_TIMEOUT_MS
    }
  );
  
  if (!response.data.valid) {
    throw new AuthenticationError(response.data.error || 'JWT validation failed');
  }
  
  return response.data.user;
}

// Validate HMAC with Auth Service
async function validateHMACWithAuthService(hmacData) {
  return authServiceCircuitBreaker.execute(async () => {
    const response = await axios.post(
      `${config.AUTH_SERVICE_URL}/v1/auth/validate-hmac`,
      hmacData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: config.AUTH_HMAC_TIMEOUT_MS
      }
    );
    
    if (!response.data.valid) {
      throw new AuthenticationError(response.data.error || 'HMAC validation failed', 'INVALID_SIGNATURE');
    }
    
    return {
      org_id: response.data.org_id,
      org_name: response.data.org_name
    };
  });
}

// Authentication middleware with hybrid JWT + HMAC validation
async function requireAuth(req, res, next) {
  try {
    // Step 1: Header presence
    const authHeader = req.headers.authorization || '';
    const clientId = req.headers['x-client-id'];
    const timestamp = req.headers['x-timestamp'];
    const signature = req.headers['x-signature'];

    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header', 'MISSING_AUTH_HEADER');
    }

    if (!clientId || !timestamp || !signature) {
      throw new AuthenticationError('Missing HMAC headers', 'MISSING_HMAC_HEADERS');
    }

    const rawToken = authHeader.substring(7);

    // Step 2: Timestamp freshness (local check)
    const reqTime = parseInt(timestamp, 10);
    if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > config.HMAC_TIMESTAMP_TOLERANCE_MS) {
      throw new AuthenticationError('Request timestamp is too old or invalid', 'HMAC_TIMESTAMP_EXPIRED');
    }

    // Step 3: Local JWT signature verification (fast, no network)
    let localPayload;
    try {
      localPayload = jwt.verify(rawToken, config.JWT_SECRET, { algorithms: ['HS256'] });
      if (localPayload.type !== 'access') {
        throw new AuthenticationError('Invalid token type', 'INVALID_TOKEN');
      }
    } catch (err) {
      const code = err.name === 'TokenExpiredError' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN';
      throw new AuthenticationError(err.message, code);
    }

    // Step 4: Remote validations IN PARALLEL
    const hmacData = {
      client_id: clientId,
      signature,
      timestamp,
      payload: {
        method: req.method,
        path: req.path,
        body: req.body
      }
    };

    logger.debug('Starting parallel auth validation', {
      userId: localPayload.user_id,
      clientId,
      timestamp
    });

    const [jwtUser, hmacOrg] = await Promise.all([
      validateJWTWithAuthService(rawToken),
      validateHMACWithAuthService(hmacData)
    ]);

    // Step 5: ORG_MISMATCH cross-check
    if (jwtUser.org_id !== hmacOrg.org_id) {
      logger.warn('ORG_MISMATCH detected - cross-tenant access attempt', {
        userId: jwtUser.user_id,
        jwtOrgId: jwtUser.org_id,
        hmacOrgId: hmacOrg.org_id,
        clientId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      throw new AuthorizationError('Organization mismatch detected', 'ORG_MISMATCH');
    }

    // Step 6: Inject context
    req.user = {
      user_id: jwtUser.user_id,
      org_id: hmacOrg.org_id,
      role: jwtUser.role
    };
    
    req.org = {
      org_id: hmacOrg.org_id,
      org_name: hmacOrg.org_name
    };

    logger.debug('Authentication successful', {
      userId: req.user.user_id,
      orgId: req.org.org_id,
      role: req.user.role
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    
    next(error);
  }
}

// Role-based authorization middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        'INSUFFICIENT_PERMISSIONS'
      );
    }
    
    next();
  };
}

// Resource ownership authorization middleware
function requireOwnership(userIdField = 'user_id') {
  return (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }
    
    // Allow admin and owner roles to access any resource in their org
    if (['admin', 'owner'].includes(req.user.role)) {
      return next();
    }
    
    // For regular users, check ownership
    const resourceUserId = req.params[userIdField] || req.body[userIdField] || req.query[userIdField];
    
    if (resourceUserId && resourceUserId !== req.user.user_id) {
      throw new AuthorizationError(
        'Access denied. You can only access your own resources.',
        'RESOURCE_ACCESS_DENIED'
      );
    }
    
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireOwnership,
  CircuitBreaker,
  authServiceCircuitBreaker
};