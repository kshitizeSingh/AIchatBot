const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { PASSWORD_RULES, BLOCKED_PASSWORDS } = require('../utils/constants');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class CryptoService {
  async hashPassword(password) {
    try {
      return bcrypt.hash(password, 12);
    } catch (error) {
      logger.error('Failed to hash password', { error: error.message });
      throw error;
    }
  }

  async comparePassword(password, hash) {
    try {
      return bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Failed to compare password', { error: error.message });
      throw error;
    }
  }

  validatePassword(password) {
    const errors = [];

    if (password.length < PASSWORD_RULES.minLength) {
      errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters`);
    }

    if (password.length > PASSWORD_RULES.maxLength) {
      errors.push(`Password cannot exceed ${PASSWORD_RULES.maxLength} characters`);
    }

    if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letter');
    }

    if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letter');
    }

    if (PASSWORD_RULES.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain number');
    }

    if (PASSWORD_RULES.requireSpecialChars && 
        !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
      errors.push('Password must contain special character');
    }

    if (BLOCKED_PASSWORDS.some(bp => 
        password.toLowerCase().includes(bp.toLowerCase()))) {
      errors.push('Password too common, please choose another');
    }

    if (errors.length > 0) {
      throw new ValidationError('INVALID_PASSWORD_FORMAT', errors[0]);
    }

    return true;
  }

  hashClientId(clientId) {
    return crypto.createHash('sha256').update(clientId).digest('hex');
  }

  hashClientSecret(clientSecret) {
    return crypto.createHash('sha256').update(clientSecret).digest('hex');
  }

  hashToken(tokenId) {
    return crypto.createHash('sha256').update(tokenId).digest('hex');
  }

  generateHMAC(clientSecretHash, payload) {
    return crypto
      .createHmac('sha256', clientSecretHash)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  verifyHMAC(signature, clientSecretHash, payload) {
    const expectedSignature = this.generateHMAC(clientSecretHash, payload);

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

module.exports = new CryptoService();
