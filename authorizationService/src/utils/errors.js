class BaseError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends BaseError {
  constructor(code, message) {
    super(code, message, 400);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends BaseError {
  constructor(code, message) {
    super(code, message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends BaseError {
  constructor(code, message) {
    super(code, message, 403);
    this.name = 'AuthorizationError';
  }
}

class DatabaseError extends BaseError {
  constructor(message, originalError) {
    super('DATABASE_ERROR', message, 500);
    this.originalError = originalError;
    this.name = 'DatabaseError';
  }
}

class NotFoundError extends BaseError {
  constructor(code, message) {
    super(code, message, 404);
    this.name = 'NotFoundError';
  }
}

module.exports = {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  NotFoundError
};
