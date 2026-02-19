import express from 'express';
import path from 'path';
import client from 'prom-client';
import { isDbReady } from './config/postgres.js';
import { config } from './config/index.js';
import { processDocumentMessage } from './processors/documentProcessor.js';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const metrics = {
  documentsProcessed: new client.Counter({ name: 'documents_processed_total', help: 'Documents processed', registers: [register] }),
  processingTime: new client.Histogram({ name: 'processing_time_seconds', help: 'Processing time', buckets: [0.5, 1, 2, 5, 10], registers: [register] })
};

export const createServer = () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/ready', async (req, res) => {
    const db = await isDbReady();
    if (db) return res.status(200).json({ status: 'ready' });
    return res.status(503).json({ status: 'not-ready' });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Development-only endpoint to process a local file without Kafka/S3
  console.log(config.LOCAL_TEST_MODE)
  if (config.LOCAL_TEST_MODE) {
    app.post('/dev/process-local', async (req, res) => {
      try {
        console.log('req.body:', req.body)
        const { document_id, org_id, localPath, filename, content_type, uploaded_at } = req.body || {};
        if (!document_id || !org_id || !localPath) {
          return res.status(400).json({ error: 'document_id, org_id, and localPath are required' });
        }
        const fname = filename || path.basename(localPath);
        const contentType = content_type || undefined;
        const payload = {
          event_type: 'document.uploaded',
          document_id,
          org_id,
          s3_key: localPath, // interpreted as relative to STORAGE_PATH when STORAGE_TYPE=local
          content_type: contentType,
          filename: fname,
          uploaded_at: uploaded_at || new Date().toISOString()
        };
        console.log('Processing local file with payload:', payload);
        await processDocumentMessage(payload);
        return res.status(202).json({ status: 'accepted', document_id, org_id, filename: fname });
      } catch (err) {
        const message = err?.message || 'processing failed';
        return res.status(500).json({ error: message });
      }
    });
  }

  const server = app.listen(config.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`HTTP server listening on :${config.PORT}`);
  });
  return { app, server };
};
