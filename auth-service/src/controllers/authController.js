const authService = require('../services/authService');
const { successResponse, errorResponse } = require('../utils/responses');
const { validateLogin, validateSignup, validateRefreshToken, validatePasswordReset } = require('../validators/authValidator');
const logger = require('../utils/logger');
const { AUDIT_ACTIONS } = require('../utils/constants');

/**
 * Authentication Controller
 * Handles all authentication-related endpoints including login, logout, signup, token refresh, and password management
 */
class AuthController {
  /**
   * POST /v1/auth/login
   * Authenticate user with email and password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async login(req, res, next) {
    try {
      logger.debug('Login endpoint called', { 
        email: req.body.email,
        orgId: req.org_id,
        ip: req.ip 
      });

      // Validate input
      const { error, value } = validateLogin(req.body);
      if (error) {
        logger.warn('Login validation failed', { 
          error: error.details[0].message,
          email: req.body.email 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Extract client information for security logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      // Call authentication service
      const result = await authService.login(
        value.email,
        value.password,
        req.org_id,
        clientInfo
      );

      logger.info('Login successful', { 
        userId: result.user.user_id,
        email: result.user.email,
        orgId: req.org_id 
      });

      return res.status(200).json(
        successResponse(result, 'User logged in successfully')
      );
    } catch (error) {
      logger.error('Login endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/auth/signup
   * Register a new user account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async signup(req, res, next) {
    try {
      logger.debug('Signup endpoint called', { 
        email: req.body.email,
        orgId: req.org_id 
      });

      // Validate input
      const { error, value } = validateSignup(req.body);
      if (error) {
        logger.warn('Signup validation failed', { 
          error: error.details[0].message,
          email: req.body.email 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Call authentication service
      const result = await authService.signup(
        value.email,
        value.password,
        req.org_id,
        {
          role: value.role || 'user',
          created_by: req.user?.user_id || 'self-registration'
        }
      );

      logger.info('Signup successful', { 
        userId: result.user_id,
        email: result.email,
        orgId: req.org_id 
      });

      return res.status(201).json(
        successResponse(result, 'User registered successfully')
      );
    } catch (error) {
      logger.error('Signup endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/auth/refresh
   * Refresh access token using refresh token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async refresh(req, res, next) {
    try {
      logger.debug('Token refresh endpoint called', { orgId: req.org_id });

      // Validate input
      const { error, value } = validateRefreshToken(req.body);
      if (error) {
        logger.warn('Refresh token validation failed', { 
          error: error.details[0].message 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Extract client information for security logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      // Call authentication service
      const result = await authService.refreshAccessToken(
        value.refresh_token,
        req.org_id,
        clientInfo
      );

      logger.info('Token refresh successful', { orgId: req.org_id });

      return res.status(200).json(
        successResponse(result, 'Token refreshed successfully')
      );
    } catch (error) {
      logger.error('Token refresh endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/auth/logout
   * Logout user and revoke refresh token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async logout(req, res, next) {
    try {
      logger.debug('Logout endpoint called', { userId: req.user.user_id });

      // Validate refresh token if provided
      if (req.body.refresh_token) {
        const { error } = validateRefreshToken(req.body);
        if (error) {
          logger.warn('Logout refresh token validation failed', { 
            error: error.details[0].message,
            userId: req.user.user_id 
          });
          return res.status(400).json(
            errorResponse('VALIDATION_ERROR', error.details[0].message, {
              field: error.details[0].path[0]
            })
          );
        }
      }

      // Extract client information for security logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      // Call authentication service
      await authService.logout(
        req.user.user_id,
        req.body.refresh_token,
        clientInfo
      );

      logger.info('Logout successful', { userId: req.user.user_id });

      return res.status(200).json(
        successResponse({}, 'Logged out successfully')
      );
    } catch (error) {
      logger.error('Logout endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/auth/revoke-all-sessions
   * Revoke all user sessions (security action)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async revokeAllSessions(req, res, next) {
    try {
      logger.debug('Revoke all sessions endpoint called', { 
        userId: req.user.user_id 
      });

      // Extract client information for security logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      // Call authentication service
      await authService.revokeAllSessions(
        req.user.user_id,
        req.user.org_id,
        clientInfo
      );

      logger.info('All sessions revoked successfully', { 
        userId: req.user.user_id 
      });

      return res.status(200).json(
        successResponse({}, 'All sessions revoked successfully')
      );
    } catch (error) {
      logger.error('Revoke all sessions endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/auth/password/reset-request
   * Request password reset (send reset email)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async requestPasswordReset(req, res, next) {
    try {
      logger.debug('Password reset request endpoint called', { 
        email: req.body.email,
        orgId: req.org_id 
      });

      // Validate input
      const { error, value } = validatePasswordReset(req.body);
      if (error) {
        logger.warn('Password reset validation failed', { 
          error: error.details[0].message,
          email: req.body.email 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // TODO: Implement password reset request logic
      // This would typically involve:
      // 1. Generate secure reset token
      // 2. Store token with expiration
      // 3. Send reset email
      
      logger.info('Password reset requested', { 
        email: value.email,
        orgId: req.org_id 
      });

      // Always return success to prevent email enumeration
      return res.status(200).json(
        successResponse(
          {}, 
          'If the email exists, a password reset link has been sent'
        )
      );
    } catch (error) {
      logger.error('Password reset request endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/auth/validate
   * Validate current access token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async validateToken(req, res, next) {
    try {
      logger.debug('Token validation endpoint called', { 
        userId: req.user.user_id 
      });

      // If we reach here, the JWT middleware has already validated the token
      const tokenInfo = {
        valid: true,
        user: {
          user_id: req.user.user_id,
          org_id: req.user.org_id,
          role: req.user.role
        },
        expires_at: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null
      };

      return res.status(200).json(
        successResponse(tokenInfo, 'Token is valid')
      );
    } catch (error) {
      logger.error('Token validation endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/auth/me
   * Get current user information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getCurrentUser(req, res, next) {
    try {
      logger.debug('Get current user endpoint called', { 
        userId: req.user.user_id 
      });

      // Return user information from JWT payload
      const userInfo = {
        user_id: req.user.user_id,
        org_id: req.user.org_id,
        role: req.user.role,
        email: req.user.email
      };

      return res.status(200).json(
        successResponse(userInfo, 'User information retrieved successfully')
      );
    } catch (error) {
      logger.error('Get current user endpoint error:', error);
      next(error);
    }
  }
}

module.exports = new AuthController();