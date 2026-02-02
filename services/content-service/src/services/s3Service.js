const { v4: uuidv4 } = require('uuid');
const { s3Client, bucket, presignedUrlExpiry } = require('../config/storage');
const logger = require('../utils/logger');

class S3Service {
  validateS3KeyBelongsToOrg(s3Key, orgId) {
    const expectedPrefix = `${orgId}/`;
    if (!s3Key.startsWith(expectedPrefix)) return false;
    if (s3Key.includes('..') || s3Key.includes('//')) return false;
    return true;
  }

  async generatePresignedUploadUrl(orgId, filename, contentType) {
    const documentId = uuidv4();
    const extension = filename.split('.').pop();
    const s3Key = `${orgId}/documents/${documentId}.${extension}`;

    const params = {
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
      Expires: presignedUrlExpiry,
      ACL: 'private',
      Metadata: {
        'org-id': orgId,
        'original-filename': filename,
        'uploaded-at': new Date().toISOString(),
      },
    };

    try {
      const presignedUrl = await s3Client.getSignedUrlPromise('putObject', params);
      logger.info('Presigned URL generated', { org_id: orgId, document_id: documentId, s3_key: s3Key });
      return { documentId, presignedUrl, s3Key, expiresIn: presignedUrlExpiry };
    } catch (error) {
      logger.error('Failed to generate presigned URL', { error: error.message, org_id: orgId });
      throw new Error('Failed to generate upload URL');
    }
  }

  async generatePresignedDownloadUrl(orgId, s3Key) {
    if (!this.validateS3KeyBelongsToOrg(s3Key, orgId)) {
      logger.warn('Attempted cross-org S3 access', { org_id: orgId, s3_key: s3Key });
      throw new Error('Access denied: document does not belong to your organization');
    }
    const params = { Bucket: bucket, Key: s3Key, Expires: 300 };
    try {
      return await s3Client.getSignedUrlPromise('getObject', params);
    } catch (error) {
      logger.error('Failed to generate download URL', { error: error.message, org_id: orgId });
      throw new Error('Failed to generate download URL');
    }
  }

  async deleteFile(orgId, s3Key) {
    if (!this.validateS3KeyBelongsToOrg(s3Key, orgId)) {
      logger.warn('Attempted cross-org S3 delete', { org_id: orgId, s3_key: s3Key });
      throw new Error('Access denied: document does not belong to your organization');
    }
    const params = { Bucket: bucket, Key: s3Key };
    try {
      await s3Client.deleteObject(params).promise();
      logger.info('File deleted from S3', { org_id: orgId, s3_key: s3Key });
      return true;
    } catch (error) {
      logger.error('Failed to delete file from S3', { error: error.message, s3_key: s3Key });
      return false;
    }
  }

  async fileExists(orgId, s3Key) {
    if (!this.validateS3KeyBelongsToOrg(s3Key, orgId)) return false;
    const params = { Bucket: bucket, Key: s3Key };
    try {
      await s3Client.headObject(params).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') return false;
      throw error;
    }
  }
}

module.exports = new S3Service();
