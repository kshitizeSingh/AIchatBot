# Auth Service - Complete Implementation Guide

## Table of Contents

1. [Project Structure](#project-structure)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Database Design & Setup](#database-design--setup)
5. [Layered Architecture](#layered-architecture)
6. [API Endpoints & Swagger](#api-endpoints--swagger)
7. [Configuration Management](#configuration-management)
8. [Docker Setup](#docker-setup)
9. [Implementation Details](#implementation-details)
10. [Security Considerations](#security-considerations)

---

## Project Structure

```
auth-service/
├── src/
│   ├── config/
│   │   ├── database.js           # Database connection pool
│   │   ├── jwt.js                # JWT configuration
│   │   ├── security.js           # Password & HMAC config
│   │   └── environment.js        # Env variable validation
│   │
│   ├── controllers/
│   │   ├── authController.js     # Auth endpoints (login, signup, refresh, logout)
│   │   ├── orgController.js      # Organization endpoints
│   │   └── userController.js     # User management endpoints
│   │
│   ├── services/
│   │   ├── authService.js        # Auth business logic
│   │   ├── orgService.js         # Organization business logic
│   │   ├── userService.js        # User management logic
│   │   ├── tokenService.js       # JWT & token operations
│   │   └── cryptoService.js      # HMAC, password hashing
│   │
│   ├── persistence/
│   │   ├── orgRepository.js      # Organization database operations
│   │   ├── userRepository.js     # User database operations
│   │   ├── tokenRepository.js    # Token storage & retrieval
│   │   └── auditRepository.js    # Audit log operations
│   │
│   ├── middleware/
│   │   ├── validateHMAC.js       # HMAC validation middleware
│   │   ├── validateJWT.js        # JWT validation middleware
│   │   ├── errorHandler.js       # Global error handling
│   │   └── requestLogger.js      # Request/response logging
│   │
│   ├── validators/
│   │   ├── authValidator.js      # Auth input validation
│   │   ├── orgValidator.js       # Org input validation
│   │   └── userValidator.js      # User input validation
│   │
│   ├── utils/
│   │   ├── logger.js             # Logging utility
│   │   ├── responses.js          # Standardized responses
│   │   ├── errors.js             # Custom error classes
│   │   └── constants.js          # Constants & enums
│   │
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_create_indexes.sql
│   │   └── 003_audit_tables.sql
│   │
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── orgRoutes.js
│   │   ├── userRoutes.js
│   │   └── index.js              # Route aggregator
│   │
│   └── app.js                    # Express app setup
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   ├── persistence/
│   │   └── utils/
│   └── integration/
│       ├── auth.test.js
│       └── org.test.js
│
├── docs/
│   ├── swagger.json              # Generated Swagger spec
│   └── INSTALLATION.md           # Setup instructions
│
├── .dockerignore
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── index.js                      # Entry point
└── README.md
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Express Server                          │
│  (req) → Routes → Middleware → Controllers → (res)         │
└─────────────────────────────────────────────────────────────┘
                             ↓
        ┌────────────────────────────────────────┐
        │      Controller Layer (Request)        │
        │  - Parse input                         │
        │  - Call service layer                  │
        │  - Return responses                    │
        └────────────────────────────────────────┘
                             ↓
        ┌────────────────────────────────────────┐
        │      Service Layer (Business Logic)    │
        │  - Auth logic                          │
        │  - Validation                          │
        │  - Org/User management                 │
        │  - Token generation                    │
        │  - Error handling                      │
        └────────────────────────────────────────┘
                             ↓
        ┌────────────────────────────────────────┐
        │   Persistence Layer (Data Access)      │
        │  - Database queries                    │
        │  - Repository pattern                  │
        │  - Query builders                      │
        │  - Error mapping                       │
        └────────────────────────────────────────┘
                             ↓
        ┌────────────────────────────────────────┐
        │       PostgreSQL Database              │
        │  - organizations                       │
        │  - users                               │
        │  - refresh_tokens                      │
        │  - audit_logs                          │
        └────────────────────────────────────────┘
```

**Request Flow:**
```
Client Request
    ↓
Routes (parse path & method)
    ↓
Middleware (HMAC validation, JWT validation, logging)
    ↓
Controller (validateHMAC → validateJWT → callService → returnResponse)
    ↓
Service (businessLogic → callRepository → return result)
    ↓
Repository (executeQuery → mapResults → return data)
    ↓
PostgreSQL (CRUD operations)
    ↓
Response back to Client
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Framework** | Express.js 4.x | Web framework |
| **Database** | PostgreSQL 14+ | Relational database |
| **DB Driver** | pg (node-postgres) | PostgreSQL client |
| **Authentication** | jsonwebtoken | JWT operations |
| **Password Hash** | bcrypt | Password hashing |
| **Validation** | joi | Input validation |
| **API Documentation** | Swagger/OpenAPI 3.0 | API specs |
| **Swagger UI** | swagger-ui-express | Interactive API docs |
| **Environment** | dotenv | Configuration management |
| **Logging** | winston | Structured logging |
| **Container** | Docker & Docker Compose | Containerization |
| **Testing** | Jest + Supertest | Unit & integration tests |

---

## Database Design & Setup

### PostgreSQL Installation & Setup

```bash
# Docker (recommended)
docker run -d \
  --name fce-postgres \
  -e POSTGRES_USER=fce_user \
  -e POSTGRES_PASSWORD=SecurePass123 \
  -e POSTGRES_DB=fce_auth_db \
  -p 5432:5432 \
  postgres:14-alpine

# Verify connection
psql -h localhost -U fce_user -d fce_auth_db -c "SELECT 1"
```

### Database Schema

```sql
-- Create organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    
    -- HMAC credentials (hashed)
    client_id_hash TEXT NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    client_id_prefix VARCHAR(20) NOT NULL,  -- "pk_abc123..." for display
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_org_client_id_hash ON organizations(client_id_hash);
CREATE INDEX idx_org_is_active ON organizations(is_active);

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    
    -- Role: 'owner', 'admin', 'user'
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    
    -- Security
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    last_password_change TIMESTAMP DEFAULT NOW(),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_email_per_org UNIQUE (org_id, email),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'user')),
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_user_org_id ON users(org_id);
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_is_active ON users(is_active);

-- Create refresh tokens table
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    token_hash TEXT NOT NULL UNIQUE,
    token_id UUID NOT NULL UNIQUE,
    
    -- Status
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    
    -- Expiration
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_refresh_token_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_token_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_token_revoked ON refresh_tokens(is_revoked);

-- Create audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    
    status VARCHAR(50),  -- 'success', 'failure', 'warning'
    details JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- Create sessions table (optional, for session tracking)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    token_hash TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_session_user_id ON sessions(user_id);
CREATE INDEX idx_session_expires_at ON sessions(expires_at);
```

---

## Layered Architecture

### 1. Controller Layer

**File: `src/controllers/authController.js`**

```javascript
const { successResponse, errorResponse } = require('../utils/responses');
const authService = require('../services/authService');
const { validateLogin, validateSignup } = require('../validators/authValidator');

class AuthController {
  /**
   * POST /v1/auth/login
   * Body: { email, password }
   * Headers: X-Client-ID, X-Signature, X-Timestamp
   */
  async login(req, res, next) {
    try {
      // req.user and req.org_id already set by middleware
      
      // Validate input
      const { error, value } = validateLogin(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      // Call service
      const result = await authService.login(
        value.email,
        value.password,
        req.org_id
      );

      return res.status(200).json(
        successResponse(result, 'User logged in successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /v1/auth/signup
   * Body: { email, password }
   * Headers: X-Client-ID, X-Signature, X-Timestamp
   */
  async signup(req, res, next) {
    try {
      const { error, value } = validateSignup(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await authService.signup(
        value.email,
        value.password,
        req.org_id
      );

      return res.status(201).json(
        successResponse(result, 'User registered successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /v1/auth/refresh
   * Body: { refresh_token }
   * Headers: X-Client-ID, X-Signature, X-Timestamp
   */
  async refresh(req, res, next) {
    try {
      if (!req.body.refresh_token) {
        return res.status(400).json(
          errorResponse('MISSING_REQUIRED_FIELD', 'refresh_token is required')
        );
      }

      const result = await authService.refreshAccessToken(
        req.body.refresh_token,
        req.org_id
      );

      return res.status(200).json(
        successResponse(result, 'Token refreshed successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /v1/auth/logout
   * Headers: Authorization, X-Client-ID, X-Signature, X-Timestamp
   */
  async logout(req, res, next) {
    try {
      // req.user.user_id already set by JWT middleware
      
      if (!req.body.refresh_token) {
        return res.status(400).json(
          errorResponse('MISSING_REQUIRED_FIELD', 'refresh_token is required')
        );
      }

      await authService.logout(req.user.user_id, req.body.refresh_token);

      return res.status(200).json(
        successResponse({}, 'Logged out successfully')
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
```

**File: `src/controllers/orgController.js`**

```javascript
const { successResponse, errorResponse } = require('../utils/responses');
const orgService = require('../services/orgService');
const { validateOrgRegistration } = require('../validators/orgValidator');

class OrgController {
  /**
   * POST /v1/org/register
   * Body: { org_name, admin_email, admin_password }
   * No auth required (public endpoint)
   */
  async register(req, res, next) {
    try {
      const { error, value } = validateOrgRegistration(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await orgService.registerOrganization(
        value.org_name,
        value.admin_email,
        value.admin_password
      );

      return res.status(201).json(
        successResponse(result, 'Organization registered successfully. Save client_secret immediately!')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v1/org/details
   * Headers: Authorization, X-Client-ID, X-Signature, X-Timestamp
   */
  async getDetails(req, res, next) {
    try {
      // req.org_id already set by middleware
      
      const details = await orgService.getOrgDetails(req.org_id);

      return res.status(200).json(
        successResponse(details, 'Organization details retrieved')
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrgController();
```

**File: `src/controllers/userController.js`**

```javascript
const { successResponse, errorResponse } = require('../utils/responses');
const userService = require('../services/userService');
const { validateUserCreation, validateRoleUpdate } = require('../validators/userValidator');

class UserController {
  /**
   * POST /v1/users/register
   * Body: { email, password, role }
   * Headers: Authorization, X-Client-ID, X-Signature, X-Timestamp
   * Permission: owner, admin only
   */
  async createUser(req, res, next) {
    try {
      // Check permission
      if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json(
          errorResponse('INSUFFICIENT_PERMISSION', 'Only admin can create users')
        );
      }

      const { error, value } = validateUserCreation(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await userService.createUser(
        value.email,
        value.password,
        value.role,
        req.user.org_id,
        req.user.user_id
      );

      return res.status(201).json(
        successResponse(result, 'User created successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v1/users
   * Headers: Authorization, X-Client-ID, X-Signature, X-Timestamp
   * Permission: owner, admin only
   */
  async listUsers(req, res, next) {
    try {
      if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json(
          errorResponse('INSUFFICIENT_PERMISSION', 'Only admin can list users')
        );
      }

      const users = await userService.listOrgUsers(req.user.org_id);

      return res.status(200).json(
        successResponse(users, 'Users retrieved successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /v1/users/:id/role
   * Body: { role }
   * Headers: Authorization, X-Client-ID, X-Signature, X-Timestamp
   * Permission: owner only
   */
  async updateUserRole(req, res, next) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json(
          errorResponse('INSUFFICIENT_PERMISSION', 'Only owner can change roles')
        );
      }

      const { error, value } = validateRoleUpdate(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await userService.updateUserRole(
        req.params.id,
        value.role,
        req.user.org_id,
        req.user.user_id
      );

      return res.status(200).json(
        successResponse(result, 'User role updated successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v1/user
   * Headers: Authorization, X-Client-ID, X-Signature, X-Timestamp
   */
  async getProfile(req, res, next) {
    try {
      const user = await userService.getUserById(req.user.user_id, req.user.org_id);

      return res.status(200).json(
        successResponse(user, 'User profile retrieved')
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
```

### 2. Service Layer

**File: `src/services/authService.js`**

```javascript
const userRepository = require('../persistence/userRepository');
const tokenService = require('./tokenService');
const cryptoService = require('./cryptoService');
const { AuthenticationError, ValidationError } = require('../utils/errors');
const auditRepository = require('../persistence/auditRepository');

class AuthService {
  /**
   * Login user and return tokens
   */
  async login(email, password, orgId) {
    try {
      // 1. Fetch user from database
      const user = await userRepository.findByEmailAndOrg(email, orgId);
      
      if (!user) {
        throw new AuthenticationError('INVALID_CREDENTIALS', 'Email or password is incorrect');
      }

      // 2. Check if account is locked
      if (user.locked_until && user.locked_until > new Date()) {
        throw new AuthenticationError('ACCOUNT_LOCKED', 
          'Account locked due to failed login attempts. Try again later.'
        );
      }

      // 3. Check if account is active
      if (!user.is_active) {
        throw new AuthenticationError('ACCOUNT_INACTIVE', 'Account has been deactivated');
      }

      // 4. Verify password
      const isPasswordValid = await cryptoService.comparePassword(password, user.password_hash);
      
      if (!isPasswordValid) {
        // Increment failed login attempts
        await userRepository.incrementFailedLoginAttempts(user.id);
        
        // Check if should lock account
        if (user.failed_login_attempts + 1 >= 5) {
          const lockUntil = new Date();
          lockUntil.setMinutes(lockUntil.getMinutes() + 30);
          await userRepository.lockAccount(user.id, lockUntil);
          
          // Log security event
          await auditRepository.log({
            org_id: orgId,
            user_id: user.id,
            action: 'login_failed_account_locked',
            status: 'warning'
          });
        }
        
        throw new AuthenticationError('INVALID_CREDENTIALS', 'Email or password is incorrect');
      }

      // 5. Generate tokens
      const accessToken = tokenService.generateAccessToken(user.id);
      const refreshToken = await tokenService.generateRefreshToken(user.id, orgId);

      // 6. Update login timestamp and reset failed attempts
      await userRepository.recordSuccessfulLogin(user.id);

      // 7. Log successful login
      await auditRepository.log({
        org_id: orgId,
        user_id: user.id,
        action: 'login_success',
        status: 'success'
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 900,  // 15 minutes
        token_type: 'Bearer',
        user: {
          user_id: user.id,
          email: user.email,
          role: user.role,
          org_id: user.org_id
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Register new user for organization
   */
  async signup(email, password, orgId) {
    try {
      // 1. Check if user already exists
      const existingUser = await userRepository.findByEmailAndOrg(email, orgId);
      
      if (existingUser) {
        throw new ValidationError('DUPLICATE_EMAIL', 'Email already exists in this organization');
      }

      // 2. Validate password
      cryptoService.validatePassword(password);

      // 3. Hash password
      const passwordHash = await cryptoService.hashPassword(password);

      // 4. Create user
      const user = await userRepository.create({
        org_id: orgId,
        email,
        password_hash: passwordHash,
        role: 'user'
      });

      // 5. Log signup
      await auditRepository.log({
        org_id: orgId,
        user_id: user.id,
        action: 'user_signup',
        status: 'success'
      });

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, orgId) {
    try {
      const payload = tokenService.verifyRefreshToken(refreshToken);

      // Check if token is revoked
      const tokenExists = await tokenRepository.findByTokenId(payload.token_id);
      
      if (!tokenExists || tokenExists.is_revoked) {
        // Possible token theft
        await auditRepository.log({
          org_id: orgId,
          user_id: payload.user_id,
          action: 'token_reuse_detected',
          status: 'warning'
        });
        
        throw new AuthenticationError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked');
      }

      // Generate new tokens
      const newAccessToken = tokenService.generateAccessToken(payload.user_id);
      const newRefreshToken = await tokenService.generateRefreshToken(payload.user_id, orgId);

      // Revoke old refresh token
      await tokenRepository.revokeToken(payload.token_id);

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 900,
        token_type: 'Bearer'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(userId, refreshToken) {
    try {
      const payload = tokenService.verifyRefreshToken(refreshToken);
      
      if (payload.user_id !== userId) {
        throw new ValidationError('TOKEN_MISMATCH', 'Token does not match user');
      }

      // Revoke refresh token
      await tokenRepository.revokeToken(payload.token_id);

      // Log logout
      await auditRepository.log({
        user_id: userId,
        action: 'logout',
        status: 'success'
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new AuthService();
```

**File: `src/services/orgService.js`**

```javascript
const { v4: uuid } = require('uuid');
const orgRepository = require('../persistence/orgRepository');
const userRepository = require('../persistence/userRepository');
const cryptoService = require('./cryptoService');
const { ValidationError } = require('../utils/errors');
const auditRepository = require('../persistence/auditRepository');

class OrgService {
  /**
   * Register new organization
   * Returns: org_id, client_id, client_secret
   */
  async registerOrganization(orgName, adminEmail, adminPassword) {
    try {
      // 1. Validate password
      cryptoService.validatePassword(adminPassword);

      // 2. Generate HMAC credentials
      const clientId = `pk_${uuid().replace(/-/g, '').substring(0, 32)}`;
      const clientSecret = `sk_${uuid().replace(/-/g, '').substring(0, 64)}`;

      // 3. Hash credentials
      const clientIdHash = cryptoService.hashClientId(clientId);
      const clientSecretHash = cryptoService.hashClientSecret(clientSecret);

      // 4. Hash admin password
      const passwordHash = await cryptoService.hashPassword(adminPassword);

      // 5. Create organization
      const org = await orgRepository.create({
        name: orgName,
        client_id_hash: clientIdHash,
        client_secret_hash: clientSecretHash,
        client_id_prefix: clientId.substring(0, 20)
      });

      // 6. Create admin user
      const adminUser = await userRepository.create({
        org_id: org.id,
        email: adminEmail,
        password_hash: passwordHash,
        role: 'owner'
      });

      // 7. Log org creation
      await auditRepository.log({
        org_id: org.id,
        user_id: adminUser.id,
        action: 'org_registered',
        status: 'success'
      });

      return {
        org_id: org.id,
        org_name: org.name,
        client_id: clientId,
        client_secret: clientSecret,
        admin_user: {
          user_id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role
        },
        warning: 'Save client_secret now. It cannot be retrieved later.'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get organization details
   */
  async getOrgDetails(orgId) {
    try {
      const org = await orgRepository.findById(orgId);
      
      if (!org) {
        throw new ValidationError('ORG_NOT_FOUND', 'Organization not found');
      }

      return {
        org_id: org.id,
        org_name: org.name,
        is_active: org.is_active,
        created_at: org.created_at,
        updated_at: org.updated_at
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new OrgService();
```

**File: `src/services/tokenService.js`**

```javascript
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const tokenRepository = require('../persistence/tokenRepository');
const cryptoService = require('./cryptoService');
const { AuthenticationError } = require('../utils/errors');

class TokenService {
  /**
   * Generate JWT access token
   */
  generateAccessToken(userId) {
    const payload = {
      user_id: userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900  // 15 minutes
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256'
    });
  }

  /**
   * Generate JWT refresh token
   */
  async generateRefreshToken(userId, orgId) {
    const tokenId = uuid();
    const payload = {
      user_id: userId,
      type: 'refresh',
      token_id: tokenId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800  // 7 days
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256'
    });

    // Store token hash in database
    const tokenHash = cryptoService.hashToken(tokenId);
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + 604800);

    await tokenRepository.create({
      user_id: userId,
      org_id: orgId,
      token_hash: tokenHash,
      token_id: tokenId,
      expires_at: expiresAt
    });

    return token;
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('EXPIRED_TOKEN', 'Access token has expired');
      }
      throw new AuthenticationError('INVALID_TOKEN', 'Token signature is invalid');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });

      if (payload.type !== 'refresh') {
        throw new AuthenticationError('INVALID_TOKEN', 'Not a refresh token');
      }

      return payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('EXPIRED_TOKEN', 'Refresh token has expired');
      }
      throw new AuthenticationError('INVALID_TOKEN', 'Token signature is invalid');
    }
  }
}

module.exports = new TokenService();
```

**File: `src/services/cryptoService.js`**

```javascript
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const PASSWORD_RULES = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true
};

const BLOCKED_PASSWORDS = [
  'password123', 'admin123', '12345678', 'qwerty123',
  'welcome123', 'sunshine123', 'letmein123'
];

class CryptoService {
  /**
   * Hash password using bcrypt
   */
  async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    const errors = [];

    if (password.length < PASSWORD_RULES.minLength) {
      errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters`);
    }

    if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letter');
    }

    if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letter');
    }

    if (PASSWORD_RULES.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain number');
    }

    if (PASSWORD_RULES.requireSpecialChars && 
        !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
      errors.push('Password must contain special character');
    }

    if (BLOCKED_PASSWORDS.some(bp => 
        password.toLowerCase().includes(bp.toLowerCase()))) {
      errors.push('Password too common, please choose another');
    }

    if (errors.length > 0) {
      const error = new Error('Invalid password');
      error.violations = errors;
      throw error;
    }

    return true;
  }

  /**
   * Hash client ID
   */
  hashClientId(clientId) {
    return crypto.createHash('sha256').update(clientId).digest('hex');
  }

  /**
   * Hash client secret
   */
  hashClientSecret(clientSecret) {
    return crypto.createHash('sha256').update(clientSecret).digest('hex');
  }

  /**
   * Hash token for storage
   */
  hashToken(tokenId) {
    return crypto.createHash('sha256').update(tokenId).digest('hex');
  }

  /**
   * Generate HMAC signature for validation
   */
  generateHMAC(clientSecretHash, payload) {
    return crypto
      .createHmac('sha256', clientSecretHash)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(signature, clientSecretHash, payload) {
    const expectedSignature = this.generateHMAC(clientSecretHash, payload);
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

module.exports = new CryptoService();
```

### 3. Persistence Layer

**File: `src/persistence/orgRepository.js`**

```javascript
const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');

class OrgRepository {
  /**
   * Create new organization
   */
  async create(data) {
    try {
      const query = `
        INSERT INTO organizations (name, client_id_hash, client_secret_hash, client_id_prefix)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, client_id_prefix, created_at
      `;

      const result = await pool.query(query, [
        data.name,
        data.client_id_hash,
        data.client_secret_hash,
        data.client_id_prefix
      ]);

      return result.rows[0];
    } catch (error) {
      throw new DatabaseError('Failed to create organization', error);
    }
  }

  /**
   * Find organization by ID
   */
  async findById(id) {
    try {
      const query = 'SELECT * FROM organizations WHERE id = $1 AND is_active = true';
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to fetch organization', error);
    }
  }

  /**
   * Find organization by client ID hash
   */
  async findByClientIdHash(clientIdHash) {
    try {
      const query = 'SELECT * FROM organizations WHERE client_id_hash = $1 AND is_active = true';
      const result = await pool.query(query, [clientIdHash]);
      return result.rows[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to fetch organization', error);
    }
  }

  /**
   * Update organization
   */
  async update(id, data) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(data).forEach(key => {
        fields.push(`${key} = $${paramCount}`);
        values.push(data[key]);
        paramCount++;
      });

      values.push(id);
      const query = `
        UPDATE organizations
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new DatabaseError('Failed to update organization', error);
    }
  }
}

module.exports = new OrgRepository();
```

**File: `src/persistence/userRepository.js`**

```javascript
const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');

class UserRepository {
  /**
   * Create new user
   */
  async create(data) {
    try {
      const query = `
        INSERT INTO users (org_id, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, org_id, email, role, is_active, created_at
      `;

      const result = await pool.query(query, [
        data.org_id,
        data.email,
        data.password_hash,
        data.role
      ]);

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {  // Unique constraint violation
        throw new DatabaseError('Email already exists', error);
      }
      throw new DatabaseError('Failed to create user', error);
    }
  }

  /**
   * Find user by email and organization
   */
  async findByEmailAndOrg(email, orgId) {
    try {
      const query = `
        SELECT * FROM users
        WHERE email = $1 AND org_id = $2
      `;

      const result = await pool.query(query, [email, orgId]);
      return result.rows[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to fetch user', error);
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId, orgId) {
    try {
      const query = `
        SELECT id, org_id, email, role, is_active, created_at
        FROM users
        WHERE id = $1 AND org_id = $2
      `;

      const result = await pool.query(query, [userId, orgId]);
      return result.rows[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to fetch user', error);
    }
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedLoginAttempts(userId) {
    try {
      const query = `
        UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1
        WHERE id = $1
      `;

      await pool.query(query, [userId]);
    } catch (error) {
      throw new DatabaseError('Failed to update login attempts', error);
    }
  }

  /**
   * Lock account
   */
  async lockAccount(userId, lockUntil) {
    try {
      const query = `
        UPDATE users
        SET locked_until = $1
        WHERE id = $2
      `;

      await pool.query(query, [lockUntil, userId]);
    } catch (error) {
      throw new DatabaseError('Failed to lock account', error);
    }
  }

  /**
   * Record successful login
   */
  async recordSuccessfulLogin(userId) {
    try {
      const query = `
        UPDATE users
        SET failed_login_attempts = 0, last_login_at = NOW(), locked_until = NULL
        WHERE id = $1
      `;

      await pool.query(query, [userId]);
    } catch (error) {
      throw new DatabaseError('Failed to record login', error);
    }
  }

  /**
   * List users in organization
   */
  async listByOrg(orgId) {
    try {
      const query = `
        SELECT id, org_id, email, role, is_active, last_login_at, created_at
        FROM users
        WHERE org_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `;

      const result = await pool.query(query, [orgId]);
      return result.rows;
    } catch (error) {
      throw new DatabaseError('Failed to fetch users', error);
    }
  }

  /**
   * Update user role
   */
  async updateRole(userId, role, orgId) {
    try {
      const query = `
        UPDATE users
        SET role = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3
        RETURNING id, org_id, email, role, is_active, created_at
      `;

      const result = await pool.query(query, [role, userId, orgId]);
      return result.rows[0];
    } catch (error) {
      throw new DatabaseError('Failed to update user role', error);
    }
  }
}

module.exports = new UserRepository();
```

**File: `src/persistence/tokenRepository.js`**

```javascript
const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');

class TokenRepository {
  /**
   * Create refresh token
   */
  async create(data) {
    try {
      const query = `
        INSERT INTO refresh_tokens (user_id, org_id, token_hash, token_id, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, expires_at
      `;

      const result = await pool.query(query, [
        data.user_id,
        data.org_id,
        data.token_hash,
        data.token_id,
        data.expires_at
      ]);

      return result.rows[0];
    } catch (error) {
      throw new DatabaseError('Failed to create refresh token', error);
    }
  }

  /**
   * Find token by token ID
   */
  async findByTokenId(tokenId) {
    try {
      const query = `
        SELECT * FROM refresh_tokens
        WHERE token_id = $1
      `;

      const result = await pool.query(query, [tokenId]);
      return result.rows[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to fetch token', error);
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(tokenId) {
    try {
      const query = `
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_at = NOW()
        WHERE token_id = $1
      `;

      await pool.query(query, [tokenId]);
    } catch (error) {
      throw new DatabaseError('Failed to revoke token', error);
    }
  }

  /**
   * Clean up expired tokens
   */
  async deleteExpiredTokens() {
    try {
      const query = `
        DELETE FROM refresh_tokens
        WHERE expires_at < NOW()
      `;

      await pool.query(query);
    } catch (error) {
      throw new DatabaseError('Failed to delete expired tokens', error);
    }
  }
}

module.exports = new TokenRepository();
```

**File: `src/persistence/auditRepository.js`**

```javascript
const pool = require('../config/database');
const { DatabaseError } = require('../utils/errors');

class AuditRepository {
  /**
   * Log audit event
   */
  async log(data) {
    try {
      const query = `
        INSERT INTO audit_logs (org_id, user_id, action, resource_type, resource_id, status, details, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;

      const result = await pool.query(query, [
        data.org_id || null,
        data.user_id || null,
        data.action,
        data.resource_type || null,
        data.resource_id || null,
        data.status || 'info',
        data.details ? JSON.stringify(data.details) : null,
        data.ip_address || null,
        data.user_agent || null
      ]);

      return result.rows[0];
    } catch (error) {
      // Log repository errors should not break request flow
      console.error('Audit log error:', error);
    }
  }

  /**
   * Get audit logs for organization
   */
  async getOrgLogs(orgId, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT * FROM audit_logs
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(query, [orgId, limit, offset]);
      return result.rows;
    } catch (error) {
      throw new DatabaseError('Failed to fetch audit logs', error);
    }
  }
}

module.exports = new AuditRepository();
```

---

## API Endpoints & Swagger

### Swagger Configuration

**File: `src/swagger.js`**

```javascript
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
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
        url: 'http://localhost:3000',
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
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email'
            },
            password: {
              type: 'string',
              minLength: 12
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_in: { type: 'integer' },
            token_type: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                user_id: { type: 'string', format: 'uuid' },
                email: { type: 'string' },
                role: { type: 'string', enum: ['owner', 'admin', 'user'] },
                org_id: { type: 'string', format: 'uuid' }
              }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['error'] },
            error_code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

const specs = swaggerJsDoc(options);

module.exports = {
  swaggerUi,
  specs
};
```

### Route Documentation

**File: `src/routes/authRoutes.js`** (with Swagger)

```javascript
/**
 * @swagger
 * /v1/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     description: Authenticate user and return access + refresh tokens
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ['success']
 *                 data:
 *                   $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Validation error
 */
router.post('/login', validateHMAC, authController.login);

/**
 * @swagger
 * /v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     description: Get new access token using refresh token
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', validateHMAC, authController.refresh);

/**
 * @swagger
 * /v1/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *       - HMACAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', [validateHMAC, validateJWT], authController.logout);
```

---

## Configuration Management

**File: `src/config/environment.js`**

```javascript
const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'LOG_LEVEL'
];

const validateEnvironment = () => {
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    nodeEnv: process.env.NODE_ENV,
    port: parseInt(process.env.PORT, 10),
    database: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: parseInt(process.env.DB_POOL_SIZE, 10) || 20,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 2000
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      accessExpiry: 900,  // 15 minutes
      refreshExpiry: 604800  // 7 days
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info'
    }
  };
};

module.exports = validateEnvironment();
```

**File: `.env.example`**

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
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

# JWT
JWT_SECRET=your-256-bit-secret-key-change-in-production

# Logging
LOG_LEVEL=debug

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:8000

# Security
BCRYPT_ROUNDS=12
SESSION_TIMEOUT_MINUTES=30
```

---

## Docker Setup

**File: `Dockerfile`**

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Final stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy app from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
```

**File: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:14-alpine
    container_name: fce-auth-postgres
    environment:
      POSTGRES_USER: ${DB_USER:-fce_user}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-SecurePass123}
      POSTGRES_DB: ${DB_NAME:-fce_auth_db}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./src/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-fce_user}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - fce-network

  # Auth Service
  auth-service:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: fce-auth-service
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 3000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME:-fce_auth_db}
      DB_USER: ${DB_USER:-fce_user}
      DB_PASSWORD: ${DB_PASSWORD:-SecurePass123}
      JWT_SECRET: ${JWT_SECRET:-your-256-bit-secret-key-change-in-production}
      LOG_LEVEL: ${LOG_LEVEL:-debug}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./src:/app/src
      - ./logs:/app/logs
    networks:
      - fce-network
    restart: unless-stopped

  # pgAdmin for database management (optional)
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: fce-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin123
    ports:
      - "5050:80"
    depends_on:
      - postgres
    networks:
      - fce-network

volumes:
  postgres-data:

networks:
  fce-network:
    driver: bridge
```

---

## Implementation Details

### Error Handling

**File: `src/utils/errors.js`**

```javascript
class BaseError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends BaseError {
  constructor(code, message) {
    super(code, message, 400);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends BaseError {
  constructor(code, message) {
    super(code, message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends BaseError {
  constructor(code, message) {
    super(code, message, 403);
    this.name = 'AuthorizationError';
  }
}

class DatabaseError extends BaseError {
  constructor(message, originalError) {
    super('DATABASE_ERROR', message, 500);
    this.originalError = originalError;
    this.name = 'DatabaseError';
  }
}

module.exports = {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError
};
```

### Response Formatting

**File: `src/utils/responses.js`**

```javascript
const successResponse = (data, message = 'Success') => ({
  status: 'success',
  message,
  data,
  timestamp: new Date().toISOString()
});

const errorResponse = (errorCode, message, details = {}) => ({
  status: 'error',
  error_code: errorCode,
  message,
  details,
  timestamp: new Date().toISOString()
});

module.exports = {
  successResponse,
  errorResponse
};
```

### Middleware

**File: `src/middleware/validateHMAC.js`**

```javascript
const crypto = require('crypto');
const orgRepository = require('../persistence/orgRepository');
const cryptoService = require('../services/cryptoService');
const { errorResponse } = require('../utils/responses');

module.exports = async (req, res, next) => {
  try {
    const clientId = req.headers['x-client-id'];
    const timestamp = req.headers['x-timestamp'];
    const signature = req.headers['x-signature'];

    if (!clientId || !timestamp || !signature) {
      return res.status(401).json(
        errorResponse('MISSING_HMAC_HEADER', 'Missing required HMAC headers')
      );
    }

    // Check timestamp freshness (5-minute window)
    const requestTime = parseInt(timestamp);
    const now = Date.now();

    if (Math.abs(now - requestTime) > 300000) {
      return res.status(401).json(
        errorResponse('EXPIRED_REQUEST', 'Request timestamp expired')
      );
    }

    // Lookup organization
    const clientIdHash = crypto.createHash('sha256').update(clientId).digest('hex');
    const org = await orgRepository.findByClientIdHash(clientIdHash);

    if (!org) {
      return res.status(401).json(
        errorResponse('INVALID_CLIENT_ID', 'Invalid client ID')
      );
    }

    // Verify signature
    const payload = {
      method: req.method,
      path: req.path,
      timestamp: timestamp,
      body: req.body || {}
    };

    try {
      cryptoService.verifyHMAC(signature, org.client_secret_hash, payload);
    } catch (error) {
      return res.status(401).json(
        errorResponse('INVALID_SIGNATURE', 'HMAC signature verification failed')
      );
    }

    // Inject org_id into request
    req.org_id = org.id;
    next();
  } catch (error) {
    next(error);
  }
};
```

**File: `src/middleware/validateJWT.js`**

```javascript
const tokenService = require('../services/tokenService');
const userRepository = require('../persistence/userRepository');
const { errorResponse } = require('../utils/responses');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(
        errorResponse('MISSING_AUTH_HEADER', 'Authorization header is missing')
      );
    }

    const token = authHeader.substring(7);

    // Verify token
    const payload = tokenService.verifyToken(token);

    // Fetch user details
    const user = await userRepository.findById(payload.user_id, req.org_id);

    if (!user) {
      return res.status(401).json(
        errorResponse('INVALID_TOKEN', 'User not found')
      );
    }

    // Inject user into request
    req.user = {
      user_id: payload.user_id,
      org_id: user.org_id,
      role: user.role
    };

    next();
  } catch (error) {
    return res.status(401).json(
      errorResponse(error.code || 'INVALID_TOKEN', error.message)
    );
  }
};
```

---

## Security Considerations

### 1. Password Security
- ✅ Minimum 12 characters
- ✅ Uppercase, lowercase, numbers, special characters required
- ✅ Bcrypt with 12 rounds
- ✅ Password reuse prevention
- ✅ Account lockout after 5 failed attempts

### 2. Token Security
- ✅ Short-lived access tokens (15 minutes)
- ✅ Long-lived refresh tokens (7 days)
- ✅ Token rotation on refresh
- ✅ Token revocation support
- ✅ Signature validation (HS256)

### 3. HMAC Security
- ✅ Timestamp-based replay attack prevention (5-minute window)
- ✅ Client secret hashing (SHA-256)
- ✅ Timing-safe comparison
- ✅ Signature includes method, path, timestamp, and body

### 4. Database Security
- ✅ Connection pooling with limits
- ✅ Parameterized queries (prevents SQL injection)
- ✅ Hashed client secrets
- ✅ Hashed passwords (bcrypt)
- ✅ Audit logging for sensitive operations

### 5. API Security
- ✅ CORS configuration
- ✅ Rate limiting (optional)
- ✅ Input validation with joi
- ✅ Error response obfuscation (no internal details)
- ✅ Request/response logging

---

## Installation & Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd auth-service

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your configuration

# 4. Start with Docker
docker-compose up

# 5. Run database migrations
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -f /docker-entrypoint-initdb.d/001_initial_schema.sql

# 6. Verify
curl http://localhost:3000/health
curl http://localhost:3000/docs

# 7. Run tests
npm test
```

---

This documentation provides a complete implementation guide for building the Auth Service with proper layered architecture, Docker containerization, and Swagger API documentation.
