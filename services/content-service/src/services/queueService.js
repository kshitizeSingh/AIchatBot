const { producer } = require('../config/queue');
const logger = require('../utils/logger');

const failedEventRepository = require('../persistence/failedEventRepository');

class QueueService {
  async connect() {
    if (!producer) return;
    try {
      await producer.connect();
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    if (!producer) return;
    try {
      await producer.disconnect();
      logger.info('Kafka producer disconnected');
    } catch (error) {
      logger.error('Failed to disconnect Kafka producer', { error: error.message });
    }
  }

  async publishDocumentUploaded(documentId, orgId, s3Key, contentType, filename) {
    if (!producer) return false;
    const event = {
      event_type: 'document.uploaded',
      document_id: documentId,
      org_id: orgId,
      s3_key: s3Key,
      content_type: contentType,
      filename,
      timestamp: new Date().toISOString(),
    };

    try {
      await producer.send({ topic: 'document.uploaded', messages: [{ key: documentId, value: JSON.stringify(event) }] });
      logger.info('Document uploaded event published', { document_id: documentId, org_id: orgId });
      return true;
    } catch (error) {
      logger.error('Failed to publish event', { error: error.message, document_id: documentId });
      await this.storeFailedEvent(event, error.message);
      return false;
    }
  }

  async storeFailedEvent(event, errorMessage) {
    try {





      await failedEventRepository.insertFailedEvent({
        eventType: event.event_type,
        documentId: event.document_id,
        orgId: event.org_id,
        payload: event,
        errorMessage,
      });
      logger.info('Failed event stored for retry', { document_id: event.document_id });
    } catch (error) {
      logger.error('Failed to store failed event', { error: error.message });
    }
  }
}

module.exports = new QueueService();
