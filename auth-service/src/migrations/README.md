# Database Migrations

This directory contains all database migration files for the Auth Service. The migrations are designed to be run in sequence to set up and maintain the PostgreSQL database schema.

## Migration Files

### Core Schema

1. **001_initial_schema.sql** - Creates the core database schema including:
   - Organizations table with HMAC credentials
   - Users table with roles and security features
   - Refresh tokens table for JWT token management
   - Audit logs table for security tracking
   - Sessions table for session management
   - Password reset and email verification tokens
   - Triggers and functions for automatic timestamp updates

2. **002_create_indexes.sql** - Creates performance indexes for:
   - Optimized query patterns
   - Composite indexes for common lookups
   - Partial indexes for active records
   - GIN indexes for JSONB columns

3. **003_audit_tables.sql** - Creates additional audit and monitoring tables:
   - Login attempts tracking
   - Security events logging
   - API rate limiting tracking
   - System health metrics
   - Configuration change auditing
   - Data retention policies

4. **004_sample_data.sql** - Inserts sample data for development and testing:
   - Test organization with HMAC credentials
   - Sample users with different roles
   - Example audit logs and security events
   - **WARNING: Only for development environments**

5. **005_functions_procedures.sql** - Creates stored procedures and functions:
   - User authentication helpers
   - Security event recording
   - Failed login attempt handling
   - Token management functions
   - Organization statistics
   - Data cleanup procedures

## Running Migrations

### Using Docker Compose (Recommended)

```bash
# Start the database
docker-compose up postgres

# Run migrations
npm run migrate
```

### Manual Execution

```bash
# Connect to PostgreSQL
psql -h localhost -U fce_user -d fce_auth_db

# Run each migration file in order
\i src/migrations/001_initial_schema.sql
\i src/migrations/002_create_indexes.sql
\i src/migrations/003_audit_tables.sql
\i src/migrations/004_sample_data.sql  # Only in development
\i src/migrations/005_functions_procedures.sql
```

### Using Docker Exec

```bash
# Run all migrations
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -f /docker-entrypoint-initdb.d/001_initial_schema.sql
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -f /docker-entrypoint-initdb.d/002_create_indexes.sql
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -f /docker-entrypoint-initdb.d/003_audit_tables.sql
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -f /docker-entrypoint-initdb.d/005_functions_procedures.sql

# Run sample data (development only)
docker exec fce-auth-postgres psql -U fce_user -d fce_auth_db -f /docker-entrypoint-initdb.d/004_sample_data.sql
```

## Database Schema Overview

### Core Tables

- **organizations** - Multi-tenant organization management
- **users** - User accounts with role-based access control
- **refresh_tokens** - JWT refresh token storage
- **audit_logs** - Comprehensive audit trail
- **sessions** - Active session tracking

### Security Tables

- **login_attempts** - Failed login tracking
- **security_events** - Security incident logging
- **password_reset_tokens** - Password reset workflow
- **email_verification_tokens** - Email verification workflow

### Monitoring Tables

- **rate_limit_tracking** - API rate limiting
- **system_metrics** - Performance monitoring
- **configuration_changes** - Configuration audit
- **data_retention_policies** - Data lifecycle management

## Key Features

### Security
- Account lockout after failed login attempts
- Comprehensive audit logging
- Token-based authentication with expiration
- HMAC-based request signing
- Password strength enforcement

### Performance
- Optimized indexes for common queries
- Partial indexes for active records
- Composite indexes for multi-column lookups
- Efficient JSONB indexing

### Monitoring
- Login attempt tracking
- Security event logging
- System metrics collection
- Configuration change auditing

### Data Management
- Automatic timestamp updates
- Data retention policies
- Cleanup procedures for expired data
- Sample data for development

## Environment Considerations

### Development
- Include sample data (004_sample_data.sql)
- Enable detailed logging
- Use shorter token expiration times for testing

### Production
- **NEVER** run sample data migrations
- Implement proper backup procedures
- Monitor performance and adjust indexes as needed
- Set up automated cleanup jobs

## Maintenance

### Regular Cleanup

Run the cleanup function regularly to remove expired data:

```sql
-- Clean up expired tokens and sessions
SELECT * FROM cleanup_expired_data();

-- Apply data retention policies
SELECT * FROM apply_data_retention_policies();
```

### Monitoring Queries

```sql
-- Check organization statistics
SELECT * FROM get_org_statistics('123e4567-e89b-12d3-a456-426614174000');

-- Get security summary
SELECT * FROM get_security_summary('123e4567-e89b-12d3-a456-426614174000', 30);

-- Check active sessions
SELECT COUNT(*) FROM sessions WHERE is_active = true AND expires_at > NOW();
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```bash
   # Ensure proper database permissions
   GRANT ALL PRIVILEGES ON DATABASE fce_auth_db TO fce_user;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fce_user;
   ```

2. **Extension Errors**
   ```sql
   -- Enable required extensions
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   ```

3. **Migration Order**
   - Always run migrations in numerical order
   - Check for any dependency issues between migrations
   - Verify all foreign key constraints are satisfied

### Rollback Procedures

For development environments, you can drop and recreate the database:

```bash
# Drop and recreate database
docker-compose down
docker volume rm auth-service_postgres-data
docker-compose up postgres
```

For production environments, create specific rollback scripts for each migration.

## Security Notes

- All sensitive data is properly hashed
- Audit logs capture all security-relevant events
- Token expiration is enforced at the database level
- Account lockout prevents brute force attacks
- Rate limiting data helps prevent abuse

## Performance Tuning

- Monitor query performance using `EXPLAIN ANALYZE`
- Adjust indexes based on actual query patterns
- Consider partitioning large audit tables
- Implement archiving for old audit data
- Use connection pooling for better performance