-- Stored procedures and functions for Auth Service
-- These provide reusable database logic and improved performance

BEGIN;

-- Function to get user with organization details
CREATE OR REPLACE FUNCTION get_user_with_org(
    p_user_id UUID,
    p_org_id UUID DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID,
    email VARCHAR(255),
    role VARCHAR(50),
    is_active BOOLEAN,
    email_verified BOOLEAN,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP,
    org_id UUID,
    org_name VARCHAR(255),
    org_is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.role,
        u.is_active,
        u.email_verified,
        u.last_login_at,
        u.created_at,
        o.id,
        o.name,
        o.is_active
    FROM users u
    JOIN organizations o ON u.org_id = o.id
    WHERE u.id = p_user_id
      AND (p_org_id IS NULL OR u.org_id = p_org_id)
      AND u.is_active = true
      AND o.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to validate and get organization by client ID hash
CREATE OR REPLACE FUNCTION get_org_by_client_id_hash(
    p_client_id_hash TEXT
)
RETURNS TABLE(
    org_id UUID,
    org_name VARCHAR(255),
    client_secret_hash TEXT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.name,
        o.client_secret_hash,
        o.is_active
    FROM organizations o
    WHERE o.client_id_hash = p_client_id_hash
      AND o.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_org_id UUID,
    p_user_id UUID,
    p_email VARCHAR(255),
    p_ip_address INET,
    p_user_agent TEXT,
    p_attempt_type VARCHAR(50),
    p_failure_reason VARCHAR(100) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    attempt_id UUID;
BEGIN
    INSERT INTO login_attempts (
        org_id,
        user_id,
        email,
        ip_address,
        user_agent,
        attempt_type,
        failure_reason
    ) VALUES (
        p_org_id,
        p_user_id,
        p_email,
        p_ip_address,
        p_user_agent,
        p_attempt_type,
        p_failure_reason
    ) RETURNING id INTO attempt_id;
    
    RETURN attempt_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record security event
CREATE OR REPLACE FUNCTION record_security_event(
    p_org_id UUID,
    p_user_id UUID,
    p_event_type VARCHAR(100),
    p_severity VARCHAR(20),
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id VARCHAR(100) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO security_events (
        org_id,
        user_id,
        event_type,
        severity,
        description,
        details,
        ip_address,
        user_agent,
        request_id
    ) VALUES (
        p_org_id,
        p_user_id,
        p_event_type,
        p_severity,
        p_description,
        p_details,
        p_ip_address,
        p_user_agent,
        p_request_id
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment failed login attempts and lock account if needed
CREATE OR REPLACE FUNCTION handle_failed_login(
    p_user_id UUID,
    p_max_attempts INTEGER DEFAULT 5,
    p_lockout_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(
    current_attempts INTEGER,
    is_locked BOOLEAN,
    locked_until TIMESTAMP
) AS $$
DECLARE
    v_current_attempts INTEGER;
    v_lock_until TIMESTAMP;
BEGIN
    -- Increment failed login attempts
    UPDATE users 
    SET failed_login_attempts = failed_login_attempts + 1
    WHERE id = p_user_id
    RETURNING failed_login_attempts INTO v_current_attempts;
    
    -- Check if account should be locked
    IF v_current_attempts >= p_max_attempts THEN
        v_lock_until := NOW() + (p_lockout_minutes || ' minutes')::INTERVAL;
        
        UPDATE users 
        SET locked_until = v_lock_until
        WHERE id = p_user_id;
        
        RETURN QUERY SELECT v_current_attempts, true, v_lock_until;
    ELSE
        RETURN QUERY SELECT v_current_attempts, false, NULL::TIMESTAMP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to reset failed login attempts on successful login
CREATE OR REPLACE FUNCTION reset_failed_login_attempts(
    p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET 
        failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get active refresh tokens for a user
CREATE OR REPLACE FUNCTION get_active_refresh_tokens(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    token_id UUID,
    created_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_revoked BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rt.token_id,
        rt.created_at,
        rt.expires_at,
        rt.is_revoked
    FROM refresh_tokens rt
    WHERE rt.user_id = p_user_id
      AND rt.expires_at > NOW()
    ORDER BY rt.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke all refresh tokens for a user
CREATE OR REPLACE FUNCTION revoke_all_user_tokens(
    p_user_id UUID,
    p_reason VARCHAR(100) DEFAULT 'user_logout'
)
RETURNS INTEGER AS $$
DECLARE
    revoked_count INTEGER;
BEGIN
    UPDATE refresh_tokens 
    SET 
        is_revoked = true,
        revoked_at = NOW(),
        revoked_reason = p_reason
    WHERE user_id = p_user_id
      AND is_revoked = false
      AND expires_at > NOW();
    
    GET DIAGNOSTICS revoked_count = ROW_COUNT;
    RETURN revoked_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get organization statistics
CREATE OR REPLACE FUNCTION get_org_statistics(
    p_org_id UUID
)
RETURNS TABLE(
    total_users INTEGER,
    active_users INTEGER,
    inactive_users INTEGER,
    verified_users INTEGER,
    unverified_users INTEGER,
    admin_users INTEGER,
    regular_users INTEGER,
    recent_logins_24h INTEGER,
    recent_signups_7d INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_users,
        COUNT(CASE WHEN u.is_active = true THEN 1 END)::INTEGER as active_users,
        COUNT(CASE WHEN u.is_active = false THEN 1 END)::INTEGER as inactive_users,
        COUNT(CASE WHEN u.email_verified = true THEN 1 END)::INTEGER as verified_users,
        COUNT(CASE WHEN u.email_verified = false THEN 1 END)::INTEGER as unverified_users,
        COUNT(CASE WHEN u.role IN ('owner', 'admin') THEN 1 END)::INTEGER as admin_users,
        COUNT(CASE WHEN u.role = 'user' THEN 1 END)::INTEGER as regular_users,
        COUNT(CASE WHEN u.last_login_at > NOW() - INTERVAL '24 hours' THEN 1 END)::INTEGER as recent_logins_24h,
        COUNT(CASE WHEN u.created_at > NOW() - INTERVAL '7 days' THEN 1 END)::INTEGER as recent_signups_7d
    FROM users u
    WHERE u.org_id = p_org_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get security summary for organization
CREATE OR REPLACE FUNCTION get_security_summary(
    p_org_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
    total_login_attempts INTEGER,
    successful_logins INTEGER,
    failed_logins INTEGER,
    locked_accounts INTEGER,
    security_events INTEGER,
    critical_events INTEGER,
    high_severity_events INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (
            SELECT COUNT(*)::INTEGER 
            FROM login_attempts la 
            WHERE la.org_id = p_org_id 
              AND la.created_at > NOW() - (p_days || ' days')::INTERVAL
        ) as total_login_attempts,
        (
            SELECT COUNT(*)::INTEGER 
            FROM login_attempts la 
            WHERE la.org_id = p_org_id 
              AND la.attempt_type = 'success'
              AND la.created_at > NOW() - (p_days || ' days')::INTERVAL
        ) as successful_logins,
        (
            SELECT COUNT(*)::INTEGER 
            FROM login_attempts la 
            WHERE la.org_id = p_org_id 
              AND la.attempt_type = 'failure'
              AND la.created_at > NOW() - (p_days || ' days')::INTERVAL
        ) as failed_logins,
        (
            SELECT COUNT(*)::INTEGER 
            FROM users u 
            WHERE u.org_id = p_org_id 
              AND u.locked_until > NOW()
        ) as locked_accounts,
        (
            SELECT COUNT(*)::INTEGER 
            FROM security_events se 
            WHERE se.org_id = p_org_id 
              AND se.created_at > NOW() - (p_days || ' days')::INTERVAL
        ) as security_events,
        (
            SELECT COUNT(*)::INTEGER 
            FROM security_events se 
            WHERE se.org_id = p_org_id 
              AND se.severity = 'critical'
              AND se.created_at > NOW() - (p_days || ' days')::INTERVAL
        ) as critical_events,
        (
            SELECT COUNT(*)::INTEGER 
            FROM security_events se 
            WHERE se.org_id = p_org_id 
              AND se.severity = 'high'
              AND se.created_at > NOW() - (p_days || ' days')::INTERVAL
        ) as high_severity_events;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE(
    table_name TEXT,
    deleted_count INTEGER
) AS $$
DECLARE
    cleanup_count INTEGER;
BEGIN
    -- Clean up expired refresh tokens
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RETURN QUERY SELECT 'refresh_tokens'::TEXT, cleanup_count;
    
    -- Clean up expired password reset tokens
    DELETE FROM password_reset_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RETURN QUERY SELECT 'password_reset_tokens'::TEXT, cleanup_count;
    
    -- Clean up expired email verification tokens
    DELETE FROM email_verification_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RETURN QUERY SELECT 'email_verification_tokens'::TEXT, cleanup_count;
    
    -- Clean up expired sessions
    DELETE FROM sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RETURN QUERY SELECT 'sessions'::TEXT, cleanup_count;
    
    -- Clean up old rate limiting data (older than 1 day)
    DELETE FROM rate_limit_tracking WHERE window_end < NOW() - INTERVAL '1 day';
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RETURN QUERY SELECT 'rate_limit_tracking'::TEXT, cleanup_count;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMIT;