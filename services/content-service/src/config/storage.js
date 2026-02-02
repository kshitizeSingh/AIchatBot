const AWS = require('aws-sdk');
const logger = require('../utils/logger');

const storageType = process.env.STORAGE_TYPE || 's3';
let s3Client = null;

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
  presignedUrlExpiry: parseInt(process.env.PRESIGNED_URL_EXPIRY || '900', 10),
};
