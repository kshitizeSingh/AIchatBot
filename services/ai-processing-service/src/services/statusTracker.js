import { pgPool } from '../config/postgres.js';

export const setProcessing = async ({ documentId }) => {
  await pgPool.query('UPDATE documents SET status = $1 WHERE id = $2', ['processing', documentId]);
};

export const setCompleted = async ({ documentId, chunksCount }) => {
  await pgPool.query(
    'UPDATE documents SET status = $1, chunks_count = $2, processed_at = NOW() WHERE id = $3',
    ['completed', chunksCount, documentId]
  );
};

export const setFailed = async ({ documentId, errorMessage }) => {
  await pgPool.query(
    'UPDATE documents SET status = $1, error_message = $2 WHERE id = $3',
    ['failed', errorMessage?.slice(0, 1000) || 'Unknown error', documentId]
  );
};
