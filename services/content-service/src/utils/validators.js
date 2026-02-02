const ALLOWED_FILE_TYPES = (process.env.ALLOWED_FILE_TYPES || 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown').split(',');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10);

const validateFileType = (contentType) => ALLOWED_FILE_TYPES.includes(contentType);
const validateFileSize = (size) => size <= MAX_FILE_SIZE;
const sanitizeFilename = (filename) => filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').substring(0, 255);

module.exports = { validateFileType, validateFileSize, sanitizeFilename, ALLOWED_FILE_TYPES, MAX_FILE_SIZE };
