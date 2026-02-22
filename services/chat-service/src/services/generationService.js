const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retryOllama } = require('../utils/retry');

/**
 * Generation service for Ollama chat completion
 * Handles answer generation with streaming and non-streaming support
 */
class GenerationService {
  constructor() {
    this.ollamaUrl = config.OLLAMA_URL;
    this.generationModel = config.OLLAMA_GENERATION_MODEL;
    this.timeout = config.OLLAMA_TIMEOUT_MS;
    this.baseSystemPrompt = this.buildBaseSystemPrompt();
  }

  /**
   * Build base system prompt for RAG responses
   * @returns {string} Base system prompt
   */
  buildBaseSystemPrompt() {
    return `You are a helpful AI assistant for an FAQ platform. Your role is to provide accurate, helpful, and concise answers based on the provided knowledge base context.

Guidelines:
1. Answer questions using ONLY the information provided in the knowledge base context
2. If the context doesn't contain relevant information, clearly state that you don't have enough information to answer
3. Be concise but thorough in your responses
4. Maintain a professional and helpful tone
5. If you reference specific information, you can mention the source document when relevant
6. Do not make up information that isn't in the provided context
7. If the question is unclear, ask for clarification

Format your responses in a clear, easy-to-read manner.`;
  }

  /**
   * Build RAG-augmented system prompt with context
   * @param {string} context - Retrieved context from knowledge base
   * @param {Object} options - Prompt building options
   * @returns {string} Complete system prompt
   */
  buildRagPrompt(context, options = {}) {
    const {
      includeNoContextNotice = true
    } = options;

    let prompt = this.baseSystemPrompt;

    if (context && context.trim().length > 0) {
      prompt += `\n\nKNOWLEDGE BASE CONTEXT:\n${context.trim()}`;
    } else if (includeNoContextNotice) {
      prompt += `\n\nKNOWLEDGE BASE CONTEXT:\nNo relevant context found in the knowledge base for this query. Please inform the user that you don't have specific information about their question in the current knowledge base.`;
    }

    return prompt;
  }

  /**
   * Generate response using Ollama chat API
   * @param {Array<Object>} messages - Chat messages array
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generateResponse(messages, options = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    const {
      temperature = 0.7,
      maxTokens = 1024,
      stream = false,
      model = this.generationModel
    } = options;

    const startTime = Date.now();
    
    try {
      logger.logExternalCall('ollama', 'generation', {
        model,
        messageCount: messages.length,
        temperature,
        maxTokens,
        stream,
        timeout: this.timeout
      });

      if (stream) {
        return await this.generateStreamingResponse(messages, options);
      } else {
        return await this.generateNonStreamingResponse(messages, options);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Response generation failed', {
        model,
        messageCount: messages.length,
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      });

      // Re-throw with more context
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not available. Please check if Ollama is running.');
      }
      
      if (error.response?.status === 404) {
        throw new Error(`Generation model '${model}' not found. Please pull the model first.`);
      }
      
      if (error.response?.status === 400) {
        throw new Error(`Invalid request to Ollama: ${error.response.data?.error || error.message}`);
      }

      throw new Error(`Generation service error: ${error.message}`);
    }
  }

  /**
   * Generate non-streaming response
   * @param {Array<Object>} messages - Chat messages
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete response
   */
  async generateNonStreamingResponse(messages, options = {}) {
    const {
      temperature = 0.7,
      maxTokens = 1024,
      model = this.generationModel
    } = options;

    const startTime = Date.now();

    const result = await retryOllama(async () => {
      const response = await axios.post(
        `${this.ollamaUrl}/api/chat`,
        {
          model,
          messages,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens
          }
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data || !response.data.message) {
        throw new Error('Invalid response from Ollama chat API');
      }

      return response.data;
    }, {
      context: {
        model,
        messageCount: messages.length
      }
    });

    const duration = Date.now() - startTime;
    const content = result.message.content || '';
    
    // Extract token usage if available
    const promptTokens = result.prompt_eval_count || 0;
    const completionTokens = result.eval_count || 0;
    
    logger.info('Non-streaming generation completed', {
      model,
      messageCount: messages.length,
      responseLength: content.length,
      promptTokens,
      completionTokens,
      duration: `${duration}ms`
    });

    return {
      content,
      usage: {
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      },
      duration: duration
    };
  }

  /**
   * Generate streaming response
   * @param {Array<Object>} messages - Chat messages
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Streaming response handler
   */
  async generateStreamingResponse(messages, options = {}) {
    const {
      temperature = 0.7,
      maxTokens = 1024,
      model = this.generationModel,
      onToken = null,
      onComplete = null,
      onError = null
    } = options;

    const startTime = Date.now();
    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    return new Promise((resolve, reject) => {
      retryOllama(async () => {
        const response = await axios.post(
          `${this.ollamaUrl}/api/chat`,
          {
            model,
            messages,
            stream: true,
            options: {
              temperature,
              num_predict: maxTokens
            }
          },
          {
            timeout: this.timeout,
            responseType: 'stream',
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        return response;
      }, {
        context: {
          model,
          messageCount: messages.length
        }
      })
      .then(response => {
        response.data.on('data', (chunk) => {
          try {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              const data = JSON.parse(line);
              
              if (data.message?.content) {
                const token = data.message.content;
                fullContent += token;
                completionTokens++;
                
                if (onToken) {
                  onToken(token);
                }
              }
              
              // Extract token counts if available
              if (data.prompt_eval_count) {
                promptTokens = data.prompt_eval_count;
              }
              
              if (data.done) {
                const duration = Date.now() - startTime;
                
                const result = {
                  content: fullContent,
                  usage: {
                    model,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: promptTokens + completionTokens
                  },
                  duration
                };
                
                logger.info('Streaming generation completed', {
                  model,
                  messageCount: messages.length,
                  responseLength: fullContent.length,
                  promptTokens,
                  completionTokens,
                  duration: `${duration}ms`
                });
                
                if (onComplete) {
                  onComplete(result);
                }
                
                resolve(result);
              }
            }
          } catch (parseError) {
            logger.error('Error parsing streaming response', {
              error: parseError.message,
              chunk: chunk.toString()
            });
          }
        });

        response.data.on('error', (error) => {
          logger.error('Streaming response error', {
            error: error.message
          });
          
          if (onError) {
            onError(error);
          }
          
          reject(error);
        });
      })
      .catch(error => {
        if (onError) {
          onError(error);
        }
        reject(error);
      });
    });
  }

  /**
   * Check if Ollama generation service is available
   * @returns {Promise<boolean>} Service availability status
   */
  async isAvailable() {
    try {
      const response = await axios.get(
        `${this.ollamaUrl}/api/tags`,
        { timeout: 5000 }
      );

      // Check if the generation model is available
      const models = response.data.models || [];
      const hasGenerationModel = models.some(model => 
        model.name === this.generationModel || 
        model.name.startsWith(this.generationModel)
      );

      if (!hasGenerationModel) {
        logger.warn('Generation model not found in Ollama', {
          model: this.generationModel,
          availableModels: models.map(m => m.name)
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Ollama generation service availability check failed', {
        error: error.message,
        url: this.ollamaUrl
      });
      return false;
    }
  }

  /**
   * Get generation service health status
   * @returns {Promise<Object>} Health status object
   */
  async getHealthStatus() {
    try {
      const isAvailable = await this.isAvailable();
      
      if (!isAvailable) {
        return {
          status: 'unhealthy',
          message: `Ollama service or model '${this.generationModel}' not available`,
          timestamp: new Date().toISOString()
        };
      }

      // Test with a simple generation
      const testMessages = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Respond with "OK" to confirm you are working.'
        },
        {
          role: 'user',
          content: 'Health check'
        }
      ];
      
      await this.generateResponse(testMessages, { maxTokens: 10 });

      return {
        status: 'healthy',
        message: 'Generation service is operational',
        model: this.generationModel,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Generation service error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const generationService = new GenerationService();

module.exports = generationService;