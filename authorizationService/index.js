require('dotenv').config();
const app = require('./src/app');
const env = require('./src/config/environment');
const logger = require('./src/utils/logger');

const PORT = env.port || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Auth Service started`, {
    port: PORT,
    environment: env.nodeEnv,
    database: {
      host: env.database.host,
      name: env.database.name
    }
  });
  
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});
