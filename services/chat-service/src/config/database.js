const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * PostgreSQL connection pool configuration
 * Handles connections to the shared database for conversations and messages tables
 */
class DatabaseConfig {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * Initialize PostgreSQL connection pool
   * @returns {Pool} PostgreSQL pool instance
   */
  async initialize() {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: config.DB_POOL_MAX,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        // SSL configuration for production
        ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      this.isConnected = true;
      logger.info('PostgreSQL connection pool initialized successfully', {
        maxConnections: config.DB_POOL_MAX,
        database: this.pool.options.database
      });
      
      // Handle pool errors
      this.pool.on('error', (err) => {
        logger.error('PostgreSQL pool error', { error: err.message });
        this.isConnected = false;
      });
      
      return this.pool;
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL connection pool', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get the database pool instance
   * @returns {Pool} PostgreSQL pool
   */
  getPool() {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call initialize() first.');
    }
    return this.pool;
  }

  /**
   * Check if database is connected and ready
   * @returns {boolean} Connection status
   */
  async isReady() {
    if (!this.pool || !this.isConnected) {
      return false;
    }
    
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      logger.error('Database readiness check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Execute a query with automatic client management
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object} Query result
   */
  async query(text, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   * @param {Function} callback - Transaction callback function
   * @returns {*} Transaction result
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gracefully close all database connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('PostgreSQL connection pool closed');
    }
  }
}

// Create singleton instance
const database = new DatabaseConfig();

module.exports = database;