const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class OrgRepository {
  /**
   * Create new organization
   */
  async create(data) {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO organizations (name, client_id_hash, client_secret_hash, client_id_prefix, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, client_id_prefix, is_active, created_at
      `;

      const result = await client.query(query, [
        data.name,
        data.client_id_hash,
        data.client_secret_hash,
        data.client_id_prefix,
        data.is_active !== undefined ? data.is_active : true
      ]);

      logger.audit('Organization created', { 
        orgId: result.rows[0].id, 
        orgName: data.name,
        clientIdPrefix: data.client_id_prefix 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create organization:', { error: error.message, orgName: data.name });
      
      if (error.code === '23505') {  // Unique constraint violation
        throw new DatabaseError('Organization with this client ID already exists', error);
      }
      throw new DatabaseError('Failed to create organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find organization by ID
   */
  async findById(id) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, name, client_id_prefix, is_active, created_at, updated_at
        FROM organizations 
        WHERE id = $1
      `;
      
      const result = await client.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find organization by ID:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to fetch organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find organization by client ID hash (for authentication)
   */
  async findByClientIdHash(clientIdHash) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, name, client_id_hash, client_secret_hash, client_id_prefix, is_active, created_at
        FROM organizations 
        WHERE client_id_hash = $1 AND is_active = true
      `;
      
      const result = await client.query(query, [clientIdHash]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find organization by client ID hash:', { error: error.message });
      throw new DatabaseError('Failed to fetch organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * Find organization by name
   */
  async findByName(name) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, name, client_id_prefix, is_active, created_at, updated_at
        FROM organizations 
        WHERE LOWER(name) = LOWER($1)
      `;
      
      const result = await client.query(query, [name.trim()]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find organization by name:', { error: error.message, orgName: name });
      throw new DatabaseError('Failed to fetch organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * Update organization
   */
  async update(id, data) {
    const client = await pool.connect();
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic query based on provided fields
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== 'id') {
          fields.push(`${key} = $${paramCount}`);
          values.push(data[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(id);
      const query = `
        UPDATE organizations
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING id, name, client_id_prefix, is_active, updated_at
      `;

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Organization not found');
      }

      logger.audit('Organization updated', { 
        orgId: id, 
        updatedFields: Object.keys(data) 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update organization:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to update organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * Activate organization
   */
  async activate(id) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE organizations
        SET is_active = true, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, is_active, updated_at
      `;

      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error('Organization not found');
      }

      logger.audit('Organization activated', { orgId: id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to activate organization:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to activate organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate organization
   */
  async deactivate(id) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE organizations
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, is_active, updated_at
      `;

      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error('Organization not found');
      }

      logger.audit('Organization deactivated', { orgId: id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to deactivate organization:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to deactivate organization', error);
    } finally {
      client.release();
    }
  }

  /**
   * List all organizations
   */
  async list(options = {}) {
    const client = await pool.connect();
    try {
      const {
        limit = 50,
        offset = 0,
        includeInactive = false,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = options;

      let whereClause = '';
      const params = [];
      
      if (!includeInactive) {
        whereClause = 'WHERE is_active = true';
      }

      const query = `
        SELECT id, name, client_id_prefix, is_active, created_at, updated_at
        FROM organizations
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to list organizations:', { error: error.message });
      throw new DatabaseError('Failed to list organizations', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get organization statistics
   */
  async getStats(id) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          o.id,
          o.name,
          o.is_active,
          o.created_at,
          COUNT(u.id) as total_users,
          COUNT(CASE WHEN u.is_active = true THEN 1 END) as active_users,
          COUNT(CASE WHEN u.role = 'admin' THEN 1 END) as admin_users,
          COUNT(CASE WHEN u.role = 'owner' THEN 1 END) as owner_users,
          MAX(u.last_login_at) as last_user_login
        FROM organizations o
        LEFT JOIN users u ON o.id = u.org_id
        WHERE o.id = $1
        GROUP BY o.id, o.name, o.is_active, o.created_at
      `;

      const result = await client.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get organization stats:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to get organization statistics', error);
    } finally {
      client.release();
    }
  }

  /**
   * Check if organization exists
   */
  async exists(id) {
    const client = await pool.connect();
    try {
      const query = 'SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1) as exists';
      const result = await client.query(query, [id]);
      return result.rows[0].exists;
    } catch (error) {
      logger.error('Failed to check organization existence:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to check organization existence', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get organization count
   */
  async getCount(includeInactive = false) {
    const client = await pool.connect();
    try {
      let query = 'SELECT COUNT(*) as count FROM organizations';
      const params = [];
      
      if (!includeInactive) {
        query += ' WHERE is_active = true';
      }

      const result = await client.query(query, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get organization count:', { error: error.message });
      throw new DatabaseError('Failed to get organization count', error);
    } finally {
      client.release();
    }
  }

  /**
   * Search organizations by name
   */
  async search(searchTerm, options = {}) {
    const client = await pool.connect();
    try {
      const {
        limit = 20,
        offset = 0,
        includeInactive = false
      } = options;

      let whereClause = 'WHERE LOWER(name) LIKE LOWER($1)';
      const params = [`%${searchTerm.trim()}%`];
      
      if (!includeInactive) {
        whereClause += ' AND is_active = true';
      }

      const query = `
        SELECT id, name, client_id_prefix, is_active, created_at
        FROM organizations
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to search organizations:', { error: error.message, searchTerm });
      throw new DatabaseError('Failed to search organizations', error);
    } finally {
      client.release();
    }
  }

  /**
   * Regenerate client credentials
   */
  async updateClientCredentials(id, clientIdHash, clientSecretHash, clientIdPrefix) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE organizations
        SET 
          client_id_hash = $1,
          client_secret_hash = $2,
          client_id_prefix = $3,
          updated_at = NOW()
        WHERE id = $4
        RETURNING id, name, client_id_prefix, updated_at
      `;

      const result = await client.query(query, [clientIdHash, clientSecretHash, clientIdPrefix, id]);
      
      if (result.rows.length === 0) {
        throw new Error('Organization not found');
      }

      logger.audit('Organization client credentials updated', { orgId: id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update client credentials:', { error: error.message, orgId: id });
      throw new DatabaseError('Failed to update client credentials', error);
    } finally {
      client.release();
    }
  }
}

module.exports = new OrgRepository();