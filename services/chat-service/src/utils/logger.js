const winston = require('winston');
const config = require('../config');

/**
 * Winston logger configuration with secret redaction
 * Provides structured JSON logging for the Chat & Orchestration Service
 */

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Define colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(colors);

// Secrets to redact from logs
const SECRETS_TO_REDACT = [
  'JWT_SECRET',
  'PINECONE_API_KEY',
  'DATABASE_URL',
  'password',
  'token',
  'authorization',
  'bearer',
  'secret',
  'key',
  'api_key',
  'apikey'
];

/**
 * Redact sensitive information from log data
 * @param {Object} obj - Object to redact
 * @returns {Object} Redacted object
 */
function redactSecrets(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SECRETS_TO_REDACT.some(secret => 
      lowerKey.includes(secret.toLowerCase())
    );

    if (shouldRedact) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecrets(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Custom format for structured logging
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    // Add service name to all logs
    info.service = 'chat-orchestration-service';
    
    // Redact sensitive information
    const redactedInfo = redactSecrets(info);
    
    return JSON.stringify(redactedInfo);
  })
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service, ...meta } = info;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(redactSecrets(meta))}` : '';
    return `${timestamp} [${service || 'chat-service'}] ${level}: ${message}${metaStr}`;
  })
);

// Create transports array
const transports = [];

// Console transport for development
if (config.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.LOG_LEVEL
    })
  );
} else {
  // JSON transport for production
  transports.push(
    new winston.transports.Console({
      format: customFormat,
      level: config.LOG_LEVEL
    })
  );
}

// File transport for errors in production
if (config.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: customFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  );
  
  transports.push(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: customFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels,
  level: config.LOG_LEVEL,
  format: customFormat,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false
});

/**
 * Enhanced logging methods with context
 */
class Logger {
  /**
   * Log error with context
   * @param {string} message - Error message
   * @param {Object} meta - Additional context
   */
  error(message, meta = {}) {
    logger.error(message, meta);
  }

  /**
   * Log warning with context
   * @param {string} message - Warning message
   * @param {Object} meta - Additional context
   */
  warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  /**
   * Log info with context
   * @param {string} message - Info message
   * @param {Object} meta - Additional context
   */
  info(message, meta = {}) {
    logger.info(message, meta);
  }

  /**
   * Log debug with context
   * @param {string} message - Debug message
   * @param {Object} meta - Additional context
   */
  debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  /**
   * Log request with standard fields
   * @param {Object} req - Express request object
   * @param {Object} meta - Additional context
   */
  logRequest(req, meta = {}) {
    this.info('HTTP Request', {
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      orgId: req.org?.org_id,
      userId: req.user?.user_id,
      ...meta
    });
  }

  /**
   * Log response with standard fields
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in ms
   * @param {Object} meta - Additional context
   */
  logResponse(req, res, duration, meta = {}) {
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    this[level]('HTTP Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      orgId: req.org?.org_id,
      userId: req.user?.user_id,
      ...meta
    });
  }

  /**
   * Log RAG pipeline stage
   * @param {string} stage - Pipeline stage name
   * @param {Object} context - Stage context
   */
  logRagStage(stage, context = {}) {
    this.info(`RAG Pipeline: ${stage}`, {
      stage,
      ...context
    });
  }

  /**
   * Log external service call
   * @param {string} service - Service name (ollama, pinecone, auth-service)
   * @param {string} operation - Operation name
   * @param {Object} context - Call context
   */
  logExternalCall(service, operation, context = {}) {
    this.info(`External Service Call: ${service}`, {
      service,
      operation,
      ...context
    });
  }

  /**
   * Log circuit breaker state change
   * @param {string} service - Service name
   * @param {string} state - New state (OPEN, CLOSED, HALF_OPEN)
   * @param {Object} context - State change context
   */
  logCircuitBreakerState(service, state, context = {}) {
    this.warn(`Circuit Breaker State Change: ${service}`, {
      service,
      state,
      ...context
    });
  }

  /**
   * Create child logger with persistent context
   * @param {Object} context - Persistent context
   * @returns {Object} Child logger
   */
  child(context = {}) {
    const childLogger = Object.create(this);
    const originalMethods = ['error', 'warn', 'info', 'debug'];
    
    originalMethods.forEach(method => {
      childLogger[method] = (message, meta = {}) => {
        this[method](message, { ...context, ...meta });
      };
    });
    
    return childLogger;
  }
}

// Create and export logger instance
const loggerInstance = new Logger();

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  loggerInstance.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  loggerInstance.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
});

module.exports = loggerInstance;