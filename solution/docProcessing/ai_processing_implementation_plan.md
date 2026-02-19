# AI Processing Service — Implementation Plan (Node.js + KafkaJS + Ollama + Pinecone)

## 1) Executive Summary
Build a background AI Processing Service that consumes `document.uploaded` events from Kafka, downloads the source file from S3/MinIO, extracts and chunks text, generates local embeddings via Ollama (`nomic-embed-text`), and upserts vectors into Pinecone with per-organization namespaces. The service updates PostgreSQL document status and emits success/failure events. This document provides a phased plan with tasks, owners, deliverables, environments, testing, operations, risks, rollout, and acceptance criteria.

---

## 2) Phases, Milestones, and Timelines (12 days)
- Phase 0 (Day 0.5): Project scaffolding, repo conventions, CI bootstrap
- Phase 1 (Day 1): Runtime setup, configuration, logging
- Phase 2 (Days 2–3): File parsing module (PDF/DOCX/TXT/MD)
- Phase 3 (Day 4): Text chunking with LangChain splitters
- Phase 4 (Days 5–6): Embeddings via Ollama; batching, retries, backpressure
- Phase 5 (Days 7–8): Pinecone integration; namespaces, batch upserts
- Phase 6 (Day 9): Kafka consumer & processing loop + DLQ
- Phase 7 (Day 10): PostgreSQL status updates & events publishing
- Phase 8 (Days 11–12): Testing, performance, docs, containerization

Milestones
- M1: Service boots with config and logger (end Day 1)
- M2: End-to-end happy path on a local sample (end Day 6)
- M3: Batch upserts to Pinecone verified (end Day 8)
- M4: Kafka-driven E2E flow green (end Day 10)
- M5: Test coverage and performance targets met; image published (end Day 12)

---

## 3) Detailed Tasks, Owners, Deliverables, DoD
Note: Owners are placeholders. Update to your team’s roster (e.g., BE-1, BE-2, DevOps-1, QA-1).

A) Foundation (Phase 0–1)
- Tasks
  - Initialize Node.js 18 project; add scripts (dev, test, lint, start)
  - Add TypeScript (optional), ESLint + Prettier; commit hooks (Husky + lint-staged)
  - Add config loader (dotenv), config schema validation (zod/joi)
  - Add Winston logger with JSON format and correlationId support
  - Create base folder structure (src/config, src/services, src/processors, src/consumers, src/utils)
- Deliverables
  - Repo with base scaffolding; .env.example; logger and config modules
- DoD
  - npm run start boots without errors; logs redact secrets; ESLint passes

B) File Retrieval & Parsing (Phase 2)
- Tasks
  - S3/MinIO client (aws-sdk v2); stream download by s3_key
  - Parsers: pdf-parse, mammoth; TXT/MD via fs UTF-8 read
  - Encrypted/corrupted detection; min text threshold
  - Unit tests for each parser path
- Deliverables
  - src/services/documentParser.js; unit tests; sample fixtures
- DoD
  - Parsing returns text for valid inputs; proper error codes for failures

C) Text Chunking (Phase 3)
- Tasks
  - Integrate LangChain RecursiveCharacterTextSplitter (1000/200)
  - Preserve paragraph/sentence boundaries via separators ["\n\n","\n",". "," ",""]
  - Attach metadata (document_id, org_id, chunk_index, total_chunks, filename, source)
- Deliverables
  - src/services/textChunker.js; unit tests for chunk sizing/overlap
- DoD
  - Deterministic chunk counts for known inputs; metadata validated

D) Embeddings via Ollama (Phase 4)
- Tasks
  - Ensure local model pulled: `ollama pull nomic-embed-text`
  - Implement client calling POST `${OLLAMA_URL}/api/embeddings`
  - Batch size = EMBEDDING_BATCH_SIZE; retries (3) with exp backoff; throttle concurrency
  - Map responses to float arrays of length EMBEDDING_DIMENSIONS (e.g., 768)
- Deliverables
  - src/services/embeddingService.js; integration tests with mocked Ollama; perf harness
- DoD
  - Handles 100-chunk batch <2s typical; resilient to 429/503 with backoff

E) Pinecone Vector Indexing (Phase 5)
- Tasks
  - Init Pinecone client; select index from env
  - Namespace per org: `org_${org_id}`; vector id: `${document_id}_${chunk_index}`
  - Batch upserts (<=100 vectors); include metadata (text, filename, uploaded_at, indices)
  - Idempotent upserts; validate dimensions == EMBEDDING_DIMENSIONS
- Deliverables
  - src/services/vectorStore.js; integration tests using Pinecone SDK mock
- DoD
  - Upserts succeed; duplicate runs are safe; dimension mismatch handled as error

F) Kafka Consumer & Processor (Phase 6)
- Tasks
  - KafkaJS consumer group; manual commit on success; configurable concurrency
  - Processor pipeline: download → parse → chunk → embed → upsert → status update → event publish
  - Retry policy (1s, 2s, 4s) for retriable errors; DLQ after 3
  - Circuit breaker if error rate >50% in 5-min window
- Deliverables
  - src/consumers/kafkaConsumer.js; src/processors/documentProcessor.js; src/utils/retry.js
- DoD
  - Processes messages in-order per partition; safe shutdown; offset commits only after success

G) Status Tracking & Events (Phase 7)
- Tasks
  - PostgreSQL updates: status, chunks_count, processed_at; on fail: status, error_message
  - Publish `document.processed` and `document.failed` events
- Deliverables
  - src/services/statusTracker.js; SQL helpers; Kafka producer
- DoD
  - DB reflects real-time state; success/failure events visible

H) Testing & Packaging (Phase 8)
- Tasks
  - Unit: parsers, chunker, embeddings, vector store, status tracker, retry
  - Integration: kafka consumer + processor with local test harness
  - E2E: docker-compose with Kafka, MinIO/S3 local, PostgreSQL, Pinecone (mock/sandbox), and Ollama
  - Performance: process a 10-page PDF <10s; throughput 100 docs/hour with 2 workers
  - Dockerfile + Healthcheck; README quick start
- Deliverables
  - tests/* with Jest; docker-compose for local; Docker image build
- DoD
  - >80% unit cov; all integration/E2E green; image runs locally

---

## 4) Configuration & Environment Variables
Core
- NODE_ENV=development|staging|production
- LOG_LEVEL=info|debug
- MAX_CONCURRENT_JOBS=5

Kafka
- KAFKA_BROKERS=host:port[,host:port]
- KAFKA_GROUP_ID=ai-processing-service
- KAFKA_TOPIC_UPLOADED=document.uploaded
- KAFKA_TOPIC_PROCESSED=document.processed
- KAFKA_TOPIC_FAILED=document.failed

Storage (S3/MinIO)
- STORAGE_TYPE=s3|minio|local
- AWS_REGION=us-east-1
- AWS_S3_BUCKET=faq-documents
- AWS_ACCESS_KEY_ID=...
- AWS_SECRET_ACCESS_KEY=...
- STORAGE_PATH=/app/uploads  # for local dev

Database (PostgreSQL)
- DATABASE_URL=postgres://user:pass@host:5432/db

Embeddings (Ollama)
- EMBEDDING_PROVIDER=ollama
- OLLAMA_URL=http://localhost:11434
- OLLAMA_EMBEDDING_MODEL=nomic-embed-text
- EMBEDDING_DIMENSIONS=768
- EMBEDDING_BATCH_SIZE=100
- OLLAMA_MAX_CONCURRENCY=4

Pinecone
- PINECONE_API_KEY=...
- PINECONE_ENVIRONMENT=us-east-1-aws
- PINECONE_INDEX_NAME=faq-platform

Chunking
- CHUNK_SIZE=1000
- CHUNK_OVERLAP=200

Retries/Backoff
- RETRY_MAX_ATTEMPTS=3
- RETRY_BASE_MS=1000

---

## 5) Testing Strategy
- Unit (Jest)
  - documentParser: happy/edge (encrypted, corrupted, empty)
  - textChunker: boundary checks, overlap guarantees
  - embeddingService: batch, retry, 429/503 handling (mock HTTP)
  - vectorStore: dimension mismatch, metadata mapping (mock SDK)
  - statusTracker: SQL paramization, error paths
  - retry utils: backoff, jitter
- Integration
  - Kafka consumer + processor: in-memory Kafka or test-topic with docker-compose
  - S3/MinIO download + parsers with sample fixtures
  - Pinecone mock sandbox for upserts
- E2E (docker-compose)
  - Bring up Kafka, MinIO, PostgreSQL, Ollama; run service; publish document.uploaded; assert DB + events
- Performance
  - 10-page PDF <10s; embedding batch <2s; Pinecone upsert <1s; memory <512MB/worker
- Coverage Targets
  - >80% lines, >75% branches unit; all critical paths covered

---

## 6) Operational Readiness (Logging, Metrics, Alerts)
- Logging
  - Winston JSON logs; include document_id, org_id, correlationId, stage (parse/chunk/embed/index)
  - Redact secrets; error stacks captured
- Metrics (Prometheus-friendly counters/histograms via prom-client)
  - documents_processed_total, processing_time_seconds, queue_lag, embedding_latency_ms, pinecone_upsert_latency_ms, failures_total{code}
- Health/Readiness
  - /health: process up; /ready: Kafka connected, DB reachable, Ollama responsive
- Dashboards & Alerts
  - Error rate >5% (warning), >10% (critical)
  - 95p processing_time_seconds >10s (warning)
  - Queue lag beyond threshold (critical)
- Runbooks
  - Ollama model not loaded → run `ollama pull nomic-embed-text`
  - Pinecone 400 (dimension mismatch) → validate EMBEDDING_DIMENSIONS vs index
  - Kafka rebalance storm → reduce concurrency; restart with jitter

---

## 7) Risks & Mitigations
- Ollama saturation or 429/503 under load
  - Mitigate with concurrency throttle, exponential backoff, circuit breaker
- Dimension mismatches between Ollama model and Pinecone index
  - Validate at startup; fail-fast with actionable error
- Large PDFs causing memory spikes
  - Stream downloads, incremental parsing, chunk by size; enforce file size limits
- Kafka consumer rebalances causing duplicate work
  - Idempotent upserts; commit offsets only after success
- S3 outages or transient failures
  - Retries with backoff; DLQ after max attempts

---

## 8) Rollout & Deployment Plan
- Packaging
  - Dockerfile (node:18-alpine); non-root user; HEALTHCHECK
- Environments
  - Dev: local Kafka + MinIO + PostgreSQL + Ollama
  - Staging: managed Kafka; Pinecone sandbox; Ollama on a VM
  - Prod: managed Kafka; Pinecone production index; Ollama on dedicated node(s)
- Promotion
  - Dev → Staging smoke tests → Performance gate → Prod canary 10% traffic
- Rollback
  - Keep previous image; toggle consumer off via env; revert within minutes
- Data
  - Namespaces per org are idempotent; re-runs safe; no destructive migrations
- Checklist
  - Env vars present; index dimensions match; health endpoints green; alerts configured

---

## 9) Acceptance Criteria
- Functional
  - Consumes `document.uploaded`; processes in-order per partition; commits on success
  - Parses PDF/DOCX/TXT/MD; rejects encrypted/corrupted with correct error
  - Chunks at 1000/200 with required metadata
  - Generates embeddings via Ollama (batch ≤100) with retries/backoff
  - Upserts vectors to Pinecone under org namespace; idempotent; metadata attached
  - Updates PostgreSQL status and emits `document.processed` / `document.failed`
- Non-Functional
  - 10-page PDF <10s typical; 100 docs/hour with 2 workers
  - Memory <512MB/worker; resilient to Ollama/Pinecone transient faults
  - Logs + metrics available; health/readiness endpoints pass
- Testing/Quality
  - Unit coverage >80%; integration/E2E pass; performance gates met

---

## 10) RACI (Example Mapping)
- Responsible: BE-1 (consumer, processor), BE-2 (parsers, chunker), BE-3 (embeddings, vector store)
- Accountable: Tech Lead
- Consulted: DevOps (infra, CI/CD), QA (test plans), Security (secrets, permissions)
- Informed: PM, Stakeholders

---

## 11) References
- Requirements: solution/docProcessing/ai_processing_requirements.md
- Libraries: kafkajs, pdf-parse, mammoth, langchain, @langchain/textsplitters, ollama, @pinecone-database/pinecone, pg, winston
- Best practices baseline referenced for Node/Express, testing (Jest), logging (Winston), and env configs.
