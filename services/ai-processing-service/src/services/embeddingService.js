import axios from 'axios';
import { config } from '../config/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TypedArray helpers
const isTypedArray = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
const toNumberArray = (v) => {
  if (Array.isArray(v)) return v.map(Number);
  if (isTypedArray(v)) return Array.from(v, Number);
  return null;
};

// Best-effort JSON parse when server responds with text
function safeParseJson(maybeJson) {
  if (maybeJson == null) return null;
  if (typeof maybeJson === 'object') return maybeJson;
  if (typeof maybeJson === 'string') {
    try {
      return JSON.parse(maybeJson);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalize a heterogeneous embeddings container into number[][].
 * Supports:
 * - number[][]
 * - Float32Array[] (TypedArray[])
 * - [{ embedding: number[]|TypedArray }, ...]
 * - [{ values: number[]|TypedArray }, ...]
 */
function normalizeVectorsContainer(container) {
  if (!Array.isArray(container)) return null;

  // Case A: Already an array of number arrays / typed arrays
  if (container.every((v) => Array.isArray(v) || isTypedArray(v))) {
    const converted = container.map((v) => toNumberArray(v) || []);
    if (converted.every((v) => Array.isArray(v) && v.length > 0)) return converted;
    return null;
  }

  // Case B: Array of objects (e.g., { embedding: [...] } or { values: [...] })
  if (
    container.every(
      (o) =>
        o &&
        (Array.isArray(o.embedding) ||
          isTypedArray(o.embedding) ||
          Array.isArray(o.values) ||
          isTypedArray(o.values))
    )
  ) {
    const converted = container.map((o) => {
      const src = Array.isArray(o.embedding) || isTypedArray(o.embedding) ? o.embedding : o.values;
      return toNumberArray(src) || [];
    });
    if (converted.every((v) => Array.isArray(v) && v.length > 0)) return converted;
    return null;
  }

  // Unknown structure
  return null;
}

/**
 * Try to extract vectors from various Ollama response shapes.
 * Returns number[][] or null if not recognized.
 */
function extractVectorsFromResponse(raw) {
  const data = safeParseJson(raw);
  if (!data || typeof data !== 'object') return null;

  // Common shapes
  // 1) { embeddings: number[][] } or { embeddings: [{ embedding: number[] }, ...] }
  if (data.embeddings) {
    const v = normalizeVectorsContainer(data.embeddings);
    if (v) return v;
  }

  // 2) { data: number[][] } or { data: [{ embedding: number[] }, ...] }
  if (data.data) {
    const v = normalizeVectorsContainer(data.data);
    if (v) return v;
  }

  // 3) { embedding: number[]|TypedArray } // single
  if (Array.isArray(data.embedding) || isTypedArray(data.embedding)) {
    const v = toNumberArray(data.embedding);
    if (v && v.length > 0) return [v];
  }

  // 4) { results: [{ embedding: number[]|TypedArray }, ...] }
  if (Array.isArray(data.results)) {
    const v = normalizeVectorsContainer(data.results);
    if (v) return v;
  }

  // 5) Some servers may use { vector: [...] } for single result
  if (Array.isArray(data.vector) || isTypedArray(data.vector)) {
    const v = toNumberArray(data.vector);
    if (v && v.length > 0) return [v];
  }

  return null;
}

/**
 * Validate vectors:
 * - array of arrays
 * - non-empty
 * - optional dimension check vs EMBEDDING_DIMENSIONS
 */
function validateVectors(vectors, { expectedCount, expectedDim }) {
  if (!Array.isArray(vectors)) return { ok: false, reason: 'Vectors not an array' };
  if (
    !vectors.every(
      (v) => Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
    )
  ) {
    return { ok: false, reason: 'Vectors contain non-numeric or empty arrays' };
  }
  if (typeof expectedCount === 'number' && vectors.length !== expectedCount) {
    return { ok: false, reason: `Embeddings length mismatch: got ${vectors.length}, expected ${expectedCount}` };
  }
  if (typeof expectedDim === 'number' && expectedDim > 0) {
    const got = vectors[0].length;
    if (!vectors.every((v) => v.length === got)) {
      return { ok: false, reason: 'Inconsistent vector lengths across items' };
    }
    if (got !== expectedDim) {
      return { ok: false, reason: `Embedding dimension mismatch: got ${got}, expected ${expectedDim}` };
    }
  }
  return { ok: true };
}

/**
 * Calls Ollama embeddings API robustly.
 * - Tries batch first using { input: [...] }
 * - Parses multiple possible response shapes (including TypedArray and string JSON)
 * - Falls back to per-text calls with both { input } and { prompt }
 * - Validates vector length vs EMBEDDING_DIMENSIONS (if set)
 */
export const embedBatchOllama = async (
  texts,
  { retries = 3, baseDelayMs = 1000 } = {}
) => {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const expectedDim = Number(config.EMBEDDING_DIMENSIONS) || undefined;

  let attempt = 0;
  while (true) {
    try {
      const url = `${config.OLLAMA_URL}/api/embeddings`;

      // First try: batch input (array)
      const batchPayload = { model: config.OLLAMA_EMBEDDING_MODEL, input: texts };
      const { data } = await axios.post(url, batchPayload, { timeout: 60_000 });

      let vectors = extractVectorsFromResponse(data);

      // Validate batch result; if invalid/mismatched count, treat as failure to trigger fallback
      const validation = validateVectors(vectors, { expectedCount: texts.length, expectedDim });
      if (!validation.ok) {
        // eslint-disable-next-line no-console
        console.debug('Batch embeddings parse failed, falling back to per-text mode', {
          reason: validation.reason,
          type: typeof data,
          keys: data && typeof data === 'object' ? Object.keys(data) : undefined,
        });
        throw new Error(validation.reason);
      }

      return vectors;
    } catch (_batchErr) {
      // Per-text fallback with retries
      try {
        const singleVectors = [];
        for (const t of texts) {
          const url = `${config.OLLAMA_URL}/api/embeddings`;

          // Try per-text with { input }
          let vec = null;
          try {
            const { data: d1 } = await axios.post(
              url,
              { model: config.OLLAMA_EMBEDDING_MODEL, input: t },
              { timeout: 60_000 }
            );
            const v1 = extractVectorsFromResponse(d1);
            if (Array.isArray(v1) && Array.isArray(v1[0])) vec = v1[0];
          } catch {
            // ignore, will try prompt
          }

          // If still null, try per-text with { prompt }
          if (!Array.isArray(vec)) {
            const { data: d2 } = await axios.post(
              url,
              { model: config.OLLAMA_EMBEDDING_MODEL, prompt: t },
              { timeout: 60_000 }
            );
            const v2 = extractVectorsFromResponse(d2);
            if (Array.isArray(v2) && Array.isArray(v2[0])) vec = v2[0];

            // Minimal debug of unexpected shapes in single mode
            if (!Array.isArray(vec)) {
              // eslint-disable-next-line no-console
              console.debug('Single embedding parse failed', {
                type: typeof d2,
                keys: d2 && typeof d2 === 'object' ? Object.keys(d2) : undefined,
              });
            }
          }

          const arr = toNumberArray(vec);
          if (!Array.isArray(arr) || arr.length === 0) {
            throw new Error('Invalid single embedding response from Ollama');
          }

          // Dimension validation (if configured)
          if (expectedDim && arr.length !== expectedDim) {
            throw new Error(`Embedding dimension mismatch: got ${arr.length}, expected ${expectedDim}`);
          }

          singleVectors.push(arr);
        }
        return singleVectors;
      } catch (fallbackErr) {
        if (attempt >= retries) throw fallbackErr;
        const jitter = Math.floor(Math.random() * 200);
        const backoff = baseDelayMs * Math.pow(2, attempt) + jitter;
        await sleep(backoff);
        attempt += 1;
      }
    }
  }
};

export const embedChunks = async (chunks) => {
  const batchSize = Number(config.EMBEDDING_BATCH_SIZE) || 100;
  const expectedDim = Number(config.EMBEDDING_DIMENSIONS) || undefined;
  const out = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    // Produce vectors for current batch
    const vecs = await embedBatchOllama(batch.map((c) => c.text));

    // Basic guards to avoid undefined vector assignment
    if (!Array.isArray(vecs) || vecs.length !== batch.length) {
      throw new Error(
        `Embeddings length mismatch: got ${Array.isArray(vecs) ? vecs.length : 'invalid'}, expected ${batch.length}`
      );
    }
    if (expectedDim && (!Array.isArray(vecs[0]) || vecs[0].length !== expectedDim)) {
      throw new Error(
        `Embedding dimension mismatch: got ${Array.isArray(vecs[0]) ? vecs[0].length : 'invalid'}, expected ${expectedDim}`
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      `[embedChunks] vectors received from Ollama for batch size=${batch.length}, dim=${
        Array.isArray(vecs[0]) ? vecs[0].length : 'n/a'
      }`
    );

    for (let j = 0; j < batch.length; j++) {
      out.push({ ...batch[j], vector: vecs[j] });
    }
  }
  return out;
};