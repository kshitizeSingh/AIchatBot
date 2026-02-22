const config = require('../config');
const pinecone = require('../config/pinecone');
const logger = require('../utils/logger');
const { retryPinecone } = require('../utils/retry');

/**
 * Retrieval service for Pinecone vector search
 * Handles vector queries with org isolation and context building
 */
class RetrievalService {
  constructor() {
    this.topK = config.RAG_TOP_K;
    this.minScore = config.RAG_MIN_SCORE;
    this.maxContextTokens = config.RAG_MAX_CONTEXT_TOKENS;
    // Approximate tokens to characters ratio (1 token ≈ 4 characters)
    this.tokensToCharsRatio = 4;
  }

  /**
   * Retrieve relevant context from Pinecone
   * @param {string} orgId - Organization ID for namespace isolation
   * @param {Array<number>} queryEmbedding - Query embedding vector
   * @param {Object} options - Query options
   * @returns {Promise<Array<Object>>} Retrieved passages with metadata
   */
  async retrieveContext(orgId, queryEmbedding, options = {}) {
    if (!orgId) {
      throw new Error('Organization ID is required for context retrieval');
    }

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error('Query embedding must be a non-empty array');
    }

    const {
      topK = this.topK,
      minScore = this.minScore,
      documentId = null,
      includeMetadata = true
    } = options;

    const startTime = Date.now();
    
    try {
      logger.logRagStage('retrieval', {
        orgId,
        topK,
        minScore,
        documentId,
        embeddingDimensions: queryEmbedding.length
      });

      const passages = await retryPinecone(async () => {
        // Build query options
        const queryOptions = {
          vector: queryEmbedding,
          topK,
          includeMetadata
        };

        // Add document filter if specified
        if (documentId) {
          queryOptions.filter = {
            document_id: { $eq: documentId }
          };
        }

        // Execute query with namespace isolation
        const result = await pinecone.query(orgId, queryOptions);
        
        return result.matches || [];
      }, {
        context: {
          orgId,
          topK,
          documentId
        }
      });

      // Filter by minimum score and transform results
      const filteredPassages = passages
        .filter(match => match.score >= minScore)
        .map(match => ({
          id: match.id,
          score: match.score,
          text: match.metadata?.text || '',
          filename: match.metadata?.filename || 'unknown',
          document_id: match.metadata?.document_id || '',
          chunk_index: match.metadata?.chunk_index || 0,
          total_chunks: match.metadata?.total_chunks || 1,
          uploaded_at: match.metadata?.uploaded_at || null
        }));

      const duration = Date.now() - startTime;
      
      logger.info('Context retrieval completed', {
        orgId,
        totalMatches: passages.length,
        filteredMatches: filteredPassages.length,
        topScore: filteredPassages.length > 0 ? filteredPassages[0].score : 0,
        duration: `${duration}ms`,
        documentId
      });

      return filteredPassages;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Context retrieval failed', {
        orgId,
        topK,
        minScore,
        documentId,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });

      // Graceful degradation - return empty results instead of failing
      logger.warn('Graceful degradation: returning empty context due to retrieval failure', {
        orgId,
        error: error.message
      });
      
      return [];
    }
  }

  /**
   * Build context string from retrieved passages
   * @param {Array<Object>} passages - Retrieved passages
   * @param {Object} options - Context building options
   * @returns {Object} Context string and sources metadata
   */
  buildContextString(passages, options = {}) {
    if (!Array.isArray(passages) || passages.length === 0) {
      return {
        contextString: '',
        sources: [],
        tokenCount: 0,
        passageCount: 0
      };
    }

    const {
      maxTokens = this.maxContextTokens,
      includeScores = true,
      includeFilenames = true
    } = options;

    const maxChars = maxTokens * this.tokensToCharsRatio;
    let currentChars = 0;
    const contextParts = [];
    const sources = [];
    
    for (const passage of passages) {
      // Build passage header
      const headerParts = [];
      
      if (includeFilenames && passage.filename) {
        headerParts.push(`Source: ${passage.filename}`);
      }
      
      if (includeScores) {
        headerParts.push(`Score: ${passage.score.toFixed(2)}`);
      }
      
      const header = headerParts.length > 0 ? `[${headerParts.join(' | ')}]` : '';
      const passageText = `${header}\n${passage.text}\n\n`;
      
      // Check if adding this passage would exceed the limit
      if (currentChars + passageText.length > maxChars && contextParts.length > 0) {
        logger.debug('Context size limit reached', {
          maxChars,
          currentChars,
          passagesIncluded: contextParts.length,
          totalPassages: passages.length
        });
        break;
      }
      
      contextParts.push(passageText);
      currentChars += passageText.length;
      
      // Add to sources metadata
      sources.push({
        filename: passage.filename,
        document_id: passage.document_id,
        chunk_index: passage.chunk_index,
        score: passage.score
      });
    }

    const contextString = contextParts.join('');
    const estimatedTokens = Math.ceil(contextString.length / this.tokensToCharsRatio);
    
    logger.logRagStage('context-building', {
      totalPassages: passages.length,
      includedPassages: contextParts.length,
      contextLength: contextString.length,
      estimatedTokens,
      maxTokens
    });

    return {
      contextString,
      sources,
      tokenCount: estimatedTokens,
      passageCount: contextParts.length
    };
  }

  /**
   * Search for similar documents across the organization
   * @param {string} orgId - Organization ID
   * @param {Array<number>} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results with context
   */
  async searchSimilarContent(orgId, queryEmbedding, options = {}) {
    const passages = await this.retrieveContext(orgId, queryEmbedding, options);
    const context = this.buildContextString(passages, options);
    
    return {
      passages,
      context: context.contextString,
      sources: context.sources,
      metadata: {
        totalPassages: passages.length,
        includedPassages: context.passageCount,
        estimatedTokens: context.tokenCount,
        topScore: passages.length > 0 ? passages[0].score : 0
      }
    };
  }

  /**
   * Get document-specific context
   * @param {string} orgId - Organization ID
   * @param {string} documentId - Specific document ID to search within
   * @param {Array<number>} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Document-specific search results
   */
  async searchWithinDocument(orgId, documentId, queryEmbedding, options = {}) {
    if (!documentId) {
      throw new Error('Document ID is required for document-specific search');
    }

    const searchOptions = {
      ...options,
      documentId
    };

    return this.searchSimilarContent(orgId, queryEmbedding, searchOptions);
  }

  /**
   * Check if Pinecone retrieval service is available
   * @returns {Promise<boolean>} Service availability status
   */
  async isAvailable() {
    try {
      return await pinecone.isReady();
    } catch (error) {
      logger.error('Pinecone retrieval service availability check failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get namespace statistics for an organization
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Namespace statistics
   */
  async getNamespaceStats(orgId) {
    if (!orgId) {
      throw new Error('Organization ID is required for namespace stats');
    }

    try {
      const stats = await pinecone.getNamespaceStats(orgId);
      
      logger.info('Retrieved namespace stats', {
        orgId,
        vectorCount: stats.namespaceVectors,
        totalVectors: stats.totalVectors
      });
      
      return stats;
    } catch (error) {
      logger.error('Failed to get namespace stats', {
        orgId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get retrieval service health status
   * @returns {Promise<Object>} Health status object
   */
  async getHealthStatus() {
    try {
      const isAvailable = await this.isAvailable();
      
      if (!isAvailable) {
        return {
          status: 'unhealthy',
          message: 'Pinecone service is not available',
          timestamp: new Date().toISOString()
        };
      }

      return {
        status: 'healthy',
        message: 'Retrieval service is operational',
        configuration: {
          topK: this.topK,
          minScore: this.minScore,
          maxContextTokens: this.maxContextTokens
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Retrieval service error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const retrievalService = new RetrievalService();

module.exports = retrievalService;