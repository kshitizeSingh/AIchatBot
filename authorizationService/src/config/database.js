const { Pool } = require('pg');
const env = require('./environment');
const logger = require('../utils/logger');

const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
  max: env.database.max,
  idleTimeoutMillis: env.database.idleTimeoutMillis,
  connectionTimeoutMillis: env.database.connectionTimeoutMillis
});

// Event listeners
pool.on('connect', () => {
  logger.info('Database pool connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { error: err });
});

pool.on('remove', () => {
  logger.info('Client removed from pool');
});

// Test connection
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    logger.error('Failed to connect to database', { error: err });
  } else {
    logger.info('Successfully connected to PostgreSQL database', {
      timestamp: result.rows[0].now
    });
  }
});

module.exports = pool;
