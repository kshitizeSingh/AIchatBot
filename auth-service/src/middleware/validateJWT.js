const tokenService = require('../services/tokenService');
const userRepository = require('../persistence/userRepository');
const { errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');

/**
 * JWT validation middleware
 * Validates Bearer token and injects user information into request
 */
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('JWT validation failed: Missing or invalid Authorization header', {
        authHeader: !!authHeader,
        startsWithBearer: authHeader ? authHeader.startsWith('Bearer ') : false,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(401).json(
        errorResponse('MISSING_AUTH_HEADER', 'Authorization header is missing or invalid. Expected: Bearer <token>')
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const payload = tokenService.verifyToken(token);

    // Ensure it's an access token
    if (payload.type !== 'access') {
      logger.warn('JWT validation failed: Invalid token type', {
        tokenType: payload.type,
        userId: payload.user_id,
        ip: req.ip
      });
      
      return res.status(401).json(
        errorResponse('INVALID_TOKEN_TYPE', 'Invalid token type. Access token required.')
      );
    }

    // Fetch user details (org_id should be set by HMAC middleware)
    const user = await userRepository.findById(payload.user_id, req.org_id);

    if (!user) {
      logger.warn('JWT validation failed: User not found', {
        userId: payload.user_id,
        orgId: req.org_id,
        ip: req.ip
      });
      
      return res.status(401).json(
        errorResponse('INVALID_TOKEN', 'User not found or token invalid')
      );
    }

    // Check if user is active
    if (!user.is_active) {
      logger.warn('JWT validation failed: User account inactive', {
        userId: user.id,
        email: user.email,
        orgId: req.org_id,
        ip: req.ip
      });
      
      return res.status(401).json(
        errorResponse('ACCOUNT_INACTIVE', 'User account has been deactivated')
      );
    }

    // Inject user info into request
    req.user = {
      user_id: payload.user_id,
      org_id: user.org_id,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    };

    logger.debug('JWT validation successful', {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.org_id,
      ip: req.ip,
      path: req.path
    });

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      logger.warn('JWT validation failed: Token expired', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(401).json(
        errorResponse('EXPIRED_TOKEN', 'Access token has expired')
      );
    }
    
    if (error.name === 'JsonWebTokenError') {
      logger.warn('JWT validation failed: Invalid token', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(401).json(
        errorResponse('INVALID_TOKEN', 'Token signature is invalid')
      );
    }

    logger.error('JWT validation error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path
    });
    
    return res.status(401).json(
      errorResponse(error.code || 'INVALID_TOKEN', error.message || 'Token validation failed')
    );
  }
};