const documentService = require('../services/documentService');
const s3Service = require('../services/s3Service');
const queueService = require('../services/queueService');
const { validateFileType, validateFileSize, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } = require('../utils/validators');

class DocumentController {
  async uploadDocument(req, res, next) {
    try {
      const { filename, content_type, file_size } = req.body;
      const user = req.user;
      if (!user?.org_id || !user?.user_id) {
        return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
      }
      const { org_id, user_id } = user;

      if (!filename || !content_type) {
        return res.status(400).json({ error: 'Missing required fields', code: 'MISSING_FIELDS', required: ['filename', 'content_type'] });
      }
      if (!validateFileType(content_type)) {
        return res.status(400).json({ error: 'Unsupported file type', code: 'INVALID_FILE_TYPE', supported_types: ALLOWED_FILE_TYPES });
      }
      if (file_size && !validateFileSize(file_size)) {
        return res.status(400).json({ error: 'File too large', code: 'FILE_TOO_LARGE', max_size: MAX_FILE_SIZE, provided_size: file_size });
      }

      const { documentId, presignedUrl, s3Key, expiresIn } = await s3Service.generatePresignedUploadUrl(org_id, filename, content_type);
      await documentService.createDocument(org_id, user_id, filename, s3Key, content_type, file_size);
      await queueService.publishDocumentUploaded(documentId, org_id, s3Key, content_type, filename);

      res.status(200).json({
        document_id: documentId,
        presigned_url: presignedUrl,
        s3_key: s3Key,
        expires_in: expiresIn,
        max_file_size: MAX_FILE_SIZE,
        upload_instructions: { method: 'PUT', headers: { 'Content-Type': content_type } },
      });
    } catch (error) { next(error); }
  }

  async listDocuments(req, res, next) {
    try {
      const { org_id } = req.user;
      const { limit, offset, status, sort } = req.query;
      const result = await documentService.getDocuments(org_id, { limit: parseInt(limit, 10) || 20, offset: parseInt(offset, 10) || 0, status, sort });
      res.status(200).json(result);
    } catch (error) { next(error); }
  }

  async getDocumentStatus(req, res, next) {
    try {
      const { id } = req.params; const { org_id } = req.user;
      const document = await documentService.getDocumentById(id, org_id);
      if (!document) return res.status(404).json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND', document_id: id });

      const response = { document_id: document.id, filename: document.filename, status: document.status, uploaded_at: document.uploaded_at };
      if (document.status === 'completed') { response.chunks_count = document.chunks_count; response.processed_at = document.processed_at; response.processing_time_seconds = Math.floor((new Date(document.processed_at) - new Date(document.uploaded_at)) / 1000); }
      if (document.status === 'failed') { response.error_message = document.error_message; response.error_code = document.error_code; response.retry_count = document.retry_count; }
      res.status(200).json(response);
    } catch (error) { next(error); }
  }

  async deleteDocument(req, res, next) {
    try {
      const { id } = req.params; const { org_id } = req.user;
      const document = await documentService.deleteDocument(id, org_id);
      if (!document) return res.status(404).json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND', document_id: id });
      res.status(200).json({ message: 'Document deleted successfully', document_id: id, deleted_at: new Date().toISOString(), cleanup: { metadata_deleted: true, s3_deleted: true } });
    } catch (error) { next(error); }
  }

  // Optional: webhook to mark uploaded when S3 notifies via Lambda/Webhook
  async s3UploadedCallback(req, res, next) {
    try {
      const { document_id } = req.body;
      if (!document_id) return res.status(400).json({ error: 'document_id required' });
      const updated = await documentService.markUploaded(document_id);
      if (!updated) return res.status(404).json({ error: 'Document not found' });
      res.json({ message: 'Status updated to uploaded', document_id });
    } catch (e) { next(e); }
  }
}

module.exports = new DocumentController();
