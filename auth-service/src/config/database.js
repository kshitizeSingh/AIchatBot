const { Pool } = require('pg');
const config = require('./environment');
const logger = require('../utils/logger');

// Create PostgreSQL connection pool
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: config.database.max,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false
});

// Handle pool events
pool.on('connect', (client) => {
  logger.debug('New database client connected');
});

pool.on('acquire', (client) => {
  logger.debug('Database client acquired from pool');
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool');
});

pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle database client:', err);
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    logger.info('Database connection successful:', {
      currentTime: result.rows[0].current_time,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
    });
    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    throw error;
  }
};

// Initialize database connection on startup
if (require.main === module || process.env.NODE_ENV !== 'test') {
  testConnection().catch((error) => {
    logger.error('Failed to establish database connection on startup:', error);
    process.exit(1);
  });
}

module.exports = pool;