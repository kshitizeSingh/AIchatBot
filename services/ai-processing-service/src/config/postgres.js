import { Pool } from 'pg';
import { config } from './index.js';

export const pgPool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });

export const isDbReady = async () => {
  try {
    const res = await pgPool.query('SELECT 1');
    return !!res;
  } catch {
    return false;
  }
};
