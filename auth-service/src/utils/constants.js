/**
 * Application constants and enums
 */

// User roles
const USER_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  USER: 'user'
};

// Token types
const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  RESET: 'reset',
  VERIFICATION: 'verification'
};

// Authentication status
const AUTH_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  LOCKED: 'locked',
  EXPIRED: 'expired',
  INVALID: 'invalid'
};

// Audit log actions
const AUDIT_ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_failed_account_locked',
  LOGOUT: 'logout',
  TOKEN_REFRESH: 'token_refresh',
  TOKEN_REVOKE: 'token_revoke',
  
  // User management
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  USER_ROLE_CHANGED: 'user_role_changed',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',
  
  // Organization management
  ORG_CREATED: 'org_created',
  ORG_UPDATED: 'org_updated',
  ORG_DELETED: 'org_deleted',
  
  // Security events
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  TOKEN_REUSE_DETECTED: 'token_reuse_detected',
  HMAC_VALIDATION_FAILED: 'hmac_validation_failed'
};

// Audit log status
const AUDIT_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  WARNING: 'warning',
  INFO: 'info'
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
};

// Error codes
const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_LENGTH: 'INVALID_LENGTH',
  
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_NOT_PROVIDED: 'TOKEN_NOT_PROVIDED',
  
  // Authorization errors
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  
  // HMAC errors
  MISSING_HMAC_HEADER: 'MISSING_HMAC_HEADER',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  EXPIRED_REQUEST: 'EXPIRED_REQUEST',
  INVALID_CLIENT_ID: 'INVALID_CLIENT_ID',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // Server errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

// Password requirements
const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 12,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  BLOCKED_PATTERNS: [
    'password', 'admin', 'user', 'login', 'welcome',
    '123456', 'qwerty', 'abc123', 'password123'
  ]
};

// Security settings
const SECURITY_SETTINGS = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 30,
  TOKEN_EXPIRY_MINUTES: 15,
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  HMAC_WINDOW_MINUTES: 5,
  SESSION_TIMEOUT_MINUTES: 30
};

// Database table names
const TABLES = {
  ORGANIZATIONS: 'organizations',
  USERS: 'users',
  REFRESH_TOKENS: 'refresh_tokens',
  AUDIT_LOGS: 'audit_logs',
  SESSIONS: 'sessions'
};

// Environment types
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  TESTING: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

// Log levels
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose'
};

// Regex patterns
const PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  CLIENT_ID: /^pk_[a-f0-9]{32}$/,
  CLIENT_SECRET: /^sk_[a-f0-9]{64}$/,
  JWT_TOKEN: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};

module.exports = {
  USER_ROLES,
  TOKEN_TYPES,
  AUTH_STATUS,
  AUDIT_ACTIONS,
  AUDIT_STATUS,
  HTTP_STATUS,
  ERROR_CODES,
  PASSWORD_REQUIREMENTS,
  SECURITY_SETTINGS,
  TABLES,
  ENVIRONMENTS,
  LOG_LEVELS,
  PATTERNS
};