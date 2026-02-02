const { Pool } = require('pg');
const logger = require('../utils/logger');

const {
  DATABASE_URL,
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_NAME = 'postgres',
  DB_USER = 'postgres',
  DB_PASSWORD = 'admin',
  DB_POOL_SIZE = '10',
  DB_IDLE_TIMEOUT = '10000',
  DB_CONNECTION_TIMEOUT = '2000',
} = process.env;

const connectionString = DATABASE_URL || `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
console.log('Connecting to database with connection string:', connectionString)
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  max: parseInt(DB_POOL_SIZE, 10),
  idleTimeoutMillis: parseInt(DB_IDLE_TIMEOUT, 10),
  connectionTimeoutMillis: parseInt(DB_CONNECTION_TIMEOUT, 10)
});
// const pool = new Pool({
//   connectionString,
//   max: parseInt(DB_POOL_SIZE, 10),
//   idleTimeoutMillis: parseInt(DB_IDLE_TIMEOUT, 10),
//   connectionTimeoutMillis: parseInt(DB_CONNECTION_TIMEOUT, 10),
// // });

pool.on('connect', () => logger.info('Database connection established'));
pool.on('error', (err) => logger.error('Database error', { error: err.message }));

module.exports = pool;
