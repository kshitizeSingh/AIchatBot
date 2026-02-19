# AI Processing Service - Requirements & Implementation Plan

## Table of Contents

1. [Service Overview](#service-overview)
2. [Functional Requirements](#functional-requirements)
3. [Technical Requirements](#technical-requirements)
4. [Architecture Design](#architecture-design)
5. [Technology Stack](#technology-stack)
6. [API Specifications](#api-specifications)
7. [Database Schema](#database-schema)
8. [Implementation Plan](#implementation-plan)
9. [Pinecone Integration](#pinecone-integration)
10. [Complete Implementation](#complete-implementation)

---

## Service Overview

### Purpose
The AI Processing Service is the **brain** of the platform. It consumes document upload events, processes files to extract text, chunks the content, generates embeddings, and indexes them in Pinecone for semantic search. It's an event-driven, asynchronous service that runs continuously in the background.

### Key Responsibilities

1. **Event Consumption**
   - Listen to Kafka `document.uploaded` topic
   - Process documents asynchronously
   - Handle retry logic and error recovery

2. **Document Parsing**
   - Extract text from PDF files (using `pdf-parse`)
   - Extract text from DOCX files (using `mammoth`)
   - Extract text from TXT/MD files (direct read)
   - Handle corrupted or password-protected files

3. **Text Processing**
   - Chunk text into semantic segments (1000 tokens, 200 overlap)
   - Preserve document structure and context
   - Add metadata to each chunk

4. **Embedding Generation**
   - Generate vector embeddings using OpenAI API or local models
   - Use `text-embedding-3-small` (1536 dimensions) or `all-MiniLM-L6-v2` (384 dimensions)
   - Batch processing for efficiency

5. **Vector Indexing**
   - Store embeddings in Pinecone
   - Create namespaces per organization
   - Associate metadata with each vector

6. **Status Tracking**
   - Update document status in PostgreSQL
   - Publish completion/failure events
   - Store error details for debugging

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Runtime** | Node.js 18+ | Main execution environment |
| **Queue Consumer** | Kafka (kafkajs) | Event consumption |
| **File Parsing** | pdf-parse, mammoth, fs | Extract text from files |
| **Text Chunking** | langchain (Node.js) | Split text intelligently |
| **Embeddings** | Ollama (local embeddings API) | Generate vectors |
| **Vector DB** | Pinecone | Vector storage and search |
| **Database** | PostgreSQL | Status tracking |
| **Storage** | AWS S3 / MinIO | Retrieve uploaded files |
| **Logging** | Winston | Structured logging |

---

## Functional Requirements

### FR-1: Event Consumption

**Description**: Service listens to Kafka `document.uploaded` events and processes them.

**Acceptance Criteria**:
- ✅ Consumes events from `document.uploaded` topic
- ✅ Processes events in order per partition
- ✅ Acknowledges messages only after successful processing
- ✅ Supports concurrent processing (configurable workers)
- ✅ Handles consumer group rebalancing gracefully

**Event Schema**:
```json
{
  "event_type": "document.uploaded",
  "document_id": "uuid",
  "org_id": "uuid",
  "s3_key": "org-uuid/documents/file.pdf",
  "content_type": "application/pdf",
  "filename": "user-guide.pdf",
  "timestamp": "2025-01-28T10:00:00Z"
}
```

---

### FR-2: Document Parsing

**Description**: Extract text from various file formats.

**Acceptance Criteria**:
- ✅ Supports PDF (using `pdf-parse`)
- ✅ Supports DOCX (using `mammoth`)
- ✅ Supports TXT and MD (direct read)
- ✅ Handles multi-page PDFs
- ✅ Preserves basic formatting (paragraphs, spacing)
- ✅ Detects and rejects encrypted/password-protected files
- ✅ Handles parsing errors gracefully
- ✅ Minimum text threshold (100 characters) to be valid

**Supported Formats**:
| Format | Library | Notes |
|--------|---------|-------|
| PDF | `pdf-parse` | Extracts text from all pages |
| DOCX | `mammoth` | Converts to plain text |
| TXT | `fs` | Direct UTF-8 read |
| MD | `fs` | Direct UTF-8 read |

**Error Handling**:
- Encrypted PDF → Status: `failed`, Error: `PDF_ENCRYPTED`
- Corrupted file → Status: `failed`, Error: `PARSE_ERROR`
- No text extracted → Status: `failed`, Error: `INSUFFICIENT_TEXT`

---

### FR-3: Text Chunking

**Description**: Split extracted text into semantic chunks for embedding.

**Acceptance Criteria**:
- ✅ Chunk size: 1000 characters (configurable)
- ✅ Chunk overlap: 200 characters (configurable)
- ✅ Preserves sentence boundaries (no mid-sentence cuts)
- ✅ Preserves paragraph structure when possible
- ✅ Each chunk includes metadata:
  - `document_id`
  - `org_id`
  - `chunk_index` (0-based)
  - `total_chunks`
  - `filename`
  - `source` (original text snippet)

**Chunking Strategy**:
```javascript
// Use RecursiveCharacterTextSplitter from langchain
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", ". ", " ", ""]
});
```

**Example**:
```
Input: 5000 character document
Output: ~5-6 chunks with 200 char overlap
```

---

### FR-4: Embedding Generation

**Description**: Convert text chunks into vector embeddings.

**Acceptance Criteria**:
- ✅ Use Ollama local embeddings API (no external network dependency)
- ✅ Supported models: `nomic-embed-text` (768 dims) or any Ollama embedding model available locally
- ✅ Batch processing (up to 100 chunks at once for efficiency)
- ✅ Retry logic for API failures (3 attempts with exponential backoff)
- ✅ Backpressure handling for local server (throttle QPS / concurrent requests)
- ✅ Configurable via environment variables

**Configuration**:
```bash
EMBEDDING_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768          # must match the selected Ollama model
EMBEDDING_BATCH_SIZE=100
```

> Notes:
> - Ensure the embedding model is pulled locally: `ollama pull nomic-embed-text`.
> - If you choose a different Ollama embedding model, update `EMBEDDING_DIMENSIONS` and Pinecone index dimensions accordingly.
> - Ollama embeddings endpoint: POST `${OLLAMA_URL}/api/embeddings` with JSON `{ "model": OLLAMA_EMBEDDING_MODEL, "input": ["text1", "text2", ...] }`. The response contains `embeddings`.

---

### FR-5: Vector Indexing (Pinecone)

**Description**: Store embeddings in Pinecone with proper organization isolation.

**Acceptance Criteria**:
- ✅ Each organization has a dedicated **namespace** in Pinecone
- ✅ Namespace format: `org_{org_id}`
- ✅ Vector ID format: `{document_id}_{chunk_index}`
- ✅ Metadata includes:
  - `document_id`
  - `org_id`
  - `chunk_index`
  - `text` (original chunk content)
  - `filename`
  - `uploaded_at`
- ✅ Upsert operation (idempotent - can re-run safely)
- ✅ Batch upserts (up to 100 vectors per request)

**Pinecone Structure**:
```javascript
// Index: faq-platform (one index for all orgs)
// Namespace: org_550e8400-e29b-41d4-a716-446655440000

{
  id: "doc-uuid_0",
  values: [0.123, 0.456, ..., 0.789],  // EMBEDDING_DIMENSIONS (e.g., 768 for nomic-embed-text)
  metadata: {
    document_id: "doc-uuid",
    org_id: "org-uuid",
    chunk_index: 0,
    total_chunks: 5,
    text: "This is the chunk content...",
    filename: "user-guide.pdf",
    uploaded_at: "2025-01-28T10:00:00Z"
  }
}
```

---

### FR-6: Status Tracking & Events

**Description**: Update document processing status and publish completion events.

**Acceptance Criteria**:
- ✅ Update PostgreSQL `documents` table with:
  - `status = 'completed'` on success
  - `status = 'failed'` on error
  - `chunks_count` (number of chunks created)
  - `processed_at` timestamp
  - `error_message` and `error_code` if failed
- ✅ Publish `document.processed` event to Kafka on success
- ✅ Publish `document.failed` event to DLQ on failure after retries
- ✅ Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)

**Success Event**:
```json
{
  "event_type": "document.processed",
  "document_id": "uuid",
  "org_id": "uuid",
  "status": "completed",
  "chunks_count": 42,
  "processing_time_ms": 5000,
  "timestamp": "2025-01-28T10:05:00Z"
}
```

**Failure Event**:
```json
{
  "event_type": "document.failed",
  "document_id": "uuid",
  "org_id": "uuid",
  "error_code": "PARSE_ERROR",
  "error_message": "Failed to parse PDF: file is corrupted",
  "retry_count": 3,
  "timestamp": "2025-01-28T10:02:00Z"
}
```

---

## Technical Requirements

### TR-1: Performance

| Metric | Target | Notes |
|--------|--------|-------|
| **Processing Time** | < 10s per document | For typical 10-page PDF |
| **Throughput** | 100 docs/hour | With 2 workers |
| **Embedding Speed** | < 2s per batch | Batch of 100 chunks |
| **Vector Upsert** | < 1s per batch | Batch of 100 vectors |
| **Memory Usage** | < 512MB per worker | Efficient chunking |

### TR-2: Reliability

- **Message Processing**: At-least-once delivery (Kafka consumer commits after success)
- **Idempotency**: Safe to re-process same document (upsert by ID)
- **Retry Logic**: 3 attempts with exponential backoff
- **Dead Letter Queue**: Failed events after 3 retries
- **Circuit Breaker**: Pause processing if error rate > 50%

### TR-3: Scalability

- **Horizontal Scaling**: Can run multiple workers in parallel
- **Partition-Based**: Each worker handles specific Kafka partitions
- **Stateless**: No local state, all state in DB/Pinecone
- **Configurable Concurrency**: `MAX_CONCURRENT_JOBS` env var

### TR-4: Organization Isolation

- **Pinecone Namespaces**: Each org has dedicated namespace
- **Metadata Tagging**: Every vector tagged with `org_id`
- **Query Scoping**: Queries filtered by namespace
- **No Cross-Org Access**: Namespace isolation prevents data leaks

### TR-5: Error Handling

```javascript
Error Categories:
1. Retriable Errors:
   - S3 download timeout
   - Ollama server busy / 429 or 503 responses
   - Ollama/Pinecone connection timeout
   Action: Retry with backoff

2. Non-Retriable Errors:
   - File encrypted
   - File corrupted
   - Insufficient text
   Action: Mark as failed immediately

3. System Errors:
   - Database connection lost
   - Kafka connection lost
   Action: Pause processing, alert
```

### TR-6: Monitoring & Observability

- **Metrics**:
  - Documents processed per minute
  - Average processing time
  - Error rate by error type
  - Queue lag (pending events)
  - Embedding API latency
  - Pinecone upsert latency

- **Logging**:
  - All events logged with `document_id`, `org_id`
  - Error stack traces
  - Processing milestones (parse, chunk, embed, index)

---

## Architecture Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document Upload Flow                          │
└─────────────────────────────────────────────────────────────────┘

1. Admin uploads document → Content Service
2. Content Service stores metadata → PostgreSQL
3. Content Service publishes event → Kafka (document.uploaded)

┌─────────────────────────────────────────────────────────────────┐
│              AI Processing Service (Event-Driven)                │
└─────────────────────────────────────────────────────────────────┘

4. AI Processing Service consumes event from Kafka

   ┌────────────────────────────────────────────────┐
   │  Consumer Loop (Continuous)                    │
   │                                                │
   │  for each message in topic:                    │
   │    1. Parse event                              │
   │    2. Download file from S3                    │
   │    3. Extract text (PDF/DOCX/TXT)              │
   │    4. Chunk text                               │
   │    5. Generate embeddings                      │
   │    6. Upsert to Pinecone                       │
   │    7. Update PostgreSQL status                 │
   │    8. Publish completion event                 │
   │    9. Commit Kafka offset                      │
   └────────────────────────────────────────────────┘

5. Success → Publish to 'document.processed' topic
6. Failure → Publish to 'document.failed' topic (DLQ)

┌─────────────────────────────────────────────────────────────────┐
│                        Data Flow                                 │
└─────────────────────────────────────────────────────────────────┘

Event → S3 Download → Text Extraction → Chunking → Embedding → Pinecone
  ↓                                                                   ↓
PostgreSQL                                                     PostgreSQL
(status: processing)                                     (status: completed)
```

---

## Technology Stack Details

### Core Dependencies

```json
{
  "dependencies": {
    "kafkajs": "^2.2.4",           // Kafka consumer
    "aws-sdk": "^2.1492.0",        // S3 file retrieval
    "pdf-parse": "^1.1.1",         // PDF parsing
    "mammoth": "^1.6.0",           // DOCX parsing
    "langchain": "^0.1.0",         // Text chunking
    "@langchain/textsplitters": "^0.0.1",
    "ollama": "^0.1.0",            // Ollama client for local embeddings
    "@pinecone-database/pinecone": "^1.1.0", // Pinecone client
    "pg": "^8.11.3",               // PostgreSQL
    "dotenv": "^16.3.1",
    "winston": "^3.11.0"           // Logging
  }
}
```

---

## Database Schema

```sql
-- No new tables needed!
-- Uses existing 'documents' table from Content Service

-- Updates to existing table:
UPDATE documents
SET 
  status = 'completed',           -- or 'failed'
  chunks_count = 42,
  processing_time_seconds = 5,
  processed_at = NOW()
WHERE id = 'document-uuid';

-- For failures:
UPDATE documents
SET 
  status = 'failed',
  error_message = 'Failed to parse PDF',
  error_code = 'PARSE_ERROR',
  retry_count = retry_count + 1
WHERE id = 'document-uuid';
```

---

## Pinecone Integration

### Setup & Configuration

**1. Create Pinecone Account & Index**

```bash
# 1. Sign up at https://www.pinecone.io
# 2. Create an index via dashboard or API:

Index Name: faq-platform
Dimensions: 768  (for Ollama nomic-embed-text) or the dimension of your selected Ollama embedding model
Metric: cosine
Cloud: AWS (or GCP)
Region: us-east-1 (or nearest)
```

**2. Environment Variables**

```bash
# Pinecone
PINECONE_API_KEY=your-api-key
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=faq-platform

# Embeddings (Ollama local)
EMBEDDING_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
EMBEDDING_BATCH_SIZE=100

# Processing
MAX_CONCURRENT_JOBS=5
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

**3. Pinecone Client Initialization**

```javascript
const { Pinecone } = require('@pinecone-database/pinecone');

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT
});

const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
```

**4. Namespace Strategy**

```javascript
// Each organization gets its own namespace
const namespace = `org_${orgId}`;

// All queries scoped to namespace
const results = await index.namespace(namespace).query({
  vector: queryEmbedding,
  topK: 5,
  includeMetadata: true
});

// Ensures org A can never access org B's vectors
```

---

## Implementation Plan

### Phase 1: Project Setup (Day 1)

**Tasks**:
1. Initialize Node.js project
2. Install dependencies
3. Setup project structure
4. Configure environment variables
5. Setup logging

```bash
mkdir ai-processing-service
cd ai-processing-service
npm init -y
npm install kafkajs aws-sdk pdf-parse mammoth langchain openai @pinecone-database/pinecone pg dotenv winston
npm install --save-dev nodemon jest
```

**Project Structure**:
```
ai-processing-service/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── kafka.js
│   │   ├── s3.js
│   │   ├── pinecone.js
│   │   └── embeddings.js
│   ├── services/
│   │   ├── documentParser.js
│   │   ├── textChunker.js
│   │   ├── embeddingService.js
│   │   ├── vectorStore.js
│   │   └── statusTracker.js
│   ├── processors/
│   │   └── documentProcessor.js
│   ├── consumers/
│   │   └── kafkaConsumer.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── retry.js
│   └── index.js
├── tests/
├── .env.example
├── package.json
└── README.md
```

### Phase 2: File Parsing (Day 2-3)

**Tasks**:
1. Implement PDF parser
2. Implement DOCX parser
3. Implement TXT/MD parser
4. Add error handling
5. Write unit tests

### Phase 3: Text Chunking (Day 4)

**Tasks**:
1. Integrate LangChain text splitter
2. Configure chunk size and overlap
3. Add metadata to chunks
4. Test with sample documents

### Phase 4: Embedding Generation (Day 5-6)

**Tasks**:
1. Setup Ollama embeddings (ensure the model is available locally: `ollama pull nomic-embed-text`)
2. Configure `OLLAMA_URL` and `OLLAMA_EMBEDDING_MODEL` in environment
3. Implement batch processing (up to `EMBEDDING_BATCH_SIZE` per request)
4. Add retry logic and backoff for transient Ollama/Pinecone failures
5. Test with sample chunks and verify Pinecone index dimensions match `EMBEDDING_DIMENSIONS`

### Phase 5: Pinecone Integration (Day 7-8)

**Tasks**:
1. Setup Pinecone client
2. Implement namespace creation
3. Implement vector upsert
4. Add batch processing
5. Test org isolation

### Phase 6: Kafka Consumer (Day 9)

**Tasks**:
1. Setup Kafka consumer
2. Implement message processing loop
3. Add error handling
4. Implement retry logic
5. Test with sample events

### Phase 7: Status Tracking & Events (Day 10)

**Tasks**:
1. Implement status updates
2. Publish completion events
3. Handle DLQ
4. Add monitoring
5. Integration testing

### Phase 8: Testing & Deployment (Day 11-12)

**Tasks**:
1. End-to-end testing
2. Performance testing
3. Error scenario testing
4. Documentation
5. Docker containerization

---

## Complete Implementation

I'll provide the complete implementation in the next section with all code files.