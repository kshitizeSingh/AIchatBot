# Auth Service - Quick Setup Guide

## ✅ Project Created Successfully!

Your complete Auth Service has been created under `authorizationService/` folder with:

### 📁 **Project Structure**
- ✅ Complete layered architecture (Controller → Service → Repository)
- ✅ Configuration management (environment, database)
- ✅ Middleware for HMAC & JWT validation
- ✅ Input validators for all endpoints
- ✅ PostgreSQL database schema with migrations
- ✅ Swagger/OpenAPI documentation
- ✅ Docker containerization (Dockerfile + docker-compose.yml)
- ✅ Comprehensive error handling
- ✅ Structured logging with Winston

### 📦 **Files Created**

**Configuration (5 files)**
- `package.json` - Dependencies and scripts
- `.env.example` - Environment variables template
- `src/config/environment.js` - Environment validation
- `src/config/database.js` - Database connection pool
- `.dockerignore` - Docker build exclusions

**Utilities (4 files)**
- `src/utils/errors.js` - Custom error classes
- `src/utils/responses.js` - Standard response formatter
- `src/utils/logger.js` - Winston logger setup
- `src/utils/constants.js` - App constants

**Validators (3 files)**
- `src/validators/authValidator.js` - Auth endpoint validation
- `src/validators/orgValidator.js` - Org endpoint validation
- `src/validators/userValidator.js` - User endpoint validation

**Middleware (4 files)**
- `src/middleware/validateHMAC.js` - HMAC signature validation
- `src/middleware/validateJWT.js` - JWT token validation
- `src/middleware/errorHandler.js` - Global error handler
- `src/middleware/requestLogger.js` - Request/response logging

**Persistence Layer (4 files)**
- `src/persistence/orgRepository.js` - Organization CRUD
- `src/persistence/userRepository.js` - User CRUD
- `src/persistence/tokenRepository.js` - Token management
- `src/persistence/auditRepository.js` - Audit logging

**Service Layer (5 files)**
- `src/services/cryptoService.js` - Password & HMAC operations
- `src/services/tokenService.js` - JWT generation & verification
- `src/services/authService.js` - Authentication logic
- `src/services/orgService.js` - Organization management
- `src/services/userService.js` - User management

**Controller Layer (3 files)**
- `src/controllers/authController.js` - Auth endpoints
- `src/controllers/orgController.js` - Org endpoints
- `src/controllers/userController.js` - User endpoints

**Routes (3 files)**
- `src/routes/authRoutes.js` - Auth routes with Swagger
- `src/routes/orgRoutes.js` - Org routes with Swagger
- `src/routes/userRoutes.js` - User routes with Swagger

**Application (2 files)**
- `src/app.js` - Express app configuration
- `index.js` - Entry point with graceful shutdown

**Database (2 files)**
- `src/migrations/001_initial_schema.sql` - Database schema
- `src/migrations/README.md` - Migration instructions

**Docker (2 files)**
- `Dockerfile` - Multi-stage Docker image
- `docker-compose.yml` - PostgreSQL + Auth Service

**Documentation (2 files)**
- `README.md` - Comprehensive documentation
- `SETUP_GUIDE.md` - This file

---

## 🚀 **Getting Started**

### Option 1: Docker (Recommended)

```bash
# Navigate to project
cd authorizationService

# Create .env from template
cp .env.example .env

# Start services
docker-compose up -d

# Verify services
docker-compose ps
```

Services will be available at:
- 🔐 **Auth Service**: http://localhost:3000
- 📚 **API Documentation**: http://localhost:3000/docs
- 💚 **Health Check**: http://localhost:3000/health
- 🗄️ **pgAdmin**: http://localhost:5050

### Option 2: Local Development

```bash
# Navigate to project
cd authorizationService

# Install dependencies
npm install

# Setup PostgreSQL
# Option A: Using Docker (PostgreSQL only)
docker run -d \
  --name fce-postgres \
  -e POSTGRES_USER=fce_user \
  -e POSTGRES_PASSWORD=SecurePass123 \
  -e POSTGRES_DB=fce_auth_db \
  -p 5432:5432 \
  postgres:14-alpine

# Option B: Using installed PostgreSQL (ensure it's running)

# Create environment file
cp .env.example .env

# Run migrations
psql -h localhost -U fce_user -d fce_auth_db -f src/migrations/001_initial_schema.sql

# Start development server
npm run dev
```

---

## 📚 **API Testing**

### 1. Register Organization (Public)

```bash
curl -X POST http://localhost:3000/v1/org/register \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "ACME Corporation",
    "admin_email": "admin@acme.com",
    "admin_password": "SecurePass123!"
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Organization registered successfully",
  "data": {
    "org_id": "uuid",
    "org_name": "ACME Corporation",
    "client_id": "pk_abc123...",
    "client_secret": "sk_xyz789...",
    "admin_user": {
      "user_id": "uuid",
      "email": "admin@acme.com",
      "role": "owner"
    },
    "warning": "Save client_secret now. It cannot be retrieved later."
  }
}
```

**⚠️ IMPORTANT**: Save the `client_id` and `client_secret` immediately!

### 2. Login (Requires HMAC)

For HMAC signing, generate signature:

```javascript
const crypto = require('crypto');

const clientSecret = 'sk_xyz789...'; // From registration
const timestamp = Date.now().toString();
const payload = JSON.stringify({
  method: 'POST',
  path: '/v1/auth/login',
  timestamp: timestamp,
  body: { email: 'admin@acme.com', password: 'SecurePass123!' }
});

const signature = crypto
  .createHmac('sha256', clientSecret)
  .update(payload)
  .digest('hex');

console.log('X-Signature:', signature);
```

Then send request:

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client-ID: pk_abc123..." \
  -H "X-Timestamp: 1737388800000" \
  -H "X-Signature: <generated-signature>" \
  -d '{
    "email": "admin@acme.com",
    "password": "SecurePass123!"
  }'
```

### 3. User Creation (Admin Only)

```bash
curl -X POST http://localhost:3000/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "X-Client-ID: pk_abc123..." \
  -H "X-Timestamp: 1737388800000" \
  -H "X-Signature: <generated-signature>" \
  -d '{
    "email": "user@acme.com",
    "password": "SecurePass123!",
    "role": "user"
  }'
```

---

## 🛠️ **Available Commands**

```bash
# Development
npm run dev              # Start with hot reload (nodemon)

# Testing
npm test               # Run all tests
npm run test:unit     # Unit tests only
npm run test:watch    # Watch mode

# Linting
npm run lint          # Check code style
npm run lint:fix      # Fix linting issues

# Database
npm run db:migrate    # Run migrations

# Production
npm start             # Start production server
```

---

## 📋 **API Endpoints Summary**

### Organization
- `POST /v1/org/register` - Register organization (public)
- `GET /v1/org/details` - Get org details (HMAC only)

### Authentication
- `POST /v1/auth/login` - User login (HMAC only)
- `POST /v1/auth/signup` - User registration (HMAC only)
- `POST /v1/auth/refresh` - Refresh access token (HMAC only)
- `POST /v1/auth/logout` - User logout (JWT + HMAC)

### Users
- `POST /v1/users` - Create user (JWT + HMAC, Admin only)
- `GET /v1/users` - List organization users (JWT + HMAC, Admin only)
- `GET /v1/user/profile` - Get user profile (JWT + HMAC)
- `PATCH /v1/users/{id}/role` - Update user role (JWT + HMAC, Owner only)

---

## 🔐 **Security Features**

✅ **Password Security**
- Bcrypt hashing (12 rounds)
- Min 12 characters with complexity requirements
- Account lockout (5 attempts = 30 min lockdown)

✅ **Token Security**
- Access tokens: 15 minutes
- Refresh tokens: 7 days (with rotation)
- JWT signature verification

✅ **HMAC Security**
- SHA256 signature validation
- Timestamp-based replay protection (5-min window)
- Timing-safe comparison

✅ **Audit Logging**
- All security events logged
- Failed login tracking
- Token operations logged

---

## 📊 **Database Schema**

**Tables:**
- `organizations` - Multi-tenant organizations
- `users` - Users with roles and security fields
- `refresh_tokens` - Token management with revocation
- `audit_logs` - Audit trail for security events
- `sessions` - Optional session tracking

---

## 🐳 **Docker Commands Reference**

```bash
# View all services
docker-compose ps

# View logs
docker-compose logs -f auth-service
docker-compose logs -f postgres

# Access database
docker exec -it fce-auth-postgres psql -U fce_user -d fce_auth_db

# Stop services
docker-compose down

# Remove volumes (delete data)
docker-compose down -v

# Rebuild images
docker-compose build --no-cache
```

---

## 📝 **Next Steps**

1. ✅ Start Docker services
2. ✅ Register an organization
3. ✅ Login with credentials
4. ✅ Create additional users
5. ✅ Test all endpoints via Swagger UI (`/docs`)
6. ✅ Review audit logs
7. ✅ Integrate with other services

---

## 🆘 **Troubleshooting**

### Port 3000 already in use
```bash
# Change PORT in .env to 3001
PORT=3001
```

### PostgreSQL connection fails
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker-compose logs postgres
```

### JWT/HMAC signature errors
- Verify X-Client-ID and X-Signature headers
- Check timestamp is within 5 minutes
- Ensure JWT_SECRET matches

---

## 📖 **Documentation**

Full documentation available in:
- 📄 `README.md` - Project overview and features
- 📚 `http://localhost:3000/docs` - Interactive Swagger UI
- 📝 `solution/auth_service_implementation.md` - Implementation details

---

**🎉 You're all set! Happy coding!**
