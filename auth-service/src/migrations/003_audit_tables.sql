-- Additional audit and monitoring tables
-- These tables provide enhanced security and monitoring capabilities

BEGIN;

-- Create login attempts tracking table
CREATE TABLE login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    
    attempt_type VARCHAR(50) NOT NULL, -- 'success', 'failure', 'locked'
    failure_reason VARCHAR(100), -- 'invalid_password', 'account_locked', 'account_inactive'
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_attempt_type CHECK (attempt_type IN ('success', 'failure', 'locked')),
    CONSTRAINT email_not_empty CHECK (LENGTH(TRIM(email)) > 0)
);

-- Create security events table
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info', -- 'critical', 'high', 'medium', 'low', 'info'
    description TEXT NOT NULL,
    details JSONB,
    
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    
    -- Constraints
    CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    CONSTRAINT event_type_not_empty CHECK (LENGTH(TRIM(event_type)) > 0),
    CONSTRAINT description_not_empty CHECK (LENGTH(TRIM(description)) > 0)
);

-- Create API rate limiting table
CREATE TABLE rate_limit_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL, -- IP address or user ID
    identifier_type VARCHAR(20) NOT NULL, -- 'ip', 'user', 'org'
    endpoint VARCHAR(255) NOT NULL,
    
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP DEFAULT NOW(),
    window_end TIMESTAMP NOT NULL,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_identifier_type CHECK (identifier_type IN ('ip', 'user', 'org')),
    CONSTRAINT positive_request_count CHECK (request_count > 0),
    CONSTRAINT valid_window CHECK (window_end > window_start),
    
    -- Unique constraint for rate limiting windows
    UNIQUE (identifier, identifier_type, endpoint, window_start)
);

-- Create system health metrics table
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit VARCHAR(20),
    
    tags JSONB,
    recorded_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT metric_name_not_empty CHECK (LENGTH(TRIM(metric_name)) > 0)
);

-- Create configuration audit table
CREATE TABLE configuration_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    configuration_key VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    change_reason TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT config_key_not_empty CHECK (LENGTH(TRIM(configuration_key)) > 0)
);

-- Create data retention policies table
CREATE TABLE data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    retention_days INTEGER NOT NULL,
    policy_type VARCHAR(50) NOT NULL, -- 'delete', 'archive'
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_retention_days CHECK (retention_days > 0),
    CONSTRAINT valid_policy_type CHECK (policy_type IN ('delete', 'archive')),
    CONSTRAINT table_name_not_empty CHECK (LENGTH(TRIM(table_name)) > 0),
    
    UNIQUE (table_name, policy_type)
);

-- Create indexes for audit tables
CREATE INDEX idx_login_attempts_org_id ON login_attempts(org_id);
CREATE INDEX idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX idx_login_attempts_email ON login_attempts(LOWER(email));
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_type ON login_attempts(attempt_type);
CREATE INDEX idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX idx_login_attempts_email_ip ON login_attempts(LOWER(email), ip_address, created_at);

CREATE INDEX idx_security_events_org_id ON security_events(org_id);
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created ON security_events(created_at);
CREATE INDEX idx_security_events_resolved ON security_events(resolved_at);
CREATE INDEX idx_security_events_ip ON security_events(ip_address);
CREATE INDEX idx_security_events_request_id ON security_events(request_id);
CREATE INDEX idx_security_events_details_gin ON security_events USING GIN (details);

CREATE INDEX idx_rate_limit_identifier ON rate_limit_tracking(identifier, identifier_type);
CREATE INDEX idx_rate_limit_endpoint ON rate_limit_tracking(endpoint);
CREATE INDEX idx_rate_limit_window ON rate_limit_tracking(window_start, window_end);
CREATE INDEX idx_rate_limit_created ON rate_limit_tracking(created_at);
CREATE INDEX idx_rate_limit_updated ON rate_limit_tracking(updated_at);

CREATE INDEX idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_system_metrics_recorded ON system_metrics(recorded_at);
CREATE INDEX idx_system_metrics_tags_gin ON system_metrics USING GIN (tags);

CREATE INDEX idx_config_changes_org_id ON configuration_changes(org_id);
CREATE INDEX idx_config_changes_changed_by ON configuration_changes(changed_by);
CREATE INDEX idx_config_changes_key ON configuration_changes(configuration_key);
CREATE INDEX idx_config_changes_created ON configuration_changes(created_at);

CREATE INDEX idx_retention_policies_table ON data_retention_policies(table_name);
CREATE INDEX idx_retention_policies_active ON data_retention_policies(is_active);

-- Create triggers for updated_at on new tables
CREATE TRIGGER update_rate_limit_tracking_updated_at 
    BEFORE UPDATE ON rate_limit_tracking 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_retention_policies_updated_at 
    BEFORE UPDATE ON data_retention_policies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function for data cleanup based on retention policies
CREATE OR REPLACE FUNCTION apply_data_retention_policies()
RETURNS TABLE(table_name TEXT, deleted_count INTEGER) AS $$
DECLARE
    policy RECORD;
    sql_command TEXT;
    result_count INTEGER;
BEGIN
    FOR policy IN 
        SELECT drp.table_name, drp.retention_days, drp.policy_type
        FROM data_retention_policies drp
        WHERE drp.is_active = true AND drp.policy_type = 'delete'
    LOOP
        -- Build dynamic SQL for deletion
        sql_command := format(
            'DELETE FROM %I WHERE created_at < NOW() - INTERVAL ''%s days''',
            policy.table_name,
            policy.retention_days
        );
        
        -- Execute the deletion
        EXECUTE sql_command;
        GET DIAGNOSTICS result_count = ROW_COUNT;
        
        -- Return the result
        table_name := policy.table_name;
        deleted_count := result_count;
        RETURN NEXT;
    END LOOP;
    
    RETURN;
END;
$$ language 'plpgsql';

-- Insert default retention policies
INSERT INTO data_retention_policies (table_name, retention_days, policy_type) VALUES
('audit_logs', 365, 'delete'),
('login_attempts', 90, 'delete'),
('security_events', 730, 'delete'),
('rate_limit_tracking', 7, 'delete'),
('system_metrics', 90, 'delete'),
('configuration_changes', 1095, 'delete'),
('refresh_tokens', 30, 'delete'),
('password_reset_tokens', 1, 'delete'),
('email_verification_tokens', 7, 'delete'),
('sessions', 30, 'delete');

COMMIT;