const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class OrgRepository {
  async create(data) {
    try {
      const query = `
        INSERT INTO organizations (name, client_id_hash, client_secret_hash, client_id_prefix)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, client_id_prefix, is_active, created_at
      `;

      const result = await pool.query(query, [
        data.name,
        data.client_id_hash,
        data.client_secret_hash,
        data.client_id_prefix
      ]);

      logger.info('Organization created', { org_id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create organization', { error: error.message });
      throw new DatabaseError('Failed to create organization', error);
    }
  }

  async findById(id) {
    try {
      const query = 'SELECT * FROM organizations WHERE id = $1 AND is_active = true';
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch organization', { error: error.message });
      throw new DatabaseError('Failed to fetch organization', error);
    }
  }

  async findByClientIdHash(clientIdHash) {
    try {
      const query = 'SELECT * FROM organizations WHERE client_id_hash = $1 AND is_active = true';
      const result = await pool.query(query, [clientIdHash]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch organization by client ID', { error: error.message });
      throw new DatabaseError('Failed to fetch organization', error);
    }
  }

  async findByName(name) {
    try {
      const query = 'SELECT * FROM organizations WHERE LOWER(name) = LOWER($1) AND is_active = true';
      const result = await pool.query(query, [name]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to fetch organization by name', { error: error.message });
      throw new DatabaseError('Failed to fetch organization', error);
    }
  }

  async update(id, data) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(data).forEach(key => {
        fields.push(`${key} = $${paramCount}`);
        values.push(data[key]);
        paramCount++;
      });

      values.push(id);
      const query = `
        UPDATE organizations
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      logger.info('Organization updated', { org_id: id });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update organization', { error: error.message });
      throw new DatabaseError('Failed to update organization', error);
    }
  }
}

module.exports = new OrgRepository();
