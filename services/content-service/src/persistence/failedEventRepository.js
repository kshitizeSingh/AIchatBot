const db = require('../config/database');

class FailedEventRepository {
  async insertFailedEvent({ eventType, documentId, orgId, payload, errorMessage }) {
    await db.query(
      `INSERT INTO failed_events (event_type, document_id, org_id, payload, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventType, documentId, orgId, JSON.stringify(payload), errorMessage]
    );
  }
}

module.exports = new FailedEventRepository();
