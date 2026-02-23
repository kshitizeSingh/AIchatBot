const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const orchestrationService = require('../services/orchestrationService');
const conversationService = require('../services/conversationService');
const logger = require('../utils/logger');
const config = require('../config');

const router = express.Router();

// Rate limiting per organization
const chatRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  keyGenerator: (req) => req.org?.org_id || req.ip,
  message: {
    error_code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply middleware to all chat routes
router.use(requireAuth);
router.use(chatRateLimit);

/**
 * @swagger
 * /v1/chat/query:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Process chat query with RAG pipeline
 *     description: |
 *       Main conversational AI endpoint that processes user queries using the RAG (Retrieval-Augmented Generation) pipeline.
 *       
 *       **Features:**
 *       - Semantic search through organization's knowledge base
 *       - Context-aware responses using conversation history
 *       - Real-time streaming responses via Server-Sent Events
 *       - Multi-turn conversation support
 *       - Source attribution for transparency
 *       
 *       **Processing Flow:**
 *       1. Validate request and authenticate user
 *       2. Resolve or create conversation context
 *       3. Embed user query using Ollama (nomic-embed-text)
 *       4. Retrieve relevant passages from Pinecone vector store
 *       5. Build RAG-augmented prompt with context
 *       6. Generate response using Ollama (llama3)
 *       7. Persist conversation messages
 *       8. Return response with source attribution
 *     
 *     security:
 *       - BearerAuth: []
 *       - HMACHeaders: []
 *     
 *     parameters:
 *       - $ref: '#/components/parameters/ClientId'
 *       - $ref: '#/components/parameters/Timestamp'
 *       - $ref: '#/components/parameters/Signature'
 *     
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatQueryRequest'
 *           examples:
 *             simple_query:
 *               summary: Simple question
 *               value:
 *                 query: "How do I reset my password?"
 *             
 *             continuing_conversation:
 *               summary: Continue existing conversation
 *               value:
 *                 query: "What if I don't receive the reset email?"
 *                 conversation_id: "550e8400-e29b-41d4-a716-446655440000"
 *             
 *             with_options:
 *               summary: Query with custom options
 *               value:
 *                 query: "Explain the authentication process"
 *                 options:
 *                   top_k: 3
 *                   min_score: 0.5
 *                   temperature: 0.3
 *                   stream: false
 *             
 *             streaming_query:
 *               summary: Streaming response
 *               value:
 *                 query: "Tell me about your API documentation"
 *                 options:
 *                   stream: true
 *     
 *     responses:
 *       '200':
 *         description: |
 *           Query processed successfully. Response format depends on streaming option:
 *           
 *           **Non-streaming (default):** Returns complete JSON response
 *           **Streaming:** Returns Server-Sent Events stream
 *         
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatQueryResponse'
 *             examples:
 *               successful_response:
 *                 summary: Successful query response
 *                 value:
 *                   conversation_id: "550e8400-e29b-41d4-a716-446655440000"
 *                   message_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                   answer: "To reset your password, go to Settings → Security and click 'Reset Password'. You will receive an email with reset instructions."
 *                   sources:
 *                     - filename: "user-guide.pdf"
 *                       document_id: "doc-550e8400-e29b-41d4-a716-446655440000"
 *                       chunk_index: 2
 *                       score: 0.91
 *                   usage:
 *                     model: "llama3"
 *                     prompt_tokens: 320
 *                     completion_tokens: 87
 *                   duration_ms: 1842
 *           
 *           text/event-stream:
 *             description: |
 *               Server-Sent Events stream for real-time response delivery.
 *               
 *               **Event Types:**
 *               - `sources`: Knowledge base sources found (sent first)
 *               - `token`: Individual response tokens (sent during generation)
 *               - `done`: Final response metadata (sent last)
 *               - `error`: Error information (sent on failure)
 *             
 *             schema:
 *               type: string
 *               format: text/event-stream
 *             
 *             examples:
 *               sse_stream:
 *                 summary: Server-Sent Events stream
 *                 value: |
 *                   event: sources
 *                   data: {"sources": [{"filename": "guide.pdf", "score": 0.91}], "conversation_id": "uuid"}
 *                   
 *                   event: token
 *                   data: {"token": "To"}
 *                   
 *                   event: token
 *                   data: {"token": " reset"}
 *                   
 *                   event: done
 *                   data: {"conversation_id": "uuid", "answer": "To reset...", "usage": {...}}
 *       
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       
 *       '404':
 *         description: Conversation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               code: 'CONVERSATION_NOT_FOUND'
 *               message: 'Conversation not found for this organization'
 *       
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 * 
 * POST /v1/chat/query
 * Main RAG endpoint - handles both streaming and non-streaming responses
 */
router.post('/query', async (req, res) => {
  const { query, conversation_id, options = {} } = req.body;
  const { org_id, user_id } = req.user;
  const startTime = Date.now();
  
  try {
    // Validate request
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error_code: 'INVALID_REQUEST',
        message: 'Query is required and must be a string'
      });
    }
    
    if (query.length > 2000) {
      return res.status(400).json({
        error_code: 'QUERY_TOO_LONG',
        message: 'Query must not exceed 2000 characters'
      });
    }
    
    // Validate conversation_id if provided
    if (conversation_id && typeof conversation_id !== 'string') {
      return res.status(400).json({
        error_code: 'INVALID_REQUEST',
        message: 'conversation_id must be a string'
      });
    }
    
    logger.info('Processing chat query', {
      org_id,
      user_id,
      conversation_id,
      query_length: query.length,
      streaming: options.stream || false
    });
    
    // Handle streaming response
    if (options.stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });
      
      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);
      
      try {
        await orchestrationService.chat({
          query,
          conversation_id,
          org_id,
          user_id,
          options
        }, {
          onSources: (data) => {
            res.write(`event: sources\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          },
          onToken: (token) => {
            res.write(`event: token\n`);
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          },
          onDone: (result) => {
            res.write(`event: done\n`);
            res.write(`data: ${JSON.stringify(result)}\n\n`);
            res.end();
            clearInterval(keepAlive);
            
            logger.info('Chat query completed (streaming)', {
              org_id,
              user_id,
              conversation_id: result.conversation_id,
              duration_ms: Date.now() - startTime
            });
          },
          onError: (error) => {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
            clearInterval(keepAlive);
          }
        });
      } catch (error) {
        clearInterval(keepAlive);
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
      
      // Handle client disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
        logger.info('Client disconnected from streaming chat', { org_id, user_id });
      });
      
    } else {
      // Handle non-streaming response
      const result = await orchestrationService.chat({
        query,
        conversation_id,
        org_id,
        user_id,
        options
      });
      
      logger.info('Chat query completed', {
        org_id,
        user_id,
        conversation_id: result.conversation_id,
        duration_ms: Date.now() - startTime
      });
      
      res.json(result);
    }
    
  } catch (error) {
    logger.error('Chat query failed', {
      org_id,
      user_id,
      conversation_id,
      error: error.message,
      duration_ms: Date.now() - startTime
    });
    
    if (error.message === 'CONVERSATION_NOT_FOUND') {
      return res.status(404).json({
        error_code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found for this organization'
      });
    }
    
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
});

/**
 * @swagger
 * /v1/chat/conversations:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Create a new conversation
 *     description: |
 *       Creates a new conversation thread for the authenticated user.
 *       Conversations provide context for multi-turn chat sessions.
 *     
 *     security:
 *       - BearerAuth: []
 *       - HMACHeaders: []
 *     
 *     parameters:
 *       - $ref: '#/components/parameters/ClientId'
 *       - $ref: '#/components/parameters/Timestamp'
 *       - $ref: '#/components/parameters/Signature'
 *     
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Optional conversation title
 *                 example: "Password reset help"
 *           examples:
 *             with_title:
 *               summary: Create conversation with title
 *               value:
 *                 title: "API Integration Questions"
 *             
 *             without_title:
 *               summary: Create conversation without title
 *               value: {}
 *     
 *     responses:
 *       '201':
 *         description: Conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *             example:
 *               id: "550e8400-e29b-41d4-a716-446655440000"
 *               title: "API Integration Questions"
 *               created_at: "2026-02-22T10:00:00Z"
 *               updated_at: "2026-02-22T10:00:00Z"
 *               last_message: null
 *       
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/conversations', async (req, res) => {
  const { org_id, user_id } = req.user;
  const { title } = req.body;
  
  try {
    const conversation = await conversationService.createConversation({
      org_id,
      user_id,
      title
    });
    
    logger.info('Conversation created', {
      org_id,
      user_id,
      conversation_id: conversation.id
    });
    
    res.status(201).json(conversation);
  } catch (error) {
    logger.error('Failed to create conversation', {
      org_id,
      user_id,
      error: error.message
    });
    
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to create conversation'
    });
  }
});

/**
 * @swagger
 * /v1/chat/conversations:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: List user's conversations
 *     description: |
 *       Retrieves a paginated list of conversations for the authenticated user.
 *       
 *       **Access Control:**
 *       - **Users**: Can only see their own conversations
 *       - **Admins/Owners**: Can see all conversations in the organization
 *     
 *     security:
 *       - BearerAuth: []
 *       - HMACHeaders: []
 *     
 *     parameters:
 *       - $ref: '#/components/parameters/ClientId'
 *       - $ref: '#/components/parameters/Timestamp'
 *       - $ref: '#/components/parameters/Signature'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - $ref: '#/components/parameters/PaginationOffset'
 *     
 *     responses:
 *       '200':
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConversationList'
 *             example:
 *               conversations:
 *                 - id: "550e8400-e29b-41d4-a716-446655440000"
 *                   title: "Password reset help"
 *                   created_at: "2026-02-22T10:00:00Z"
 *                   updated_at: "2026-02-22T10:05:00Z"
 *                   last_message: "To reset your password..."
 *                 - id: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                   title: "API Documentation"
 *                   created_at: "2026-02-22T09:30:00Z"
 *                   updated_at: "2026-02-22T09:45:00Z"
 *                   last_message: "The API uses REST principles..."
 *               pagination:
 *                 total: 42
 *                 limit: 20
 *                 offset: 0
 *                 has_more: true
 *       
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/conversations', async (req, res) => {
  const { org_id, user_id, role } = req.user;
  const { limit = 20, offset = 0 } = req.query;
  
  try {
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);
    
    // Admin and owner can see all org conversations, users see only their own
    const filterUserId = ['admin', 'owner'].includes(role) ? null : user_id;

    const result = await conversationService.getConversations({
      org_id,
      user_id: filterUserId,
      limit: limitNum,
      offset: offsetNum
    });
    
    logger.info('Conversations retrieved', {
      org_id,
      user_id,
      count: result.conversations.length,
      total: result.pagination.total
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to retrieve conversations', {
      org_id,
      user_id,
      error: error.message
    });
    
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve conversations'
    });
  }
});

/**
 * @swagger
 * /v1/chat/conversations/{id}/messages:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: Get conversation messages
 *     description: |
 *       Retrieves all messages in a specific conversation, including user queries
 *       and AI responses with source attribution.
 *       
 *       **Access Control:**
 *       - **Users**: Can only access their own conversations
 *       - **Admins/Owners**: Can access any conversation in the organization
 *     
 *     security:
 *       - BearerAuth: []
 *       - HMACHeaders: []
 *     
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *       - $ref: '#/components/parameters/ClientId'
 *       - $ref: '#/components/parameters/Timestamp'
 *       - $ref: '#/components/parameters/Signature'
 *     
 *     responses:
 *       '200':
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageList'
 *             example:
 *               conversation_id: "550e8400-e29b-41d4-a716-446655440000"
 *               messages:
 *                 - id: "msg-1"
 *                   role: "user"
 *                   content: "How do I reset my password?"
 *                   sources: []
 *                   model: null
 *                   tokens_used: null
 *                   created_at: "2026-02-22T10:00:00Z"
 *                 - id: "msg-2"
 *                   role: "assistant"
 *                   content: "To reset your password, go to Settings → Security..."
 *                   sources:
 *                     - filename: "user-guide.pdf"
 *                       document_id: "doc-uuid"
 *                       chunk_index: 2
 *                       score: 0.91
 *                   model: "llama3"
 *                   tokens_used: 87
 *                   created_at: "2026-02-22T10:00:02Z"
 *               total: 2
 *       
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       
 *       '403':
 *         description: Access denied to conversation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               code: 'ACCESS_DENIED'
 *               message: 'You do not have access to this conversation'
 *       
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/conversations/:id/messages', async (req, res) => {
  const { org_id, user_id, role } = req.user;
  const { id: conversation_id } = req.params;
  
  try {
    // First check if conversation exists and user has access
    const conversation = await conversationService.getConversation({
      conversation_id,
      org_id
    });
    
    if (!conversation) {
      return res.status(404).json({
        error_code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found'
      });
    }
    
    // Check access permissions
    const hasAccess = ['admin', 'owner'].includes(role) || conversation.user_id === user_id;
    if (!hasAccess) {
      return res.status(403).json({
        error_code: 'ACCESS_DENIED',
        message: 'You do not have access to this conversation'
      });
    }
    
    const messages = await conversationService.getMessages({
      conversation_id,
      org_id
    });
    
    logger.info('Messages retrieved', {
      org_id,
      user_id,
      conversation_id,
      message_count: messages.length
    });
    
    res.json({
      conversation_id,
      messages,
      total: messages.length
    });
  } catch (error) {
    logger.error('Failed to retrieve messages', {
      org_id,
      user_id,
      conversation_id,
      error: error.message
    });
    
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve messages'
    });
  }
});

/**
 * @swagger
 * /v1/chat/conversations/{id}:
 *   delete:
 *     tags:
 *       - Conversations
 *     summary: Delete conversation
 *     description: |
 *       Permanently deletes a conversation and all its associated messages.
 *       This action cannot be undone.
 *       
 *       **Access Control:**
 *       - **Users**: Can only delete their own conversations
 *       - **Admins/Owners**: Can delete any conversation in the organization
 *       
 *       **Cascade Behavior:**
 *       - All messages in the conversation are automatically deleted
 *       - Foreign key constraints ensure data consistency
 *     
 *     security:
 *       - BearerAuth: []
 *       - HMACHeaders: []
 *     
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *       - $ref: '#/components/parameters/ClientId'
 *       - $ref: '#/components/parameters/Timestamp'
 *       - $ref: '#/components/parameters/Signature'
 *     
 *     responses:
 *       '204':
 *         description: Conversation deleted successfully (no content returned)
 *       
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       
 *       '403':
 *         description: Access denied to conversation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               code: 'ACCESS_DENIED'
 *               message: 'You do not have access to this conversation'
 *       
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/conversations/:id', async (req, res) => {
  const { org_id, user_id, role } = req.user;
  const { id: conversation_id } = req.params;
  
  try {
    // First check if conversation exists and user has access
    const conversation = await conversationService.getConversation({
      conversation_id,
      org_id
    });
    
    if (!conversation) {
      return res.status(404).json({
        error_code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found'
      });
    }
    
    // Check access permissions
    const hasAccess = ['admin', 'owner'].includes(role) || conversation.user_id === user_id;
    if (!hasAccess) {
      return res.status(403).json({
        error_code: 'ACCESS_DENIED',
        message: 'You do not have access to this conversation'
      });
    }
    
    await conversationService.deleteConversation({
      conversation_id,
      org_id
    });
    
    logger.info('Conversation deleted', {
      org_id,
      user_id,
      conversation_id
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete conversation', {
      org_id,
      user_id,
      conversation_id,
      error: error.message
    });
    
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to delete conversation'
    });
  }
});

module.exports = router;