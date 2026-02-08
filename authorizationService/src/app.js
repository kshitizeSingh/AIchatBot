const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const env = require('./config/environment');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const orgRoutes = require('./routes/orgRoutes');
const userRoutes = require('./routes/userRoutes');
const logger = require('./utils/logger');

const app = express();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI FAQ Platform - Auth Service API',
      version: '1.0.0',
      description: 'Complete authentication and authorization service for multi-tenant FAQ platform',
      contact: {
        name: 'Development Team',
        email: 'dev@example.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: 'Development Server'
      },
      {
        url: 'https://api.example.com',
        description: 'Production Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token in Authorization header'
        },
        HMACAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Signature',
          description: 'HMAC-SHA256 signature'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

// Middleware
app.use(helmet());
console.log(env.cors,'corsvalue');
app.use(cors(env.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/org', orgRoutes);
app.use('/v1/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv
  });
});

// API documentation
app.use('/docs', swaggerUi.serve);
app.use('/docs', swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui { max-width: 1200px; }',
  customSiteTitle: 'Auth Service API Docs'
}));

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'AI FAQ Platform - Auth Service',
    version: '1.0.0',
    documentation: '/docs',
    health: '/health'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    error_code: 'NOT_FOUND',
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
