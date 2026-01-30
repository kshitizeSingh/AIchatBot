# Auth Service - AI FAQ Platform

Complete authentication and authorization service for multi-tenant FAQ platform built with Node.js, Express, PostgreSQL, and Docker.

## Features

- 🔐 **Multi-tenant Authentication** - Secure user authentication with organization isolation
- 🎫 **JWT Token Management** - Access and refresh token implementation
- 🔒 **HMAC Signature Validation** - Request integrity verification
- 👥 **Role-Based Access Control** - Owner, Admin, User role management
- 🛡️ **Security Features** - Password hashing, account lockout, audit logging
- 🐳 **Docker Support** - Complete containerization with PostgreSQL
- 📊 **Comprehensive Testing** - Unit and integration tests
- 📚 **API Documentation** - Swagger/OpenAPI 3.0 documentation

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 14+
- **Authentication**: JWT + HMAC
- **Password Hashing**: bcrypt
- **Validation**: Joi
- **Testing**: Jest + Supertest
- **Documentation**: Swagger/OpenAPI 3.0
- **Containerization**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Node.js 18+ and npm 8+
- Docker and Docker Compose
- PostgreSQL 14+ (if running locally)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd auth-service

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your configuration

# Start with Docker (recommended)
docker-compose up -d

# Run database migrations
npm run migrate

# Verify installation
curl http://localhost:3000/health
```

### Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

## API Documentation

Once the service is running, visit:
- **Swagger UI**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health

## Architecture

### Layered Architecture

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

### Key Components

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and validation
- **Repositories**: Database operations and queries
- **Middleware**: Authentication, validation, logging
- **Validators**: Input validation schemas
- **Utils**: Helper functions and utilities

## Security Features

### Password Security
- ✅ Minimum 12 characters
- ✅ Uppercase, lowercase, numbers, special characters required
- ✅ Bcrypt with 12 rounds
- ✅ Password reuse prevention
- ✅ Account lockout after 5 failed attempts

### Token Security
- ✅ Short-lived access tokens (15 minutes)
- ✅ Long-lived refresh tokens (7 days)
- ✅ Token rotation on refresh
- ✅ Token revocation support
- ✅ Signature validation (HS256)

### HMAC Security
- ✅ Timestamp-based replay attack prevention (5-minute window)
- ✅ Client secret hashing (SHA-256)
- ✅ Timing-safe comparison
- ✅ Signature includes method, path, timestamp, and body

## API Endpoints

### Organization Management
- `POST /v1/org/register` - Register new organization
- `GET /v1/org/details` - Get organization details

### Authentication
- `POST /v1/auth/login` - User login
- `POST /v1/auth/signup` - User registration
- `POST /v1/auth/refresh` - Refresh access token
- `POST /v1/auth/logout` - User logout

### User Management
- `GET /v1/user` - Get user profile
- `POST /v1/users/register` - Create new user (admin only)
- `GET /v1/users` - List organization users (admin only)
- `PATCH /v1/users/:id/role` - Update user role (owner only)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Server port | 3000 |
| `DB_HOST` | Database host | postgres |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | fce_auth_db |
| `DB_USER` | Database user | fce_user |
| `DB_PASSWORD` | Database password | SecurePass123 |
| `JWT_SECRET` | JWT signing secret | (required) |
| `LOG_LEVEL` | Logging level | debug |

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

The project maintains high test coverage:
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+
- **Statements**: 80%+

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f auth-service

# Stop services
docker-compose down
```

### Manual Docker Build

```bash
# Build image
npm run docker:build

# Run container
docker run -p 3000:3000 --env-file .env auth-service
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.