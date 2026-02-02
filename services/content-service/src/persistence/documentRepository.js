const db = require('../config/database');

class DocumentRepository {
  async insertDocument({ orgId, userId, filename, originalFilename, contentType, fileSize, s3Key }) {
    const result = await db.query(
      `INSERT INTO documents (
        org_id, filename, original_filename, content_type, file_size, s3_key, uploaded_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id, filename, status, uploaded_at`,
      [orgId, filename, originalFilename, contentType, fileSize, s3Key, userId]
    );
    return result.rows[0];
  }

  async listDocuments(orgId, { limit, offset, status, sortField, sortOrder }) {
    let query = `SELECT 
      d.id, d.filename, d.original_filename, d.content_type, d.file_size,
      d.status, d.error_message, d.chunks_count, d.uploaded_at, d.processed_at,
      json_build_object('user_id', u.id, 'email', u.email) as uploaded_by
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.org_id = $1 AND d.deleted_at IS NULL`;

    const params = [orgId];
    let paramIndex = 2;
    if (status) { query += ` AND d.status = $${paramIndex}`; params.push(status); paramIndex++; }
    query += ` ORDER BY d.${sortField} ${sortOrder}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  async countDocuments(orgId, { status }) {
    const countQuery = `SELECT COUNT(*) FROM documents WHERE org_id = $1 AND deleted_at IS NULL ${status ? 'AND status = $2' : ''}`;
    const countParams = status ? [orgId, status] : [orgId];
    const countResult = await db.query(countQuery, countParams);
    return parseInt(countResult.rows[0].count, 10);
  }

  async findByIdInOrg(documentId, orgId) {
    const result = await db.query(
      `SELECT d.*, json_build_object('user_id', u.id, 'email', u.email) as uploaded_by
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL`,
      [documentId, orgId]
    );
    return result.rows[0] || null;
  }

  async updateStatus(documentId, { status, chunksCount, errorMessage, errorCode }) {
    const updates = ['status = $2'];
    const params = [documentId, status];
    let paramIndex = 3;

    if (status === 'completed') {
      updates.push('processed_at = NOW()');
      if (chunksCount !== undefined) { updates.push(`chunks_count = $${paramIndex}`); params.push(chunksCount); paramIndex++; }
    }
    if (status === 'failed') {
      if (errorMessage) { updates.push(`error_message = $${paramIndex}`); params.push(errorMessage); paramIndex++; }
      if (errorCode) { updates.push(`error_code = $${paramIndex}`); params.push(errorCode); paramIndex++; }
    }
    updates.push('updated_at = NOW()');

    const query = `UPDATE documents SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);
    return result.rows[0];
  }

  async markUploaded(documentId) {
    const result = await db.query(
      `UPDATE documents SET status = 'uploaded', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [documentId]
    );
    return result.rows[0];
  }

  async softDeleteById(documentId) {
    await db.query('UPDATE documents SET deleted_at = NOW() WHERE id = $1', [documentId]);
  }
}

module.exports = new DocumentRepository();
