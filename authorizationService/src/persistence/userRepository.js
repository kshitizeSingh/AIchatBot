const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class UserRepository {
  async create(data) {
    try {
      const query = `
        INSERT INTO users (org_id, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, org_id, email, role, is_active, created_at
      `;

      const result = await pool.query(query, [
        data.org_id,
        data.email,
        data.password_hash,
        data.role
      ]);

      logger.info('User created', { user_id: result.rows[0].id, org_id: data.org_id });
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        logger.warn('Duplicate email', { email: data.email, org_id: data.org_id });
        throw new DatabaseError('Email already exists in this organization', error);
      }
      logger.error('Failed to create user', { error: error.message });
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async findByEmailAndOrg(email, orgId) {
    try {
      const query = `
        SELECT * FROM users
        WHERE email = $1 AND org_id = $2
      `;

      const result = await pool.query(query, [email, orgId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch user', { error: error.message });
      throw new DatabaseError('Failed to fetch user', error);
    }
  }

  async findById(userId, orgId) {
    try {
      const query = `
        SELECT id, org_id, email, role, is_active, created_at
        FROM users
        WHERE id = $1 AND org_id = $2
      `;

      const result = await pool.query(query, [userId, orgId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch user by ID', { error: error.message });
      throw new DatabaseError('Failed to fetch user', error);
    }
  }

  async findByIdOnly(userId) {
    try {
      const query = `
        SELECT * FROM users
        WHERE id = $1
      `;

      const result = await pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch user', { error: error.message });
      throw new DatabaseError('Failed to fetch user', error);
    }
  }

  async incrementFailedLoginAttempts(userId) {
    try {
      const query = `
        UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1
        WHERE id = $1
      `;

      await pool.query(query, [userId]);
    } catch (error) {
      logger.error('Failed to increment login attempts', { error: error.message });
      throw new DatabaseError('Failed to update login attempts', error);
    }
  }

  async lockAccount(userId, lockUntil) {
    try {
      const query = `
        UPDATE users
        SET locked_until = $1
        WHERE id = $2
      `;

      await pool.query(query, [lockUntil, userId]);
      logger.warn('Account locked', { user_id: userId });
    } catch (error) {
      logger.error('Failed to lock account', { error: error.message });
      throw new DatabaseError('Failed to lock account', error);
    }
  }

  async recordSuccessfulLogin(userId) {
    try {
      const query = `
        UPDATE users
        SET failed_login_attempts = 0, last_login_at = NOW(), locked_until = NULL
        WHERE id = $1
      `;

      await pool.query(query, [userId]);
    } catch (error) {
      logger.error('Failed to record login', { error: error.message });
      throw new DatabaseError('Failed to record login', error);
    }
  }

  async listByOrg(orgId) {
    try {
      const query = `
        SELECT id, org_id, email, role, is_active, last_login_at, created_at
        FROM users
        WHERE org_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `;

      const result = await pool.query(query, [orgId]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to fetch users', { error: error.message });
      throw new DatabaseError('Failed to fetch users', error);
    }
  }

  async updateRole(userId, role, orgId) {
    try {
      const query = `
        UPDATE users
        SET role = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3
        RETURNING id, org_id, email, role, is_active, created_at
      `;

      const result = await pool.query(query, [role, userId, orgId]);
      logger.info('User role updated', { user_id: userId, new_role: role });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user role', { error: error.message });
      throw new DatabaseError('Failed to update user role', error);
    }
  }
}

module.exports = new UserRepository();
