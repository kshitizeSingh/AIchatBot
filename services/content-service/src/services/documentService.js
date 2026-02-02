
const s3Service = require('./s3Service');

const logger = require('../utils/logger');
const { sanitizeFilename } = require('../utils/validators');
const documentRepository = require('../persistence/documentRepository');

class DocumentService {
  async createDocument(orgId, userId, filename, s3Key, contentType, fileSize) {
    const sanitized = sanitizeFilename(filename);









    const created = await documentRepository.insertDocument({
      orgId,
      userId,
      filename: sanitized,
      originalFilename: filename,
      contentType,
      fileSize,
      s3Key,
    });
    logger.info('Document metadata created', { document_id: created.id, org_id: orgId, user_id: userId });
    return created;
  }

  async getDocuments(orgId, options = {}) {
    const { limit = 20, offset = 0, status = null, sort = 'uploaded_at:desc' } = options;

    const [sortFieldRaw, sortOrderRaw] = String(sort).split(':');
    const allowedSortFields = ['uploaded_at', 'filename', 'status'];


    const sortField = allowedSortFields.includes(sortFieldRaw) ? sortFieldRaw : 'uploaded_at';
    const sortOrder = sortOrderRaw === 'asc' ? 'ASC' : 'DESC';








    const rows = await documentRepository.listDocuments(orgId, { limit, offset, status, sortField, sortOrder });
    const total = await documentRepository.countDocuments(orgId, { status });














    return {
      documents: rows,
      pagination: { total, limit, offset, has_more: offset + limit < total },
    };
  }

  async getDocumentById(documentId, orgId) {








    return documentRepository.findByIdInOrg(documentId, orgId);
  }

  async updateDocumentStatus(documentId, status, additionalData = {}) {
















    const updated = await documentRepository.updateStatus(documentId, {
      status,
      chunksCount: additionalData.chunksCount,
      errorMessage: additionalData.errorMessage,
      errorCode: additionalData.errorCode,
    });
    logger.info('Document status updated', { document_id: documentId, status });

    return updated;
  }

  async markUploaded(documentId) {





    return documentRepository.markUploaded(documentId);
  }

  async deleteDocument(documentId, orgId) {





















    const document = await documentRepository.findByIdInOrg(documentId, orgId);
    if (!document) return null;
    await documentRepository.softDeleteById(documentId);
    s3Service
      .deleteFile(orgId, document.s3_key)
      .catch((err) => logger.error('Failed to delete S3 file', { error: err.message, s3_key: document.s3_key }));
    logger.info('Document deleted', { document_id: documentId, org_id: orgId });
    return document;
  }
}

module.exports = new DocumentService();
