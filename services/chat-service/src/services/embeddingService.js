const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retryOllama } = require('../utils/retry');

/**
 * Embedding service for Ollama integration
 * Handles query embedding using nomic-embed-text model
 */
class EmbeddingService {
  constructor() {
    this.ollamaUrl = config.OLLAMA_URL;
    this.embeddingModel = config.OLLAMA_EMBEDDING_MODEL;
    this.expectedDimensions = config.EMBEDDING_DIMENSIONS;
    this.timeout = config.OLLAMA_TIMEOUT_MS;
  }

  /**
   * Embed a text query using Ollama
   * @param {string} query - Text query to embed
   * @param {Object} options - Additional options
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async embedQuery(query, options = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    if (query.length > 8000) {
      throw new Error('Query too long. Maximum length is 8000 characters.');
    }

    const startTime = Date.now();
    
    try {
      logger.logExternalCall('ollama', 'embedding', {
        model: this.embeddingModel,
        queryLength: query.length,
        timeout: this.timeout
      });

      const embedding = await retryOllama(async () => {
        const response = await axios.post(
          `${this.ollamaUrl}/api/embeddings`,
          {
            model: this.embeddingModel,
            prompt: query
          },
          {
            timeout: this.timeout,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.data || !response.data.embedding) {
          throw new Error('Invalid response from Ollama embedding API');
        }

        return response.data.embedding;
      }, {
        context: {
          model: this.embeddingModel,
          queryLength: query.length
        }
      });

      // Validate embedding dimensions
      this.validateEmbedding(embedding);

      const duration = Date.now() - startTime;
      
      logger.info('Query embedding successful', {
        model: this.embeddingModel,
        queryLength: query.length,
        embeddingDimensions: embedding.length,
        duration: `${duration}ms`
      });

      return embedding;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Query embedding failed', {
        model: this.embeddingModel,
        queryLength: query.length,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });

      // Re-throw with more context
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not available. Please check if Ollama is running.');
      }
      
      if (error.response?.status === 404) {
        throw new Error(`Embedding model '${this.embeddingModel}' not found. Please pull the model first.`);
      }
      
      if (error.response?.status === 400) {
        throw new Error(`Invalid request to Ollama: ${error.response.data?.error || error.message}`);
      }

      throw new Error(`Embedding service error: ${error.message}`);
    }
  }

  /**
   * Validate embedding vector
   * @param {Array<number>} embedding - Embedding vector to validate
   */
  validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array');
    }

    if (embedding.length !== this.expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch. Expected ${this.expectedDimensions}, got ${embedding.length}. ` +
        `This indicates a model mismatch between ingestion and query time.`
      );
    }

    // Check if all values are numbers
    const hasInvalidValues = embedding.some(val => 
      typeof val !== 'number' || isNaN(val) || !isFinite(val)
    );

    if (hasInvalidValues) {
      throw new Error('Embedding contains invalid values (NaN or Infinity)');
    }

    // Check if embedding is not all zeros (which might indicate an error)
    const isAllZeros = embedding.every(val => val === 0);
    if (isAllZeros) {
      logger.warn('Embedding vector is all zeros', {
        model: this.embeddingModel,
        dimensions: embedding.length
      });
    }
  }

  /**
   * Batch embed multiple queries
   * @param {Array<string>} queries - Array of queries to embed
   * @param {Object} options - Additional options
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async embedQueries(queries, options = {}) {
    if (!Array.isArray(queries)) {
      throw new Error('Queries must be an array');
    }

    if (queries.length === 0) {
      return [];
    }

    if (queries.length > 10) {
      throw new Error('Maximum 10 queries can be embedded at once');
    }

    const startTime = Date.now();
    
    try {
      logger.info('Batch embedding queries', {
        count: queries.length,
        model: this.embeddingModel
      });

      // Process queries sequentially to avoid overwhelming Ollama
      const embeddings = [];
      for (let i = 0; i < queries.length; i++) {
        const embedding = await this.embedQuery(queries[i], options);
        embeddings.push(embedding);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Batch embedding completed', {
        count: queries.length,
        model: this.embeddingModel,
        duration: `${duration}ms`,
        avgDuration: `${Math.round(duration / queries.length)}ms`
      });

      return embeddings;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Batch embedding failed', {
        count: queries.length,
        model: this.embeddingModel,
        duration: `${duration}ms`,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Check if Ollama embedding service is available
   * @returns {Promise<boolean>} Service availability status
   */
  async isAvailable() {
    try {
      const response = await axios.get(
        `${this.ollamaUrl}/api/tags`,
        { timeout: 5000 }
      );

      // Check if the embedding model is available
      const models = response.data.models || [];
      const hasEmbeddingModel = models.some(model => 
        model.name === this.embeddingModel || 
        model.name.startsWith(this.embeddingModel)
      );

      if (!hasEmbeddingModel) {
        logger.warn('Embedding model not found in Ollama', {
          model: this.embeddingModel,
          availableModels: models.map(m => m.name)
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Ollama embedding service availability check failed', {
        error: error.message,
        url: this.ollamaUrl
      });
      return false;
    }
  }

  /**
   * Get embedding service health status
   * @returns {Promise<Object>} Health status object
   */
  async getHealthStatus() {
    try {
      const isAvailable = await this.isAvailable();
      
      if (!isAvailable) {
        return {
          status: 'unhealthy',
          message: `Ollama service or model '${this.embeddingModel}' not available`,
          timestamp: new Date().toISOString()
        };
      }

      // Test with a simple embedding
      const testQuery = 'health check';
      await this.embedQuery(testQuery);

      return {
        status: 'healthy',
        message: 'Embedding service is operational',
        model: this.embeddingModel,
        dimensions: this.expectedDimensions,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Embedding service error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const embeddingService = new EmbeddingService();

module.exports = embeddingService;