// Security constants
const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true
};

const BLOCKED_PASSWORDS = [
  'password123', 'admin123', '12345678', 'qwerty123',
  'welcome123', 'sunshine123', 'letmein123', 'password',
  'admin', 'user', 'test123', 'password@123'
];

const ROLE_HIERARCHY = {
  'owner': 3,
  'admin': 2,
  'user': 1
};

const VALID_ROLES = ['owner', 'admin', 'user'];

const ACCOUNT_LOCKOUT = {
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 30
};

const JWT_CONFIG = {
  accessExpiry: 900,    // 15 minutes
  refreshExpiry: 604800 // 7 days
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

const AUDIT_ACTIONS = {
  // Organization
  ORG_REGISTERED: 'org_registered',
  ORG_UPDATED: 'org_updated',
  ORG_DELETED: 'org_deleted',
  
  // User
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  USER_SIGNUP: 'user_signup',
  USER_ROLE_CHANGED: 'user_role_changed',
  
  // Authentication
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_FAILED_ACCOUNT_LOCKED: 'login_failed_account_locked',
  LOGOUT: 'logout',
  TOKEN_REFRESH: 'token_refresh',
  TOKEN_REVOKED: 'token_revoked',
  TOKEN_REUSE_DETECTED: 'token_reuse_detected',
  
  // Security
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',
  PASSWORD_CHANGED: 'password_changed'
};

module.exports = {
  PASSWORD_RULES,
  BLOCKED_PASSWORDS,
  ROLE_HIERARCHY,
  VALID_ROLES,
  ACCOUNT_LOCKOUT,
  JWT_CONFIG,
  HTTP_STATUS,
  AUDIT_ACTIONS
};
