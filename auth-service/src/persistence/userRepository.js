const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class UserRepository {
  /**
   * Create new user
   */
  async create(data) {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO users (org_id, email, password_hash, role, is_active, email_verified)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, org_id, email, role, is_active, email_verified, created_at
      `;

      const result = await client.query(query, [
        data.org_id,
        data.email,
        data.password_hash,
        data.role || 'user',
        data.is_active !== undefined ? data.is_active : true,
        data.email_verified || false
      ]);

      logger.debug('User created successfully', { userId: result.rows[0].id, email: data.email });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create user:', { error: error.message, email: data.email });
      
      if (error.code === '23505') {  // Unique constraint violation
        throw new DatabaseError('Email already exists in this organization', error);
      }
      throw new DatabaseError('Failed to create user', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find user by email and organization
   */
  async findByEmailAndOrg(email, orgId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT * FROM users
        WHERE email = $1 AND org_id = $2
      `;

      const result = await client.query(query, [email.toLowerCase().trim(), orgId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user by email and org:', { error: error.message, email, orgId });
      throw new DatabaseError('Failed to fetch user', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId, orgId = null) {
    const client = await pool.connect();
    try {
      let query, params;
      
      if (orgId) {
        query = `
          SELECT id, org_id, email, role, is_active, email_verified, last_login_at, created_at, updated_at
          FROM users
          WHERE id = $1 AND org_id = $2
        `;
        params = [userId, orgId];
      } else {
        query = `
          SELECT id, org_id, email, role, is_active, email_verified, last_login_at, created_at, updated_at
          FROM users
          WHERE id = $1
        `;
        params = [userId];
      }

      const result = await client.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user by ID:', { error: error.message, userId, orgId });
      throw new DatabaseError('Failed to fetch user', error);
    } finally {
      client.release();
    }
  }

  /**
   * Update user
   */
  async update(userId, data) {
    const client = await pool.connect();
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic query based on provided fields
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(data[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(userId);
      const query = `
        UPDATE users
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING id, org_id, email, role, is_active, email_verified, updated_at
      `;

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.debug('User updated successfully', { userId, updatedFields: Object.keys(data) });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user:', { error: error.message, userId });
      throw new DatabaseError('Failed to update user', error);
    } finally {
      client.release();
    }
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedLoginAttempts(userId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1, updated_at = NOW()
        WHERE id = $1
        RETURNING failed_login_attempts
      `;

      const result = await client.query(query, [userId]);
      logger.debug('Failed login attempts incremented', { userId, attempts: result.rows[0]?.failed_login_attempts });
      return result.rows[0]?.failed_login_attempts || 0;
    } catch (error) {
      logger.error('Failed to increment login attempts:', { error: error.message, userId });
      throw new DatabaseError('Failed to update login attempts', error);
    } finally {
      client.release();
    }
  }

  /**
   * Lock account
   */
  async lockAccount(userId, lockUntil) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET locked_until = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await client.query(query, [lockUntil, userId]);
      logger.audit('Account locked', { userId, lockedUntil: lockUntil });
    } catch (error) {
      logger.error('Failed to lock account:', { error: error.message, userId });
      throw new DatabaseError('Failed to lock account', error);
    } finally {
      client.release();
    }
  }

  /**
   * Record successful login
   */
  async recordSuccessfulLogin(userId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET failed_login_attempts = 0, last_login_at = NOW(), locked_until = NULL, updated_at = NOW()
        WHERE id = $1
      `;

      await client.query(query, [userId]);
      logger.debug('Successful login recorded', { userId });
    } catch (error) {
      logger.error('Failed to record successful login:', { error: error.message, userId });
      throw new DatabaseError('Failed to record login', error);
    } finally {
      client.release();
    }
  }

  /**
   * List users in organization
   */
  async listByOrg(orgId, options = {}) {
    const client = await pool.connect();
    try {
      const {
        limit = 50,
        offset = 0,
        includeInactive = false,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = options;

      let whereClause = 'WHERE org_id = $1';
      const params = [orgId];
      
      if (!includeInactive) {
        whereClause += ' AND is_active = true';
      }

      const query = `
        SELECT id, org_id, email, role, is_active, email_verified, last_login_at, created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to list users by org:', { error: error.message, orgId });
      throw new DatabaseError('Failed to fetch users', error);
    } finally {
      client.release();
    }
  }

  /**
   * Update user role
   */
  async updateRole(userId, role, orgId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET role = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3
        RETURNING id, org_id, email, role, is_active, updated_at
      `;

      const result = await client.query(query, [role, userId, orgId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found or not in organization');
      }

      logger.audit('User role updated', { userId, newRole: role, orgId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user role:', { error: error.message, userId, role });
      throw new DatabaseError('Failed to update user role', error);
    } finally {
      client.release();
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(userId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET email_verified = true, updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, email_verified
      `;

      const result = await client.query(query, [userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.audit('Email verified', { userId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to verify email:', { error: error.message, userId });
      throw new DatabaseError('Failed to verify email', error);
    } finally {
      client.release();
    }
  }

  /**
   * Update password
   */
  async updatePassword(userId, passwordHash) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET password_hash = $1, last_password_change = NOW(), updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, last_password_change
      `;

      const result = await client.query(query, [passwordHash, userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.audit('Password updated', { userId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update password:', { error: error.message, userId });
      throw new DatabaseError('Failed to update password', error);
    } finally {
      client.release();
    }
  }

  /**
   * Soft delete user (deactivate)
   */
  async deactivate(userId, orgId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE users
        SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND org_id = $2
        RETURNING id, email, is_active
      `;

      const result = await client.query(query, [userId, orgId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found or not in organization');
      }

      logger.audit('User deactivated', { userId, orgId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to deactivate user:', { error: error.message, userId });
      throw new DatabaseError('Failed to deactivate user', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get user count for organization
   */
  async getOrgUserCount(orgId, includeInactive = false) {
    const client = await pool.connect();
    try {
      let query = 'SELECT COUNT(*) as count FROM users WHERE org_id = $1';
      const params = [orgId];
      
      if (!includeInactive) {
        query += ' AND is_active = true';
      }

      const result = await client.query(query, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get user count:', { error: error.message, orgId });
      throw new DatabaseError('Failed to get user count', error);
    } finally {
      client.release();
    }
  }
}

module.exports = new UserRepository();