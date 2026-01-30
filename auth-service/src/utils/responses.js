/**
 * Standard success response format
 */
const successResponse = (data, message = 'Success', meta = {}) => {
  const response = {
    status: 'success',
    message,
    data,
    timestamp: new Date().toISOString()
  };

  // Add pagination or other metadata if provided
  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }

  return response;
};

/**
 * Standard error response format
 */
const errorResponse = (errorCode, message, details = {}, statusCode = 500) => {
  const response = {
    status: 'error',
    error_code: errorCode,
    message,
    timestamp: new Date().toISOString()
  };

  // Add error details if provided (but sanitize for security)
  if (Object.keys(details).length > 0) {
    response.details = sanitizeErrorDetails(details);
  }

  return response;
};

/**
 * Sanitize error details to prevent information leakage
 */
const sanitizeErrorDetails = (details) => {
  const sanitized = { ...details };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'hash'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      delete sanitized[field];
    }
  });
  
  // Remove database error details in production
  if (process.env.NODE_ENV === 'production') {
    delete sanitized.stack;
    delete sanitized.query;
    delete sanitized.parameters;
  }
  
  return sanitized;
};

/**
 * Paginated response format
 */
const paginatedResponse = (data, pagination, message = 'Success') => {
  return successResponse(data, message, {
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      total: pagination.total || 0,
      totalPages: Math.ceil((pagination.total || 0) / (pagination.limit || 10)),
      hasNext: pagination.page * pagination.limit < pagination.total,
      hasPrev: pagination.page > 1
    }
  });
};

/**
 * Validation error response format
 */
const validationErrorResponse = (errors) => {
  const formattedErrors = Array.isArray(errors) ? errors : [errors];
  
  return errorResponse(
    'VALIDATION_ERROR',
    'Input validation failed',
    {
      validation_errors: formattedErrors.map(error => ({
        field: error.path || error.field || 'unknown',
        message: error.message || 'Invalid value',
        value: error.value !== undefined ? error.value : null
      }))
    },
    400
  );
};

/**
 * Authentication error response format
 */
const authErrorResponse = (message = 'Authentication failed') => {
  return errorResponse(
    'AUTHENTICATION_FAILED',
    message,
    {},
    401
  );
};

/**
 * Authorization error response format
 */
const authorizationErrorResponse = (message = 'Insufficient permissions') => {
  return errorResponse(
    'AUTHORIZATION_FAILED',
    message,
    {},
    403
  );
};

/**
 * Not found error response format
 */
const notFoundErrorResponse = (resource = 'Resource') => {
  return errorResponse(
    'RESOURCE_NOT_FOUND',
    `${resource} not found`,
    {},
    404
  );
};

/**
 * Rate limit error response format
 */
const rateLimitErrorResponse = (retryAfter = null) => {
  const details = retryAfter ? { retry_after: retryAfter } : {};
  
  return errorResponse(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Please try again later.',
    details,
    429
  );
};

/**
 * Server error response format
 */
const serverErrorResponse = (message = 'Internal server error') => {
  return errorResponse(
    'INTERNAL_SERVER_ERROR',
    message,
    {},
    500
  );
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
  validationErrorResponse,
  authErrorResponse,
  authorizationErrorResponse,
  notFoundErrorResponse,
  rateLimitErrorResponse,
  serverErrorResponse,
  sanitizeErrorDetails
};