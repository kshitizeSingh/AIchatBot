import { getPineconeIndex } from '../config/pinecone.js';
import { config } from '../config/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const upsertVectors = async ({ orgId, documentId, items }) => {
  const index = getPineconeIndex();
  const namespace = `org_${orgId}`;

  const expectedDim = Number(config.EMBEDDING_DIMENSIONS);
  // eslint-disable-next-line no-console
  console.log('Expected embedding dimension:', expectedDim);
  // eslint-disable-next-line no-console
  console.log(items.length, 'items to upsert. Sample item:', items[0]);

  // Validate dimensions before network calls
  for (const it of items) {
    // eslint-disable-next-line no-console
    console.log('Dimension for item:', it?.vector?.length, 'expected:', expectedDim);
    if (!Array.isArray(it.vector) || it.vector.length !== expectedDim) {
      const e = new Error('Embedding dimension mismatch');
      e.code = 'DIMENSION_MISMATCH';
      throw e;
    }
  }

  const vectors = items.map((it) => ({
    id: `${documentId}_${it.metadata.chunk_index}`,
    values: it.vector,
    metadata: {
      document_id: documentId,
      org_id: orgId,
      chunk_index: it.metadata.chunk_index,
      total_chunks: it.metadata.total_chunks,
      text: it.text,
      filename: it.metadata.filename,
      uploaded_at: it.metadata.uploaded_at,
    },
  }));

  // Batch upsert with retries (idempotent)
  const batchSize = 100;
  const maxAttempts = 3;
  const baseDelayMs = 800;

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);

    if (!Array.isArray(batch)) {
      const e = new Error('PINECONE_UPSERT_INVALID_ARG');
      e.details = { reason: 'batch is not an array', type: typeof batch };
      throw e;
    }

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Pinecone SDK v2 expects an array argument
        await index.namespace(namespace).upsert({records: batch});

        // eslint-disable-next-line no-console
        console.log(`[pinecone] Upsert OK: namespace=${namespace}, count=${batch.length}`);
        break; // batch done
      } catch (err) {
        attempt += 1;
        const last = attempt >= maxAttempts;

        // eslint-disable-next-line no-console
        console.warn('[pinecone] Upsert failed', {
          attempt,
          last,
          message: err?.message,
          code: err?.code,
          name: err?.name,
        });

        if (last) {
          const e = new Error('PINECONE_UPSERT_UNREACHABLE');
          e.cause = err;
          e.details = { namespace, batchStart: i, batchCount: batch.length };
          throw e;
        }

        const jitter = Math.floor(Math.random() * 200);
        const backoff = baseDelayMs * 2 ** (attempt - 1) + jitter;
        await sleep(backoff);
      }
    }
  }
};