const { consumer } = require('../config/queue');
const logger = require('../utils/logger');
const documentService = require('../services/documentService');

module.exports = async function startProcessedEventConsumer() {
  if (!consumer) return;
  await consumer.connect();
  await consumer.subscribe({ topic: 'document.processed', fromBeginning: false });
  await consumer.subscribe({ topic: 'document.failed', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const value = message.value?.toString() || '{}';
        const event = JSON.parse(value);
        const { document_id: documentId } = event;
        if (!documentId) return;

        if (topic === 'document.processed') {
          await documentService.updateDocumentStatus(documentId, 'completed', { chunksCount: event.chunks_count });
        } else if (topic === 'document.failed') {
          await documentService.updateDocumentStatus(documentId, 'failed', { errorMessage: event.error_message, errorCode: event.error_code });
        }
        logger.info('Processed event handled', { topic, document_id: documentId });
      } catch (e) {
        logger.error('Failed processing event', { error: e.message, topic });
      }
    },
  });
};
