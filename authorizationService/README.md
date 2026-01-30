# Auth Service - AI FAQ Platform

Complete authentication and authorization service for the AI-powered FAQ & Chatbot platform.

## Features

- ✅ **Multi-tenant Architecture** - Complete organization isolation
- ✅ **JWT + HMAC Authentication** - Dual-layer security
- ✅ **Role-Based Access Control** - Owner, Admin, User roles
- ✅ **Account Security** - Password hashing, account lockout, failed attempt tracking
- ✅ **Token Management** - Access tokens (15 min), Refresh tokens (7 days), Token rotation
- ✅ **Audit Logging** - Complete security event logging
- ✅ **Swagger Documentation** - Interactive API docs
- ✅ **Docker Ready** - Full containerization with docker-compose

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (or PostgreSQL 14+)
- npm 9+

### Installation

1. **Clone & Setup**
```bash
cd authorizationService
npm install
cp .env.example .env
```

2. **Using Docker (Recommended)**
```bash
docker-compose up -d
```

The service will:
- Start PostgreSQL on port 5432
- Start Auth Service on port 3000
- Start pgAdmin on port 5050
- Automatically run database migrations

3. **Manual Setup (without Docker)**
```bash
# Start PostgreSQL (ensure it's running)

# Create database and run migrations
psql -h localhost -U postgres
CREATE DATABASE fce_auth_db;
CREATE USER fce_user WITH PASSWORD 'SecurePass123';
GRANT ALL PRIVILEGES ON DATABASE fce_auth_db TO fce_user;

# Run migrations
psql -h localhost -U fce_user -d fce_auth_db -f src/migrations/001_initial_schema.sql

# Start service
npm run dev
```

## API Documentation

Interactive API documentation available at: `http://localhost:3000/docs`

### Key Endpoints

**Organization Registration** (Public)
```http
POST /v1/org/register
Content-Type: application/json

{
  "org_name": "ACME Corporation",
  "admin_email": "admin@acme.com",
  "admin_password": "SecurePass123!"
}
```

**User Login** (Requires HMAC)
```http
POST /v1/auth/login
X-Client-ID: pk_xxx
X-Timestamp: 1737388800000
X-Signature: xxx
Content-Type: application/json

{
  "email": "user@acme.com",
  "password": "SecurePass123!"
}
```

**User Creation** (Requires JWT + HMAC, Admin only)
```http
POST /v1/users
Authorization: Bearer <jwt_token>
X-Client-ID: pk_xxx
X-Timestamp: 1737388800000
X-Signature: xxx
Content-Type: application/json

{
  "email": "newuser@acme.com",
  "password": "SecurePass123!",
  "role": "user"
}
```

## Project Structure

```
authorizationService/
├── src/
│   ├── config/          # Configuration (database, environment)
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic
│   ├── persistence/     # Database repositories
│   ├── middleware/      # Express middleware
│   ├── validators/      # Input validation
│   ├── routes/          # API routes
│   ├── utils/           # Utilities (errors, responses, logger)
│   ├── migrations/      # Database migration scripts
│   └── app.js          # Express app setup
├── tests/               # Unit & integration tests
├── logs/                # Application logs
├── .env.example         # Environment variables template
├── docker-compose.yml   # Docker Compose configuration
├── Dockerfile          # Container image definition
├── package.json        # Dependencies
└── index.js           # Application entry point
```

## Configuration

### Environment Variables

```env
# Environment
NODE_ENV=development
PORT=3000

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=fce_auth_db
DB_USER=fce_user
DB_PASSWORD=SecurePass123
DB_POOL_SIZE=20

# JWT
JWT_SECRET=your-256-bit-secret-key-change-in-production

# Logging
LOG_LEVEL=debug

# CORS
CORS_ORIGIN=http://localhost:3000
```

## Development

### Running Locally
```bash
npm run dev
```

### Running Tests
```bash
npm test
npm run test:unit
npm run test:integration
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Database Migrations
```bash
npm run db:migrate
```

## Architecture

### Layered Architecture

```
Client Requests
    ↓
Routes (path parsing)
    ↓
Middleware (HMAC/JWT validation, logging)
    ↓
Controllers (request handling)
    ↓
Services (business logic)
    ↓
Repositories (data access)
    ↓
PostgreSQL Database
```

### Security Layers

1. **HMAC Validation** - Organization-level authentication
2. **JWT Validation** - User-level authentication
3. **Role-Based Access** - Resource-level authorization
4. **Audit Logging** - Security event tracking
5. **Password Security** - Bcrypt hashing, complexity requirements
6. **Token Management** - Rotation, revocation, expiration

## API Security

### HMAC Signature Calculation

```javascript
const crypto = require('crypto');

const payload = JSON.stringify({
  method: 'POST',
  path: '/v1/auth/login',
  timestamp: Date.now(),
  body: { email: 'user@example.com', password: 'xxx' }
});

const signature = crypto
  .createHmac('sha256', clientSecret)
  .update(payload)
  .digest('hex');
```

### Headers Required

```
X-Client-ID: pk_xxx          # Provided during org registration
X-Timestamp: 1737388800000   # Current milliseconds
X-Signature: xxx             # HMAC-SHA256 signature
```

## Monitoring

### Health Check
```http
GET /v1/health
```

### Logs
Application logs stored in `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

## Docker Commands

```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f auth-service

# Stop services
docker-compose down

# Rebuild images
docker-compose build

# Access PostgreSQL
docker exec -it fce-auth-postgres psql -U fce_user -d fce_auth_db

# Access pgAdmin
# http://localhost:5050
# Email: admin@example.com
# Password: admin123
```

## Production Deployment

Before deploying to production:

1. **Change JWT_SECRET**
   ```
   JWT_SECRET=<generate-random-256-bit-key>
   ```

2. **Set NODE_ENV**
   ```
   NODE_ENV=production
   ```

3. **Database Security**
   - Change default database password
   - Enable SSL connections
   - Set up proper backups

4. **CORS Configuration**
   ```
   CORS_ORIGIN=https://yourdomain.com
   ```

5. **HTTPS/SSL**
   - Configure reverse proxy (nginx, Apache)
   - Enable HTTPS

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker-compose logs postgres

# Test connection
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -c "SELECT 1"
```

### Port Already in Use
```bash
# Change PORT in .env
PORT=3001

# Or kill process using port
lsof -i :3000
kill -9 <PID>
```

### JWT/HMAC Errors
- Verify X-Client-ID and signature headers are present
- Check JWT_SECRET is set correctly
- Ensure timestamp is within 5-minute window

## Testing with Postman

1. **Import Collection**: `./docs/auth-service.postman_collection.json`
2. **Set Variables**:
   - `client_id`: From org registration response
   - `client_secret`: From org registration response
   - `access_token`: From login response
   - `refresh_token`: From login response

3. **Use Pre-request Scripts** for automatic HMAC signing

## Contributing

1. Follow the layered architecture pattern
2. Write tests for new features
3. Run linting before committing
4. Update API documentation (Swagger)

## License

MIT

## Support

For issues or questions, contact the development team.
