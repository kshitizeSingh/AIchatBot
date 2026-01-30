const pool = require('../config/database');
const logger = require('../utils/logger');

class AuditRepository {
  async log(data) {
    try {
      const query = `
        INSERT INTO audit_logs (org_id, user_id, action, resource_type, resource_id, status, details, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;

      const result = await pool.query(query, [
        data.org_id || null,
        data.user_id || null,
        data.action,
        data.resource_type || null,
        data.resource_id || null,
        data.status || 'info',
        data.details ? JSON.stringify(data.details) : null,
        data.ip_address || null,
        data.user_agent || null
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Audit log error', { error: error.message });
    }
  }

  async getOrgLogs(orgId, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT * FROM audit_logs
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(query, [orgId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to fetch audit logs', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AuditRepository();
