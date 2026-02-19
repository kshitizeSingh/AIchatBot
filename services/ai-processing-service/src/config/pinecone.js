import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './index.js';

let client;
let indexRef;
let verifiedOnce = false;

// Simple timeout wrapper for preflight
const withTimeout = (promise, ms, label = 'operation') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}ms`)), ms)
    ),
  ]);

export const getPineconeIndex = () => {
  if (!client) {
    const opts = { apiKey: config.PINECONE_API_KEY };
    if (config.PINECONE_ENVIRONMENT) {
      opts.environment = config.PINECONE_ENVIRONMENT;
    }
    client = new Pinecone(opts);
  }

  if (!indexRef) {
    if (config.PINECONE_INDEX_HOST) {
      indexRef = client.index(config.PINECONE_INDEX_NAME, config.PINECONE_INDEX_HOST);
    } else {
      indexRef = client.index(config.PINECONE_INDEX_NAME);
    }

    // Log which endpoint is being used to catch misrouting early
    // eslint-disable-next-line no-console
    console.log('[pinecone] Using index endpoint', {
      name: config.PINECONE_INDEX_NAME,
      host: config.PINECONE_INDEX_HOST ?? '(controller-derived)',
      environment: config.PINECONE_ENVIRONMENT ?? '(unset)',
    });
  }

  // One-time connectivity probe; logs details (with timeout) but does not throw
  if (!verifiedOnce) {
    verifiedOnce = true;
    withTimeout(indexRef.describeIndexStats({}), 8000, 'describeIndexStats')
      .then((stats) => {
        // eslint-disable-next-line no-console
        console.log('[pinecone] describeIndexStats OK', {
          dimension: stats?.dimension,
          namespaces: Object.keys(stats?.namespaces ?? {}),
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[pinecone] describeIndexStats failed; upserts may fail', {
          message: err?.message,
          code: err?.code,
          name: err?.name,
          hint:
            'Ensure PINECONE_INDEX_HOST points to the working "svc.aped-4627-b74a..." endpoint and the process loads services/ai-processing-service/.env',
        });
      });
  }

  return indexRef;
};