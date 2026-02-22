const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { metrics } = require('./routes/metrics');
const { swaggerSpec, swaggerUiOptions } = require('./config/swagger');

// Import routes
const chatRoutes = require('./routes/chat');
const healthRoutes = require('./routes/health');
const metricsRoutes = require('./routes/metrics');

// Create Express app
const app = express();

// Trust proxy for rate limiting and real IP detection
app.set('trust proxy', 1);


// Security middleware with Swagger UI allowances
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],



      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for Swagger UI
      imgSrc: ["'self'", "data:", "https:", "https://validator.swagger.io"],
      connectSrc: ["'self'"],

      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Client-ID',
    'X-Timestamp',
    'X-Signature',
    'Cache-Control'
  ],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length')
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration_ms: duration,
      contentLength: res.get('Content-Length')
    });
    
    // Update metrics
    const status = res.statusCode >= 400 ? 'error' : 'success';
    metrics.chatRequestsTotal.inc({ status });
    metrics.chatDurationSeconds.observe(duration / 1000);
  });
  
  next();
});

/**
 * @swagger
 * /::
 *   get:
 *     summary: Service information
 *     description: Returns basic service information and links to documentation
 *     responses:
 *       '200':
 *         description: Service information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                   example: 'chat-orchestration-service'
 *                 version:
 *                   type: string
 *                   example: '1.1.0'
 *                 documentation:
 *                   type: string
 *                   example: '/api-docs'
 *                 openapi_spec:
 *                   type: string
 *                   example: '/api-docs.json'
 */
app.get('/', (req, res) => {
  res.json({
    service: 'chat-orchestration-service',
    version: require('../package.json').version,
    description: 'AI FAQ Platform - Chat & Orchestration Service with RAG pipeline',
    documentation: '/api-docs',
    openapi_spec: '/api-docs.json',
    health_check: '/health',
    readiness_check: '/ready',
    metrics: '/metrics'
  });
});

// Swagger UI documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// OpenAPI specification endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Health endpoints (no auth required)
app.use('/', healthRoutes);

// Metrics endpoint (no auth required - should be internal only)
app.use('/', metricsRoutes.router);

// API routes with authentication
app.use('/v1/chat', chatRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error_code: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handling
let server;

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason?.message || reason,
    promise: promise.toString()
  });
  process.exit(1);
});

function gracefulShutdown(signal) {
  logger.info('Received shutdown signal', { signal });
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connections
      const { pool } = require('./config/database');
      if (pool) {
        pool.end(() => {
          logger.info('Database pool closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Startup validation and server start
async function startServer() {
  try {
    logger.info('Starting Chat & Orchestration Service', {
      version: require('../package.json').version,
      nodeVersion: process.version,
      environment: config.NODE_ENV,
      port: config.PORT
    });
    
    // Validate environment configuration
    const requiredEnvVars = [
      'JWT_SECRET',
      'AUTH_SERVICE_URL',
      'DATABASE_URL',
      'PINECONE_API_KEY',
      'PINECONE_INDEX_NAME',
      'OLLAMA_URL'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    // Test database connection
    const { pool } = require('./config/database');
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('Database connection validated');
    
    // Test Pinecone connection
    const pinecone = require('./config/pinecone');
    await pinecone.describeIndexStats();
    logger.info('Pinecone connection validated');
    
    // Test Ollama connection
    const fetch = require('node-fetch');
    const ollamaResponse = await fetch(`${config.OLLAMA_URL}/api/tags`, {
      timeout: 5000
    });
    if (!ollamaResponse.ok) {
      throw new Error(`Ollama not available: ${ollamaResponse.status}`);
    }
    logger.info('Ollama connection validated');
    
    // Start HTTP server
    server = app.listen(config.PORT, () => {
      logger.info('Server started successfully', {
        port: config.PORT,
        environment: config.NODE_ENV
      });
    });
    
    // Set server timeout for long-running streaming requests
    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds
    
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;