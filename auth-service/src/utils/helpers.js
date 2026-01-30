const crypto = require('crypto');
const { PATTERNS } = require('./constants');

/**
 * Utility helper functions
 */

/**
 * Check if a string is a valid email
 */
const isValidEmail = (email) => {
  return typeof email === 'string' && PATTERNS.EMAIL.test(email.toLowerCase());
};

/**
 * Check if a string is a valid UUID
 */
const isValidUUID = (uuid) => {
  return typeof uuid === 'string' && PATTERNS.UUID.test(uuid);
};

/**
 * Check if a string is a valid JWT token format
 */
const isValidJWT = (token) => {
  return typeof token === 'string' && PATTERNS.JWT_TOKEN.test(token);
};

/**
 * Generate a random string of specified length
 */
const generateRandomString = (length = 32, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => {
  let result = '';
  const charsetLength = charset.length;
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charsetLength);
    result += charset[randomIndex];
  }
  
  return result;
};

/**
 * Generate a cryptographically secure random hex string
 */
const generateSecureHex = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Sleep for specified milliseconds (useful for testing)
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Deep clone an object
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
};

/**
 * Remove undefined and null values from object
 */
const cleanObject = (obj) => {
  const cleaned = {};
  
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== null) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        const cleanedNested = cleanObject(obj[key]);
        if (Object.keys(cleanedNested).length > 0) {
          cleaned[key] = cleanedNested;
        }
      } else {
        cleaned[key] = obj[key];
      }
    }
  }
  
  return cleaned;
};

/**
 * Convert string to camelCase
 */
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

/**
 * Convert string to snake_case
 */
const toSnakeCase = (str) => {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
};

/**
 * Convert object keys to camelCase
 */
const keysToCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(keysToCamelCase);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const converted = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const camelKey = toCamelCase(key);
        converted[camelKey] = keysToCamelCase(obj[key]);
      }
    }
    return converted;
  }
  
  return obj;
};

/**
 * Convert object keys to snake_case
 */
const keysToSnakeCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(keysToSnakeCase);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const converted = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const snakeKey = toSnakeCase(key);
        converted[snakeKey] = keysToSnakeCase(obj[key]);
      }
    }
    return converted;
  }
  
  return obj;
};

/**
 * Mask sensitive data for logging
 */
const maskSensitiveData = (obj, sensitiveFields = ['password', 'token', 'secret', 'key']) => {
  const masked = deepClone(obj);
  
  const maskValue = (value) => {
    if (typeof value === 'string') {
      if (value.length <= 4) {
        return '*'.repeat(value.length);
      }
      return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
    }
    return '***';
  };
  
  const maskObject = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(maskObject);
    }
    
    if (obj !== null && typeof obj === 'object') {
      const result = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
            result[key] = maskValue(obj[key]);
          } else {
            result[key] = maskObject(obj[key]);
          }
        }
      }
      return result;
    }
    
    return obj;
  };
  
  return maskObject(masked);
};

/**
 * Format bytes to human readable string
 */
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Format duration in milliseconds to human readable string
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

/**
 * Retry function with exponential backoff
 */
const retry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      await sleep(delay);
    }
  }
};

/**
 * Debounce function
 */
const debounce = (func, delay) => {
  let timeoutId;
  
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

/**
 * Throttle function
 */
const throttle = (func, delay) => {
  let lastExecTime = 0;
  
  return function (...args) {
    const now = Date.now();
    
    if (now - lastExecTime >= delay) {
      lastExecTime = now;
      return func.apply(this, args);
    }
  };
};

module.exports = {
  isValidEmail,
  isValidUUID,
  isValidJWT,
  generateRandomString,
  generateSecureHex,
  sleep,
  deepClone,
  cleanObject,
  toCamelCase,
  toSnakeCase,
  keysToCamelCase,
  keysToSnakeCase,
  maskSensitiveData,
  formatBytes,
  formatDuration,
  retry,
  debounce,
  throttle
};