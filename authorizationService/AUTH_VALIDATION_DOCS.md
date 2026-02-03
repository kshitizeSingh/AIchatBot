# Authentication Service - Validation Endpoints Documentation

## Overview

The Authentication Service provides centralized validation endpoints that other services can use to validate JWT tokens and HMAC signatures. This enables a **hybrid authentication architecture** where services can choose between local validation (for performance) and centralized validation (for security).

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │────│  Auth Service    │────│ Other Services  │
│                 │    │                  │    │                 │
│ • JWT Validation│    │ • /validate-jwt  │    │ • Content       │
│ • HMAC Validation│   │ • /validate-hmac │   │ • Query         │
│ • Fast & Local  │    │ • Token Refresh  │    │ • AI Processing │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Validation Endpoints

### 1. JWT Token Validation

**Endpoint:** `POST /v1/auth/validate-jwt`

**Purpose:** Validate JWT access tokens and return user context

**Authentication:** Bearer token in Authorization header

**Request:**
```http
POST /v1/auth/validate-jwt
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Success Response (200):**
```json
{
  "valid": true,
  "user": {
    "user_id": "e83e8749-4e38-4f98-b4b1-0c4387105156",
    "org_id": "a1b2c3d4-5e6f-7g8h-9i0j-1k2l3m4n5o6p",
    "role": "admin"
  }
}
```

**Error Response (401):**
```json
{
  "valid": false,
  "error": "Token expired" | "Invalid token" | "Token revoked"
}
```

### 2. HMAC Signature Validation

**Endpoint:** `POST /v1/auth/validate-hmac`

**Purpose:** Validate HMAC signatures for organization-level authentication

**Authentication:** None (public endpoint for service-to-service communication)

**Request:**
```http
POST /v1/auth/validate-hmac
Content-Type: application/json

{
  "client_id": "pk_7f83efb20c8e4b14bd6a239c2f997f41",
  "signature": "a1b2c3d4e5f6...",
  "timestamp": "1738459200000",
  "payload": {
    "method": "POST",
    "path": "/api/content/upload",
    "body": {
      "file_name": "document.pdf",
      "size": 1024000
    }
  }
}
```

**Success Response (200):**
```json
{
  "valid": true,
  "org_id": "a1b2c3d4-5e6f-7g8h-9i0j-1k2l3m4n5o6p",
  "org_name": "Publicis Sapient"
}
```

**Error Response (401):**
```json
{
  "valid": false,
  "error": "Invalid client ID" | "Request timestamp expired" | "Invalid signature"
}
```

## Usage Patterns

### Pattern 1: API Gateway with Local Validation (Recommended)

```javascript
// api-gateway/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const axios = require('axios');

class AuthMiddleware {
  constructor(authServiceUrl) {
    this.authServiceUrl = authServiceUrl;
  }

  // Fast local JWT validation
  validateJWT(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // HMAC validation via auth service
  async validateHMAC(clientId, signature, timestamp, payload) {
    const response = await axios.post(`${this.authServiceUrl}/v1/auth/validate-hmac`, {
      client_id: clientId,
      signature,
      timestamp,
      payload
    });
    return response.data;
  }

  // Combined middleware
  async authenticate(req, res, next) {
    try {
      // Validate JWT locally
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const user = this.validateJWT(token);

      // Validate HMAC via auth service
      const { 'x-client-id': clientId, 'x-signature': signature, 'x-timestamp': timestamp } = req.headers;

      const hmacResult = await this.validateHMAC(clientId, signature, timestamp, {
        method: req.method,
        path: req.path,
        body: req.body
      });

      if (!hmacResult.valid) {
        return res.status(401).json({ error: 'Invalid HMAC signature' });
      }

      // Attach context to request
      req.user = user;
      req.org_id = hmacResult.org_id;
      req.org_name = hmacResult.org_name;

      next();
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed' });
    }
  }
}

module.exports = AuthMiddleware;
```

### Pattern 2: Service-to-Service Validation

```javascript
// content-service/src/middleware/auth.js
const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';

const validateRequest = async (req, res, next) => {
  try {
    // Get tokens from headers
    const authHeader = req.headers.authorization;
    const clientId = req.headers['x-client-id'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!authHeader || !clientId || !signature || !timestamp) {
      return res.status(401).json({ error: 'Missing authentication headers' });
    }

    // Validate JWT
    const token = authHeader.split(' ')[1];
    const jwtResponse = await axios.post(
      `${AUTH_SERVICE_URL}/v1/auth/validate-jwt`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!jwtResponse.data.valid) {
      return res.status(401).json({ error: 'Invalid JWT token' });
    }

    // Validate HMAC
    const hmacResponse = await axios.post(`${AUTH_SERVICE_URL}/v1/auth/validate-hmac`, {
      client_id: clientId,
      signature,
      timestamp,
      payload: {
        method: req.method,
        path: req.path,
        body: req.body
      }
    });

    if (!hmacResponse.data.valid) {
      return res.status(401).json({ error: 'Invalid HMAC signature' });
    }

    // Attach user and org context
    req.user = jwtResponse.data.user;
    req.org_id = hmacResponse.data.org_id;
    req.org_name = hmacResponse.data.org_name;

    next();
  } catch (error) {
    console.error('Auth validation error:', error.message);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
};

module.exports = validateRequest;
```

### Pattern 3: Critical Operations Double-Check

```javascript
// content-service/src/controllers/adminController.js
const axios = require('axios');

class AdminController {
  async deleteOrganizationData(req, res) {
    try {
      const { org_id } = req.params;
      const user = req.user;

      // For critical operations, double-check with auth service
      const authResponse = await axios.post(
        `${process.env.AUTH_SERVICE_URL}/v1/auth/validate-jwt`,
        {},
        { headers: { Authorization: req.headers.authorization } }
      );

      if (!authResponse.data.valid || authResponse.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Proceed with deletion
      await this.contentService.deleteOrgData(org_id);

      res.json({ message: 'Organization data deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Operation failed' });
    }
  }
}
```

## Client Libraries

### JavaScript/Node.js Client

```javascript
// shared/auth-client.js
const axios = require('axios');

class AuthClient {
  constructor(authServiceUrl) {
    this.baseUrl = authServiceUrl;
  }

  async validateJWT(token) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/auth/validate-jwt`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async validateHMAC(clientId, signature, timestamp, payload) {
    try {
      const response = await axios.post(`${this.baseUrl}/v1/auth/validate-hmac`, {
        client_id: clientId,
        signature,
        timestamp,
        payload
      });
      return response.data;
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  generateHMAC(clientSecret, payload) {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', clientSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}

module.exports = AuthClient;
```

### Python Client

```python
# shared/auth_client.py
import requests
import hmac
import hashlib
import json
from typing import Dict, Any

class AuthClient:
    def __init__(self, auth_service_url: str):
        self.base_url = auth_service_url

    def validate_jwt(self, token: str) -> Dict[str, Any]:
        """Validate JWT token"""
        try:
            response = requests.post(
                f"{self.base_url}/v1/auth/validate-jwt",
                headers={"Authorization": f"Bearer {token}"}
            )
            return response.json()
        except Exception as e:
            return {"valid": False, "error": str(e)}

    def validate_hmac(self, client_id: str, signature: str,
                     timestamp: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Validate HMAC signature"""
        try:
            response = requests.post(
                f"{self.base_url}/v1/auth/validate-hmac",
                json={
                    "client_id": client_id,
                    "signature": signature,
                    "timestamp": timestamp,
                    "payload": payload
                }
            )
            return response.json()
        except Exception as e:
            return {"valid": False, "error": str(e)}

    @staticmethod
    def generate_hmac(client_secret: str, payload: Dict[str, Any]) -> str:
        """Generate HMAC signature"""
        message = json.dumps(payload, separators=(',', ':'))
        return hmac.new(
            client_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
```

## Security Considerations

### 1. Rate Limiting
```javascript
// auth-service/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const authValidationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    valid: false,
    error: 'Too many validation requests'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to validation endpoints
app.use('/v1/auth/validate-jwt', authValidationLimiter);
app.use('/v1/auth/validate-hmac', authValidationLimiter);
```

### 2. Request Signing
```javascript
// client-side HMAC generation
function generateHMACSignature(clientSecret, method, path, body, timestamp) {
  const payload = {
    method: method.toUpperCase(),
    path: path,
    timestamp: timestamp,
    body: body || {}
  };

  const message = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', clientSecret)
    .update(message)
    .digest('hex');
}

// Usage
const timestamp = Date.now().toString();
const signature = generateHMACSignature(
  clientSecret,
  'POST',
  '/api/content/upload',
  { fileName: 'document.pdf' },
  timestamp
);
```

### 3. Token Blacklisting
```javascript
// auth-service/src/services/tokenService.js
class TokenService {
  async blacklistToken(tokenId) {
    await this.tokenRepository.update(tokenId, { is_revoked: true });
  }

  async isTokenBlacklisted(tokenId) {
    const token = await this.tokenRepository.findByTokenId(tokenId);
    return token?.is_revoked || false;
  }
}
```

## Error Handling

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `MISSING_TOKEN` | 401 | No JWT token provided |
| `INVALID_TOKEN` | 401 | JWT token is malformed or invalid |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `TOKEN_REVOKED` | 401 | JWT token has been revoked |
| `INVALID_CLIENT_ID` | 401 | HMAC client ID not found |
| `EXPIRED_REQUEST` | 401 | Request timestamp is too old |
| `INVALID_SIGNATURE` | 401 | HMAC signature doesn't match |
| `SERVICE_UNAVAILABLE` | 503 | Auth service is down |

### Circuit Breaker Pattern

```javascript
// shared/circuit-breaker.js
class CircuitBreaker {
  constructor(serviceName, failureThreshold = 5, timeout = 60000) {
    this.serviceName = serviceName;
    this.failureThreshold = failureThreshold;
    this.timeout = timeout;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`${this.serviceName} is currently unavailable`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const authCircuitBreaker = new CircuitBreaker('auth-service');

const validateToken = async (token) => {
  return authCircuitBreaker.execute(async () => {
    return await authClient.validateJWT(token);
  });
};
```

## Monitoring and Logging

### Structured Logging
```javascript
// auth-service/src/routes/authRoutes.js
router.post('/validate-jwt', validateJWT, (req, res) => {
  logger.info('JWT validation successful', {
    service: 'auth-service',
    endpoint: '/validate-jwt',
    user_id: req.user.user_id,
    org_id: req.user.org_id,
    ip: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    valid: true,
    user: req.user
  });
});
```

### Metrics Collection
```javascript
// auth-service/src/middleware/metrics.js
const responseTime = require('response-time');

app.use(responseTime((req, res, time) => {
  if (req.path.startsWith('/v1/auth/validate')) {
    // Send metrics to monitoring system
    metrics.timing('auth.validation.response_time', time, {
      endpoint: req.path,
      method: req.method,
      status: res.statusCode
    });
  }
}));
```

## Deployment Configuration

### Environment Variables
```bash
# Auth Service
AUTH_SERVICE_URL=http://auth-service:3000
JWT_SECRET=your-256-bit-secret-key
HMAC_VALIDATION_TIMEOUT=5000

# Other Services
AUTH_SERVICE_URL=http://auth-service:3000
AUTH_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
AUTH_CIRCUIT_BREAKER_TIMEOUT=60000
```

### Docker Compose
```yaml
version: '3.8'
services:
  auth-service:
    image: auth-service:latest
    environment:
      - JWT_SECRET=${JWT_SECRET}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  content-service:
    image: content-service:latest
    environment:
      - AUTH_SERVICE_URL=http://auth-service:3000
    depends_on:
      auth-service:
        condition: service_healthy
```

## Testing

### Unit Tests
```javascript
// auth-service/test/validation.test.js
const request = require('supertest');
const app = require('../src/app');

describe('Validation Endpoints', () => {
  test('should validate valid JWT', async () => {
    const token = generateValidJWT();
    const response = await request(app)
      .post('/v1/auth/validate-jwt')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.valid).toBe(true);
    expect(response.body.user).toHaveProperty('user_id');
  });

  test('should reject invalid HMAC', async () => {
    const response = await request(app)
      .post('/v1/auth/validate-hmac')
      .send({
        client_id: 'invalid',
        signature: 'invalid',
        timestamp: Date.now().toString(),
        payload: {}
      })
      .expect(401);

    expect(response.body.valid).toBe(false);
  });
});
```

### Integration Tests
```javascript
// test/auth-integration.test.js
describe('Cross-Service Authentication', () => {
  test('content service should accept valid auth', async () => {
    // 1. Register organization
    const org = await registerTestOrg();

    // 2. Create user
    const user = await createTestUser(org);

    // 3. Login to get tokens
    const tokens = await loginTestUser(user, org);

    // 4. Generate HMAC signature
    const signature = generateHMAC(org.client_secret, {
      method: 'POST',
      path: '/api/content/upload',
      timestamp: Date.now(),
      body: { fileName: 'test.pdf' }
    });

    // 5. Call content service
    const response = await request(contentService)
      .post('/api/content/upload')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .set('X-Client-ID', org.client_id)
      .set('X-Signature', signature)
      .set('X-Timestamp', Date.now().toString())
      .attach('file', 'test.pdf')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## Troubleshooting

### Common Issues

1. **Token Validation Fails**
   - Check JWT_SECRET is consistent across services
   - Verify token hasn't expired
   - Ensure token format is correct

2. **HMAC Validation Fails**
   - Verify client_secret is correct
   - Check timestamp is within 5-minute window
   - Ensure payload structure matches exactly

3. **Service Unavailable**
   - Check auth service health endpoint
   - Verify network connectivity
   - Check circuit breaker status

### Debug Mode
```javascript
// Enable debug logging
process.env.DEBUG = 'auth:*';

// Check auth service logs
docker logs auth-service

// Test endpoints manually
curl -X POST http://localhost:3000/v1/auth/validate-jwt \
  -H "Authorization: Bearer <token>"
```

## API Reference

### Endpoints Summary

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/v1/auth/validate-jwt` | POST | Validate JWT token | Bearer token |
| `/v1/auth/validate-hmac` | POST | Validate HMAC signature | None |
| `/v1/auth/login` | POST | User login | HMAC headers |
| `/v1/auth/signup` | POST | User registration | HMAC headers |
| `/v1/auth/refresh` | POST | Refresh tokens | HMAC headers |

### Request/Response Schemas

See the Swagger documentation at `http://localhost:3000/docs` for complete API specifications.

---

## Conclusion

This hybrid authentication architecture provides the best balance of **performance**, **security**, and **scalability**. The validation endpoints enable services to choose the appropriate validation level based on their security requirements while maintaining centralized control over authentication logic.

For questions or issues, refer to the service logs or contact the development team.