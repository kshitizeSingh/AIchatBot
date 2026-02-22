const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Service liveness check
 *     description: |
 *       Liveness probe endpoint that indicates whether the service is running.
 *       This endpoint always returns 200 OK if the process is alive and able to handle requests.
 *       
 *       **Use Case:**
 *       - Kubernetes liveness probes
 *       - Load balancer health checks
 *       - Basic service availability monitoring
 *       
 *       **Response Time:** < 10ms (no external dependencies)
 *     
 *     responses:
 *       '200':
 *         description: Service is alive and running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               status: 'healthy'
 *               timestamp: '2026-02-22T10:00:00Z'
 *               service: 'chat-orchestration-service'
 * 
 * GET /health
 * Liveness probe - returns 200 if the process is running
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'chat-orchestration-service'
  });
});

/**
 * @swagger
 * /ready:
 *   get:
 *     tags:
 *       - Health
 *     summary: Service readiness check
 *     description: |
 *       Readiness probe endpoint that verifies all external dependencies are available
 *       and the service is ready to handle requests.
 *       
 *       **Dependencies Checked:**
 *       - **PostgreSQL**: Database connectivity and query execution
 *       - **Pinecone**: Vector database connectivity and index access
 *       - **Ollama**: AI model server availability and required models
 *       
 *       **Health Criteria:**
 *       - All dependencies must respond within timeout (5 seconds)
 *       - Required AI models must be loaded in Ollama
 *       - Database connections must be successful
 *       
 *       **Use Case:**
 *       - Kubernetes readiness probes
 *       - Service mesh health checks
 *       - Deployment validation
 *     
 *     responses:
 *       '200':
 *         description: Service is ready - all dependencies healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 *             example:
 *               status: 'ready'
 *               timestamp: '2026-02-22T10:00:00Z'
 *               service: 'chat-orchestration-service'
 *               checks:
 *                 postgresql:
 *                   status: 'healthy'
 *                   latency_ms: 45
 *                   error: null
 *                 pinecone:
 *                   status: 'healthy'
 *                   latency_ms: 120
 *                   error: null
 *                 ollama:
 *                   status: 'healthy'
 *                   latency_ms: 200
 *                   error: null
 *                   models:
 *                     embedding: 'nomic-embed-text'
 *                     generation: 'llama3'
 *       
 *       '503':
 *         description: Service not ready - one or more dependencies unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 *             example:
 *               status: 'not_ready'
 *               timestamp: '2026-02-22T10:00:00Z'
 *               service: 'chat-orchestration-service'
 *               checks:
 *                 postgresql:
 *                   status: 'healthy'
 *                   latency_ms: 45
 *                   error: null
 *                 pinecone:
 *                   status: 'unhealthy'
 *                   latency_ms: null
 *                   error: 'Connection timeout'
 *                 ollama:
 *                   status: 'unhealthy'
 *                   latency_ms: null
 *                   error: 'Embedding model not found'
 * 
 * GET /ready
 * Readiness probe - checks all external dependencies
 */
router.get('/ready', async (req, res) => {
  const checks = {
    postgresql: { status: 'unknown', latency_ms: null, error: null },
    pinecone: { status: 'unknown', latency_ms: null, error: null },
    ollama: { status: 'unknown', latency_ms: null, error: null }
  };
  
  let overallStatus = 'ready';
  
  // Check PostgreSQL
  try {
    const pgStart = Date.now();
    const pool = new Pool({ connectionString: config.DATABASE_URL });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    
    checks.postgresql.status = 'healthy';
    checks.postgresql.latency_ms = Date.now() - pgStart;
    
    logger.debug('PostgreSQL health check passed', {
      latency_ms: checks.postgresql.latency_ms
    });
  } catch (error) {
    checks.postgresql.status = 'unhealthy';
    checks.postgresql.error = error.message;
    overallStatus = 'not_ready';
    
    logger.error('PostgreSQL health check failed', {
      error: error.message
    });
  }
  
  // Check Pinecone
  try {
    const pineconeStart = Date.now();
    const pinecone = new Pinecone({
      apiKey: config.PINECONE_API_KEY
    });
    
    const index = pinecone.index(config.PINECONE_INDEX_NAME);
    await index.describeIndexStats();
    
    checks.pinecone.status = 'healthy';
    checks.pinecone.latency_ms = Date.now() - pineconeStart;
    
    logger.debug('Pinecone health check passed', {
      latency_ms: checks.pinecone.latency_ms
    });
  } catch (error) {
    checks.pinecone.status = 'unhealthy';
    checks.pinecone.error = error.message;
    overallStatus = 'not_ready';
    
    logger.error('Pinecone health check failed', {
      error: error.message
    });
  }
  
  // Check Ollama
  try {
    const ollamaStart = Date.now();
    const response = await fetch(`${config.OLLAMA_URL}/api/tags`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check if required models are available
    const models = data.models || [];
    const embeddingModel = models.find(m => m.name === config.OLLAMA_EMBEDDING_MODEL);
    const generationModel = models.find(m => m.name === config.OLLAMA_GENERATION_MODEL);
    
    if (!embeddingModel) {
      throw new Error(`Embedding model '${config.OLLAMA_EMBEDDING_MODEL}' not found`);
    }
    
    if (!generationModel) {
      throw new Error(`Generation model '${config.OLLAMA_GENERATION_MODEL}' not found`);
    }
    
    checks.ollama.status = 'healthy';
    checks.ollama.latency_ms = Date.now() - ollamaStart;
    checks.ollama.models = {
      embedding: embeddingModel.name,
      generation: generationModel.name
    };
    
    logger.debug('Ollama health check passed', {
      latency_ms: checks.ollama.latency_ms,
      models: checks.ollama.models
    });
  } catch (error) {
    checks.ollama.status = 'unhealthy';
    checks.ollama.error = error.message;
    overallStatus = 'not_ready';
    
    logger.error('Ollama health check failed', {
      error: error.message
    });
  }
  
  const statusCode = overallStatus === 'ready' ? 200 : 503;
  
  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: 'chat-orchestration-service',
    checks
  });
  
  logger.info('Readiness check completed', {
    status: overallStatus,
    checks: Object.fromEntries(
      Object.entries(checks).map(([key, value]) => [key, value.status])
    )
  });
});

module.exports = router;