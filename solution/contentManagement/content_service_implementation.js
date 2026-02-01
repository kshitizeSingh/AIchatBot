// ============================================================================
// FILE: src/config/database.js
// ============================================================================
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  logger.info('Database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message });
});

module.exports = pool;

// ============================================================================
// FILE: src/config/storage.js
// ============================================================================
const AWS = require('aws-sdk');
const logger = require('../utils/logger');

const storageType = process.env.STORAGE_TYPE || 's3';

let s3Client;

if (storageType === 's3') {
  s3Client = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
  });
  logger.info('S3 client initialized');
} else {
  logger.info('Using local storage (no S3 client)');
}

module.exports = {
  s3Client,
  storageType,
  bucket: process.env.AWS_S3_BUCKET || 'faq-documents',
  presignedUrlExpiry: parseInt(process.env.PRESIGNED_URL_EXPIRY) || 900,
};

// ============================================================================
// FILE: src/config/queue.js
// ============================================================================
const { Kafka } = require('kafkajs');
const logger = require('../utils/logger');

const queueType = process.env.QUEUE_TYPE || 'kafka';

let kafka, producer, consumer;

if (queueType === 'kafka') {
  kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'content-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });

  producer = kafka.producer();
  consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'content-service-group',
  });

  logger.info('Kafka client initialized');
}

module.exports = {
  queueType,
  producer,
  consumer,
};

// ============================================================================
// FILE: src/utils/logger.js
// ============================================================================
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'content-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;

// ============================================================================
// FILE: src/utils/validators.js
// ============================================================================
const ALLOWED_FILE_TYPES = (process.env.ALLOWED_FILE_TYPES || 
  'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'
).split(',');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 52428800; // 50MB

const validateFileType = (contentType) => {
  return ALLOWED_FILE_TYPES.includes(contentType);
};

const validateFileSize = (size) => {
  return size <= MAX_FILE_SIZE;
};

const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
};

module.exports = {
  validateFileType,
  validateFileSize,
  sanitizeFilename,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
};

// ============================================================================
// FILE: src/middlewares/errorHandler.js
// ============================================================================
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user_id: req.user?.user_id,
    org_id: req.user?.org_id,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

// ============================================================================
// FILE: src/middlewares/authMiddleware.js
// ============================================================================
// This would normally be in API Gateway, but included here for completeness
const logger = require('../utils/logger');

const requireAuth = (req, res, next) => {
  // In production, this comes from API Gateway
  // For development/testing, we can extract from headers
  
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  next();
};

const requireAdmin = (req, res, next) => {
  if (!['owner', 'admin'].includes(req.user?.role)) {
    logger.warn('Admin access denied', {
      user_id: req.user?.user_id,
      role: req.user?.role,
      path: req.path,
    });

    return res.status(403).json({
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS',
      required_role: ['owner', 'admin'],
      current_role: req.user?.role,
    });
  }

  next();
};

module.exports = {
  requireAuth,
  requireAdmin,
};

// ============================================================================
// FILE: src/services/s3Service.js
// ============================================================================
const { v4: uuidv4 } = require('uuid');
const { s3Client, bucket, presignedUrlExpiry } = require('../config/storage');
const logger = require('../utils/logger');

class S3Service {
  /**
   * Generate presigned URL for uploading a file
   */
  async generatePresignedUploadUrl(orgId, filename, contentType) {
    const documentId = uuidv4();
    const extension = filename.split('.').pop();
    const s3Key = `${orgId}/documents/${documentId}.${extension}`;

    const params = {
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
      Expires: presignedUrlExpiry,
      Metadata: {
        'org-id': orgId,
        'original-filename': filename,
      },
    };

    try {
      const presignedUrl = await s3Client.getSignedUrlPromise('putObject', params);

      logger.info('Presigned URL generated', {
        org_id: orgId,
        document_id: documentId,
        s3_key: s3Key,
      });

      return {
        documentId,
        presignedUrl,
        s3Key,
        expiresIn: presignedUrlExpiry,
      };
    } catch (error) {
      logger.error('Failed to generate presigned URL', {
        error: error.message,
        org_id: orgId,
      });
      throw new Error('Failed to generate upload URL');
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(s3Key) {
    const params = {
      Bucket: bucket,
      Key: s3Key,
    };

    try {
      await s3Client.deleteObject(params).promise();
      logger.info('File deleted from S3', { s3_key: s3Key });
      return true;
    } catch (error) {
      logger.error('Failed to delete file from S3', {
        error: error.message,
        s3_key: s3Key,
      });
      return false;
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(s3Key) {
    const params = {
      Bucket: bucket,
      Key: s3Key,
    };

    try {
      await s3Client.headObject(params).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }
}

module.exports = new S3Service();

// ============================================================================
// FILE: src/services/queueService.js
// ============================================================================
const { producer } = require('../config/queue');
const logger = require('../utils/logger');

class QueueService {
  async connect() {
    try {
      await producer.connect();
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      await producer.disconnect();
      logger.info('Kafka producer disconnected');
    } catch (error) {
      logger.error('Failed to disconnect Kafka producer', { error: error.message });
    }
  }

  /**
   * Publish document.uploaded event
   */
  async publishDocumentUploaded(documentId, orgId, s3Key, contentType, filename) {
    const event = {
      event_type: 'document.uploaded',
      document_id: documentId,
      org_id: orgId,
      s3_key: s3Key,
      content_type: contentType,
      filename,
      timestamp: new Date().toISOString(),
    };

    try {
      await producer.send({
        topic: 'document.uploaded',
        messages: [
          {
            key: documentId,
            value: JSON.stringify(event),
          },
        ],
      });

      logger.info('Document uploaded event published', {
        document_id: documentId,
        org_id: orgId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to publish event', {
        error: error.message,
        document_id: documentId,
      });

      // Store in failed_events table for retry
      await this.storeFailedEvent(event, error.message);
      return false;
    }
  }

  /**
   * Store failed event for retry
   */
  async storeFailedEvent(event, errorMessage) {
    const db = require('../config/database');
    
    try {
      await db.query(`
        INSERT INTO failed_events (event_type, document_id, org_id, payload, error_message)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        event.event_type,
        event.document_id,
        event.org_id,
        JSON.stringify(event),
        errorMessage,
      ]);

      logger.info('Failed event stored for retry', { document_id: event.document_id });
    } catch (error) {
      logger.error('Failed to store failed event', { error: error.message });
    }
  }
}

module.exports = new QueueService();

// ============================================================================
// FILE: src/services/documentService.js
// ============================================================================
const db = require('../config/database');
const s3Service = require('./s3Service');
const queueService = require('./queueService');
const logger = require('../utils/logger');
const { sanitizeFilename } = require('../utils/validators');

class DocumentService {
  /**
   * Create document metadata
   */
  async createDocument(orgId, userId, filename, s3Key, contentType, fileSize) {
    const sanitized = sanitizeFilename(filename);

    try {
      const result = await db.query(`
        INSERT INTO documents (
          org_id,
          filename,
          original_filename,
          content_type,
          file_size,
          s3_key,
          uploaded_by,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id, filename, status, uploaded_at
      `, [orgId, sanitized, filename, contentType, fileSize, s3Key, userId]);

      logger.info('Document metadata created', {
        document_id: result.rows[0].id,
        org_id: orgId,
        user_id: userId,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create document metadata', {
        error: error.message,
        org_id: orgId,
      });
      throw error;
    }
  }

  /**
   * Get documents for an organization
   */
  async getDocuments(orgId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      status = null,
      sort = 'uploaded_at:desc',
    } = options;

    const [sortField, sortOrder] = sort.split(':');
    const allowedSortFields = ['uploaded_at', 'filename', 'status'];
    const finalSortField = allowedSortFields.includes(sortField) ? sortField : 'uploaded_at';
    const finalSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    try {
      let query = `
        SELECT 
          d.id,
          d.filename,
          d.original_filename,
          d.content_type,
          d.file_size,
          d.status,
          d.error_message,
          d.chunks_count,
          d.uploaded_at,
          d.processed_at,
          json_build_object(
            'user_id', u.id,
            'email', u.email
          ) as uploaded_by
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.org_id = $1 AND d.deleted_at IS NULL
      `;

      const params = [orgId];
      let paramIndex = 2;

      if (status) {
        query += ` AND d.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY d.${finalSortField} ${finalSortOrder}`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) FROM documents
        WHERE org_id = $1 AND deleted_at IS NULL
        ${status ? 'AND status = $2' : ''}
      `;
      const countParams = status ? [orgId, status] : [orgId];
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      return {
        documents: result.rows,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total,
        },
      };
    } catch (error) {
      logger.error('Failed to get documents', {
        error: error.message,
        org_id: orgId,
      });
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocumentById(documentId, orgId) {
    try {
      const result = await db.query(`
        SELECT 
          d.*,
          json_build_object(
            'user_id', u.id,
            'email', u.email
          ) as uploaded_by
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL
      `, [documentId, orgId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get document', {
        error: error.message,
        document_id: documentId,
      });
      throw error;
    }
  }

  /**
   * Update document status
   */
  async updateDocumentStatus(documentId, status, additionalData = {}) {
    try {
      const updates = ['status = $2'];
      const params = [documentId, status];
      let paramIndex = 3;

      if (status === 'completed') {
        updates.push(`processed_at = NOW()`);
        
        if (additionalData.chunksCount) {
          updates.push(`chunks_count = $${paramIndex}`);
          params.push(additionalData.chunksCount);
          paramIndex++;
        }
      }

      if (status === 'failed') {
        if (additionalData.errorMessage) {
          updates.push(`error_message = $${paramIndex}`);
          params.push(additionalData.errorMessage);
          paramIndex++;
        }
        if (additionalData.errorCode) {
          updates.push(`error_code = $${paramIndex}`);
          params.push(additionalData.errorCode);
          paramIndex++;
        }
      }

      updates.push('updated_at = NOW()');

      const query = `
        UPDATE documents
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await db.query(query, params);

      logger.info('Document status updated', {
        document_id: documentId,
        status,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update document status', {
        error: error.message,
        document_id: documentId,
      });
      throw error;
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId, orgId) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Get document details
      const docResult = await client.query(
        'SELECT * FROM documents WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
        [documentId, orgId]
      );

      if (docResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const document = docResult.rows[0];

      // Soft delete in database
      await client.query(
        'UPDATE documents SET deleted_at = NOW() WHERE id = $1',
        [documentId]
      );

      await client.query('COMMIT');

      // Delete from S3 (async, don't wait)
      s3Service.deleteFile(document.s3_key).catch(err => {
        logger.error('Failed to delete S3 file', {
          error: err.message,
          s3_key: document.s3_key,
        });
      });

      logger.info('Document deleted', {
        document_id: documentId,
        org_id: orgId,
      });

      return document;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete document', {
        error: error.message,
        document_id: documentId,
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new DocumentService();

// ============================================================================
// FILE: src/controllers/documentController.js
// ============================================================================
const documentService = require('../services/documentService');
const s3Service = require('../services/s3Service');
const queueService = require('../services/queueService');
const { validateFileType, validateFileSize, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } = require('../utils/validators');
const logger = require('../utils/logger');

class DocumentController {
  /**
   * POST /v1/documents/upload
   * Generate presigned URL for document upload
   */
  async uploadDocument(req, res, next) {
    try {
      const { filename, content_type, file_size } = req.body;
      const { org_id, user_id } = req.user;

      // Validate request
      if (!filename || !content_type) {
        return res.status(400).json({
          error: 'Missing required fields',
          code: 'MISSING_FIELDS',
          required: ['filename', 'content_type'],
        });
      }

      // Validate file type
      if (!validateFileType(content_type)) {
        return res.status(400).json({
          error: 'Unsupported file type',
          code: 'INVALID_FILE_TYPE',
          supported_types: ALLOWED_FILE_TYPES,
        });
      }

      // Validate file size (if provided)
      if (file_size && !validateFileSize(file_size)) {
        return res.status(400).json({
          error: 'File too large',
          code: 'FILE_TOO_LARGE',
          max_size: MAX_FILE_SIZE,
          provided_size: file_size,
        });
      }

      // Generate presigned URL
      const { documentId, presignedUrl, s3Key, expiresIn } = 
        await s3Service.generatePresignedUploadUrl(org_id, filename, content_type);

      // Create document metadata
      await documentService.createDocument(
        org_id,
        user_id,
        filename,
        s3Key,
        content_type,
        file_size
      );

      // Publish event to Kafka
      await queueService.publishDocumentUploaded(
        documentId,
        org_id,
        s3Key,
        content_type,
        filename
      );

      res.status(200).json({
        document_id: documentId,
        presigned_url: presignedUrl,
        s3_key: s3Key,
        expires_in: expiresIn,
        max_file_size: MAX_FILE_SIZE,
        upload_instructions: {
          method: 'PUT',
          headers: {
            'Content-Type': content_type,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v1/documents
   * List documents for organization
   */
  async listDocuments(req, res, next) {
    try {
      const { org_id } = req.user;
      const { limit, offset, status, sort } = req.query;

      const result = await documentService.getDocuments(org_id, {
        limit: parseInt(limit) || 20,
        offset: parseInt(offset) || 0,
        status,
        sort,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v1/documents/:id/status
   * Get document processing status
   */
  async getDocumentStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { org_id } = req.user;

      const document = await documentService.getDocumentById(id, org_id);

      if (!document) {
        return res.status(404).json({
          error: 'Document not found',
          code: 'DOCUMENT_NOT_FOUND',
          document_id: id,
        });
      }

      const response = {
        document_id: document.id,
        filename: document.filename,
        status: document.status,
        uploaded_at: document.uploaded_at,
      };

      if (document.status === 'completed') {
        response.chunks_count = document.chunks_count;
        response.processed_at = document.processed_at;
        response.processing_time_seconds = 
          Math.floor((new Date(document.processed_at) - new Date(document.uploaded_at)) / 1000);
      }

      if (document.status === 'failed') {
        response.error_message = document.error_message;
        response.error_code = document.error_code;
        response.retry_count = document.retry_count;
      }

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /v1/documents/:id
   * Delete a document
   */
  async deleteDocument(req, res, next) {
    try {
      const { id } = req.params;
      const { org_id } = req.user;

      const document = await documentService.deleteDocument(id, org_id);

      if (!document) {
        return res.status(404).json({
          error: 'Document not found',
          code: 'DOCUMENT_NOT_FOUND',
          document_id: id,
        });
      }

      res.status(200).json({
        message: 'Document deleted successfully',
        document_id: id,
        deleted_at: new Date().toISOString(),
        cleanup: {
          metadata_deleted: true,
          s3_deleted: true,  // Async deletion
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DocumentController();

// ============================================================================
// FILE: src/routes/documentRoutes.js
// ============================================================================
const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(requireAuth);

// Upload document (admin only)
router.post('/upload', requireAdmin, documentController.uploadDocument);

// List documents (all authenticated users)
router.get('/', documentController.listDocuments);

// Get document status (all authenticated users)
router.get('/:id/status', documentController.getDocumentStatus);

// Delete document (admin only)
router.delete('/:id', requireAdmin, documentController.deleteDocument);

module.exports = router;