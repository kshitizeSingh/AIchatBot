# Chat & Orchestration Service

## Overview

The Chat & Orchestration Service is the runtime brain of the AI FAQ Platform. It provides RAG-powered conversational AI capabilities with multi-tenant isolation, conversation management, and real-time streaming responses.

## Features

- **RAG Pipeline**: Retrieval-Augmented Generation using Ollama and Pinecone
- **Multi-turn Conversations**: Context-aware conversation management
- **Real-time Streaming**: Server-Sent Events for live response delivery
- **Multi-tenant Isolation**: Organization-scoped data access
- **Dual Authentication**: JWT + HMAC signature verification
- **Comprehensive API Documentation**: OpenAPI 3.0 with Swagger UI

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Ollama with required models
- Pinecone account and index
- Auth Service running

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit environment variables
vim .env

# Run database migrations
npm run migrate:up

# Start development server
npm run dev
```

### Required Environment Variables

```bash
# Authentication
JWT_SECRET=your-jwt-secret
AUTH_SERVICE_URL=http://auth-service:3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/chat_db

# Pinecone
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX_NAME=faq-platform

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_GENERATION_MODEL=llama3
```

## API Documentation

The service provides comprehensive API documentation via Swagger UI:

- **Swagger UI**: http://localhost:3003/api-docs
- **OpenAPI Spec**: http://localhost:3003/api-docs.json
- **Service Info**: http://localhost:3003/

### Authentication

All protected endpoints require dual authentication:

1. **JWT Bearer Token** - User identity and authorization
2. **HMAC Signature** - Request integrity verification

#### Required Headers

```http
Authorization: Bearer <jwt_token>
X-Client-ID: pk_your_client_id
X-Timestamp: 1738459200000
X-Signature: <hmac_sha256_hex>
```

### Main Endpoints

#### Chat Query
```http
POST /v1/chat/query
```
Process user queries with RAG pipeline. Supports both JSON and streaming responses.

#### Conversation Management
```http
GET    /v1/chat/conversations          # List conversations
POST   /v1/chat/conversations          # Create conversation
GET    /v1/chat/conversations/:id/messages  # Get messages
DELETE /v1/chat/conversations/:id      # Delete conversation
```

#### Health & Monitoring
```http
GET /health    # Liveness probe
GET /ready     # Readiness probe  
GET /metrics   # Prometheus metrics
```

## Development

### Scripts

```bash
# Development
npm run dev              # Start with hot reload
npm run start            # Production start

# Testing
npm test                 # Run unit tests
npm run test:coverage    # Test with coverage
npm run test:integration # Integration tests
npm run test:swagger     # Test Swagger integration

# Documentation
npm run docs:validate    # Validate API documentation
npm run docs:test        # Test documentation completeness

# Code Quality
npm run lint             # Check code style
npm run lint:fix         # Fix linting issues

# Database
npm run migrate:up       # Apply migrations
npm run migrate:down     # Rollback migrations

# Docker
npm run docker:build     # Build image
npm run docker:dev       # Start with dependencies
npm run docker:down      # Stop containers
```

### Project Structure

```
src/
├── config/           # Configuration and environment
│   ├── index.js      # Main config
│   ├── database.js   # PostgreSQL connection
│   ├── pinecone.js   # Pinecone client
│   └── swagger.js    # OpenAPI specification
├── middleware/       # Express middleware
│   ├── auth.js       # Authentication (JWT + HMAC)
│   └── errorHandler.js
├── routes/           # API route handlers
│   ├── chat.js       # Chat and conversation endpoints
│   ├── health.js     # Health check endpoints
│   └── metrics.js    # Prometheus metrics
├── services/         # Business logic
│   ├── orchestrationService.js  # Main RAG pipeline
│   ├── embeddingService.js      # Query embedding
│   ├── retrievalService.js      # Pinecone retrieval
│   ├── generationService.js     # Ollama generation
│   └── conversationService.js   # Conversation management
├── utils/            # Utilities
│   ├── logger.js     # Winston logger
│   └── retry.js      # Retry logic
└── index.js          # Express app setup
```

### Testing

The service includes comprehensive testing:

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end API testing
- **Swagger Tests**: Documentation validation
- **Performance Tests**: Load and stress testing

### Monitoring

The service exposes Prometheus metrics for monitoring:

- Request rates and latencies
- RAG pipeline performance
- External service health
- Authentication metrics
- Error rates and types

## Architecture

### RAG Pipeline Flow

1. **Authentication**: Validate JWT + HMAC
2. **Context Resolution**: Load/create conversation
3. **Query Embedding**: Generate vector using Ollama
4. **Retrieval**: Search Pinecone for relevant passages
5. **Prompt Construction**: Build RAG-augmented prompt
6. **Generation**: Generate response using Ollama
7. **Persistence**: Save messages to PostgreSQL
8. **Response**: Return with source attribution

### Security

- **Multi-tenant Isolation**: Org-scoped data access
- **Dual Authentication**: JWT + HMAC verification
- **Circuit Breaker**: Auth service resilience
- **Rate Limiting**: Per-org request throttling
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error responses

### Scalability

- **Stateless Design**: Horizontal scaling support
- **Connection Pooling**: Efficient database usage
- **Streaming Responses**: Memory-efficient large responses
- **Caching**: Vector and conversation caching
- **Load Balancing**: Multi-instance deployment

## Deployment

### Docker

```bash
# Build image
docker build -t chat-orchestration-service .

# Run with dependencies
docker-compose -f docker-compose.dev.yml up
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-service
  template:
    metadata:
      labels:
        app: chat-service
    spec:
      containers:
      - name: chat-service
        image: chat-orchestration-service:latest
        ports:
        - containerPort: 3003
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 3003
        readinessProbe:
          httpGet:
            path: /ready
            port: 3003
```

### Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3003` | HTTP listen port |
| `JWT_SECRET` | **required** | JWT signing secret |
| `AUTH_SERVICE_URL` | `http://auth-service:3000` | Auth service URL |
| `DATABASE_URL` | **required** | PostgreSQL connection |
| `PINECONE_API_KEY` | **required** | Pinecone API key |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `RAG_TOP_K` | `5` | Retrieval passage count |
| `RAG_MIN_SCORE` | `0.3` | Minimum similarity score |

## Troubleshooting

### Common Issues

#### Ollama Models Not Found
```bash
# Pull required models
ollama pull nomic-embed-text
ollama pull llama3
```

#### Pinecone Dimension Mismatch
Ensure `EMBEDDING_DIMENSIONS=768` matches your Pinecone index configuration.

#### Authentication Failures
Verify `JWT_SECRET` matches the Auth Service configuration.

#### Zero Retrieval Results
Check that documents have been processed by the AI Processing Service.

### Logs

The service uses structured JSON logging:

```bash
# View logs
docker logs chat-service

# Follow logs
docker logs -f chat-service

# Filter by level
docker logs chat-service | grep '"level":"error"'
```

### Health Checks

```bash
# Check service health
curl http://localhost:3003/health

# Check readiness
curl http://localhost:3003/ready

# View metrics
curl http://localhost:3003/metrics
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Validate documentation
6. Submit a pull request

### Code Style

- ESLint configuration enforced
- Prettier for formatting
- JSDoc for documentation
- Conventional commits

### Testing Requirements

- Unit test coverage > 80%
- Integration tests for all endpoints
- Documentation validation
- Performance benchmarks

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

- Create GitHub issues for bugs
- Use discussions for questions
- Check documentation first
- Include logs and environment details
