const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

/**
 * Conversation service for PostgreSQL operations
 * Handles conversation and message CRUD with org-scoped access
 */
class ConversationService {
  constructor() {
    this.maxHistoryLength = 50; // Maximum messages to load for context
    this.maxTitleLength = 200;
  }

  /**
   * Create a new conversation
   * @param {string} orgId - Organization ID
   * @param {string} userId - User ID
   * @param {Object} options - Conversation options
   * @returns {Promise<Object>} Created conversation
   */
  async createConversation(orgId, userId, options = {}) {
    if (!orgId || !userId) {
      throw new ValidationError('Organization ID and User ID are required');
    }

    const {
      title = null,
      metadata = {}
    } = options;

    try {
      const conversationId = uuidv4();
      
      const query = `
        INSERT INTO conversations (id, org_id, user_id, title, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, org_id, user_id, title, created_at, updated_at, metadata
      `;
      
      const values = [
        conversationId,
        orgId,
        userId,
        title ? title.substring(0, this.maxTitleLength) : null,
        JSON.stringify(metadata)
      ];
      
      const result = await database.query(query, values);
      const conversation = result.rows[0];
      
      logger.info('Conversation created', {
        conversationId,
        orgId,
        userId,
        title
      });
      
      return conversation;
    } catch (error) {
      logger.error('Failed to create conversation', {
        orgId,
        userId,
        title,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get conversation by ID with org-scoped access
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID for access control
   * @returns {Promise<Object>} Conversation data
   */
  async getConversation(conversationId, orgId) {
    if (!conversationId || !orgId) {
      throw new ValidationError('Conversation ID and Organization ID are required');
    }

    try {
      const query = `
        SELECT id, org_id, user_id, title, created_at, updated_at, metadata
        FROM conversations
        WHERE id = $1 AND org_id = $2
      `;
      
      const result = await database.query(query, [conversationId, orgId]);
      
      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation not found or access denied');
      }
      
      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to get conversation', {
        conversationId,
        orgId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List conversations for a user with pagination
   * @param {string} orgId - Organization ID
   * @param {string} userId - User ID (optional for admin/owner roles)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated conversations
   */
  async listConversations(orgId, userId = null, options = {}) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    const {
      limit = 20,
      offset = 0,
      orderBy = 'updated_at',
      orderDirection = 'DESC'
    } = options;

    try {
      // Build query based on whether userId is provided
      let query = `
        SELECT 
          c.id,
          c.org_id,
          c.user_id,
          c.title,
          c.created_at,
          c.updated_at,
          c.metadata,
          (
            SELECT content 
            FROM messages 
            WHERE conversation_id = c.id 
            ORDER BY created_at DESC 
            LIMIT 1
          ) as last_message
        FROM conversations c
        WHERE c.org_id = $1
      `;
      
      const values = [orgId];
      
      if (userId) {
        query += ' AND c.user_id = $2';
        values.push(userId);
      }
      
      query += ` ORDER BY c.${orderBy} ${orderDirection} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM conversations WHERE org_id = $1';
      const countValues = [orgId];
      
      if (userId) {
        countQuery += ' AND user_id = $2';
        countValues.push(userId);
      }
      
      const [conversationsResult, countResult] = await Promise.all([
        database.query(query, values),
        database.query(countQuery, countValues)
      ]);
      
      const conversations = conversationsResult.rows;
      const total = parseInt(countResult.rows[0].count, 10);
      
      logger.debug('Listed conversations', {
        orgId,
        userId,
        count: conversations.length,
        total,
        limit,
        offset
      });
      
      return {
        conversations,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total
        }
      };
    } catch (error) {
      logger.error('Failed to list conversations', {
        orgId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update conversation title
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID
   * @param {string} title - New title
   * @returns {Promise<Object>} Updated conversation
   */
  async updateConversationTitle(conversationId, orgId, title) {
    if (!conversationId || !orgId) {
      throw new ValidationError('Conversation ID and Organization ID are required');
    }

    try {
      const query = `
        UPDATE conversations 
        SET title = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3
        RETURNING id, org_id, user_id, title, created_at, updated_at, metadata
      `;
      
      const values = [
        title ? title.substring(0, this.maxTitleLength) : null,
        conversationId,
        orgId
      ];
      
      const result = await database.query(query, values);
      
      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation not found or access denied');
      }
      
      logger.info('Conversation title updated', {
        conversationId,
        orgId,
        title
      });
      
      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to update conversation title', {
        conversationId,
        orgId,
        title,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete conversation and all associated messages
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteConversation(conversationId, orgId) {
    if (!conversationId || !orgId) {
      throw new ValidationError('Conversation ID and Organization ID are required');
    }

    try {
      const result = await database.transaction(async (client) => {
        // Delete messages first (CASCADE should handle this, but being explicit)
        await client.query(
          'DELETE FROM messages WHERE conversation_id = $1 AND org_id = $2',
          [conversationId, orgId]
        );
        
        // Delete conversation
        const deleteResult = await client.query(
          'DELETE FROM conversations WHERE id = $1 AND org_id = $2',
          [conversationId, orgId]
        );
        
        return deleteResult.rowCount > 0;
      });
      
      if (!result) {
        throw new NotFoundError('Conversation not found or access denied');
      }
      
      logger.info('Conversation deleted', {
        conversationId,
        orgId
      });
      
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to delete conversation', {
        conversationId,
        orgId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save a message to a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Saved message
   */
  async saveMessage(conversationId, orgId, messageData) {
    if (!conversationId || !orgId || !messageData) {
      throw new ValidationError('Conversation ID, Organization ID, and message data are required');
    }

    const {
      role,
      content,
      sources = [],
      model = null,
      tokens_used = null
    } = messageData;

    if (!role || !content) {
      throw new ValidationError('Message role and content are required');
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      throw new ValidationError('Message role must be user, assistant, or system');
    }

    try {
      const messageId = uuidv4();
      
      const query = `
        INSERT INTO messages (id, conversation_id, org_id, role, content, sources, model, tokens_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, conversation_id, org_id, role, content, sources, model, tokens_used, created_at
      `;
      
      const values = [
        messageId,
        conversationId,
        orgId,
        role,
        content,
        JSON.stringify(sources),
        model,
        tokens_used
      ];
      
      const result = await database.query(query, values);
      const message = result.rows[0];
      
      // Update conversation updated_at timestamp
      await database.query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND org_id = $2',
        [conversationId, orgId]
      );
      
      logger.debug('Message saved', {
        messageId,
        conversationId,
        orgId,
        role,
        contentLength: content.length,
        sourcesCount: sources.length
      });
      
      return message;
    } catch (error) {
      logger.error('Failed to save message', {
        conversationId,
        orgId,
        role,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get messages for a conversation with pagination
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Messages with metadata
   */
  async getMessages(conversationId, orgId, options = {}) {
    if (!conversationId || !orgId) {
      throw new ValidationError('Conversation ID and Organization ID are required');
    }

    const {
      limit = this.maxHistoryLength,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'ASC'
    } = options;

    try {
      // First verify conversation exists and user has access
      await this.getConversation(conversationId, orgId);
      
      const query = `
        SELECT id, conversation_id, org_id, role, content, sources, model, tokens_used, created_at
        FROM messages
        WHERE conversation_id = $1 AND org_id = $2
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $3 OFFSET $4
      `;
      
      const countQuery = `
        SELECT COUNT(*) 
        FROM messages 
        WHERE conversation_id = $1 AND org_id = $2
      `;
      
      const [messagesResult, countResult] = await Promise.all([
        database.query(query, [conversationId, orgId, limit, offset]),
        database.query(countQuery, [conversationId, orgId])
      ]);
      
      const messages = messagesResult.rows;
      const total = parseInt(countResult.rows[0].count, 10);
      
      logger.debug('Retrieved conversation messages', {
        conversationId,
        orgId,
        count: messages.length,
        total
      });
      
      return {
        conversation_id: conversationId,
        messages,
        total
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to get messages', {
        conversationId,
        orgId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get conversation history for context (recent messages)
   * @param {string} conversationId - Conversation ID
   * @param {string} orgId - Organization ID
   * @param {number} maxMessages - Maximum messages to return
   * @returns {Promise<Array<Object>>} Recent messages for context
   */
  async getConversationHistory(conversationId, orgId, maxMessages = 10) {
    try {
      const query = `
        SELECT role, content
        FROM messages
        WHERE conversation_id = $1 AND org_id = $2
        ORDER BY created_at ASC
        LIMIT $3
      `;
      
      const result = await database.query(query, [conversationId, orgId, maxMessages]);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get conversation history', {
        conversationId,
        orgId,
        maxMessages,
        error: error.message
      });
      // Return empty history on error to allow conversation to continue
      return [];
    }
  }

  /**
   * Prune conversation history to manage context window
   * @param {Array<Object>} history - Full conversation history
   * @param {number} maxTurns - Maximum conversation turns to keep
   * @returns {Array<Object>} Pruned history
   */
  pruneHistory(history, maxTurns = 10) {
    if (!Array.isArray(history) || history.length === 0) {
      return [];
    }

    // Keep the most recent maxTurns * 2 messages (user + assistant pairs)
    const maxMessages = maxTurns * 2;
    
    if (history.length <= maxMessages) {
      return history;
    }

    // Keep recent messages
    const prunedHistory = history.slice(-maxMessages);
    
    logger.debug('Conversation history pruned', {
      originalLength: history.length,
      prunedLength: prunedHistory.length,
      maxTurns
    });
    
    return prunedHistory;
  }

  /**
   * Generate conversation title from first user message
   * @param {string} firstMessage - First user message
   * @returns {string} Generated title
   */
  generateConversationTitle(firstMessage) {
    if (!firstMessage || typeof firstMessage !== 'string') {
      return 'New Conversation';
    }

    // Take first 50 characters and add ellipsis if longer
    const maxLength = 50;
    const title = firstMessage.trim();
    
    if (title.length <= maxLength) {
      return title;
    }
    
    return title.substring(0, maxLength).trim() + '...';
  }
}

// Create singleton instance
const conversationService = new ConversationService();

module.exports = conversationService;