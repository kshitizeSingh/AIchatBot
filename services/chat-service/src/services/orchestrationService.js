const { v4: uuidv4 } = require('uuid');
const embeddingService = require('./embeddingService');
const retrievalService = require('./retrievalService');
const generationService = require('./generationService');
const conversationService = require('./conversationService');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

/**
 * Orchestration service for the complete RAG pipeline
 * Coordinates the 11-step process from query to response
 */
class OrchestrationService {
  constructor() {
    this.maxQueryLength = 2000;
    this.defaultOptions = {
      top_k: 5,
      min_score: 0.3,
      temperature: 0.7,
      max_tokens: 1024,
      stream: false
    };
  }

  /**
   * Main chat method - executes the complete RAG pipeline
   * @param {Object} request - Chat request data
   * @param {Object} user - Authenticated user context
   * @param {Object} org - Organization context
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Chat response
   */
  async chat(request, user, org, options = {}) {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    try {
      // Validate input
      this.validateChatRequest(request);
      
      const {
        query,
        conversation_id = null,
        options: requestOptions = {}
      } = request;
      
      const mergedOptions = {
        ...this.defaultOptions,
        ...requestOptions,
        ...options
      };
      
      logger.info('Starting RAG pipeline', {
        requestId,
        orgId: org.org_id,
        userId: user.user_id,
        conversationId: conversation_id,
        queryLength: query.length,
        options: mergedOptions
      });
      
      // Execute the 11-step RAG pipeline
      const result = await this.executeRagPipeline({
        query,
        conversation_id,
        user,
        org,
        options: mergedOptions,
        requestId
      });
      
      const duration = Date.now() - startTime;
      
      logger.info('RAG pipeline completed', {
        requestId,
        conversationId: result.conversation_id,
        messageId: result.message_id,
        sourcesCount: result.sources.length,
        duration: `${duration}ms`,
        success: true
      });
      
      return {
        ...result,
        duration_ms: duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('RAG pipeline failed', {
        requestId,
        orgId: org.org_id,
        userId: user.user_id,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * Execute the complete RAG pipeline (11 steps)
   * @param {Object} params - Pipeline parameters
   * @returns {Promise<Object>} Pipeline result
   */
  async executeRagPipeline(params) {
    const {
      query,
      conversation_id,
      user,
      org,
      options,
      requestId
    } = params;

    // Step 1: Resolve conversation
    logger.logRagStage('conversation-resolution', { requestId, conversationId: conversation_id });
    const conversation = await this.resolveConversation(conversation_id, org.org_id, user.user_id, query);
    
    // Step 2: Load conversation history
    logger.logRagStage('history-loading', { requestId, conversationId: conversation.id });
    const history = await this.loadConversationHistory(conversation.id, org.org_id);
    
    // Step 3: Embed query
    logger.logRagStage('embedding', { requestId, queryLength: query.length });
    const queryEmbedding = await embeddingService.embedQuery(query);
    
    // Step 4: Retrieve context
    logger.logRagStage('retrieval', { requestId, topK: options.top_k });
    const retrievalResult = await this.retrieveContext(org.org_id, queryEmbedding, options);
    
    // Step 5: Build context string
    logger.logRagStage('context-building', { requestId, passagesCount: retrievalResult.passages.length });
    const contextData = retrievalService.buildContextString(retrievalResult.passages, options);
    
    // Step 6: Build RAG system prompt
    logger.logRagStage('prompt-building', { requestId, contextLength: contextData.contextString.length });
    const systemPrompt = generationService.buildRagPrompt(contextData.contextString);
    
    // Step 7: Persist user message
    logger.logRagStage('user-message-persistence', { requestId });
    const userMessage = await conversationService.saveMessage(conversation.id, org.org_id, {
      role: 'user',
      content: query
    });
    
    // Step 8: Build messages array for generation
    const messages = this.buildMessagesArray(systemPrompt, history, query);
    
    // Step 9: Generate answer
    logger.logRagStage('generation', { requestId, messageCount: messages.length, stream: options.stream });
    let generationResult;
    
    if (options.stream) {
      generationResult = await this.handleStreamingGeneration(messages, options, {
        conversation,
        org,
        sources: contextData.sources,
        requestId
      });
    } else {
      generationResult = await generationService.generateResponse(messages, options);
      
      // Step 10: Persist assistant message
      logger.logRagStage('assistant-message-persistence', { requestId });
      const assistantMessage = await conversationService.saveMessage(conversation.id, org.org_id, {
        role: 'assistant',
        content: generationResult.content,
        sources: contextData.sources,
        model: generationResult.usage.model,
        tokens_used: generationResult.usage.completion_tokens
      });
      
      // Step 11: Return response
      return {
        conversation_id: conversation.id,
        message_id: assistantMessage.id,
        answer: generationResult.content,
        sources: contextData.sources,
        usage: generationResult.usage
      };
    }
    
    return generationResult;
  }

  /**
   * Resolve conversation (create new or get existing)
   * @param {string|null} conversationId - Existing conversation ID
   * @param {string} orgId - Organization ID
   * @param {string} userId - User ID
   * @param {string} query - User query for title generation
   * @returns {Promise<Object>} Conversation object
   */
  async resolveConversation(conversationId, orgId, userId, query) {
    if (conversationId) {
      try {
        return await conversationService.getConversation(conversationId, orgId);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new NotFoundError('Conversation not found or access denied');
        }
        throw error;
      }
    } else {
      // Create new conversation with auto-generated title
      const title = conversationService.generateConversationTitle(query);
      return await conversationService.createConversation(orgId, userId, { title });
    }
  }

  /**
   * Load and prune conversation history
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID
   * @returns {Promise<Array<Object>>} Pruned conversation history
   */
  async loadConversationHistory(conversationId, orgId) {
    try {
      const history = await conversationService.getConversationHistory(conversationId, orgId, 20);
      return conversationService.pruneHistory(history, 10);
    } catch (error) {
      logger.warn('Failed to load conversation history, continuing with empty history', {
        conversationId,
        orgId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Retrieve context with graceful degradation
   * @param {string} orgId - Organization ID
   * @param {Array<number>} queryEmbedding - Query embedding
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieval result
   */
  async retrieveContext(orgId, queryEmbedding, options) {
    try {
      return await retrievalService.searchSimilarContent(orgId, queryEmbedding, options);
    } catch (error) {
      // Graceful degradation - log error and continue with empty context
      logger.warn('Context retrieval failed, continuing with empty context', {
        orgId,
        error: error.message
      });
      
      return {
        passages: [],
        context: '',
        sources: [],
        metadata: {
          totalPassages: 0,
          includedPassages: 0,
          estimatedTokens: 0,
          topScore: 0
        }
      };
    }
  }

  /**
   * Build messages array for generation
   * @param {string} systemPrompt - System prompt with context
   * @param {Array<Object>} history - Conversation history
   * @param {string} currentQuery - Current user query
   * @returns {Array<Object>} Messages array
   */
  buildMessagesArray(systemPrompt, history, currentQuery) {
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];
    
    // Add conversation history
    for (const historyMessage of history) {
      messages.push({
        role: historyMessage.role,
        content: historyMessage.content
      });
    }
    
    // Add current user query
    messages.push({
      role: 'user',
      content: currentQuery
    });
    
    return messages;
  }

  /**
   * Handle streaming generation with real-time persistence
   * @param {Array<Object>} messages - Messages for generation
   * @param {Object} options - Generation options
   * @param {Object} context - Streaming context
   * @returns {Promise<Object>} Streaming result
   */
  async handleStreamingGeneration(messages, options, context) {
    const { conversation, org, sources, requestId } = context;
    let fullContent = '';
    let assistantMessageId = null;
    
    const streamingOptions = {
      ...options,
      onToken: (token) => {
        fullContent += token;
        // Emit token to client (handled by route layer)
        if (options.onToken) {
          options.onToken(token);
        }
      },
      onComplete: async (result) => {
        try {
          // Persist complete assistant message
          logger.logRagStage('assistant-message-persistence', { requestId });
          const assistantMessage = await conversationService.saveMessage(conversation.id, org.org_id, {
            role: 'assistant',
            content: fullContent,
            sources,
            model: result.usage.model,
            tokens_used: result.usage.completion_tokens
          });
          
          assistantMessageId = assistantMessage.id;
          
          // Notify completion to client
          if (options.onComplete) {
            options.onComplete({
              conversation_id: conversation.id,
              message_id: assistantMessage.id,
              answer: fullContent,
              sources,
              usage: result.usage
            });
          }
        } catch (error) {
          logger.error('Failed to persist streaming message', {
            requestId,
            conversationId: conversation.id,
            error: error.message
          });
          
          if (options.onError) {
            options.onError(error);
          }
        }
      },
      onError: (error) => {
        logger.error('Streaming generation error', {
          requestId,
          conversationId: conversation.id,
          error: error.message
        });
        
        if (options.onError) {
          options.onError(error);
        }
      }
    };
    
    const result = await generationService.generateResponse(messages, streamingOptions);
    
    return {
      conversation_id: conversation.id,
      message_id: assistantMessageId,
      answer: fullContent,
      sources,
      usage: result.usage,
      streaming: true
    };
  }

  /**
   * Validate chat request
   * @param {Object} request - Chat request
   */
  validateChatRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new ValidationError('Request body is required');
    }
    
    const { query, conversation_id, options } = request;
    
    if (!query || typeof query !== 'string') {
      throw new ValidationError('Query is required and must be a string');
    }
    
    if (query.trim().length === 0) {
      throw new ValidationError('Query cannot be empty');
    }
    
    if (query.length > this.maxQueryLength) {
      throw new ValidationError(`Query too long. Maximum length is ${this.maxQueryLength} characters.`);
    }
    
    if (conversation_id && typeof conversation_id !== 'string') {
      throw new ValidationError('Conversation ID must be a string');
    }
    
    if (options && typeof options !== 'object') {
      throw new ValidationError('Options must be an object');
    }
    
    // Validate options if provided
    if (options) {
      this.validateChatOptions(options);
    }
  }

  /**
   * Validate chat options
   * @param {Object} options - Chat options
   */
  validateChatOptions(options) {
    const {
      top_k,
      min_score,
      document_id,
      temperature,
      max_tokens,
      stream
    } = options;
    
    if (top_k !== undefined) {
      if (!Number.isInteger(top_k) || top_k < 1 || top_k > 50) {
        throw new ValidationError('top_k must be an integer between 1 and 50');
      }
    }
    
    if (min_score !== undefined) {
      if (typeof min_score !== 'number' || min_score < 0 || min_score > 1) {
        throw new ValidationError('min_score must be a number between 0 and 1');
      }
    }
    
    if (document_id !== undefined && typeof document_id !== 'string') {
      throw new ValidationError('document_id must be a string');
    }
    
    if (temperature !== undefined) {
      if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
        throw new ValidationError('temperature must be a number between 0 and 2');
      }
    }
    
    if (max_tokens !== undefined) {
      if (!Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > 4096) {
        throw new ValidationError('max_tokens must be an integer between 1 and 4096');
      }
    }
    
    if (stream !== undefined && typeof stream !== 'boolean') {
      throw new ValidationError('stream must be a boolean');
    }
  }

  /**
   * Get orchestration service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const [embeddingHealth, retrievalHealth, generationHealth] = await Promise.all([
        embeddingService.getHealthStatus(),
        retrievalService.getHealthStatus(),
        generationService.getHealthStatus()
      ]);
      
      const allHealthy = [
        embeddingHealth.status,
        retrievalHealth.status,
        generationHealth.status
      ].every(status => status === 'healthy');
      
      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        message: allHealthy ? 'RAG pipeline is operational' : 'One or more RAG components are unhealthy',
        components: {
          embedding: embeddingHealth,
          retrieval: retrievalHealth,
          generation: generationHealth
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Orchestration service error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const orchestrationService = new OrchestrationService();

module.exports = orchestrationService;