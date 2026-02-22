const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * Pinecone client configuration and initialization
 * Handles vector database connections for RAG retrieval
 */
class PineconeConfig {
  constructor() {
    this.client = null;
    this.index = null;
    this.isConnected = false;
  }

  /**
   * Initialize Pinecone client and index
   * @returns {Object} Pinecone index instance
   */
  async initialize() {
    try {
      // Initialize Pinecone client
      this.client = new Pinecone({
        apiKey: config.PINECONE_API_KEY
      });

      // Get the index instance
      this.index = this.client.index(config.PINECONE_INDEX_NAME);
      
      // Test the connection by getting index stats
      await this.index.describeIndexStats();
      
      this.isConnected = true;
      logger.info('Pinecone client initialized successfully', {
        indexName: config.PINECONE_INDEX_NAME
      });
      
      return this.index;
    } catch (error) {
      logger.error('Failed to initialize Pinecone client', {
        error: error.message,
        indexName: config.PINECONE_INDEX_NAME,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get the Pinecone index instance
   * @returns {Object} Pinecone index
   */
  getIndex() {
    if (!this.index) {
      throw new Error('Pinecone index not initialized. Call initialize() first.');
    }
    return this.index;
  }

  /**
   * Get a namespaced index for org-specific queries
   * @param {string} orgId - Organization ID
   * @returns {Object} Namespaced Pinecone index
   */
  getNamespacedIndex(orgId) {
    if (!orgId) {
      throw new Error('Organization ID is required for namespaced queries');
    }
    
    const namespace = `org_${orgId}`;
    return this.index.namespace(namespace);
  }

  /**
   * Check if Pinecone is connected and ready
   * @returns {boolean} Connection status
   */
  async isReady() {
    if (!this.index || !this.isConnected) {
      return false;
    }
    
    try {
      await this.index.describeIndexStats();
      return true;
    } catch (error) {
      logger.error('Pinecone readiness check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Query vectors in the specified namespace
   * @param {string} orgId - Organization ID for namespace
   * @param {Object} queryOptions - Query parameters
   * @returns {Object} Query results
   */
  async query(orgId, queryOptions) {
    const namespacedIndex = this.getNamespacedIndex(orgId);
    
    try {
      const result = await namespacedIndex.query(queryOptions);
      
      logger.debug('Pinecone query executed', {
        orgId,
        namespace: `org_${orgId}`,
        topK: queryOptions.topK,
        resultsCount: result.matches?.length || 0
      });
      
      return result;
    } catch (error) {
      logger.error('Pinecone query failed', {
        orgId,
        namespace: `org_${orgId}`,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get index statistics for a specific namespace
   * @param {string} orgId - Organization ID
   * @returns {Object} Index stats
   */
  async getNamespaceStats(orgId) {
    try {
      const stats = await this.index.describeIndexStats();
      const namespace = `org_${orgId}`;
      
      return {
        totalVectors: stats.totalVectorCount || 0,
        namespaceVectors: stats.namespaces?.[namespace]?.vectorCount || 0,
        dimension: stats.dimension,
        indexFullness: stats.indexFullness
      };
    } catch (error) {
      logger.error('Failed to get namespace stats', {
        orgId,
        error: error.message
      });
      throw error;
    }
  }
}

// Create singleton instance
const pinecone = new PineconeConfig();

module.exports = pinecone;