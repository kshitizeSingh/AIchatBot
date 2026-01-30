const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const env = require('../config/environment');
const tokenRepository = require('../persistence/tokenRepository');
const cryptoService = require('./cryptoService');
const { AuthenticationError } = require('../utils/errors');
const logger = require('../utils/logger');

class TokenService {
  generateAccessToken(userId) {
    const payload = {
      user_id: userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + env.jwt.accessExpiry
    };

    return jwt.sign(payload, env.jwt.secret, {
      algorithm: 'HS256'
    });
  }

  async generateRefreshToken(userId, orgId) {
    try {
      const tokenId = uuid();
      const payload = {
        user_id: userId,
        type: 'refresh',
        token_id: tokenId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + env.jwt.refreshExpiry
      };

      const token = jwt.sign(payload, env.jwt.secret, {
        algorithm: 'HS256'
      });

      // Store token hash in database
      const tokenHash = cryptoService.hashToken(tokenId);
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + env.jwt.refreshExpiry);

      await tokenRepository.create({
        user_id: userId,
        org_id: orgId,
        token_hash: tokenHash,
        token_id: tokenId,
        expires_at: expiresAt
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate refresh token', { error: error.message });
      throw error;
    }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, env.jwt.secret, {
        algorithms: ['HS256']
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('EXPIRED_TOKEN', 'Access token has expired');
      }
      throw new AuthenticationError('INVALID_TOKEN', 'Token signature is invalid');
    }
  }

  verifyRefreshToken(token) {
    try {
      const payload = jwt.verify(token, env.jwt.secret, {
        algorithms: ['HS256']
      });

      if (payload.type !== 'refresh') {
        throw new AuthenticationError('INVALID_TOKEN', 'Not a refresh token');
      }

      return payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('EXPIRED_TOKEN', 'Refresh token has expired');
      }
      throw new AuthenticationError('INVALID_TOKEN', 'Token signature is invalid');
    }
  }
}

module.exports = new TokenService();
