const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');
const logger = require('../utils/logger');

class AuditRepository {
  /**
   * Log audit event
   */
  async log(data) {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO audit_logs (
          org_id, user_id, action, resource_type, resource_id, 
          status, details, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, created_at
      `;

      const result = await client.query(query, [
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
      // Audit log errors should not break request flow
      // Log the error but don't throw to prevent cascading failures
      logger.error('Failed to create audit log:', {
        error: error.message,
        auditData: {
          action: data.action,
          userId: data.user_id,
          orgId: data.org_id
        }
      });
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Get audit logs for organization
   */
  async getOrgLogs(orgId, options = {}) {
    const client = await pool.connect();
    try {
      const {
        limit = 100,
        offset = 0,
        startDate = null,
        endDate = null,
        action = null,
        status = null,
        userId = null
      } = options;

      let whereClause = 'WHERE org_id = $1';
      const params = [orgId];
      let paramCount = 1;

      // Add optional filters
      if (startDate) {
        paramCount++;
        whereClause += ` AND created_at >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        whereClause += ` AND created_at <= $${paramCount}`;
        params.push(endDate);
      }

      if (action) {
        paramCount++;
        whereClause += ` AND action = $${paramCount}`;
        params.push(action);
      }

      if (status) {
        paramCount++;
        whereClause += ` AND status = $${paramCount}`;
        params.push(status);
      }

      if (userId) {
        paramCount++;
        whereClause += ` AND user_id = $${paramCount}`;
        params.push(userId);
      }

      const query = `
        SELECT 
          id, org_id, user_id, action, resource_type, resource_id,
          status, details, ip_address, user_agent, created_at
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get organization audit logs:', {
        error: error.message,
        orgId,
        options
      });
      throw new DatabaseError('Failed to fetch audit logs', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get audit logs for user
   */
  async getUserLogs(userId, options = {}) {
    const client = await pool.connect();
    try {
      const {
        limit = 100,
        offset = 0,
        startDate = null,
        endDate = null,
        action = null,
        status = null
      } = options;

      let whereClause = 'WHERE user_id = $1';
      const params = [userId];
      let paramCount = 1;

      // Add optional filters
      if (startDate) {
        paramCount++;
        whereClause += ` AND created_at >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        whereClause += ` AND created_at <= $${paramCount}`;
        params.push(endDate);
      }

      if (action) {
        paramCount++;
        whereClause += ` AND action = $${paramCount}`;
        params.push(action);
      }

      if (status) {
        paramCount++;
        whereClause += ` AND status = $${paramCount}`;
        params.push(status);
      }

      const query = `
        SELECT 
          id, org_id, user_id, action, resource_type, resource_id,
          status, details, ip_address, user_agent, created_at
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user audit logs:', {
        error: error.message,
        userId,
        options
      });
      throw new DatabaseError('Failed to fetch user audit logs', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get security events (failed logins, lockouts, etc.)
   */
  async getSecurityEvents(orgId, options = {}) {
    const client = await pool.connect();
    try {
      const {
        limit = 100,
        offset = 0,
        startDate = null,
        endDate = null,
        severity = 'warning' // warning, error, critical
      } = options;

      let whereClause = 'WHERE org_id = $1 AND status IN ($2, $3, $4)';
      const params = [orgId, 'warning', 'error', 'failure'];
      let paramCount = 4;

      // Add optional filters
      if (startDate) {
        paramCount++;
        whereClause += ` AND created_at >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        whereClause += ` AND created_at <= $${paramCount}`;
        params.push(endDate);
      }

      const query = `
        SELECT 
          id, org_id, user_id, action, status, details, 
          ip_address, user_agent, created_at
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get security events:', {
        error: error.message,
        orgId,
        options
      });
      throw new DatabaseError('Failed to fetch security events', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get audit log statistics
   */
  async getStats(orgId, timeframe = '24 hours') {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as success_events,
          COUNT(CASE WHEN status = 'failure' THEN 1 END) as failure_events,
          COUNT(CASE WHEN status = 'warning' THEN 1 END) as warning_events,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as error_events,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT ip_address) as unique_ips,
          COUNT(CASE WHEN action LIKE '%login%' THEN 1 END) as login_events
        FROM audit_logs
        WHERE org_id = $1 AND created_at >= NOW() - INTERVAL '${timeframe}'
      `;

      const result = await client.query(query, [orgId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get audit stats:', {
        error: error.message,
        orgId,
        timeframe
      });
      throw new DatabaseError('Failed to get audit statistics', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get recent failed login attempts
   */
  async getRecentFailedLogins(orgId, hoursBack = 24) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          user_id, ip_address, user_agent, details, created_at,
          COUNT(*) OVER (PARTITION BY ip_address) as attempts_from_ip,
          COUNT(*) OVER (PARTITION BY user_id) as attempts_for_user
        FROM audit_logs
        WHERE org_id = $1 
          AND action IN ('login_failed', 'login_locked')
          AND created_at >= NOW() - INTERVAL '${hoursBack} hours'
        ORDER BY created_at DESC
        LIMIT 100
      `;

      const result = await client.query(query, [orgId]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent failed logins:', {
        error: error.message,
        orgId,
        hoursBack
      });
      throw new DatabaseError('Failed to get failed login attempts', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get suspicious IP addresses
   */
  async getSuspiciousIPs(orgId, threshold = 10, hoursBack = 24) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          ip_address,
          COUNT(*) as failure_count,
          COUNT(DISTINCT user_id) as affected_users,
          MIN(created_at) as first_attempt,
          MAX(created_at) as last_attempt,
          array_agg(DISTINCT action) as actions
        FROM audit_logs
        WHERE org_id = $1 
          AND status IN ('failure', 'warning')
          AND created_at >= NOW() - INTERVAL '${hoursBack} hours'
          AND ip_address IS NOT NULL
        GROUP BY ip_address
        HAVING COUNT(*) >= $2
        ORDER BY failure_count DESC
      `;

      const result = await client.query(query, [orgId, threshold]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get suspicious IPs:', {
        error: error.message,
        orgId,
        threshold,
        hoursBack
      });
      throw new DatabaseError('Failed to get suspicious IP addresses', error);
    } finally {
      client.release();
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays = 90) {
    const client = await pool.connect();
    try {
      const query = `
        DELETE FROM audit_logs
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
        RETURNING COUNT(*) as deleted_count
      `;

      const result = await client.query(query);
      const deletedCount = result.rowCount;
      
      if (deletedCount > 0) {
        logger.info('Old audit logs cleaned up', { deletedCount, retentionDays });
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', {
        error: error.message,
        retentionDays
      });
      throw new DatabaseError('Failed to cleanup audit logs', error);
    } finally {
      client.release();
    }
  }

  /**
   * Export audit logs for compliance
   */
  async exportLogs(orgId, startDate, endDate, format = 'json') {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id, org_id, user_id, action, resource_type, resource_id,
          status, details, ip_address, user_agent, created_at
        FROM audit_logs
        WHERE org_id = $1 
          AND created_at >= $2 
          AND created_at <= $3
        ORDER BY created_at ASC
      `;

      const result = await client.query(query, [orgId, startDate, endDate]);
      
      logger.audit('Audit logs exported', {
        orgId,
        startDate,
        endDate,
        recordCount: result.rows.length
      });
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to export audit logs:', {
        error: error.message,
        orgId,
        startDate,
        endDate
      });
      throw new DatabaseError('Failed to export audit logs', error);
    } finally {
      client.release();
    }
  }
}

module.exports = new AuditRepository();