const jwt = require('jsonwebtoken');
const config = require('./environment');
const { AuthenticationError } = require('../utils/errors');

class JWTConfig {
  constructor() {
    this.secret = config.jwt.secret;
    this.accessExpiry = config.jwt.accessExpiry;
    this.refreshExpiry = config.jwt.refreshExpiry;
    this.algorithm = 'HS256';
  }

  /**
   * Generate JWT token with payload
   */
  generateToken(payload, options = {}) {
    const defaultOptions = {
      algorithm: this.algorithm,
      issuer: 'auth-service',
      audience: 'faq-platform'
    };

    return jwt.sign(payload, this.secret, { ...defaultOptions, ...options });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token, options = {}) {
    try {
      const defaultOptions = {
        algorithms: [this.algorithm],
        issuer: 'auth-service',
        audience: 'faq-platform'
      };

      return jwt.verify(token, this.secret, { ...defaultOptions, ...options });
    } catch (error) {
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
   * Decode token without verification (for debugging)
   */
  decodeToken(token) {
    return jwt.decode(token, { complete: true });
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
}

module.exports = new JWTConfig();