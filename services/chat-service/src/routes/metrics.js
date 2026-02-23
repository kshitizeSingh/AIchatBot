const express = require('express');
const client = require('prom-client');
const logger = require('../utils/logger');

const router = express.Router();

// Create a Registry to register the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  service: 'chat-orchestration-service'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics as specified in the documentation

// Counter for total chat requests
const chatRequestsTotal = new client.Counter({
  name: 'chat_requests_total',
  help: 'Total number of chat requests processed',
  labelNames: ['status'], // success | error
  registers: [register]
});

// Histogram for chat request duration
const chatDurationSeconds = new client.Histogram({
  name: 'chat_duration_seconds',
  help: 'Duration of chat requests in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30],
  registers: [register]
});

// Histogram for number of passages returned by Pinecone
const retrievalPassagesCount = new client.Histogram({
  name: 'retrieval_passages_count',
  help: 'Number of passages returned by Pinecone per query',
  buckets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  registers: [register]
});

// Counter for Ollama tokens
const ollamaTokensTotal = new client.Counter({
  name: 'ollama_tokens_total',
  help: 'Total number of tokens processed by Ollama',
  labelNames: ['type'], // prompt | completion
  registers: [register]
});

// Counter for retrieval failures
const retrievalFailuresTotal = new client.Counter({
  name: 'retrieval_failures_total',
  help: 'Total number of Pinecone retrieval failures',
  registers: [register]
});

// Counter for generation failures
const generationFailuresTotal = new client.Counter({
  name: 'generation_failures_total',
  help: 'Total number of Ollama generation failures after all retries',
  registers: [register]
});

// Counter for authentication failures
const authFailuresTotal = new client.Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['type'], // jwt_expired | jwt_invalid | hmac_invalid | org_mismatch | missing_headers
  registers: [register]
});

// Histogram for external service response times
const externalServiceDurationSeconds = new client.Histogram({
  name: 'external_service_duration_seconds',
  help: 'Duration of external service calls in seconds',
  labelNames: ['service'], // ollama | pinecone | auth_service
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

// Gauge for active streaming connections
const activeStreamingConnections = new client.Gauge({
  name: 'active_streaming_connections',
  help: 'Number of active streaming chat connections',
  registers: [register]
});

// Gauge for circuit breaker state
const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'], // auth_service
  registers: [register]
});

// GET /metrics - Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', {
      error: error.message
    });
    res.status(500).end('Error generating metrics');
  }
});

// Export metrics for use in other modules
module.exports = {
  router,
  metrics: {
    chatRequestsTotal,
    chatDurationSeconds,
    retrievalPassagesCount,
    ollamaTokensTotal,
    retrievalFailuresTotal,
    generationFailuresTotal,
    authFailuresTotal,
    externalServiceDurationSeconds,
    activeStreamingConnections,
    circuitBreakerState
  }
};