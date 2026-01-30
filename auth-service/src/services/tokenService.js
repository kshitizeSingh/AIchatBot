const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const jwtConfig = require('../config/jwt');
const config = require('../config/environment');
const cryptoService = require('./cryptoService');
const { AuthenticationError } = require('../utils/errors');
const { TOKEN_TYPES } = require('../utils/constants');
const logger = require('../utils/logger');

class TokenService {
  constructor() {
    this.jwtSecret = config.jwt.secret;
    this.accessExpiry = config.jwt.accessExpiry;
    this.refreshExpiry = config.jwt.refreshExpiry;
    this.algorithm = 'HS256';
    this.issuer = 'auth-service';
    this.audience = 'faq-platform';
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(userId, orgId = null, additionalClaims = {}) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        user_id: userId,
        type: TOKEN_TYPES.ACCESS,
        iat: now,
        exp: now + this.accessExpiry,
        iss: this.issuer,
        aud: this.audience,
        jti: uuid(), // JWT ID for tracking
        ...additionalClaims
      };

      if (orgId) {
        payload.org_id = orgId;
      }

      const token = jwt.sign(payload, this.jwtSecret, {
        algorithm: this.algorithm
      });

      logger.debug('Access token generated', { userId, orgId, expiresIn: this.accessExpiry });
      return token;
    } catch (error) {
      logger.error('Failed to generate access token:', error.message);
      throw new AuthenticationError('TOKEN_GENERATION_FAILED', 'Failed to generate access token');
    }
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(userId, orgId, additionalClaims = {}) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const tokenId = uuid();
      
      const payload = {
        user_id: userId,
        org_id: orgId,
        type: TOKEN_TYPES.REFRESH,
        token_id: tokenId,
        iat: now,
        exp: now + this.refreshExpiry,
        iss: this.issuer,
        aud: this.audience,
        jti: uuid(),
        ...additionalClaims
      };

      const token = jwt.sign(payload, this.jwtSecret, {
        algorithm: this.algorithm
      });

      logger.debug('Refresh token generated', { userId, orgId, tokenId, expiresIn: this.refreshExpiry });
      
      return {
        token,
        tokenId,
        expiresAt: new Date((now + this.refreshExpiry) * 1000)
      };
    } catch (error) {
      logger.error('Failed to generate refresh token:', error.message);
      throw new AuthenticationError('TOKEN_GENERATION_FAILED', 'Failed to generate refresh token');
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: [this.algorithm],
        issuer: this.issuer,
        audience: this.audience
      });

      logger.debug('Token verified successfully', { userId: payload.user_id, type: payload.type });
      return payload;
    } catch (error) {
      logger.security('Token verification failed:', { error: error.name, message: error.message });
      
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('EXPIRED_TOKEN', 'Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('INVALID_TOKEN', 'Token is invalid');
      } else if (error.name === 'NotBeforeError') {
        throw new AuthenticationError('TOKEN_NOT_ACTIVE', 'Token is not active yet');
      }
      
      throw new AuthenticationError('TOKEN_VERIFICATION_FAILED', error.message);
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      const payload = this.verifyToken(token);

      if (payload.type !== TOKEN_TYPES.REFRESH) {
        throw new AuthenticationError('INVALID_TOKEN_TYPE', 'Not a refresh token');
      }

      if (!payload.token_id) {
        throw new AuthenticationError('INVALID_TOKEN', 'Refresh token missing token ID');
      }

      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('REFRESH_TOKEN_VERIFICATION_FAILED', error.message);
    }
  }

  /**
   * Decode token without verification (for debugging/inspection)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.warn('Failed to decode token:', error.message);
      return null;
    }
  }

  /**
   * Get token expiry time
   */
  getTokenExpiry(token) {
    const decoded = this.decodeToken(token);
    return decoded?.payload?.exp ? new Date(decoded.payload.exp * 1000) : null;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token) {
    const expiry = this.getTokenExpiry(token);
    return expiry ? expiry < new Date() : true;
  }

  /**
   * Extract user ID from token without full verification
   */
  extractUserId(token) {
    const decoded = this.decodeToken(token);
    return decoded?.payload?.user_id || null;
  }

  /**
   * Extract organization ID from token without full verification
   */
  extractOrgId(token) {
    const decoded = this.decodeToken(token);
    return decoded?.payload?.org_id || null;
  }

  /**
   * Generate password reset token
   */
  generatePasswordResetToken(userId, email) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        user_id: userId,
        email,
        type: TOKEN_TYPES.RESET,
        iat: now,
        exp: now + 3600, // 1 hour expiry
        iss: this.issuer,
        aud: this.audience,
        jti: uuid()
      };

      const token = jwt.sign(payload, this.jwtSecret, {
        algorithm: this.algorithm
      });

      logger.audit('Password reset token generated', { userId, email });
      return token;
    } catch (error) {
      logger.error('Failed to generate password reset token:', error.message);
      throw new AuthenticationError('TOKEN_GENERATION_FAILED', 'Failed to generate password reset token');
    }
  }

  /**
   * Verify password reset token
   */
  verifyPasswordResetToken(token) {
    try {
      const payload = this.verifyToken(token);

      if (payload.type !== TOKEN_TYPES.RESET) {
        throw new AuthenticationError('INVALID_TOKEN_TYPE', 'Not a password reset token');
      }

      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('RESET_TOKEN_VERIFICATION_FAILED', error.message);
    }
  }

  /**
   * Generate email verification token
   */
  generateEmailVerificationToken(userId, email) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        user_id: userId,
        email,
        type: TOKEN_TYPES.VERIFICATION,
        iat: now,
        exp: now + 86400, // 24 hours expiry
        iss: this.issuer,
        aud: this.audience,
        jti: uuid()
      };

      const token = jwt.sign(payload, this.jwtSecret, {
        algorithm: this.algorithm
      });

      logger.audit('Email verification token generated', { userId, email });
      return token;
    } catch (error) {
      logger.error('Failed to generate email verification token:', error.message);
      throw new AuthenticationError('TOKEN_GENERATION_FAILED', 'Failed to generate email verification token');
    }
  }

  /**
   * Verify email verification token
   */
  verifyEmailVerificationToken(token) {
    try {
      const payload = this.verifyToken(token);

      if (payload.type !== TOKEN_TYPES.VERIFICATION) {
        throw new AuthenticationError('INVALID_TOKEN_TYPE', 'Not an email verification token');
      }

      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('VERIFICATION_TOKEN_VERIFICATION_FAILED', error.message);
    }
  }
}

module.exports = new TokenService();