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
    // CHANGE: Updated default options with model-specific configurations
    this.defaultOptions = {
      top_k: 5,
      min_score: 0.3,
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
      // CHANGE: Add model-specific timeout configurations
      model_timeout_overrides: {
        'llama3:latest': 120000,        // 2 minutes for llama3
        'gpt-oss:120b-cloud': 300000,  // 5 minutes for large cloud model
        'nomic-embed-text:latest': 30000 // 30 seconds for embedding
      }
    };
    // CHANGE: Add model validation cache
    this.modelValidationCache = new Map();
    this.modelValidationTTL = 300000; // 5 minutes
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
      
      // CHANGE: Add model availability check before starting pipeline
      await this.validateModelAvailability(mergedOptions.model || 'llama3:latest');
      
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
    


    // ENHANCED: Add intelligent context optimization for better performance
    const modelName = options.model || 'llama3:latest';
    const optimizedContext = this.optimizeContextForModel(contextData.contextString, modelName);
    
    // Log context optimization metrics
    logger.info('Context optimization completed', {
      requestId,
      model: modelName,
      originalLength: contextData.contextString.length,
      optimizedLength: optimizedContext.length,
      passagesCount: retrievalResult.passages.length,
      sourcesCount: contextData.sources.length
    });
    
    // Step 6: Build RAG system prompt
    logger.logRagStage('prompt-building', { requestId, contextLength: optimizedContext.length });
    const systemPrompt = generationService.buildRagPrompt(optimizedContext);
    
    // Step 7: Persist user message
    logger.logRagStage('user-message-persistence', { requestId });
    const userMessage = await conversationService.saveMessage(conversation.id, org.org_id, {
      role: 'user',
      content: query
    });
    
    // Step 8: Build messages array for generation
    const messages = this.buildMessagesArray(systemPrompt, history, query);
    
    // CHANGE: Apply model-specific timeout
    const modelSpecificOptions = this.applyModelSpecificOptions(options);
    
    // Step 9: Generate answer
    logger.logRagStage('generation', { requestId, messageCount: messages.length, stream: options.stream });
    let generationResult;
    
    if (options.stream) {
      generationResult = await this.handleStreamingGeneration(messages, modelSpecificOptions, {
        conversation,
        org,
        sources: contextData.sources,
        requestId
      });
    } else {
      generationResult = await generationService.generateResponse(messages, modelSpecificOptions);
      
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
   * CHANGE: Validate model availability with caching
   * @param {string} modelName - Model name to validate
   * @returns {Promise<boolean>} Model availability
   */
  async validateModelAvailability(modelName) {
    const cacheKey = `model_${modelName}`;
    const cached = this.modelValidationCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.modelValidationTTL) {
      if (!cached.available) {
        throw new ValidationError(`Model '${modelName}' is not available`);
      }
      return true;
    }
    
    try {
      const isAvailable = await generationService.isAvailable();
      this.modelValidationCache.set(cacheKey, {
        available: isAvailable,
        timestamp: Date.now()
      });
      
      if (!isAvailable) {
        throw new ValidationError(`Model '${modelName}' is not available`);
      }
      
      return true;
    } catch (error) {
      this.modelValidationCache.set(cacheKey, {
        available: false,
        timestamp: Date.now()
      });
      throw new ValidationError(`Model validation failed: ${error.message}`);
    }
  }

  /**

   * ENHANCED: Optimize context based on model capabilities with intelligent truncation
   * @param {string} context - Original context
   * @param {string} modelName - Target model name
   * @returns {string} Optimized context
   */
  optimizeContextForModel(context, modelName) {
    const modelLimits = {



      'llama3:latest': { 
        maxContextTokens: 3000, 
        maxContextChars: 10000,  // Reduced from 12000 for better performance
        priorityKeywords: ['answer', 'solution', 'how to', 'steps', 'process']
      },
      'gpt-oss:120b-cloud': { 
        maxContextTokens: 8000, 
        maxContextChars: 28000,  // Reduced from 32000 for stability
        priorityKeywords: ['detailed', 'comprehensive', 'analysis', 'explanation']
      },
      'nomic-embed-text:latest': { 
        maxContextTokens: 1000, 
        maxContextChars: 3500,   // Reduced from 4000 for embedding efficiency
        priorityKeywords: ['key', 'important', 'main', 'primary']
      }
    };
    
    const limits = modelLimits[modelName] || modelLimits['llama3:latest'];
    
    if (context.length <= limits.maxContextChars) {
      logger.debug('Context within limits, no optimization needed', {
        modelName,
        contextLength: context.length,
        limit: limits.maxContextChars
      });
      return context;
    }
    



    // Enhanced optimization with priority-based selection
    const optimized = this.intelligentContextTruncation(context, limits);
    








    logger.info('Context optimized for model', {
      modelName,
      originalLength: context.length,
      optimizedLength: optimized.length,

      reduction: `${((context.length - optimized.length) / context.length * 100).toFixed(1)}%`,
      limit: limits.maxContextChars
    });
    
    return optimized;
  }

  /**
   * Intelligent context truncation with priority-based selection
   * @param {string} context - Original context
   * @param {Object} limits - Model limits and configuration
   * @returns {string} Optimized context
   */
  intelligentContextTruncation(context, limits) {
    const paragraphs = context.split('\n\n').filter(p => p.trim().length > 0);
    const priorityKeywords = limits.priorityKeywords || [];
    
    // Score paragraphs based on priority keywords and position
    const scoredParagraphs = paragraphs.map((paragraph, index) => {
      let score = 0;
      
      // Priority keyword scoring
      priorityKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = paragraph.match(regex) || [];
        score += matches.length * 10;
      });
      
      // Position scoring (earlier paragraphs get higher scores)
      score += Math.max(0, 50 - (index * 5));
      
      // Length penalty (very short or very long paragraphs get lower scores)
      if (paragraph.length < 50) score -= 20;
      if (paragraph.length > 1000) score -= 10;
      
      return {
        content: paragraph,
        score,
        length: paragraph.length,
        index
      };
    });
    
    // Sort by score (highest first)
    scoredParagraphs.sort((a, b) => b.score - a.score);
    
    // Select paragraphs until we reach the limit
    let optimized = '';
    let currentLength = 0;
    const selectedParagraphs = [];
    
    for (const paragraph of scoredParagraphs) {
      const potentialLength = currentLength + paragraph.length + 2; // +2 for \n\n
      
      if (potentialLength <= limits.maxContextChars) {
        selectedParagraphs.push(paragraph);
        currentLength = potentialLength;
      } else {
        // Try to fit a truncated version of this paragraph
        const remainingSpace = limits.maxContextChars - currentLength - 2;
        if (remainingSpace > 100) { // Only if we have meaningful space
          const truncated = this.truncateAtSentenceBoundary(paragraph.content, remainingSpace);
          if (truncated.length > 50) { // Only if truncation leaves meaningful content
            selectedParagraphs.push({
              ...paragraph,
              content: truncated,
              length: truncated.length
            });
            break;
          }
        }
        break;
      }
    }
    
    // Sort selected paragraphs back to original order for coherence
    selectedParagraphs.sort((a, b) => a.index - b.index);
    
    // Combine selected paragraphs
    optimized = selectedParagraphs.map(p => p.content).join('\n\n');
    
    // Final fallback: sentence-level truncation if still too long
    if (optimized.length > limits.maxContextChars) {
      optimized = this.truncateAtSentenceBoundary(optimized, limits.maxContextChars);
    }
    
    return optimized.trim();
  }

  /**
   * Truncate text at sentence boundary
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateAtSentenceBoundary(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    
    const sentences = text.split(/[.!?]+\s+/);
    let truncated = '';
    
    for (const sentence of sentences) {
      const potential = truncated + sentence + '. ';
      if (potential.length > maxLength) {
        break;
      }
      truncated = potential;
    }
    
    // If no complete sentences fit, truncate at word boundary
    if (truncated.length === 0) {
      const words = text.split(' ');
      for (const word of words) {
        const potential = truncated + word + ' ';
        if (potential.length > maxLength) {
          break;
        }
        truncated = potential;
      }
    }
    
    return truncated.trim();
  }

  /**
   * CHANGE: Apply model-specific options including timeouts
   * @param {Object} options - Base options
   * @returns {Object} Model-specific options
   */
  applyModelSpecificOptions(options) {
    const modelName = options.model || 'llama3:latest';
    const modelSpecificOptions = { ...options };
    
    // Apply timeout overrides
    if (this.defaultOptions.model_timeout_overrides[modelName]) {
      modelSpecificOptions.timeout = this.defaultOptions.model_timeout_overrides[modelName];
    }
    
    // Apply model-specific parameter adjustments
    switch (modelName) {
      case 'llama3:latest':
        // Optimize for faster response
        modelSpecificOptions.temperature = Math.min(options.temperature || 0.7, 0.8);
        modelSpecificOptions.max_tokens = Math.min(options.max_tokens || 1024, 1024);
        break;
        
      case 'gpt-oss:120b-cloud':
        // Allow higher creativity for larger model
        modelSpecificOptions.temperature = options.temperature || 0.9;
        modelSpecificOptions.max_tokens = Math.min(options.max_tokens || 2048, 2048);
        break;
        
      default:
        // Keep original options
        break;
    }
    
    return modelSpecificOptions;
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
      stream,
      model // CHANGE: Add model validation
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
    
    // CHANGE: Add model validation
    if (model !== undefined) {
      if (typeof model !== 'string') {
        throw new ValidationError('model must be a string');
      }
      
      const supportedModels = ['llama3:latest', 'gpt-oss:120b-cloud', 'nomic-embed-text:latest'];
      if (!supportedModels.includes(model)) {
        throw new ValidationError(`Unsupported model. Supported models: ${supportedModels.join(', ')}`);
      }
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