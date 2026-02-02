const logger = require('../utils/logger');

module.exports = (err, req, res, _next) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user_id: req.user?.user_id,
    org_id: req.user?.org_id,
  });

  // Map known PostgreSQL errors to user-friendly API errors
  if (err && err.code) {
    // Foreign key violation
    if (err.code === '23503') {
      // If the constraint indicates missing organization reference
      if (err.constraint === 'documents_org_id_fkey') {
        return res.status(404).json({ error: 'Organization not found', code: 'ORG_NOT_FOUND' });
      }
      return res.status(400).json({ error: 'Foreign key constraint failed', code: 'FOREIGN_KEY_VIOLATION' });
    }
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
