const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class TokenRepository {
  /**
   * Create refresh token
   */
  async create(data) {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO refresh_tokens (user_id, org_id, token_hash, token_id, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, org_id, token_id, expires_at, created_at
      `;

      const result = await client.query(query, [
        data.user_id,
        data.org_id,
        data.token_hash,
        data.token_id,
        data.expires_at
      ]);

      logger.debug('Refresh token created', { 
        tokenId: data.token_id, 
        userId: data.user_id, 
        expiresAt: data.expires_at 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create refresh token:', { 
        error: error.message, 
        tokenId: data.token_id,
        userId: data.user_id 
      });
      
      if (error.code === '23505') {  // Unique constraint violation
        throw new DatabaseError('Token already exists', error);
      }
      throw new DatabaseError('Failed to create refresh token', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find token by token ID
   */
  async findByTokenId(tokenId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT * FROM refresh_tokens
        WHERE token_id = $1
      `;

      const result = await client.query(query, [tokenId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find token by ID:', { error: error.message, tokenId });
      throw new DatabaseError('Failed to fetch token', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find tokens by user ID
   */
  async findByUserId(userId, includeRevoked = false) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT * FROM refresh_tokens
        WHERE user_id = $1
      `;
      
      if (!includeRevoked) {
        query += ' AND is_revoked = false';
      }
      
      query += ' ORDER BY created_at DESC';

      const result = await client.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find tokens by user ID:', { error: error.message, userId });
      throw new DatabaseError('Failed to fetch user tokens', error);
    } finally {
      client.release();
    }
  }

  /**
   * Revoke token by token ID
   */
  async revokeToken(tokenId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_at = NOW()
        WHERE token_id = $1
        RETURNING id, token_id, is_revoked, revoked_at
      `;

      const result = await client.query(query, [tokenId]);
      
      if (result.rows.length === 0) {
        logger.warn('Attempted to revoke non-existent token', { tokenId });
        return null;
      }

      logger.debug('Token revoked successfully', { tokenId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to revoke token:', { error: error.message, tokenId });
      throw new DatabaseError('Failed to revoke token', error);
    } finally {
      client.release();
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_at = NOW()
        WHERE user_id = $1 AND is_revoked = false
        RETURNING COUNT(*) as revoked_count
      `;

      const result = await client.query(query, [userId]);
      const revokedCount = result.rowCount;
      
      logger.audit('All user tokens revoked', { userId, revokedCount });
      return revokedCount;
    } catch (error) {
      logger.error('Failed to revoke all user tokens:', { error: error.message, userId });
      throw new DatabaseError('Failed to revoke user tokens', error);
    } finally {
      client.release();
    }
  }

  /**
   * Revoke all tokens for an organization
   */
  async revokeAllOrgTokens(orgId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_at = NOW()
        WHERE org_id = $1 AND is_revoked = false
        RETURNING COUNT(*) as revoked_count
      `;

      const result = await client.query(query, [orgId]);
      const revokedCount = result.rowCount;
      
      logger.audit('All organization tokens revoked', { orgId, revokedCount });
      return revokedCount;
    } catch (error) {
      logger.error('Failed to revoke all org tokens:', { error: error.message, orgId });
      throw new DatabaseError('Failed to revoke organization tokens', error);
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired tokens
   */
  async deleteExpiredTokens() {
    const client = await pool.connect();
    try {
      const query = `
        DELETE FROM refresh_tokens
        WHERE expires_at < NOW()
        RETURNING COUNT(*) as deleted_count
      `;

      const result = await client.query(query);
      const deletedCount = result.rowCount;
      
      if (deletedCount > 0) {
        logger.info('Expired tokens cleaned up', { deletedCount });
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete expired tokens:', { error: error.message });
      throw new DatabaseError('Failed to delete expired tokens', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get token statistics for user
   */
  async getUserTokenStats(userId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN is_revoked = false THEN 1 END) as active_tokens,
          COUNT(CASE WHEN is_revoked = true THEN 1 END) as revoked_tokens,
          COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_tokens,
          MAX(created_at) as last_token_created
        FROM refresh_tokens
        WHERE user_id = $1
      `;

      const result = await client.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get user token stats:', { error: error.message, userId });
      throw new DatabaseError('Failed to get token statistics', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get token statistics for organization
   */
  async getOrgTokenStats(orgId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN is_revoked = false THEN 1 END) as active_tokens,
          COUNT(CASE WHEN is_revoked = true THEN 1 END) as revoked_tokens,
          COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_tokens,
          COUNT(DISTINCT user_id) as unique_users,
          MAX(created_at) as last_token_created
        FROM refresh_tokens
        WHERE org_id = $1
      `;

      const result = await client.query(query, [orgId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get org token stats:', { error: error.message, orgId });
      throw new DatabaseError('Failed to get organization token statistics', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find tokens expiring soon
   */
  async findTokensExpiringSoon(hoursFromNow = 24) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT token_id, user_id, org_id, expires_at
        FROM refresh_tokens
        WHERE is_revoked = false 
          AND expires_at > NOW() 
          AND expires_at <= NOW() + INTERVAL '${hoursFromNow} hours'
        ORDER BY expires_at ASC
      `;

      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find tokens expiring soon:', { error: error.message });
      throw new DatabaseError('Failed to find expiring tokens', error);
    } finally {
      client.release();
    }
  }

  /**
   * Update token last used timestamp
   */
  async updateLastUsed(tokenId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE refresh_tokens
        SET last_used_at = NOW()
        WHERE token_id = $1 AND is_revoked = false
        RETURNING id, token_id, last_used_at
      `;

      const result = await client.query(query, [tokenId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to update token last used:', { error: error.message, tokenId });
      throw new DatabaseError('Failed to update token usage', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get active token count for user
   */
  async getActiveTokenCount(userId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM refresh_tokens
        WHERE user_id = $1 AND is_revoked = false AND expires_at > NOW()
      `;

      const result = await client.query(query, [userId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get active token count:', { error: error.message, userId });
      throw new DatabaseError('Failed to get active token count', error);
    } finally {
      client.release();
    }
  }

  /**
   * Validate token exists and is active
   */
  async validateToken(tokenId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT token_id, user_id, org_id, is_revoked, expires_at
        FROM refresh_tokens
        WHERE token_id = $1
      `;

      const result = await client.query(query, [tokenId]);
      const token = result.rows[0];
      
      if (!token) {
        return { valid: false, reason: 'TOKEN_NOT_FOUND' };
      }
      
      if (token.is_revoked) {
        return { valid: false, reason: 'TOKEN_REVOKED' };
      }
      
      if (new Date(token.expires_at) <= new Date()) {
        return { valid: false, reason: 'TOKEN_EXPIRED' };
      }
      
      return { valid: true, token };
    } catch (error) {
      logger.error('Failed to validate token:', { error: error.message, tokenId });
      throw new DatabaseError('Failed to validate token', error);
    } finally {
      client.release();
    }
  }
}

module.exports = new TokenRepository();