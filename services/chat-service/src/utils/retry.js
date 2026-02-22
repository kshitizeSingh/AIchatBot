const logger = require('./logger');

/**
 * Exponential backoff retry utility with jitter
 * Implements retry logic for external service calls
 */

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseMs - Base delay in milliseconds
 * @param {number} maxMs - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, baseMs = 500, maxMs = 30000) {
  // Exponential backoff: baseMs * 2^attempt
  const exponentialDelay = baseMs * Math.pow(2, attempt);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxMs);
  
  // Add jitter (±25% random variation)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff and jitter
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} options.baseMs - Base delay in milliseconds (default: 500)
 * @param {number} options.maxMs - Maximum delay in milliseconds (default: 30000)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried
 * @param {string} options.operation - Operation name for logging
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise} Promise that resolves with function result or rejects with last error
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseMs = 500,
    maxMs = 30000,
    shouldRetry = defaultShouldRetry,
    operation = 'unknown',
    context = {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      // Log successful retry if this wasn't the first attempt
      if (attempt > 0) {
        logger.info(`Retry succeeded for ${operation}`, {
          operation,
          attempt: attempt + 1,
          totalAttempts: maxAttempts,
          ...context
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!shouldRetry(error)) {
        logger.warn(`Non-retryable error for ${operation}`, {
          operation,
          attempt: attempt + 1,
          error: error.message,
          errorCode: error.code,
          statusCode: error.status || error.statusCode,
          ...context
        });
        throw error;
      }
      
      // If this was the last attempt, don't wait
      if (attempt === maxAttempts - 1) {
        logger.error(`All retry attempts failed for ${operation}`, {
          operation,
          totalAttempts: maxAttempts,
          finalError: error.message,
          errorCode: error.code,
          statusCode: error.status || error.statusCode,
          ...context
        });
        break;
      }
      
      // Calculate delay and wait
      const delay = calculateDelay(attempt, baseMs, maxMs);
      
      logger.warn(`Retry attempt ${attempt + 1} failed for ${operation}, retrying in ${delay}ms`, {
        operation,
        attempt: attempt + 1,
        totalAttempts: maxAttempts,
        delay,
        error: error.message,
        errorCode: error.code,
        statusCode: error.status || error.statusCode,
        ...context
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Default function to determine if an error should be retried
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should be retried
 */
function defaultShouldRetry(error) {
  // Don't retry client errors (4xx) except for specific cases
  const statusCode = error.status || error.statusCode;
  if (statusCode >= 400 && statusCode < 500) {
    // Retry on rate limiting and request timeout
    return statusCode === 429 || statusCode === 408;
  }
  
  // Retry server errors (5xx)
  if (statusCode >= 500) {
    return true;
  }
  
  // Retry network errors
  const networkErrors = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH'
  ];
  
  if (error.code && networkErrors.includes(error.code)) {
    return true;
  }
  
  // Retry timeout errors
  if (error.message && error.message.toLowerCase().includes('timeout')) {
    return true;
  }
  
  // Don't retry other errors by default
  return false;
}

/**
 * Specialized retry function for Ollama API calls
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves with function result
 */
async function retryOllama(fn, options = {}) {
  return retry(fn, {
    maxAttempts: 3,
    baseMs: 1000,
    maxMs: 10000,
    shouldRetry: (error) => {
      // Ollama-specific retry logic
      const statusCode = error.status || error.statusCode;
      
      // Retry on server errors and timeouts
      if (statusCode >= 500 || statusCode === 408) {
        return true;
      }
      
      // Retry on model loading errors (Ollama returns 404 when model is loading)
      if (statusCode === 404 && error.message?.includes('model')) {
        return true;
      }
      
      return defaultShouldRetry(error);
    },
    operation: 'ollama-api',
    ...options
  });
}

/**
 * Specialized retry function for Pinecone API calls
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves with function result
 */
async function retryPinecone(fn, options = {}) {
  return retry(fn, {
    maxAttempts: 3,
    baseMs: 500,
    maxMs: 5000,
    shouldRetry: (error) => {
      // Pinecone-specific retry logic
      const statusCode = error.status || error.statusCode;
      
      // Don't retry authentication errors
      if (statusCode === 401 || statusCode === 403) {
        return false;
      }
      
      // Don't retry bad request errors
      if (statusCode === 400) {
        return false;
      }
      
      return defaultShouldRetry(error);
    },
    operation: 'pinecone-api',
    ...options
  });
}

/**
 * Specialized retry function for Auth Service calls
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves with function result
 */
async function retryAuthService(fn, options = {}) {
  return retry(fn, {
    maxAttempts: 2, // Fewer attempts for auth calls
    baseMs: 200,
    maxMs: 2000,
    shouldRetry: (error) => {
      // Auth service-specific retry logic
      const statusCode = error.status || error.statusCode;
      
      // Don't retry authentication/authorization errors
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }
      
      return defaultShouldRetry(error);
    },
    operation: 'auth-service',
    ...options
  });
}

module.exports = {
  retry,
  retryOllama,
  retryPinecone,
  retryAuthService,
  calculateDelay,
  sleep,
  defaultShouldRetry
};