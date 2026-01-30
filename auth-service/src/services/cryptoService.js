const crypto = require('crypto');
const bcrypt = require('bcrypt');
const config = require('../config/environment');
const securityConfig = require('../config/security');
const { ValidationError } = require('../utils/errors');
const { PASSWORD_REQUIREMENTS } = require('../utils/constants');
const logger = require('../utils/logger');

class CryptoService {
  constructor() {
    this.bcryptRounds = config.security.bcryptRounds;
    this.passwordRules = securityConfig.getPasswordRules();
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password) {
    try {
      // Validate password before hashing
      this.validatePassword(password);
      
      const salt = await bcrypt.genSalt(this.bcryptRounds);
      const hash = await bcrypt.hash(password, salt);
      
      logger.debug('Password hashed successfully');
      return hash;
    } catch (error) {
      logger.error('Password hashing failed:', error.message);
      throw error;
    }
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password, hash) {
    try {
      const isValid = await bcrypt.compare(password, hash);
      logger.debug(`Password comparison result: ${isValid}`);
      return isValid;
    } catch (error) {
      logger.error('Password comparison failed:', error.message);
      throw new ValidationError('PASSWORD_COMPARISON_FAILED', 'Failed to verify password');
    }
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    const errors = [];
    const rules = this.passwordRules;

    // Check length
    if (password.length < rules.minLength) {
      errors.push(`Password must be at least ${rules.minLength} characters`);
    }

    if (password.length > rules.maxLength) {
      errors.push(`Password must not exceed ${rules.maxLength} characters`);
    }

    // Check character requirements
    if (rules.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (rules.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (rules.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (rules.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check against blocked passwords
    const lowerPassword = password.toLowerCase();
    if (rules.blockedPasswords.some(blocked => lowerPassword.includes(blocked.toLowerCase()))) {
      errors.push('Password contains common patterns and is not secure');
    }

    // Check for common patterns
    if (/^(.)\1{2,}/.test(password)) {
      errors.push('Password cannot contain repeated characters');
    }

    if (/123456|abcdef|qwerty/i.test(password)) {
      errors.push('Password cannot contain sequential characters');
    }

    if (errors.length > 0) {
      throw new ValidationError('WEAK_PASSWORD', 'Password does not meet security requirements', {
        violations: errors
      });
    }

    return true;
  }

  /**
   * Hash client ID
   */
  hashClientId(clientId) {
    return crypto.createHash('sha256').update(clientId).digest('hex');
  }

  /**
   * Hash client secret
   */
  hashClientSecret(clientSecret) {
    return crypto.createHash('sha256').update(clientSecret).digest('hex');
  }

  /**
   * Hash token for storage
   */
  hashToken(tokenId) {
    return crypto.createHash('sha256').update(tokenId).digest('hex');
  }

  /**
   * Generate HMAC signature for validation
   */
  generateHMAC(clientSecretHash, payload) {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto
      .createHmac('sha256', clientSecretHash)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(signature, clientSecretHash, payload) {
    try {
      const expectedSignature = this.generateHMAC(clientSecretHash, payload);
      
      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.security('HMAC verification failed:', { error: error.message });
      return false;
    }
  }

  /**
   * Generate cryptographically secure random string
   */
  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate client credentials
   */
  generateClientCredentials() {
    const clientId = `pk_${this.generateSecureRandom(16)}`;
    const clientSecret = `sk_${this.generateSecureRandom(32)}`;
    
    return {
      clientId,
      clientSecret,
      clientIdHash: this.hashClientId(clientId),
      clientSecretHash: this.hashClientSecret(clientSecret),
      clientIdPrefix: clientId.substring(0, 20)
    };
  }

  /**
   * Validate timestamp for replay attack prevention
   */
  validateTimestamp(timestamp, windowMs = 300000) { // 5 minutes default
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    
    if (isNaN(requestTime)) {
      return false;
    }
    
    const timeDiff = Math.abs(now - requestTime);
    return timeDiff <= windowMs;
  }

  /**
   * Generate secure session token
   */
  generateSessionToken() {
    return this.generateSecureRandom(32);
  }

  /**
   * Hash data using SHA-256
   */
  hashData(data) {
    const input = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}

module.exports = new CryptoService();