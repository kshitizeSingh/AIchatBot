-- Auth Service Database Schema
-- PostgreSQL 14+ compatible
-- Multi-tenant authentication and authorization system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT org_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT client_id_prefix_format CHECK (client_id_prefix LIKE 'pk_%')
);

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
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}$'),
    CONSTRAINT email_not_empty CHECK (LENGTH(TRIM(email)) > 0),
    CONSTRAINT failed_attempts_non_negative CHECK (failed_login_attempts >= 0)
);

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
    revoked_reason VARCHAR(100),
    
    -- Expiration
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT expires_after_creation CHECK (expires_at > created_at),
    CONSTRAINT revoked_at_when_revoked CHECK (
        (is_revoked = true AND revoked_at IS NOT NULL) OR 
        (is_revoked = false AND revoked_at IS NULL)
    )
);

-- Create audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    
    status VARCHAR(50) DEFAULT 'info',  -- 'success', 'failure', 'warning', 'info'
    details JSONB,
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('success', 'failure', 'warning', 'info')),
    CONSTRAINT action_not_empty CHECK (LENGTH(TRIM(action)) > 0)
);

-- Create sessions table (optional, for session tracking)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    session_token_hash TEXT NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Constraints
    CONSTRAINT session_expires_after_creation CHECK (expires_at > created_at),
    CONSTRAINT last_activity_after_creation CHECK (last_activity >= created_at)
);

-- Create password reset tokens table
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    token_hash TEXT NOT NULL UNIQUE,
    token_id UUID NOT NULL UNIQUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT reset_expires_after_creation CHECK (expires_at > created_at),
    CONSTRAINT used_before_expiry CHECK (used_at IS NULL OR used_at <= expires_at)
);

-- Create email verification tokens table
CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    token_hash TEXT NOT NULL UNIQUE,
    token_id UUID NOT NULL UNIQUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT verify_expires_after_creation CHECK (expires_at > created_at),
    CONSTRAINT verified_before_expiry CHECK (verified_at IS NULL OR verified_at <= expires_at)
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_organizations_updated_at 
    BEFORE UPDATE ON organizations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically set last_activity on sessions
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sessions_activity 
    BEFORE UPDATE ON sessions 
    FOR EACH ROW EXECUTE FUNCTION update_session_activity();

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete expired refresh tokens
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete expired password reset tokens
    DELETE FROM password_reset_tokens WHERE expires_at < NOW();
    
    -- Delete expired email verification tokens
    DELETE FROM email_verification_tokens WHERE expires_at < NOW();
    
    -- Delete expired sessions
    DELETE FROM sessions WHERE expires_at < NOW();
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

COMMIT;