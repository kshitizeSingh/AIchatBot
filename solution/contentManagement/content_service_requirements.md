# Content Management Service - Requirements & Implementation Plan

## Table of Contents

1. [Service Overview](#service-overview)
2. [Functional Requirements](#functional-requirements)
3. [Technical Requirements](#technical-requirements)
4. [API Specifications](#api-specifications)
5. [Database Schema](#database-schema)
6. [Implementation Plan](#implementation-plan)
7. [Code Structure](#code-structure)
8. [Complete Implementation](#complete-implementation)

---

## Service Overview

### Purpose
The Content Management Service handles all document-related operations including upload, storage, metadata management, and lifecycle tracking. It acts as the bridge between admin users and the document processing pipeline.

### Key Responsibilities
1. **Document Upload Management**
   - Generate presigned S3 URLs for direct client uploads
   - Validate file types and sizes
   - Store document metadata
   
2. **Event Publishing**
   - Publish `document.uploaded` events to Kafka/RabbitMQ
   - Listen for `document.processed` events to update status
   
3. **Document Lifecycle**
   - Track processing status (pending → uploaded → processing → completed/failed)
   - Handle document deletion (metadata + S3 cleanup)
   - Provide status queries
   
4. **Organization Isolation**
   - Ensure all operations are scoped to `org_id`
   - Prevent cross-organization data access

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL (metadata storage)
- **Storage**: AWS S3 / MinIO (document files)
- **Message Queue**: Kafka / RabbitMQ
- **Cache**: Redis (optional, for metadata caching)

---

## Functional Requirements

### FR-1: Document Upload
**Description**: Admins can upload documents for their organization.

**Acceptance Criteria**:
- ✅ Only users with role `owner` or `admin` can upload
- ✅ Supported file types: PDF, DOCX, TXT, MD
- ✅ Maximum file size: 50MB
- ✅ Upload uses presigned S3 URL (client uploads directly to S3)
- ✅ Metadata stored in PostgreSQL with status `pending`
- ✅ Event published to Kafka after metadata creation
- ✅ Duplicate filename handling (append timestamp)

**Flow**:
```
1. Admin requests upload → POST /v1/documents/upload
2. Service validates permissions (role = admin/owner)
3. Service generates presigned S3 URL (15 min expiry)
4. Service stores metadata in PostgreSQL (status: pending)
5. Service returns presigned URL to client
6. Client uploads file directly to S3
7. S3 triggers webhook/Lambda to update status to 'uploaded'
8. Service publishes event to Kafka
```

### FR-2: List Documents
**Description**: Users can view all documents in their organization.

**Acceptance Criteria**:
- ✅ Returns documents scoped to user's `org_id`
- ✅ Supports pagination (limit, offset)
- ✅ Supports filtering by status
- ✅ Supports sorting by upload date
- ✅ Returns metadata including filename, status, upload date, uploaded by

### FR-3: Get Document Status
**Description**: Users can check the processing status of a document.

**Acceptance Criteria**:
- ✅ Returns current status (pending, uploaded, processing, completed, failed)
- ✅ If failed, returns error message
- ✅ If completed, returns chunk count
- ✅ Only accessible by users in the same organization

### FR-4: Delete Document
**Description**: Admins can delete documents from their organization.

**Acceptance Criteria**:
- ✅ Only users with role `owner` or `admin` can delete
- ✅ Deletes file from S3
- ✅ Deletes metadata from PostgreSQL
- ✅ Deletes vectors from ChromaDB (via event or direct call)
- ✅ Soft delete option (mark as deleted but keep data)
- ✅ Returns confirmation

### FR-5: Event Consumption
**Description**: Service listens for processing completion events.

**Acceptance Criteria**:
- ✅ Consumes `document.processed` events from Kafka
- ✅ Updates document status to `completed` or `failed`
- ✅ Updates `chunks_count` if successful
- ✅ Stores error message if failed

---

## Technical Requirements

### TR-1: Authentication & Authorization
- **Requirement**: All endpoints require JWT + HMAC authentication
- **Implementation**: Use API Gateway middleware for validation
- **Context**: `req.user = { user_id, org_id, role }`

### TR-2: Organization Isolation
- **Requirement**: All database queries must include `WHERE org_id = $1`
- **Implementation**: 
  ```javascript
  // ✅ CORRECT
  SELECT * FROM documents WHERE org_id = $1 AND id = $2
  
  // ❌ WRONG - No org_id filter
  SELECT * FROM documents WHERE id = $1
  ```

### TR-3: Storage Strategy
- **Local Development**: Use MinIO or local filesystem
- **Production**: AWS S3 with presigned URLs
- **Configuration**: Environment variable `STORAGE_TYPE` (s3 | local)

### TR-4: File Validation
- **File Types**: 
  - PDF: `application/pdf`
  - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - TXT: `text/plain`
  - MD: `text/markdown`
- **Max Size**: 50MB (configurable via env var)
- **Validation**: Both client-side (UI) and server-side

### TR-5: Error Handling
- **Validation Errors**: 400 Bad Request
- **Authentication Errors**: 401 Unauthorized
- **Permission Errors**: 403 Forbidden
- **Not Found**: 404 Not Found
- **Server Errors**: 500 Internal Server Error
- **All errors**: Logged with context (org_id, user_id, action)

### TR-6: Event Publishing
- **Queue Type**: Configurable (Kafka or RabbitMQ)
- **Topic**: `document.uploaded`
- **Retry Logic**: 3 attempts with exponential backoff
- **Failure Handling**: Log error, store in `failed_events` table

### TR-7: Performance
- **Response Time**: < 200ms for metadata operations
- **Presigned URL Generation**: < 100ms
- **Pagination**: Default 20 items, max 100 per page
- **Database Queries**: Use indexes on `org_id`, `status`, `uploaded_at`

---

## API Specifications

### Endpoint: POST /v1/documents/upload

**Description**: Generate presigned URL for document upload

**Authentication**: JWT + HMAC

**Authorization**: Role = `owner` OR `admin`

**Request**:
```http
POST /v1/documents/upload
Authorization: Bearer eyJhbGciOiJ...
X-Client-ID: pk_abc123...
X-Timestamp: 1737388800000
X-Signature: hmac_signature
Content-Type: application/json

{
  "filename": "user-guide.pdf",
  "content_type": "application/pdf",
  "file_size": 2048576  // bytes (optional)
}
```

**Response (Success - 200)**:
```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "presigned_url": "https://s3.amazonaws.com/bucket/org-uuid/documents/doc-uuid.pdf?X-Amz-Algorithm=...",
  "s3_key": "org-uuid/documents/550e8400-e29b-41d4-a716-446655440000.pdf",
  "expires_in": 900,  // seconds
  "max_file_size": 52428800,  // bytes
  "upload_instructions": {
    "method": "PUT",
    "headers": {
      "Content-Type": "application/pdf"
    }
  }
}
```

**Response (Error - 403)**:
```json
{
  "error": "Admin access required",
  "code": "INSUFFICIENT_PERMISSIONS",
  "required_role": ["owner", "admin"],
  "current_role": "user"
}
```

**Response (Error - 400)**:
```json
{
  "error": "Unsupported file type",
  "code": "INVALID_FILE_TYPE",
  "supported_types": ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"]
}
```

---

### Endpoint: GET /v1/documents

**Description**: List all documents for the organization

**Authentication**: JWT + HMAC

**Authorization**: Any authenticated user in the org

**Request**:
```http
GET /v1/documents?limit=20&offset=0&status=completed&sort=uploaded_at:desc
Authorization: Bearer eyJhbGciOiJ...
X-Client-ID: pk_abc123...
X-Timestamp: 1737388800000
X-Signature: hmac_signature
```

**Query Parameters**:
- `limit` (optional): Number of results (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status (pending, uploaded, processing, completed, failed)
- `sort` (optional): Sort field and direction (e.g., `uploaded_at:desc`)

**Response (Success - 200)**:
```json
{
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "user-guide.pdf",
      "content_type": "application/pdf",
      "file_size": 2048576,
      "status": "completed",
      "chunks_count": 42,
      "uploaded_by": {
        "user_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "email": "admin@acme.com"
      },
      "uploaded_at": "2025-01-28T10:00:00Z",
      "processed_at": "2025-01-28T10:05:00Z"
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

---

### Endpoint: GET /v1/documents/:id/status

**Description**: Get processing status of a specific document

**Authentication**: JWT + HMAC

**Authorization**: Any authenticated user in the same org

**Request**:
```http
GET /v1/documents/550e8400-e29b-41d4-a716-446655440000/status
Authorization: Bearer eyJhbGciOiJ...
X-Client-ID: pk_abc123...
X-Timestamp: 1737388800000
X-Signature: hmac_signature
```

**Response (Success - 200)**:
```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "user-guide.pdf",
  "status": "completed",
  "progress": {
    "current_step": "indexing",
    "total_steps": 4,
    "percentage": 100
  },
  "chunks_count": 42,
  "uploaded_at": "2025-01-28T10:00:00Z",
  "processed_at": "2025-01-28T10:05:00Z",
  "processing_time_seconds": 300
}
```

**Response (Failed Document - 200)**:
```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "corrupted-file.pdf",
  "status": "failed",
  "error_message": "Failed to parse PDF: File is encrypted",
  "error_code": "PARSE_ERROR",
  "retry_count": 3,
  "uploaded_at": "2025-01-28T10:00:00Z",
  "failed_at": "2025-01-28T10:02:00Z"
}
```

---

### Endpoint: DELETE /v1/documents/:id

**Description**: Delete a document and its associated data

**Authentication**: JWT + HMAC

**Authorization**: Role = `owner` OR `admin`

**Request**:
```http
DELETE /v1/documents/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJ...
X-Client-ID: pk_abc123...
X-Timestamp: 1737388800000
X-Signature: hmac_signature
```

**Response (Success - 200)**:
```json
{
  "message": "Document deleted successfully",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "deleted_at": "2025-01-28T12:00:00Z",
  "cleanup": {
    "s3_deleted": true,
    "metadata_deleted": true,
    "vectors_deleted": true
  }
}
```

**Response (Error - 404)**:
```json
{
  "error": "Document not found",
  "code": "DOCUMENT_NOT_FOUND",
  "document_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Database Schema

```sql
-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- File information
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,  -- Before sanitization
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT,  -- bytes
    
    -- S3 storage
    s3_key TEXT NOT NULL,
    s3_bucket VARCHAR(255) DEFAULT 'faq-documents',
    
    -- Processing status
    status VARCHAR(50) DEFAULT 'pending',
    -- Status values: pending, uploaded, processing, completed, failed
    
    error_message TEXT,
    error_code VARCHAR(100),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    
    -- Processing metrics
    chunks_count INT DEFAULT 0,
    processing_time_seconds INT,
    
    -- Audit fields
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    deleted_at TIMESTAMP,  -- Soft delete
    
    -- Metadata
    metadata JSONB,  -- Custom metadata from client
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_documents_org_id ON documents(org_id);
CREATE INDEX idx_documents_status ON documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX idx_documents_org_status ON documents(org_id, status) WHERE deleted_at IS NULL;

-- Composite index for common query pattern
CREATE INDEX idx_documents_org_uploaded ON documents(org_id, uploaded_at DESC) WHERE deleted_at IS NULL;

-- Failed events table (for retry mechanism)
CREATE TABLE failed_events (
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

CREATE INDEX idx_failed_events_retry ON failed_events(retry_count, created_at) WHERE retry_count < 3;
```

---

## Implementation Plan

### Phase 1: Project Setup (Day 1)

**Tasks**:
1. Initialize Node.js project
   ```bash
   mkdir content-service
   cd content-service
   npm init -y
   ```

2. Install dependencies
   ```bash
   npm install express pg aws-sdk kafkajs dotenv
   npm install --save-dev nodemon jest supertest
   ```

3. Create project structure
   ```
   content-service/
   ├── src/
   │   ├── config/
   │   │   ├── database.js
   │   │   ├── storage.js
   │   │   └── queue.js
   │   ├── controllers/
   │   │   └── documentController.js
   │   ├── services/
   │   │   ├── s3Service.js
   │   │   ├── queueService.js
   │   │   └── documentService.js
   │   ├── middlewares/
   │   │   ├── authMiddleware.js
   │   │   └── errorHandler.js
   │   ├── models/
   │   │   └── documentModel.js
   │   ├── routes/
   │   │   └── documentRoutes.js
   │   ├── utils/
   │   │   ├── logger.js
   │   │   └── validators.js
   │   └── index.js
   ├── migrations/
   │   └── 001_create_documents_table.sql
   ├── tests/
   │   ├── unit/
   │   └── integration/
   ├── .env.example
   ├── .gitignore
   ├── package.json
   └── README.md
   ```

4. Configure environment variables
   ```bash
   # .env.example
   NODE_ENV=development
   PORT=3002
   
   # Database
   DATABASE_URL=postgresql://user:pass@localhost:5432/faq_platform
   
   # Storage
   STORAGE_TYPE=s3  # or 'local' for development
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=faq-documents
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   PRESIGNED_URL_EXPIRY=900  # 15 minutes
   
   # Queue
   QUEUE_TYPE=kafka  # or 'rabbitmq'
   KAFKA_BROKERS=localhost:9092
   KAFKA_CLIENT_ID=content-service
   KAFKA_GROUP_ID=content-service-group
   
   # File Upload
   MAX_FILE_SIZE=52428800  # 50MB in bytes
   ALLOWED_FILE_TYPES=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown
   ```

### Phase 2: Core Infrastructure (Day 2-3)

**Tasks**:
1. Database connection setup
2. S3 client configuration
3. Kafka producer/consumer setup
4. Logger implementation
5. Error handling middleware

### Phase 3: Document Upload (Day 4-5)

**Tasks**:
1. Implement presigned URL generation
2. Create document metadata storage
3. Add file validation
4. Implement event publishing
5. Add unit tests

### Phase 4: Document Listing & Status (Day 6)

**Tasks**:
1. Implement list documents endpoint
2. Add pagination logic
3. Implement status check endpoint
4. Add filtering and sorting
5. Add unit tests

### Phase 5: Document Deletion (Day 7)

**Tasks**:
1. Implement delete endpoint
2. Add S3 cleanup
3. Add database cleanup
4. Publish deletion events
5. Add unit tests

### Phase 6: Event Consumption (Day 8)

**Tasks**:
1. Implement Kafka consumer
2. Handle `document.processed` events
3. Update document status
4. Add error handling and retries
5. Add integration tests

### Phase 7: Testing & Documentation (Day 9-10)

**Tasks**:
1. Integration tests
2. API documentation (Swagger)
3. Error scenarios testing
4. Performance testing
5. Security testing

---

## Code Structure

### File: src/index.js

```javascript
const express = require('express');
const dotenv = require('dotenv');
const documentRoutes = require('./routes/documentRoutes');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/v1/documents', documentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'content-service' });
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Content Service running on port ${PORT}`);
});

module.exports = app;
```

---

## Complete Implementation

I'll provide the complete implementation in the next artifact with all the code files needed.