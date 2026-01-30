const { errorResponse } = require('../utils/responses');
const { BaseError } = require('../utils/errors');
const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  // Logging
  logger.error('Request error', {
    name: err.name,
    code: err.code,
    message: err.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack
  });

  // Handle known errors
  if (err instanceof BaseError) {
    return res.status(err.statusCode).json(
      errorResponse(err.code, err.message, { details: err.message })
    );
  }

  // Handle Joi validation errors
  if (err.details) {
    const errors = err.details.map(detail => ({
      field: detail.context.key,
      message: detail.message
    }));
    return res.status(400).json(
      errorResponse('VALIDATION_ERROR', 'Request validation failed', { errors })
    );
  }

  // Handle database errors
  if (err.code === '23505') {
    return res.status(409).json(
      errorResponse('DUPLICATE_ENTRY', 'Duplicate entry in database')
    );
  }

  // Default error
  return res.status(500).json(
    errorResponse('INTERNAL_SERVER_ERROR', 'Unexpected server error')
  );
};
