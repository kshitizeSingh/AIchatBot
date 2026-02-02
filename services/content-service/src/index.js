const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const documentRoutes = require('./routes/documentRoutes');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./utils/logger');
const db = require('./config/database');
const queueService = require('./services/queueService');
const startProcessedEventConsumer = require('./consumers/processedEventConsumer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Basic middlewares
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Dev helper to simulate req.user when running without API Gateway
// Only attach req.user in non-production when explicit dev headers are provided.
app.use((req, _res, next) => {
  if (!req.user && process.env.NODE_ENV !== 'production') {


    const orgId = req.headers['x-org-id'];
    const userId = req.headers['x-user-id'];
    const role = req.headers['x-role'] || 'owner';

    if (orgId && userId) {
      req.user = { org_id: orgId, user_id: userId, role };
    }
  }
  next();
});

// Routes
app.use('/v1/documents', documentRoutes);

// Swagger docs
let openapi;
try {
  openapi = require('./docs/openapi.json');
  // Serve raw OpenAPI JSON
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  // Serve Swagger UI
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));
} catch (e) {
  logger.warn('Swagger docs not loaded', { error: e.message });
}

// Health checks
app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'content-service' }));
app.get('/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not-ready', error: e.message });
  }
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  logger.info(`Content Service running on port ${PORT}`);
  // Connect Kafka producer and start consumer
  try {
    await queueService.connect();
  } catch (e) {
    logger.error('Kafka producer connect failed', { error: e.message });
  }
  try {
    await startProcessedEventConsumer();
  } catch (e) {
    logger.error('Kafka consumer start failed', { error: e.message });
  }
});

module.exports = app;
