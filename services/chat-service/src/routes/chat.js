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

// POST /v1/chat/query - Main RAG endpoint
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

// POST /v1/chat/conversations - Create a new conversation
router.post('/conversations', async (req, res) => {
  const { org_id, user_id } = req.user;
  const { title } = req.body || {};
  
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

// GET /v1/chat/conversations - List user's conversations
router.get('/conversations', async (req, res) => {
  const { org_id, user_id, role } = req.user;
  const { limit = 20, offset = 0 } = req.query;
  
  try {
    // Validate pagination parameters
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    const result = await conversationService.getConversations({
      org_id,
      user_id: ['admin', 'owner'].includes(role) ? null : user_id, // Admins can see all
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

// GET /v1/chat/conversations/:id/messages - Get conversation messages
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

// DELETE /v1/chat/conversations/:id - Delete conversation
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