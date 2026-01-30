const logger = require('../utils/logger');
const { errorResponse } = require('../utils/responses');
const { 
  BaseError, 
  ValidationError, 
  AuthenticationError, 
  AuthorizationError, 
  DatabaseError 
} = require('../utils/errors');

/**
 * Global error handling middleware
 * Catches all errors and returns standardized error responses
 */
module.exports = (error, req, res, next) => {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  // Log error details
  const errorContext = {
    error: error.message,
    stack: error.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.user_id,
    orgId: req.org_id,
    body: req.body,
    query: req.query,
    params: req.params
  };

  // Handle known error types
  if (error instanceof ValidationError) {
    logger.warn('Validation error', errorContext);
    return res.status(error.statusCode).json(
      errorResponse(error.code, error.message, { violations: error.violations })
    );
  }

  if (error instanceof AuthenticationError) {
    logger.warn('Authentication error', errorContext);
    return res.status(error.statusCode).json(
      errorResponse(error.code, error.message)
    );
  }

  if (error instanceof AuthorizationError) {
    logger.warn('Authorization error', errorContext);
    return res.status(error.statusCode).json(
      errorResponse(error.code, error.message)
    );
  }

  if (error instanceof DatabaseError) {
    logger.error('Database error', {
      ...errorContext,
      originalError: error.originalError?.message,
      originalStack: error.originalError?.stack
    });
    
    // Don't expose database details in production
    const message = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'A database error occurred';
    
    return res.status(error.statusCode).json(
      errorResponse(error.code, message)
    );
  }

  if (error instanceof BaseError) {
    logger.error('Base error', errorContext);
    return res.status(error.statusCode).json(
      errorResponse(error.code, error.message)
    );
  }

  // Handle Joi validation errors
  if (error.isJoi) {
    logger.warn('Joi validation error', {
      ...errorContext,
      validationDetails: error.details
    });
    
    const violations = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    
    return res.status(400).json(
      errorResponse('VALIDATION_ERROR', 'Request validation failed', { violations })
    );
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    logger.warn('JSON parsing error', errorContext);
    return res.status(400).json(
      errorResponse('INVALID_JSON', 'Invalid JSON in request body')
    );
  }

  // Handle rate limit errors
  if (error.status === 429) {
    logger.warn('Rate limit exceeded', errorContext);
    return res.status(429).json(
      errorResponse('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later')
    );
  }

  // Handle payload too large errors
  if (error.status === 413) {
    logger.warn('Payload too large', errorContext);
    return res.status(413).json(
      errorResponse('PAYLOAD_TOO_LARGE', 'Request payload is too large')
    );
  }

  // Handle unknown errors
  logger.error('Unhandled error', errorContext);
  
  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'development' 
    ? error.message 
    : 'An internal server error occurred';
  
  const details = process.env.NODE_ENV === 'development' 
    ? { stack: error.stack } 
    : {};

  return res.status(500).json(
    errorResponse('INTERNAL_SERVER_ERROR', message, details)
  );
};