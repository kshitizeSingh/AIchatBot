const jwt = require('jsonwebtoken');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retryAuthService } = require('../utils/retry');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

/**
 * Circuit breaker implementation for Auth Service calls
 * Prevents cascade failures when Auth Service is unavailable
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || config.AUTH_CB_FAILURE_THRESHOLD;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs || config.AUTH_CB_RECOVERY_MS;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @returns {Promise} Function result
   */
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - Auth Service unavailable');
      }
      // Move to HALF_OPEN state for recovery probe
      this.state = 'HALF_OPEN';
      logger.logCircuitBreakerState('auth-service', 'HALF_OPEN', {
        failureCount: this.failureCount
      });
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

  /**
   * Handle successful call
   */
  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.logCircuitBreakerState('auth-service', 'CLOSED', {
        message: 'Recovery successful'
      });
    }
  }

  /**
   * Handle failed call
   * @param {Error} error - Error from failed call
   */
  onFailure(error) {
    // Only count infrastructure failures, not auth rejections
    const statusCode = error.response?.status;
    const isInfraFailure = !statusCode || statusCode >= 500;
    
    if (isInfraFailure) {
      this.failureCount++;
      
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = Date.now() + this.recoveryTimeoutMs;
        
        logger.logCircuitBreakerState('auth-service', 'OPEN', {
          failureCount: this.failureCount,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
        });
      }
    }
  }
}

// Global circuit breaker instance
const authServiceCircuitBreaker = new CircuitBreaker();

/**
 * Validate JWT with Auth Service
 * @param {string} token - JWT token
 * @returns {Promise<Object>} User data from Auth Service
 */
async function validateJWTWithAuthService(token) {
  return retryAuthService(async () => {
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
  }, {
    context: { operation: 'validate-jwt' }
  });
}

/**
 * Validate HMAC with Auth Service
 * @param {Object} hmacData - HMAC validation data
 * @returns {Promise<Object>} Organization data from Auth Service
 */
async function validateHMACWithAuthService(hmacData) {
  return authServiceCircuitBreaker.execute(async () => {
    return retryAuthService(async () => {
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
    }, {
      context: { operation: 'validate-hmac' }
    });
  });
}

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: |
 *         JWT access token for user authentication and authorization.
 *         
 *         The token must be obtained from the Auth Service login endpoint
 *         and contains the user's identity and organization membership.
 *         
 *         **Algorithm:** HS256  
 *         **Claims:** `user_id`, `type: "access"`  
 *         **Expiration:** Configurable (typically 1 hour)
 *         
 *         Example: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
 *     
 *     HMACHeaders:
 *       type: object
 *       description: |
 *         HMAC authentication requires three additional headers for request integrity verification.
 *         The signature is computed using HMAC-SHA256 with the organization's secret key.
 *         
 *         **Signature Computation:**
 *         ```
 *         payload = method + path + JSON.stringify(body) + timestamp
 *         signature = HMAC-SHA256(payload, org_secret_key)
 *         ```
 *         
 *         **Timestamp Window:** ±5 minutes from server time
 *       properties:
 *         X-Client-ID:
 *           type: string
 *           pattern: '^pk_[a-f0-9]{32}$'
 *           description: Organization's public client ID
 *           example: 'pk_7f83efb20c8e4b14bd6a239c2f997f41'
 *         X-Timestamp:
 *           type: string
 *           pattern: '^[0-9]{13}$'
 *           description: Unix timestamp in milliseconds
 *           example: '1738459200000'
 *         X-Signature:
 *           type: string
 *           pattern: '^[a-f0-9]{64}$'
 *           description: HMAC-SHA256 hex digest
 *           example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
 *   
 *   responses:
 *     AuthenticationError:
 *       description: Authentication failed
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *           examples:
 *             missing_auth_header:
 *               summary: Missing Authorization header
 *               value:
 *                 code: 'MISSING_AUTH_HEADER'
 *                 message: 'Missing or invalid Authorization header'
 *             missing_hmac_headers:
 *               summary: Missing HMAC headers
 *               value:
 *                 code: 'MISSING_HMAC_HEADERS'
 *                 message: 'Missing HMAC headers'
 *             expired_token:
 *               summary: JWT token expired
 *               value:
 *                 code: 'EXPIRED_TOKEN'
 *                 message: 'JWT token has expired'
 *             invalid_token:
 *               summary: Invalid JWT token
 *               value:
 *                 code: 'INVALID_TOKEN'
 *                 message: 'JWT signature invalid or malformed'
 *             hmac_timestamp_expired:
 *               summary: HMAC timestamp expired
 *               value:
 *                 code: 'HMAC_TIMESTAMP_EXPIRED'
 *                 message: 'Request timestamp is too old or invalid'
 *             invalid_signature:
 *               summary: Invalid HMAC signature
 *               value:
 *                 code: 'INVALID_SIGNATURE'
 *                 message: 'HMAC signature verification failed'
 *             org_mismatch:
 *               summary: Organization mismatch
 *               value:
 *                 code: 'ORG_MISMATCH'
 *                 message: 'Organization mismatch detected'
 *             auth_service_unavailable:
 *               summary: Auth service unavailable
 *               value:
 *                 code: 'AUTH_SERVICE_UNAVAILABLE'
 *                 message: 'Authentication service is temporarily unavailable'
 * 
 * Authentication middleware with hybrid JWT + HMAC validation
 * Implements the pattern specified in the documentation:
 * - Local JWT signature verification (fast)
 * - Parallel remote validation calls to Auth Service
 * - ORG_MISMATCH cross-check
 * - Circuit breaker for resilience
 */
async function requireAuth(req, res, next) {
  try {
    // ── Step 1: Header presence ──────────────────────────────────────────────
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

    // ── Step 2: Timestamp freshness (local check) ────────────────────────────
    const reqTime = parseInt(timestamp, 10);
    if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > config.HMAC_TIMESTAMP_TOLERANCE_MS) {
      throw new AuthenticationError('Request timestamp is too old or invalid', 'HMAC_TIMESTAMP_EXPIRED');
    }

    // ── Step 3: Local JWT signature verification (fast, no network) ──────────
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

    // ── Step 4: Remote validations IN PARALLEL ───────────────────────────────
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

    // ── Step 5: ORG_MISMATCH cross-check ─────────────────────────────────────
    // JWT says which org the USER belongs to.
    // HMAC says which org sent THIS REQUEST.
    // They must match — a mismatch means a cross-tenant access attempt.
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

    // ── Step 6: Inject context ────────────────────────────────────────────────
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
    // Log authentication failure
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

/**
 * @swagger
 * components:
 *   schemas:
 *     UserRole:
 *       type: string
 *       enum: [owner, admin, user]
 *       description: |
 *         User role within the organization:
 *         - **owner**: Full organization access, can manage all resources
 *         - **admin**: Administrative access, can manage users and content
 *         - **user**: Standard access, can use chat and manage own conversations
 *     
 *     AuthContext:
 *       type: object
 *       description: Authentication context injected into request
 *       properties:
 *         user:
 *           type: object
 *           properties:
 *             user_id:
 *               type: string
 *               format: uuid
 *               description: Unique user identifier
 *             org_id:
 *               type: string
 *               format: uuid
 *               description: User's organization identifier
 *             role:
 *               $ref: '#/components/schemas/UserRole'
 *         org:
 *           type: object
 *           properties:
 *             org_id:
 *               type: string
 *               format: uuid
 *               description: Organization identifier
 *             org_name:
 *               type: string
 *               description: Organization display name
 * 
 * Role-based authorization middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 * @returns {Function} Middleware function
 */
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

/**
 * @swagger
 * components:
 *   responses:
 *     AuthorizationError:
 *       description: Authorization failed - insufficient permissions
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *           examples:
 *             insufficient_permissions:
 *               summary: Insufficient role permissions
 *               value:
 *                 code: 'INSUFFICIENT_PERMISSIONS'
 *                 message: 'Access denied. Required roles: admin, owner'
 *             resource_access_denied:
 *               summary: Resource access denied
 *               value:
 *                 code: 'RESOURCE_ACCESS_DENIED'
 *                 message: 'Access denied. You can only access your own resources.'
 * 
 * Resource ownership authorization middleware
 * Ensures users can only access their own resources
 * @param {string} userIdField - Field name containing the user ID (default: 'user_id')
 * @returns {Function} Middleware function
 */
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