CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT,
    s3_key TEXT NOT NULL,
    s3_bucket VARCHAR(255) DEFAULT 'faq-documents',
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    error_code VARCHAR(100),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    chunks_count INT DEFAULT 0,
    processing_time_seconds INT,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    deleted_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_org_uploaded ON documents(org_id, uploaded_at DESC) WHERE deleted_at IS NULL;
