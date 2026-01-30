const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class TokenRepository {
  async create(data) {
    try {
      const query = `
        INSERT INTO refresh_tokens (user_id, org_id, token_hash, token_id, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, expires_at
      `;

      const result = await pool.query(query, [
        data.user_id,
        data.org_id,
        data.token_hash,
        data.token_id,
        data.expires_at
      ]);

      logger.info('Refresh token created', { user_id: data.user_id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create refresh token', { error: error.message });
      throw new DatabaseError('Failed to create refresh token', error);
    }
  }

  async findByTokenId(tokenId) {
    try {
      const query = `
        SELECT * FROM refresh_tokens
        WHERE token_id = $1
      `;

      const result = await pool.query(query, [tokenId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch token', { error: error.message });
      throw new DatabaseError('Failed to fetch token', error);
    }
  }

  async revokeToken(tokenId) {
    try {
      const query = `
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_at = NOW()
        WHERE token_id = $1
      `;

      await pool.query(query, [tokenId]);
      logger.info('Token revoked', { token_id: tokenId });
    } catch (error) {
      logger.error('Failed to revoke token', { error: error.message });
      throw new DatabaseError('Failed to revoke token', error);
    }
  }

  async deleteExpiredTokens() {
    try {
      const query = `
        DELETE FROM refresh_tokens
        WHERE expires_at < NOW()
      `;

      const result = await pool.query(query);
      logger.info('Expired tokens cleaned up', { deleted_count: result.rowCount });
    } catch (error) {
      logger.error('Failed to delete expired tokens', { error: error.message });
      throw new DatabaseError('Failed to delete expired tokens', error);
    }
  }
}

module.exports = new TokenRepository();
