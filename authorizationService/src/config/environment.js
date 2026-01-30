const dotenv = require('dotenv');
const path = require('path');

// Load .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET'
];

const validateEnvironment = () => {
  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      name: process.env.DB_NAME || 'fce_auth_db',
      user: process.env.DB_USER || 'fce_user',
      password: process.env.DB_PASSWORD || '',
      max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10)
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'your-256-bit-secret-key-change-in-production',
      accessExpiry: 900,   // 15 minutes
      refreshExpiry: 604800 // 7 days
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info'
    },
    cors: {
      origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
      credentials: true
    }
  };
};

module.exports = validateEnvironment();
