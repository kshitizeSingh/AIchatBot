const crypto = require('crypto');
const config = require('./environment');

class SecurityConfig {
  constructor() {
    this.bcryptRounds = config.security.bcryptRounds;
    this.sessionTimeoutMinutes = config.security.sessionTimeoutMinutes;
    this.hmacAlgorithm = 'sha256';
    this.hashAlgorithm = 'sha256';
  }

  /**
   * Password strength requirements
   */
  getPasswordRules() {
    return {
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      blockedPasswords: [
        'password123', 'admin123', '12345678', 'qwerty123',
        'welcome123', 'sunshine123', 'letmein123', 'password1234',
        'administrator', 'password!', 'Password123'
      ]
    };
  }

  /**
   * Generate cryptographically secure random string
   */
  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate HMAC signature
   */
  generateHMAC(data, secret) {
    return crypto
      .createHmac(this.hmacAlgorithm, secret)
      .update(typeof data === 'string' ? data : JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Verify HMAC signature with timing-safe comparison
   */
  verifyHMAC(signature, data, secret) {
    const expectedSignature = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Hash data using SHA-256
   */
  hashData(data) {
    return crypto
      .createHash(this.hashAlgorithm)
      .update(typeof data === 'string' ? data : JSON.stringify(data))
      .digest('hex');
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
      clientIdHash: this.hashData(clientId),
      clientSecretHash: this.hashData(clientSecret)
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
    
    return Math.abs(now - requestTime) <= windowMs;
  }

  /**
   * Sanitize input to prevent injection attacks
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return input
      .replace(/[<>"'&]/g, (char) => {
        const entities = {
          '<': '<',
          '>': '>',
          '"': '"',
          "'": '&#x27;',
          '&': '&'
        };
        return entities[char] || char;
      })
      .trim();
  }

  /**
   * Generate secure session ID
   */
  generateSessionId() {
    return this.generateSecureRandom(32);
  }

  /**
   * Calculate session expiry
   */
  getSessionExpiry() {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + this.sessionTimeoutMinutes);
    return expiry;
  }
}

module.exports = new SecurityConfig();