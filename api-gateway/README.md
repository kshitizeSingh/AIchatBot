# Nginx API Gateway for AI FAQ Platform

A comprehensive API Gateway solution built with Nginx for the AI FAQ Platform, providing centralized routing, load balancing, security, and monitoring for all backend services.

## 🏗️ Architecture Overview

The API Gateway serves as the single entry point for all client requests, routing them to appropriate backend services:

- **Authentication Service** (Port 3000) - User authentication, authorization, JWT tokens
- **Content Service** (Port 3002) - Document management, file uploads, metadata
- **Chat Service** (Port 3003) - AI-powered chat, RAG pipeline, conversation management
- **AI Processing Service** (Port 3004) - Document processing, embeddings, vector storage

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Git
- Basic understanding of Nginx configuration

### 1. Clone and Setup

```bash
# Navigate to the API gateway directory
cd api-gateway

# Review and update environment variables
cp .env.example .env
# Edit .env file with your specific configuration
```

### 2. Start the Gateway and Services

```bash
# Start all services including the API gateway
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs api-gateway
```

### 3. Verify Setup

```bash
# Check gateway health
curl http://localhost/health

# Check service routing
curl http://localhost/health/auth
curl http://localhost/health/content
curl http://localhost/health/chat

# Access API documentation
open http://localhost/docs
```

## 📁 Project Structure

```
api-gateway/
├── nginx.conf              # Main Nginx configuration
├── Dockerfile              # Container build instructions
├── docker-compose.yml      # Multi-service orchestration
├── conf.d/                 # Additional configurations
│   ├── rate-limiting.conf  # Rate limiting rules
│   └── security.conf       # Security headers and policies
├── html/                   # Static content
│   └── docs/              # API documentation
│       └── index.html     # Documentation homepage
├── scripts/               # Utility scripts
│   ├── health-check.sh    # Health monitoring script
│   └── init-multiple-databases.sh  # DB initialization
├── tests/                 # Test suites
│   ├── test-gateway.sh    # Functional tests
│   └── load-test.sh       # Performance tests
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# JWT Secret (must match across services)
JWT_SECRET=your-256-bit-secret-key-change-in-production-12345678

# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Pinecone Configuration
PINCONE_API_KEY=your-pinecone-api-key

# Optional: Redis and Grafana passwords
REDIS_PASSWORD=your-redis-password
GRAFANA_PASSWORD=your-grafana-password
```

### Nginx Configuration

The main configuration is in `nginx.conf` with additional modules in `conf.d/`:

- **Upstream Definitions**: Load balancing configuration for each service
- **Rate Limiting**: Different limits for various endpoints
- **Security Headers**: CORS, CSP, and other security policies
- **SSL/TLS**: Ready for HTTPS deployment (commented out)

## 🛡️ Security Features

### Rate Limiting
- **API Endpoints**: 10 requests/second
- **Auth Endpoints**: 5 requests/second
- **Upload Endpoints**: 2 requests/second
- **Per-user limits**: Based on JWT user ID

### Security Headers
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Content Security Policy
- Referrer Policy

### Access Control
- IP-based restrictions for admin endpoints
- CORS configuration for allowed origins
- Request size limits (2MB default, 50MB for uploads)

## 📊 Monitoring and Health Checks

### Health Endpoints
- `/health` - Gateway health
- `/health/auth` - Auth service health
- `/health/content` - Content service health
- `/health/chat` - Chat service health

### Metrics
- `/metrics` - Prometheus metrics (internal access only)
- Grafana dashboard available at `http://localhost:3001`
- Prometheus at `http://localhost:9090`

### Logging
- Access logs: `/var/log/nginx/access.log`
- Error logs: `/var/log/nginx/error.log`
- Custom log format with request tracking

## 🧪 Testing

### Functional Tests

```bash
# Run comprehensive gateway tests
./tests/test-gateway.sh

# Test specific functionality
./tests/test-gateway.sh --endpoint-only
./tests/test-gateway.sh --nginx-only
```

### Load Testing

```bash
# Basic load test
./tests/load-test.sh

# Custom load test
./tests/load-test.sh --users 20 --duration 120 --rps 10

# Stress test with endurance
RUN_ENDURANCE=true ./tests/load-test.sh --endurance
```

### Health Monitoring

```bash
# Manual health check
./scripts/health-check.sh

# Specific checks
./scripts/health-check.sh --nginx-only
./scripts/health-check.sh --upstream-only
```

## 🚀 Deployment

### Development

```bash
# Start in development mode
docker-compose up

# View real-time logs
docker-compose logs -f api-gateway
```

### Production

1. **Update Configuration**:
   ```bash
   # Update environment variables
   cp .env.example .env.production
   # Edit .env.production with production values
   ```

2. **Enable HTTPS**:
   - Uncomment HTTPS server block in `nginx.conf`
   - Add SSL certificates to `ssl/` directory
   - Update DNS records

3. **Deploy**:
   ```bash
   # Production deployment
   docker-compose -f docker-compose.yml --env-file .env.production up -d
   ```

### Scaling

```bash
# Scale individual services
docker-compose up -d --scale auth-service=3 --scale chat-service=2

# Update nginx upstream configuration accordingly
```

## 🔍 Troubleshooting

### Common Issues

1. **Gateway not starting**:
   ```bash
   # Check nginx configuration
   docker-compose exec api-gateway nginx -t
   
   # Check logs
   docker-compose logs api-gateway
   ```

2. **Service not reachable**:
   ```bash
   # Check service health
   curl http://localhost/health/auth
   
   # Check service logs
   docker-compose logs auth-service
   ```

3. **Rate limiting issues**:
   ```bash
   # Check rate limit zones
   docker-compose exec api-gateway cat /var/log/nginx/error.log | grep "limiting"
   ```

4. **Performance issues**:
   ```bash
   # Run performance tests
   ./tests/load-test.sh
   
   # Check resource usage
   docker stats
   ```

### Debug Mode

```bash
# Enable debug logging
docker-compose exec api-gateway sed -i 's/error_log.*/error_log \/var\/log\/nginx\/error.log debug;/' /etc/nginx/nginx.conf
docker-compose restart api-gateway
```

## 📈 Performance Tuning

### Nginx Optimization

```nginx
# In nginx.conf
worker_processes auto;
worker_connections 2048;
keepalive_timeout 65;
keepalive_requests 1000;

# Enable caching
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m;
```

### Load Balancing

```nginx
# Different algorithms
upstream auth_service {
    least_conn;          # Default
    # ip_hash;           # Session persistence
    # random;            # Random distribution
    server auth-service-1:3000;
    server auth-service-2:3000;
}
```

## 🔐 Security Best Practices

1. **Regular Updates**:
   - Keep Nginx version updated
   - Update base Docker images
   - Review security configurations

2. **SSL/TLS**:
   - Use strong cipher suites
   - Enable HSTS
   - Implement OCSP stapling

3. **Access Control**:
   - Implement IP whitelisting for admin endpoints
   - Use strong JWT secrets
   - Regular security audits

4. **Monitoring**:
   - Set up alerts for unusual traffic patterns
   - Monitor error rates
   - Track performance metrics

## 📚 API Documentation

Access comprehensive API documentation:

- **Gateway Overview**: `http://localhost/docs`
- **Auth Service**: `http://localhost/docs/auth`
- **Content Service**: `http://localhost/docs/content`
- **Chat Service**: `http://localhost/docs/chat`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `./tests/test-gateway.sh`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the troubleshooting section
- Review logs and monitoring dashboards

---

**Built with ❤️ for the AI FAQ Platform**