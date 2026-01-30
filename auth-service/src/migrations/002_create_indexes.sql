-- Performance indexes for Auth Service
-- These indexes optimize common query patterns

BEGIN;

-- Organizations table indexes
CREATE INDEX idx_org_client_id_hash ON organizations(client_id_hash);
CREATE INDEX idx_org_is_active ON organizations(is_active);
CREATE INDEX idx_org_created_at ON organizations(created_at);
CREATE INDEX idx_org_name_lower ON organizations(LOWER(name));

-- Users table indexes
CREATE INDEX idx_user_org_id ON users(org_id);
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_email_lower ON users(LOWER(email));
CREATE INDEX idx_user_is_active ON users(is_active);
CREATE INDEX idx_user_role ON users(role);
CREATE INDEX idx_user_created_at ON users(created_at);
CREATE INDEX idx_user_last_login ON users(last_login_at);
CREATE INDEX idx_user_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX idx_user_failed_attempts ON users(failed_login_attempts) WHERE failed_login_attempts > 0;
CREATE INDEX idx_user_email_verified ON users(email_verified);

-- Composite index for user lookup by org and email
CREATE INDEX idx_user_org_email ON users(org_id, LOWER(email));

-- Composite index for active users by organization
CREATE INDEX idx_user_org_active ON users(org_id, is_active);

-- Refresh tokens table indexes
CREATE INDEX idx_refresh_token_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_token_org ON refresh_tokens(org_id);
CREATE INDEX idx_refresh_token_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_token_revoked ON refresh_tokens(is_revoked);
CREATE INDEX idx_refresh_token_created ON refresh_tokens(created_at);
CREATE INDEX idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_token_id ON refresh_tokens(token_id);

-- Composite index for active tokens by user
CREATE INDEX idx_refresh_token_user_active ON refresh_tokens(user_id, is_revoked, expires_at);

-- Audit logs table indexes
CREATE INDEX idx_audit_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_status ON audit_logs(status);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_ip_address ON audit_logs(ip_address);
CREATE INDEX idx_audit_request_id ON audit_logs(request_id);

-- Composite indexes for common audit queries
CREATE INDEX idx_audit_org_created ON audit_logs(org_id, created_at);
CREATE INDEX idx_audit_user_created ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_action_created ON audit_logs(action, created_at);
CREATE INDEX idx_audit_status_created ON audit_logs(status, created_at);

-- GIN index for JSONB details column in audit logs
CREATE INDEX idx_audit_details_gin ON audit_logs USING GIN (details);

-- Sessions table indexes
CREATE INDEX idx_session_user_id ON sessions(user_id);
CREATE INDEX idx_session_org_id ON sessions(org_id);
CREATE INDEX idx_session_expires_at ON sessions(expires_at);
CREATE INDEX idx_session_last_activity ON sessions(last_activity);
CREATE INDEX idx_session_is_active ON sessions(is_active);
CREATE INDEX idx_session_token_hash ON sessions(session_token_hash);
CREATE INDEX idx_session_created_at ON sessions(created_at);
CREATE INDEX idx_session_ip_address ON sessions(ip_address);

-- Composite index for active sessions by user
CREATE INDEX idx_session_user_active ON sessions(user_id, is_active, expires_at);

-- Password reset tokens table indexes
CREATE INDEX idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_created_at ON password_reset_tokens(created_at);
CREATE INDEX idx_password_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_password_reset_token_id ON password_reset_tokens(token_id);
CREATE INDEX idx_password_reset_used_at ON password_reset_tokens(used_at);

-- Composite index for valid password reset tokens
CREATE INDEX idx_password_reset_valid ON password_reset_tokens(user_id, expires_at, used_at) 
    WHERE used_at IS NULL;

-- Email verification tokens table indexes
CREATE INDEX idx_email_verify_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verify_expires_at ON email_verification_tokens(expires_at);
CREATE INDEX idx_email_verify_created_at ON email_verification_tokens(created_at);
CREATE INDEX idx_email_verify_token_hash ON email_verification_tokens(token_hash);
CREATE INDEX idx_email_verify_token_id ON email_verification_tokens(token_id);
CREATE INDEX idx_email_verify_verified_at ON email_verification_tokens(verified_at);

-- Composite index for valid email verification tokens
CREATE INDEX idx_email_verify_valid ON email_verification_tokens(user_id, expires_at, verified_at) 
    WHERE verified_at IS NULL;

-- Partial indexes for performance optimization
-- Index only active organizations
CREATE INDEX idx_org_active_only ON organizations(id, name) WHERE is_active = true;

-- Index only active users
CREATE INDEX idx_user_active_only ON users(id, org_id, email, role) WHERE is_active = true;

-- Index only non-revoked refresh tokens
CREATE INDEX idx_refresh_token_active_only ON refresh_tokens(user_id, expires_at) 
    WHERE is_revoked = false;

-- Index only active sessions
CREATE INDEX idx_session_active_only ON sessions(user_id, last_activity) 
    WHERE is_active = true;

-- Index for recent audit logs (last 30 days)
CREATE INDEX idx_audit_recent ON audit_logs(org_id, user_id, action, created_at) 
    WHERE created_at > NOW() - INTERVAL '30 days';

COMMIT;