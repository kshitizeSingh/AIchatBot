const winston = require('winston');
const path = require('path');
const config = require('../config/environment');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };

    if (stack) {
      log.stack = stack;
    }

    return JSON.stringify(log);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: config.logging.level,
    format: config.nodeEnv === 'development' ? consoleFormat : logFormat,
    handleExceptions: true,
    handleRejections: true
  })
];

// Add file transports for production
if (config.nodeEnv === 'production') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'auth-service',
    environment: config.nodeEnv
  },
  transports,
  exitOnError: false
});

// Add custom methods
logger.audit = (message, meta = {}) => {
  logger.info(message, { type: 'audit', ...meta });
};

logger.security = (message, meta = {}) => {
  logger.warn(message, { type: 'security', ...meta });
};

logger.performance = (message, meta = {}) => {
  logger.info(message, { type: 'performance', ...meta });
};

// Log uncaught exceptions and rejections
logger.exceptions.handle(
  new winston.transports.Console({
    format: consoleFormat
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: consoleFormat
  })
);

module.exports = logger;