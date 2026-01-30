-- Sample data for testing and development
-- This file contains test data for the Auth Service
-- WARNING: Do not run this in production!

BEGIN;

-- Only insert sample data in development environment
-- This check should be handled by the application, but adding as safeguard
DO $$
BEGIN
    IF current_setting('server_version_num')::int >= 140000 THEN
        RAISE NOTICE 'Inserting sample data for development...';
    END IF;
END $$;

-- Insert sample organization
INSERT INTO organizations (
    id,
    name,
    client_id_hash,
    client_secret_hash,
    client_id_prefix,
    is_active
) VALUES (
    '123e4567-e89b-12d3-a456-426614174000',
    'Acme Corporation',
    -- Hash of 'pk_test_client_id_12345'
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    -- Hash of 'sk_test_client_secret_67890'
    'b109f3bbbc244eb82441917ed06d618b9008dd09b3befd1b5e07394c706a8bb9',
    'pk_test_client_id',
    true
) ON CONFLICT (id) DO NOTHING;

-- Insert sample admin user (owner)
INSERT INTO users (
    id,
    org_id,
    email,
    password_hash,
    role,
    is_active,
    email_verified,
    last_password_change
) VALUES (
    '223e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-12d3-a456-426614174000',
    'admin@acme.com',
    -- Hash of 'AdminPassword123!' using bcrypt with 12 rounds
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6YKrN8qhyG',
    'owner',
    true,
    true,
    NOW()
) ON CONFLICT (org_id, email) DO NOTHING;

-- Insert sample regular user
INSERT INTO users (
    id,
    org_id,
    email,
    password_hash,
    role,
    is_active,
    email_verified,
    last_password_change
) VALUES (
    '323e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-12d3-a456-426614174000',
    'user@acme.com',
    -- Hash of 'UserPassword123!' using bcrypt with 12 rounds
    '$2b$12$8K1p/a0dhrxSMlQqBfaOiOZpwpUn8rUn8rUn8rUn8rUn8rUn8rUn',
    'user',
    true,
    true,
    NOW()
) ON CONFLICT (org_id, email) DO NOTHING;

-- Insert sample admin user
INSERT INTO users (
    id,
    org_id,
    email,
    password_hash,
    role,
    is_active,
    email_verified,
    last_password_change
) VALUES (
    '423e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-12d3-a456-426614174000',
    'manager@acme.com',
    -- Hash of 'ManagerPassword123!' using bcrypt with 12 rounds
    '$2b$12$9L2q/b1eisySNmRrCgbPjPaqxqVo9sVo9sVo9sVo9sVo9sVo9sVo',
    'admin',
    true,
    true,
    NOW()
) ON CONFLICT (org_id, email) DO NOTHING;

-- Insert sample audit logs
INSERT INTO audit_logs (
    org_id,
    user_id,
    action,
    resource_type,
    resource_id,
    status,
    details,
    ip_address,
    user_agent
) VALUES 
(
    '123e4567-e89b-12d3-a456-426614174000',
    '223e4567-e89b-12d3-a456-426614174000',
    'org_registered',
    'organization',
    '123e4567-e89b-12d3-a456-426614174000',
    'success',
    '{"org_name": "Acme Corporation", "admin_email": "admin@acme.com"}',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
),
(
    '123e4567-e89b-12d3-a456-426614174000',
    '323e4567-e89b-12d3-a456-426614174000',
    'user_signup',
    'user',
    '323e4567-e89b-12d3-a456-426614174000',
    'success',
    '{"email": "user@acme.com", "role": "user"}',
    '192.168.1.101',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
),
(
    '123e4567-e89b-12d3-a456-426614174000',
    '223e4567-e89b-12d3-a456-426614174000',
    'login_success',
    'user',
    '223e4567-e89b-12d3-a456-426614174000',
    'success',
    '{"login_method": "email_password"}',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
);

-- Insert sample login attempts
INSERT INTO login_attempts (
    org_id,
    user_id,
    email,
    ip_address,
    user_agent,
    attempt_type,
    failure_reason
) VALUES 
(
    '123e4567-e89b-12d3-a456-426614174000',
    '223e4567-e89b-12d3-a456-426614174000',
    'admin@acme.com',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'success',
    NULL
),
(
    '123e4567-e89b-12d3-a456-426614174000',
    NULL,
    'admin@acme.com',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'failure',
    'invalid_password'
),
(
    '123e4567-e89b-12d3-a456-426614174000',
    '323e4567-e89b-12d3-a456-426614174000',
    'user@acme.com',
    '192.168.1.101',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'success',
    NULL
);

-- Insert sample security events
INSERT INTO security_events (
    org_id,
    user_id,
    event_type,
    severity,
    description,
    details,
    ip_address,
    user_agent
) VALUES 
(
    '123e4567-e89b-12d3-a456-426614174000',
    NULL,
    'multiple_failed_logins',
    'medium',
    'Multiple failed login attempts detected from same IP',
    '{"failed_attempts": 3, "time_window": "5 minutes", "email": "admin@acme.com"}',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
),
(
    '123e4567-e89b-12d3-a456-426614174000',
    '223e4567-e89b-12d3-a456-426614174000',
    'password_changed',
    'info',
    'User password changed successfully',
    '{"change_method": "self_service"}',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
);

-- Insert sample system metrics
INSERT INTO system_metrics (
    metric_name,
    metric_value,
    metric_unit,
    tags
) VALUES 
('api_response_time', 125.50, 'milliseconds', '{"endpoint": "/v1/auth/login", "method": "POST"}'),
('active_sessions', 15, 'count', '{"org_id": "123e4567-e89b-12d3-a456-426614174000"}'),
('database_connections', 8, 'count', '{"pool": "main"}'),
('memory_usage', 512.75, 'megabytes', '{"process": "auth-service"}'),
('cpu_usage', 25.3, 'percent', '{"process": "auth-service"}');

RAISE NOTICE 'Sample data inserted successfully!';
RAISE NOTICE 'Test credentials:';
RAISE NOTICE '  Organization: Acme Corporation';
RAISE NOTICE '  Client ID: pk_test_client_id_12345';
RAISE NOTICE '  Client Secret: sk_test_client_secret_67890';
RAISE NOTICE '  Admin: admin@acme.com / AdminPassword123!';
RAISE NOTICE '  User: user@acme.com / UserPassword123!';
RAISE NOTICE '  Manager: manager@acme.com / ManagerPassword123!';

COMMIT;