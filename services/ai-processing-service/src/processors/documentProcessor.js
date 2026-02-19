import { downloadToBuffer } from '../config/s3.js';
import { parseDocument } from '../services/documentParser.js';
import { chunkText } from '../services/textChunker.js';
import { embedChunks } from '../services/embeddingService.js';
import { upsertVectors } from '../services/vectorStore.js';
import { setProcessing, setCompleted, setFailed } from '../services/statusTracker.js';
import { getProducer } from '../config/kafka.js';
import { config } from '../config/index.js';
import { withContext } from '../utils/logger.js';

export const processDocumentMessage = async (msg) => {
  const payload = typeof msg === 'string' ? JSON.parse(msg) : msg;
  const { document_id: documentId, org_id: orgId, s3_key: s3Key, content_type: contentType, filename, uploaded_at } = payload;
  const log = withContext({ documentId, orgId });

  const producer = await getProducer();

  try {
    log.info('Setting status: processing');
    await setProcessing({ documentId });

    log.info('Downloading file');
    const buffer = await downloadToBuffer({ s3Key });

    log.info('Parsing document');
    const text = await parseDocument({ buffer, filename, contentType });

    log.info('Chunking text');
    const chunks = await chunkText({ text, metadata: { document_id: documentId, org_id: orgId, filename, uploaded_at } });

    log.info('Embedding chunks via Ollama', { count: chunks.length });
    const embedded = await embedChunks(chunks);

    log.info('Upserting vectors to Pinecone');
    await upsertVectors({ orgId: orgId, documentId, items: embedded });

    log.info('Updating DB status: completed');
    await setCompleted({ documentId, chunksCount: chunks.length });

    const successEvt = {
      event_type: 'document.processed',
      document_id: documentId,
      org_id: orgId,
      status: 'completed',
      chunks_count: chunks.length,
      timestamp: new Date().toISOString()
    };
    await producer.send({ topic: config.KAFKA_TOPIC_PROCESSED, messages: [{ value: JSON.stringify(successEvt) }] });
    log.info('Published success event');
  } catch (err) {
    const message = err?.message || 'unknown error';
    await setFailed({ documentId, errorMessage: message });
    const failEvt = {
      event_type: 'document.failed',
      document_id: documentId,
      org_id: orgId,
      error_message: message,
      timestamp: new Date().toISOString()
    };
    await producer.send({ topic: config.KAFKA_TOPIC_FAILED, messages: [{ value: JSON.stringify(failEvt) }] });
    const log = withContext({ documentId, orgId });
    log.error('Processing failed', { error: message });
    console.error('Processing failed', { documentId, orgId, error: err });
    throw err; // Let consumer handle retry/DLQ policy
  }
};
