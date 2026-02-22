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

/**
 * @swagger
 * /metrics:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Prometheus metrics endpoint
 *     description: |
 *       Exposes Prometheus-compatible metrics for monitoring and observability.
 *       This endpoint provides detailed operational metrics for the chat service.
 *       
 *       **Metrics Categories:**
 *       
 *       **Request Metrics:**
 *       - `chat_requests_total` - Total chat requests by status (success/error)
 *       - `chat_duration_seconds` - Request duration histogram
 *       
 *       **RAG Pipeline Metrics:**
 *       - `retrieval_passages_count` - Number of Pinecone passages retrieved
 *       - `ollama_tokens_total` - Token usage by type (prompt/completion)
 *       - `retrieval_failures_total` - Pinecone retrieval failures
 *       - `generation_failures_total` - Ollama generation failures
 *       
 *       **Authentication Metrics:**
 *       - `auth_failures_total` - Authentication failures by type
 *       
 *       **External Service Metrics:**
 *       - `external_service_duration_seconds` - External service latency
 *       - `circuit_breaker_state` - Circuit breaker status
 *       
 *       **Connection Metrics:**
 *       - `active_streaming_connections` - Active SSE connections
 *       
 *       **System Metrics:**
 *       - Node.js default metrics (memory, CPU, GC, etc.)
 *       
 *       **Access Control:**
 *       - No authentication required (internal endpoint)
 *       - Should be restricted to internal network/monitoring systems
 *       
 *       **Scraping Frequency:**
 *       - Recommended: 15-30 seconds
 *       - High-frequency metrics updated in real-time
 *     
 *     responses:
 *       '200':
 *         description: Metrics data in Prometheus format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               description: Prometheus metrics in text exposition format
 *             example: |
 *               # HELP chat_requests_total Total number of chat requests processed
 *               # TYPE chat_requests_total counter
 *               chat_requests_total{service="chat-orchestration-service",status="success"} 1247
 *               chat_requests_total{service="chat-orchestration-service",status="error"} 23
 *               
 *               # HELP chat_duration_seconds Duration of chat requests in seconds
 *               # TYPE chat_duration_seconds histogram
 *               chat_duration_seconds_bucket{service="chat-orchestration-service",le="0.1"} 45
 *               chat_duration_seconds_bucket{service="chat-orchestration-service",le="0.5"} 234
 *               chat_duration_seconds_bucket{service="chat-orchestration-service",le="1"} 567
 *               chat_duration_seconds_bucket{service="chat-orchestration-service",le="+Inf"} 1270
 *               chat_duration_seconds_sum{service="chat-orchestration-service"} 2847.3
 *               chat_duration_seconds_count{service="chat-orchestration-service"} 1270
 *               
 *               # HELP retrieval_passages_count Number of passages returned by Pinecone per query
 *               # TYPE retrieval_passages_count histogram
 *               retrieval_passages_count_bucket{service="chat-orchestration-service",le="3"} 456
 *               retrieval_passages_count_bucket{service="chat-orchestration-service",le="5"} 1123
 *               retrieval_passages_count_bucket{service="chat-orchestration-service",le="+Inf"} 1270
 *               
 *               # HELP ollama_tokens_total Total number of tokens processed by Ollama
 *               # TYPE ollama_tokens_total counter
 *               ollama_tokens_total{service="chat-orchestration-service",type="prompt"} 456789
 *               ollama_tokens_total{service="chat-orchestration-service",type="completion"} 123456
 *               
 *               # HELP active_streaming_connections Number of active streaming chat connections
 *               # TYPE active_streaming_connections gauge
 *               active_streaming_connections{service="chat-orchestration-service"} 12
 *               
 *               # HELP circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half-open)
 *               # TYPE circuit_breaker_state gauge
 *               circuit_breaker_state{service="chat-orchestration-service",service="auth_service"} 0
 *       
 *       '500':
 *         description: Error generating metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: 'Error generating metrics'
 * 
 * GET /metrics
 * Prometheus metrics endpoint
 */
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