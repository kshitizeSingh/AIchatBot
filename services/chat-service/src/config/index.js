const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

/**
 * Environment configuration with validation
 * All required environment variables are validated at startup
 */
const config = {
  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3003,
  
  // JWT Configuration (shared with Auth Service)
  JWT_SECRET: process.env.JWT_SECRET,
  
  // Auth Service Integration
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://auth-service:3000',
  AUTH_HMAC_TIMEOUT_MS: parseInt(process.env.AUTH_HMAC_TIMEOUT_MS, 10) || 5000,
  HMAC_TIMESTAMP_TOLERANCE_MS: parseInt(process.env.HMAC_TIMESTAMP_TOLERANCE_MS, 10) || 300000,
  
  // Circuit Breaker Configuration
  AUTH_CB_FAILURE_THRESHOLD: parseInt(process.env.AUTH_CB_FAILURE_THRESHOLD, 10) || 5,
  AUTH_CB_RECOVERY_MS: parseInt(process.env.AUTH_CB_RECOVERY_MS, 10) || 60000,
  
  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL,
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  
  // Pinecone Configuration
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'faq-platform',
  
  // Ollama Configuration
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  OLLAMA_EMBEDDING_MODEL: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
  EMBEDDING_DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS, 10) || 768,
  OLLAMA_GENERATION_MODEL: process.env.OLLAMA_GENERATION_MODEL || 'llama3',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 60000,
  
  // RAG Configuration
  RAG_TOP_K: parseInt(process.env.RAG_TOP_K, 10) || 5,
  RAG_MIN_SCORE: parseFloat(process.env.RAG_MIN_SCORE) || 0.3,
  RAG_MAX_CONTEXT_TOKENS: parseInt(process.env.RAG_MAX_CONTEXT_TOKENS, 10) || 3000,
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 30,
  
  // Retry Configuration
  RETRY_MAX_ATTEMPTS: parseInt(process.env.RETRY_MAX_ATTEMPTS, 10) || 3,
  RETRY_BASE_MS: parseInt(process.env.RETRY_BASE_MS, 10) || 500,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

/**
 * Validate required environment variables
 * Throws an error if any required variable is missing
 */
function validateConfig() {
  const requiredVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'PINECONE_API_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !config[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate numeric ranges
  if (config.PORT < 1 || config.PORT > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
  
  if (config.EMBEDDING_DIMENSIONS !== 768) {
    throw new Error('EMBEDDING_DIMENSIONS must be 768 to match nomic-embed-text model');
  }
  
  if (config.RAG_MIN_SCORE < 0 || config.RAG_MIN_SCORE > 1) {
    throw new Error('RAG_MIN_SCORE must be between 0 and 1');
  }
  
  if (config.RAG_TOP_K < 1 || config.RAG_TOP_K > 50) {
    throw new Error('RAG_TOP_K must be between 1 and 50');
  }
}

// Validate configuration on module load
validateConfig();

module.exports = config;