require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config/environment');
const logger = require('./src/utils/logger');
const pool = require('./src/config/database');

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Close database connections
  pool.end(() => {
    logger.info('Database pool closed.');
    process.exit(0);
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after 30 seconds');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const server = app.listen(config.port, () => {
  logger.info(`Auth Service started on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
  logger.info(`Health check: http://localhost:${config.port}/health`);
  logger.info(`API docs: http://localhost:${config.port}/docs`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use`);
  } else {
    logger.error('Server error:', error);
  }
  process.exit(1);
});

module.exports = server;