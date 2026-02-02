CREATE TABLE IF NOT EXISTS failed_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    document_id UUID REFERENCES documents(id),
    org_id UUID REFERENCES organizations(id),
    payload JSONB NOT NULL,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_retry_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_failed_events_retry ON failed_events(retry_count, created_at) WHERE retry_count < 3;
