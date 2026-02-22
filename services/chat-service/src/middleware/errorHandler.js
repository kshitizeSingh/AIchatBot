const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Global error handler middleware for Express
 * Handles all unhandled errors and provides consistent error responses
 */

/**
 * Error response structure
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {string} requestId - Request ID for tracking
 * @param {Object} details - Additional error details (only in development)
 * @returns {Object} Standardized error response
 */
function createErrorResponse(code, message, requestId, details = null) {
  const response = {
    error: {
      code,
      message,
      request_id: requestId
    }
  };
  
  // Include details only in development
  if (process.env.NODE_ENV === 'development' && details) {
    response.error.details = details;
  }
  
  return response;
}

/**
 * Map error types to HTTP status codes and error codes
 * @param {Error} error - Error object
 * @returns {Object} Status code and error code mapping
 */
function mapErrorToResponse(error) {
  // Custom application errors
  if (error.name === 'ValidationError') {
    return {
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: error.message
    };
  }
  
  if (error.name === 'AuthenticationError') {
    return {
      statusCode: 401,
      code: error.code || 'AUTHENTICATION_FAILED',
      message: error.message
    };
  }
  
  if (error.name === 'AuthorizationError') {
    return {
      statusCode: 403,
      code: error.code || 'AUTHORIZATION_FAILED',
      message: error.message
    };
  }
  
  if (error.name === 'NotFoundError') {
    return {
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: error.message
    };
  }
  
  if (error.name === 'ConflictError') {
    return {
      statusCode: 409,
      code: 'RESOURCE_CONFLICT',
      message: error.message
    };
  }
  
  if (error.name === 'RateLimitError') {
    return {
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: error.message
    };
  }
  
  // Database errors
  if (error.code === '23505') { // PostgreSQL unique violation
    return {
      statusCode: 409,
      code: 'RESOURCE_CONFLICT',
      message: 'Resource already exists'
    };
  }
  
  if (error.code === '23503') { // PostgreSQL foreign key violation
    return {
      statusCode: 400,
      code: 'INVALID_REFERENCE',
      message: 'Referenced resource does not exist'
    };
  }
  
  if (error.code === '23502') { // PostgreSQL not null violation
    return {
      statusCode: 400,
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Required field is missing'
    };
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return {
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token'
    };
  }
  
  if (error.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      code: 'EXPIRED_TOKEN',
      message: 'Authentication token has expired'
    };
  }
  
  // External service errors
  if (error.message?.includes('Ollama')) {
    return {
      statusCode: 503,
      code: 'OLLAMA_UNAVAILABLE',
      message: 'AI service is temporarily unavailable'
    };
  }
  
  if (error.message?.includes('Pinecone')) {
    return {
      statusCode: 503,
      code: 'VECTOR_DB_UNAVAILABLE',
      message: 'Vector database is temporarily unavailable'
    };
  }
  
  if (error.message?.includes('Auth Service')) {
    return {
      statusCode: 503,
      code: 'AUTH_SERVICE_UNAVAILABLE',
      message: 'Authentication service is temporarily unavailable'
    };
  }
  
  // Circuit breaker errors
  if (error.message?.includes('Circuit breaker')) {
    return {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service is temporarily unavailable due to high error rate'
    };
  }
  
  // Timeout errors
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return {
      statusCode: 504,
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out'
    };
  }
  
  // Default to internal server error
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  };
}

/**
 * Express error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Generate request ID if not present
  const requestId = req.id || uuidv4();
  
  // Map error to response
  const { statusCode, code, message } = mapErrorToResponse(err);
  
  // Log error with context
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]('Request error', {
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    errorCode: code,
    errorMessage: message,
    originalError: err.message,
    stack: statusCode >= 500 ? err.stack : undefined,
    orgId: req.org?.org_id,
    userId: req.user?.user_id,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // Create error response
  const errorResponse = createErrorResponse(
    code,
    message,
    requestId,
    process.env.NODE_ENV === 'development' ? {
      originalError: err.message,
      stack: err.stack
    } : null
  );
  
  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Custom error classes for application-specific errors
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends Error {
  constructor(message, code = 'AUTHENTICATION_FAILED') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}

class AuthorizationError extends Error {
  constructor(message, code = 'AUTHORIZATION_FAILED') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Async error wrapper for Express routes
 * Catches async errors and passes them to error handler
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unmatched routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
}

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
};