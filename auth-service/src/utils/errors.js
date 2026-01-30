/**
 * Base error class for all custom errors
 */
class BaseError extends Error {
  constructor(code, message, statusCode = 500, isOperational = true) {
    super(message);
    
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
}

/**
 * Validation error for input validation failures
 */
class ValidationError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 400);
    this.details = details;
  }
}

/**
 * Authentication error for login/token failures
 */
class AuthenticationError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 401);
    this.details = details;
  }
}

/**
 * Authorization error for permission failures
 */
class AuthorizationError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 403);
    this.details = details;
  }
}

/**
 * Not found error for missing resources
 */
class NotFoundError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 404);
    this.details = details;
  }
}

/**
 * Conflict error for duplicate resources
 */
class ConflictError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 409);
    this.details = details;
  }
}

/**
 * Rate limit error for too many requests
 */
class RateLimitError extends BaseError {
  constructor(code, message, retryAfter = null) {
    super(code, message, 429);
    this.retryAfter = retryAfter;
  }
}

/**
 * Database error for database operation failures
 */
class DatabaseError extends BaseError {
  constructor(message, originalError = null) {
    super('DATABASE_ERROR', message, 500);
    this.originalError = originalError;
    
    // Extract useful information from database errors
    if (originalError) {
      this.dbCode = originalError.code;
      this.dbDetail = originalError.detail;
      this.dbConstraint = originalError.constraint;
    }
  }
}

/**
 * External service error for third-party service failures
 */
class ExternalServiceError extends BaseError {
  constructor(service, message, statusCode = 502) {
    super('EXTERNAL_SERVICE_ERROR', message, statusCode);
    this.service = service;
  }
}

/**
 * Business logic error for domain-specific failures
 */
class BusinessLogicError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 422);
    this.details = details;
  }
}

/**
 * Security error for security-related failures
 */
class SecurityError extends BaseError {
  constructor(code, message, details = {}) {
    super(code, message, 403);
    this.details = details;
    this.severity = 'high';
  }
}

/**
 * Check if error is operational (expected) or programming error
 */
const isOperationalError = (error) => {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Extract error information for logging
 */
const getErrorInfo = (error) => {
  if (error instanceof BaseError) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details || {},
      timestamp: error.timestamp,
      isOperational: error.isOperational
    };
  }
  
  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    statusCode: 500,
    isOperational: false,
    timestamp: new Date().toISOString()
  };
};

/**
 * Map database errors to application errors
 */
const mapDatabaseError = (error) => {
  if (!error.code) {
    return new DatabaseError('Database operation failed', error);
  }
  
  switch (error.code) {
    case '23505': // unique_violation
      return new ConflictError(
        'DUPLICATE_ENTRY',
        'Resource already exists',
        { constraint: error.constraint }
      );
    case '23503': // foreign_key_violation
      return new ValidationError(
        'FOREIGN_KEY_VIOLATION',
        'Referenced resource does not exist',
        { constraint: error.constraint }
      );
    case '23502': // not_null_violation
      return new ValidationError(
        'REQUIRED_FIELD_MISSING',
        'Required field is missing',
        { column: error.column }
      );
    case '23514': // check_violation
      return new ValidationError(
        'CONSTRAINT_VIOLATION',
        'Data violates constraint',
        { constraint: error.constraint }
      );
    case '42P01': // undefined_table
      return new DatabaseError('Database table does not exist', error);
    case '42703': // undefined_column
      return new DatabaseError('Database column does not exist', error);
    default:
      return new DatabaseError('Database operation failed', error);
  }
};

module.exports = {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  BusinessLogicError,
  SecurityError,
  isOperationalError,
  getErrorInfo,
  mapDatabaseError
};