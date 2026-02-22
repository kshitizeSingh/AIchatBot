# AI FAQ Platform — Chat & Orchestration Service
## Complete Technical Documentation & Implementation Guide

| Version | Date | Status | Author |
|---------|------|--------|--------|
| 1.1.0 | Feb 22, 2026 | Updated — Centralized Auth | Platform Team |
| 1.0.0 | Feb 22, 2026 | Initial Draft | Platform Team |

> **Document Purpose**
> This document provides the complete specification, auth integration design, Pinecone namespace strategy, API contract, data model, implementation approach, and operational guidance for the Chat & Orchestration Service — the RAG pipeline that powers the AI FAQ chatbot. It must be read alongside the Auth Service implementation guide and AI Processing Service implementation plan before any code is written.

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Authentication & Authorization Integration](#2-authentication--authorization-integration)
3. [Pinecone Namespace Strategy](#3-pinecone-namespace-strategy)
4. [RAG Pipeline — Detailed Flow](#4-rag-pipeline--detailed-flow)
5. [API Reference](#5-api-reference)
6. [Database Schema](#6-database-schema)
7. [Service Structure & Implementation Approach](#7-service-structure--implementation-approach)
8. [Environment Variables](#8-environment-variables)
9. [Dependencies](#9-dependencies)
10. [Observability](#10-observability)
11. [Testing Strategy](#11-testing-strategy)
12. [Open Issues & Decisions Required](#12-open-issues--decisions-required)
13. [Operational Runbooks](#13-operational-runbooks)

---

## 1. Service Overview

The Chat & Orchestration Service is the runtime brain of the AI FAQ Platform. When an end-user sends a question, this service is responsible for understanding that question, finding relevant knowledge from the vector store, constructing a grounded prompt, generating a response via Ollama, persisting the conversation, and returning the answer with full provenance to the client.

### 1.1 Responsibilities

- Validate and authenticate every request using the same JWT + HMAC pattern used by all services in the platform
- Embed the user query using Ollama (`nomic-embed-text`) — the same model used during document ingestion
- Retrieve the top-K most relevant document chunks from Pinecone, scoped strictly to the requesting org's namespace
- Build a RAG-augmented system prompt from the retrieved context
- Generate a natural-language answer using Ollama (`llama3` or configurable model)
- Support both synchronous (JSON) and streaming (SSE) response modes
- Persist every user query and assistant response to PostgreSQL, with source provenance attached
- Manage multi-turn conversation history for contextual follow-up questions

### 1.2 Position in the Platform Architecture

The Chat & Orchestration Service is a downstream consumer. It does not write to Pinecone or S3 — those are the domain of the AI Processing Service. It reads from both Pinecone (vectors) and PostgreSQL (conversation history, user/org data for auth).

```
React Native / Web App
        │
        │  POST /v1/chat/query
        │  Headers: Authorization: Bearer <JWT>
        │           X-Client-ID: pk_...
        │           X-Timestamp: <unix_ms>
        │           X-Signature: <HMAC-SHA256>
        ▼
Chat & Orchestration Service (port 3003)
        │
        ├──► Auth validation (hybrid)
        │      ├─ JWT verified locally (jsonwebtoken, zero network)
        │      ├─ POST /v1/auth/validate-jwt  ──► Auth Service :3000
        │      ├─ POST /v1/auth/validate-hmac ──► Auth Service :3000
        │      └─ ORG_MISMATCH cross-check (both calls in parallel)
        │
        ├──► Embed query  ────────────► Ollama :11434/api/embeddings
        │                               model: nomic-embed-text
        │
        ├──► Retrieve context ─────────► Pinecone index: faq-platform
        │                               namespace: org_{org_id}
        │
        ├──► Build RAG prompt
        │
        ├──► Generate answer ──────────► Ollama :11434/api/chat
        │                               model: llama3 (configurable)
        │
        ├──► Persist messages ─────────► PostgreSQL: conversations, messages
        │
        └──► Return answer + sources to client
```

---

## 2. Authentication & Authorization Integration

> ⚠️ **v1.1 Change — Centralized Auth Service Pattern**
>
> The previous design (v1.0) validated JWT and HMAC entirely inside the Chat Service using a shared PostgreSQL connection. The updated design delegates validation to the Auth Service via its dedicated `/v1/auth/validate-jwt` and `/v1/auth/validate-hmac` endpoints (documented in `AUTH_VALIDATION_DOCS.md`). The Chat Service no longer reads the `organizations` or `users` tables directly. The **ORG_MISMATCH cross-check and circuit breaker** are retained and enforced in the middleware.

### 2.1 Architecture — Hybrid Validation Pattern

The Chat Service uses **Pattern 1** from the Auth Service validation docs: JWT is verified locally (fast, zero network cost), while HMAC is validated remotely via the Auth Service. Both remote calls run in parallel.

```
requireAuth middleware
        │
        ├─ [local]  jwt.verify(token, JWT_SECRET)      — signature check, no network
        │
        ├─ [remote, parallel] ──────────────────────────────────────────────────────
        │    ├─ POST AUTH_SERVICE_URL/v1/auth/validate-jwt   → { user_id, org_id, role }
        │    └─ POST AUTH_SERVICE_URL/v1/auth/validate-hmac  → { org_id, org_name }
        │         └─ wrapped in circuit breaker
        │
        ├─ ORG_MISMATCH cross-check
        │    jwt_response.org_id  ===  hmac_response.org_id  ?  proceed : 403
        │
        └─ inject req.user = { user_id, org_id, role }
                   req.org  = { org_id, org_name }
```

**Why parallel calls?** Running `validate-jwt` and `validate-hmac` concurrently with `Promise.all()` means total auth latency is `max(t_jwt, t_hmac)` instead of `t_jwt + t_hmac`, saving one full round-trip on every request.

---

### 2.2 Auth Service Endpoints Used

#### 2.2.1 POST /v1/auth/validate-jwt

Validates the JWT and returns `org_id` + `role` from a live DB lookup in the Auth Service. The Chat Service does **not** trust `org_id` or `role` from the raw JWT payload — they must come from this response.

**Request:**
```http
POST http://auth-service:3000/v1/auth/validate-jwt
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "valid": true,
  "user": {
    "user_id": "e83e8749-4e38-4f98-b4b1-0c4387105156",
    "org_id":  "a1b2c3d4-5e6f-7890-abcd-ef1234567890",
    "role":    "admin"
  }
}
```

**Failure Response (401):**
```json
{ "valid": false, "error": "Token expired" }
```

#### 2.2.2 POST /v1/auth/validate-hmac

Validates the HMAC signature and returns the `org_id` + `org_name` for the requesting organisation. No authentication required on this endpoint (service-to-service call, must be restricted to the internal network).

**Request:**
```http
POST http://auth-service:3000/v1/auth/validate-hmac
Content-Type: application/json

{
  "client_id": "pk_7f83efb20c8e4b14bd6a239c2f997f41",
  "signature": "a1b2c3d4e5f6...",
  "timestamp": "1738459200000",
  "payload": {
    "method": "POST",
    "path":   "/v1/chat/query",
    "body":   { "query": "How do I reset my password?" }
  }
}
```

**Success Response (200):**
```json
{
  "valid":    true,
  "org_id":   "a1b2c3d4-5e6f-7890-abcd-ef1234567890",
  "org_name": "Publicis Sapient"
}
```

**Failure Response (401):**
```json
{ "valid": false, "error": "Invalid signature" }
```

---

### 2.3 Required Client Headers

| Header | Example | Description |
|--------|---------|-------------|
| `Authorization` | `Bearer eyJhbGc...` | JWT access token. Algorithm HS256, contains only `user_id` and `type: "access"` |
| `X-Client-ID` | `pk_abc123...` | Plain-text `client_id` issued at org registration |
| `X-Timestamp` | `1737388800000` | Unix timestamp in **milliseconds**. Must be within ±5 minutes of server time |
| `X-Signature` | `a3f2d1...hex...` | HMAC-SHA256 hex digest — computed by the client SDK |

---

### 2.4 Full Auth Middleware Flow (`requireAuth`)

```javascript
async function requireAuth(req, res, next) {

  // ── Step 1: Header presence ──────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const clientId   = req.headers['x-client-id'];
  const timestamp  = req.headers['x-timestamp'];
  const signature  = req.headers['x-signature'];

  if (!authHeader.startsWith('Bearer '))
    return res.status(401).json({ code: 'MISSING_AUTH_HEADER' });
  if (!clientId || !timestamp || !signature)
    return res.status(401).json({ code: 'MISSING_HMAC_HEADERS' });

  // ── Step 2: Timestamp freshness (local — saves a network round-trip) ─────
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > 300_000)
    return res.status(401).json({ code: 'HMAC_TIMESTAMP_EXPIRED' });

  // ── Step 3: Local JWT signature verification (fast, no network) ──────────
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.type !== 'access')
      return res.status(401).json({ code: 'INVALID_TOKEN' });
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN';
    return res.status(401).json({ code });
  }

  // ── Step 4: Remote validations IN PARALLEL ───────────────────────────────
  const [jwtUser, hmacOrg] = await Promise.all([
    // Returns { user_id, org_id, role } from Auth Service DB lookup
    remoteValidateJWT(rawToken),

    // Returns { org_id, org_name } — wrapped in circuit breaker
    remoteValidateHMAC({ clientId, signature, timestamp,
                         method: req.method, path: req.path, body: req.body }),
  ]);

  // ── Step 5: ORG_MISMATCH cross-check ─────────────────────────────────────
  // JWT says which org the USER belongs to.
  // HMAC says which org sent THIS REQUEST.
  // They must match — a mismatch means a cross-tenant access attempt.
  if (jwtUser.org_id !== hmacOrg.org_id)
    return res.status(403).json({ code: 'ORG_MISMATCH' });

  // ── Step 6: Inject context ────────────────────────────────────────────────
  req.user = { user_id: jwtUser.user_id, org_id: hmacOrg.org_id, role: jwtUser.role };
  req.org  = { org_id: hmacOrg.org_id, org_name: hmacOrg.org_name };
  next();
}
```

---

### 2.5 Circuit Breaker (Auth Service Resilience)

The `validate-hmac` call is wrapped in a circuit breaker to prevent cascade failures when the Auth Service is unavailable. Auth rejections (4xx) do **not** count as failures — only infrastructure failures (5xx, no response) open the circuit.

| State | Behaviour |
|-------|-----------|
| `CLOSED` (normal) | All requests pass through to Auth Service |
| `OPEN` (tripped) | Returns `503 AUTH_SERVICE_UNAVAILABLE` immediately — no HTTP call made |
| `HALF_OPEN` (recovery probe) | One request allowed through; success closes circuit, failure re-opens it |

Circuit opens after **5 consecutive infrastructure failures** and attempts recovery after **60 seconds**.

---

### 2.6 Error Codes

| HTTP | `code` | Cause |
|------|--------|-------|
| 401 | `MISSING_AUTH_HEADER` | `Authorization` header absent or not `Bearer ` |
| 401 | `MISSING_HMAC_HEADERS` | One or more of `X-Client-ID`, `X-Timestamp`, `X-Signature` absent |
| 401 | `HMAC_TIMESTAMP_EXPIRED` | `X-Timestamp` outside ±5 minute window |
| 401 | `EXPIRED_TOKEN` | JWT has passed its `exp` claim |
| 401 | `INVALID_TOKEN` | JWT signature invalid, malformed, or `type ≠ "access"` |
| 401 | `INVALID_CLIENT_ID` | No org found for provided `client_id` |
| 401 | `INVALID_SIGNATURE` | HMAC signature does not match |
| 403 | `ORG_MISMATCH` | JWT user's org differs from HMAC org — cross-tenant attempt blocked |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | Circuit breaker open; Auth Service is down |

---

### 2.7 Authorization Matrix for Chat Endpoints

| Endpoint | owner | admin | user | Public |
|----------|-------|-------|------|--------|
| `POST /v1/chat/query` | ✅ | ✅ | ✅ | ❌ |
| `POST /v1/chat/conversations` | ✅ | ✅ | ✅ | ❌ |
| `GET /v1/chat/conversations` | ✅ | ✅ | ✅ (own) | ❌ |
| `GET /v1/chat/conversations/:id/messages` | ✅ | ✅ | ✅ (own) | ❌ |
| `DELETE /v1/chat/conversations/:id` | ✅ | ✅ | ✅ (own) | ❌ |
| `GET /health` | ✅ | ✅ | ✅ | ✅ |
| `GET /ready` | ✅ | ✅ | ✅ | ✅ |
| `GET /metrics` | ✅ | ✅ | ✅ | ✅ |

---

## 3. Pinecone Namespace Strategy

The Chat & Orchestration Service queries Pinecone using the **exact same namespace format** that the AI Processing Service uses when upserting vectors. Any mismatch here means zero results will be returned at query time.

### 3.1 Canonical Namespace Format

```
org_{org_id}

Example:  org_550e8400-e29b-41d4-a716-446655440000
```

This is established in the AI Processing Service plan and must not be changed without coordinating updates to both services. The namespace ensures complete data isolation — an organisation can only ever query their own vectors, even if the Pinecone API key were compromised.

---

### 3.2 Vector Structure (as written by AI Processing Service)

```javascript
// Index name: faq-platform  (env var: PINECONE_INDEX_NAME)
// Namespace:  org_{org_id}
// Vector ID:  {document_id}_{chunk_index}

{
  id: 'doc-uuid_0',
  values: [0.123, 0.456, ..., 0.789],  // 768 floats (nomic-embed-text)
  metadata: {
    document_id: 'doc-uuid',
    org_id:      'org-uuid',
    chunk_index: 0,
    total_chunks: 5,
    text:        'The actual chunk text used for generation context',
    filename:    'user-guide.pdf',
    uploaded_at: '2025-01-28T10:00:00Z'
  }
}
```

---

### 3.3 Query Construction

```javascript
// In the Chat & Orchestration Service:
const namespace = `org_${orgId}`;            // Must match ingestion

const response = await pineconeIndex
  .namespace(namespace)
  .query({
    vector:          queryEmbedding,          // 768-dim float array
    topK:            5,                       // env: RAG_TOP_K
    includeMetadata: true,
    // Optional: restrict to a single document
    filter: documentId
      ? { document_id: { $eq: documentId } }
      : undefined
  });

// Each match has:
//   match.id        → "{document_id}_{chunk_index}"
//   match.score     → cosine similarity [0.0 – 1.0]
//   match.metadata  → { text, filename, document_id, chunk_index, ... }
```

---

### 3.4 Critical Alignment Requirements

| Parameter | AI Processing Service | Chat Service (must match) |
|-----------|----------------------|--------------------------|
| Embedding model | `nomic-embed-text` | `nomic-embed-text` |
| Embedding dimensions | `768` | `768` |
| Pinecone index name | `faq-platform` | `faq-platform` |
| Namespace format | `org_{org_id}` | `org_{org_id}` |
| Similarity metric | `cosine` | `cosine` (index-level) |
| Metadata key for text | `text` | `metadata.text` |

---

## 4. RAG Pipeline — Detailed Flow

### 4.1 End-to-End Request Flow

```
POST /v1/chat/query
  Body: { query, conversation_id?, options? }

1.  Auth middleware (JWT + HMAC)  →  req.user = { user_id, org_id, role }

2.  Resolve conversation
    ├─ If conversation_id provided:
    │    SELECT * FROM conversations WHERE id=$1 AND org_id=$2
    │    404 if not found (never leak other orgs' conversation IDs)
    └─ If null: INSERT INTO conversations → new conversation_id

3.  Load history
    SELECT role, content FROM messages
    WHERE conversation_id=$1  (org_id enforced via conversations join)
    ORDER BY created_at ASC LIMIT 50
    Prune to last 10 turns for context window management

4.  Embed query
    POST http://ollama:11434/api/embeddings
    Body: { model: "nomic-embed-text", prompt: query }
    Response: { embedding: float[768] }
    Validate: length must equal EMBEDDING_DIMENSIONS (768)

5.  Retrieve context
    Pinecone .namespace("org_{org_id}").query({
      vector: queryEmbedding, topK: 5, includeMetadata: true
    })
    Filter: match.score >= RAG_MIN_SCORE (default 0.3)
    Map to: { text, score, filename, document_id, chunk_index }

6.  Build context string
    Join passages into one string, budget: RAG_MAX_CONTEXT_TOKENS * 4 chars
    "[Source: filename | Score: 0.92]\nChunk text...\n\n"
    Collect sources array for provenance

7.  Build RAG system prompt
    base_system_prompt + "\n\nKNOWLEDGE BASE CONTEXT:\n" + contextStr
    If no context: append "No relevant context found" notice

8.  Persist user message
    INSERT INTO messages (conversation_id, org_id, role="user", content)

9.  Generate answer
    POST http://ollama:11434/api/chat
    Body: { model, messages: [system, ...history, user], stream: false|true }
    → stream=false: wait for full response
    → stream=true:  pipe NDJSON to client via SSE

10. Persist assistant message
    INSERT INTO messages (conversation_id, org_id, role="assistant",
                          content, sources, model, tokens_used)

11. Return
    { conversation_id, message_id, answer, sources, usage, duration_ms }
```

---

### 4.2 Graceful Degradation

If the Pinecone retrieval step fails (timeout, network error, index unavailable), the service must **NOT** fail the request. Instead it logs the error, sets `contextStr = ""` and `sources = []`, builds the no-context system prompt, and proceeds to generation. This ensures the chatbot stays available even if the vector store has issues.

---

### 4.3 Streaming (SSE) Response

When `options.stream = true`, the service returns `text/event-stream`. Events are delivered in this order:

```
event: sources
data: { "sources": [...], "conversation_id": "uuid" }

event: token
data: { "token": "Go" }

event: token
data: { "token": " to" }

... (one event per token from Ollama)

event: done
data: { "conversation_id": "uuid", "answer": "full text", "usage": {...} }
```

The assistant message is persisted after the stream ends (in the `done` callback), not before, so that the full text is available.

---

## 5. API Reference

### 5.1 POST /v1/chat/query

Main RAG endpoint.

**Request**

```http
POST /v1/chat/query
Authorization:  Bearer <access_token>
X-Client-ID:    pk_...
X-Timestamp:    1737388800000
X-Signature:    <hmac_hex>
Content-Type:   application/json

{
  "query":           "How do I reset my password?",
  "conversation_id": "uuid-or-null",
  "options": {
    "top_k":       5,
    "min_score":   0.3,
    "document_id": "uuid",
    "temperature": 0.7,
    "max_tokens":  1024,
    "stream":      false
  }
}
```

**Response (200 — non-streaming)**

```json
{
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "message_id":      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "answer":          "To reset your password, go to Settings → Security...",
  "sources": [
    {
      "filename":    "user-guide.pdf",
      "document_id": "uuid",
      "chunk_index": 2,
      "score":       0.91
    }
  ],
  "usage": {
    "model":             "llama3",
    "prompt_tokens":     320,
    "completion_tokens": 87
  },
  "duration_ms": 1842
}
```

**Error Responses**

| HTTP | `error_code` | Cause |
|------|-------------|-------|
| 400 | `INVALID_REQUEST` | `query` missing or not a string |
| 400 | `QUERY_TOO_LONG` | `query` exceeds 2000 characters |
| 401 | `MISSING_HMAC_HEADERS` | `X-Client-ID`, `X-Timestamp`, or `X-Signature` missing |
| 401 | `EXPIRED_REQUEST` | `X-Timestamp` more than 5 minutes old |
| 401 | `INVALID_CLIENT_ID` | No org found for that `client_id` hash |
| 401 | `INVALID_SIGNATURE` | HMAC signature does not match |
| 401 | `MISSING_AUTH_HEADER` | `Authorization` header absent |
| 401 | `EXPIRED_TOKEN` | JWT has passed its `exp` claim |
| 401 | `INVALID_TOKEN` | JWT signature invalid or `type ≠ "access"` |
| 403 | `ORG_MISMATCH` | JWT user's `org_id` does not match HMAC `org_id` |
| 404 | `CONVERSATION_NOT_FOUND` | `conversation_id` does not exist for this org |
| 429 | `RATE_LIMITED` | Exceeded 30 requests/minute per org |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### 5.2 Conversation Management Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/conversations` | Create a new conversation (no message needed) |
| `GET` | `/v1/chat/conversations` | List user's conversations. Supports `?limit=20&offset=0` |
| `GET` | `/v1/chat/conversations/:id/messages` | Get all messages in a conversation. Org-scoped. |
| `DELETE` | `/v1/chat/conversations/:id` | Delete conversation + all messages (CASCADE). Org-scoped. |

**GET /v1/chat/conversations — Response**

```json
{
  "conversations": [
    {
      "id":           "uuid",
      "title":        "Password reset help",
      "created_at":   "2026-02-22T10:00:00Z",
      "updated_at":   "2026-02-22T10:05:00Z",
      "last_message": "To reset your password..."
    }
  ],
  "pagination": {
    "total":    42,
    "limit":    20,
    "offset":   0,
    "has_more": true
  }
}
```

**GET /v1/chat/conversations/:id/messages — Response**

```json
{
  "conversation_id": "uuid",
  "messages": [
    {
      "id":          "uuid",
      "role":        "user",
      "content":     "How do I reset my password?",
      "sources":     [],
      "model":       null,
      "tokens_used": null,
      "created_at":  "2026-02-22T10:00:00Z"
    },
    {
      "id":          "uuid",
      "role":        "assistant",
      "content":     "To reset your password, go to Settings → Security...",
      "sources":     [{ "filename": "user-guide.pdf", "document_id": "uuid", "chunk_index": 2, "score": 0.91 }],
      "model":       "llama3",
      "tokens_used": 87,
      "created_at":  "2026-02-22T10:00:02Z"
    }
  ],
  "total": 2
}
```

---

## 6. Database Schema

The Chat & Orchestration Service owns two tables: `conversations` and `messages`. Both include `org_id` for multi-tenant isolation and join cleanly with the existing `users` and `organizations` tables created by the Auth Service.

```sql
-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── conversations ────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID         NOT NULL
                            REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  metadata     JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_conversations_org_user
  ON conversations (org_id, user_id, updated_at DESC);

-- ── messages ─────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID         NOT NULL
                               REFERENCES conversations(id) ON DELETE CASCADE,
  org_id           UUID         NOT NULL,  -- denormalised for fast org-scoping
  role             TEXT         NOT NULL
                               CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT         NOT NULL,
  sources          JSONB        NOT NULL DEFAULT '[]',
  model            TEXT,
  tokens_used      INT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation
  ON messages (conversation_id, created_at ASC);

CREATE INDEX idx_messages_org
  ON messages (org_id, created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 6.1 `sources` JSONB Shape

Each assistant message stores the Pinecone passages that grounded its answer:

```json
[
  {
    "filename":    "user-guide.pdf",
    "document_id": "uuid",
    "chunk_index": 2,
    "score":       0.91
  },
  {
    "filename":    "faq.pdf",
    "document_id": "uuid",
    "chunk_index": 0,
    "score":       0.87
  }
]
```

---

## 7. Service Structure & Implementation Approach

### 7.1 Folder Structure

```
chat-orchestration-service/
├── src/
│   ├── config/
│   │   ├── index.js               # All env vars — validated at startup
│   │   ├── database.js            # PostgreSQL pool (shared auth + chat tables)
│   │   └── pinecone.js            # Pinecone client singleton
│   ├── middleware/
│   │   ├── auth.js                # requireAuth: local JWT + remote validate-jwt/hmac (§2.4)
│   │   └── errorHandler.js        # Global Express error handler
│   ├── services/
│   │   ├── embeddingService.js    # Query embedding via Ollama
│   │   ├── retrievalService.js    # Pinecone query + score filtering
│   │   ├── generationService.js   # Ollama chat API, streaming + non-streaming
│   │   ├── conversationService.js # Conversation + message DB CRUD
│   │   └── orchestrationService.js # Main RAG pipeline (coordinates all above)
│   ├── routes/
│   │   ├── chat.js                # All /v1/chat/* endpoints
│   │   ├── health.js              # /health (liveness), /ready (readiness)
│   │   └── metrics.js             # /metrics (Prometheus)
│   ├── utils/
│   │   ├── logger.js              # Winston JSON logger with secret redaction
│   │   └── retry.js               # Exponential backoff with jitter
│   └── index.js                   # Express app + graceful shutdown
├── migrations/
│   └── 001_create_chat_tables.sql
├── tests/
│   └── unit/
│       ├── orchestrationService.test.js
│       ├── retrievalService.test.js
│       └── generationService.test.js
├── .env.example
├── Dockerfile
├── docker-compose.dev.yml
└── package.json
```

---

### 7.2 Implementation Phases

| Phase | Days | Milestone | Deliverables |
|-------|------|-----------|-------------|
| 0 | 0.5 | Project scaffolding | Repo, ESLint, Husky, `.env.example`, base folder structure |
| 1 | 1 | Config + logger + DB pool | All env vars validated at startup; Winston logger; PG pool; service boots cleanly |
| 2 | 2 | Auth middleware | `requireAuth`: local JWT verify + parallel `validate-jwt`/`validate-hmac` calls + `ORG_MISMATCH` guard + circuit breaker — all with unit tests |
| 3 | 1 | Pinecone + embedding | `embeddingService` (Ollama), `retrievalService` (Pinecone), dimension validation, unit tests |
| 4 | 1.5 | Generation service | `generationService`: non-streaming + SSE streaming, RAG prompt builder, retry logic |
| 5 | 1 | Conversation CRUD | `conversationService`: create/get/list/delete conversations, save/get messages, `pruneHistory` |
| 6 | 1 | Orchestration pipeline | `orchestrationService.chat()`: full 11-step flow, graceful degradation, streaming callback |
| 7 | 1 | Routes + rate limiting | All `/v1/chat/*` routes, error handling, rate limiter, health/ready/metrics endpoints |
| 8 | 2 | Testing + packaging | >80% unit coverage, integration E2E with docker-compose, Dockerfile, performance gate |

---

### 7.3 Service Interaction Map

```
requireAuth (middleware)
  │
  ├── jwt.verify() locally
  ├── [parallel] authService.validateJWT()    → Auth Service :3000
  └── [parallel] authService.validateHMAC()   → Auth Service :3000 (circuit breaker)

orchestrationService.chat()
  │
  ├── conversationService.getConversation()       → PostgreSQL
  ├── conversationService.createConversation()    → PostgreSQL
  ├── conversationService.getMessages()           → PostgreSQL
  ├── conversationService.pruneHistory()          → in-memory
  │
  ├── embeddingService.embedQuery()               → Ollama /api/embeddings
  │
  ├── retrievalService.retrieveContext()          → Pinecone .namespace(org_{org_id}).query()
  ├── retrievalService.buildContextString()       → in-memory
  │
  ├── generationService.buildRagPrompt()          → in-memory
  ├── generationService.generateResponse()        → Ollama /api/chat
  │
  ├── conversationService.saveMessage(user)       → PostgreSQL
  └── conversationService.saveMessage(assistant)  → PostgreSQL
```

---

## 8. Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | `development` \| `staging` \| `production` |
| `PORT` | `3003` | HTTP listen port |
| `JWT_SECRET` | **required** | ⚠️ Must match Auth Service `JWT_SECRET` exactly — used for local JWT signature verification |
| `AUTH_SERVICE_URL` | `http://auth-service:3000` | ⚠️ Internal URL of the Auth Service. Never expose `validate-hmac` publicly |
| `AUTH_HMAC_TIMEOUT_MS` | `5000` | Timeout for calls to Auth Service endpoints |
| `HMAC_TIMESTAMP_TOLERANCE_MS` | `300000` | Replay attack window — reject requests older than this (5 min) |
| `AUTH_CB_FAILURE_THRESHOLD` | `5` | Circuit breaker — opens after this many consecutive infra failures |
| `AUTH_CB_RECOVERY_MS` | `60000` | Circuit breaker — retry after this ms once OPEN (1 min) |
| `DATABASE_URL` | **required** | PostgreSQL — owns `conversations` and `messages` tables only |
| `DB_POOL_MAX` | `10` | PostgreSQL connection pool size |
| `PINECONE_API_KEY` | **required** | Pinecone API key |
| `PINECONE_INDEX_NAME` | `faq-platform` | Must match AI Processing Service value |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | ⚠️ **Must match the model used during doc ingestion** |
| `EMBEDDING_DIMENSIONS` | `768` | ⚠️ **Must match Pinecone index dimensions** |
| `OLLAMA_GENERATION_MODEL` | `llama3` | Model for answer generation (`llama3`, `mistral`, `phi3`, etc.) |
| `OLLAMA_TIMEOUT_MS` | `60000` | Timeout for Ollama HTTP calls in ms |
| `RAG_TOP_K` | `5` | Number of Pinecone passages to retrieve per query |
| `RAG_MIN_SCORE` | `0.3` | Minimum cosine similarity to include a passage |
| `RAG_MAX_CONTEXT_TOKENS` | `3000` | Approx. token budget for context (1 token ≈ 4 chars) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms (per org) |
| `RATE_LIMIT_MAX` | `30` | Max requests per org per window |
| `RETRY_MAX_ATTEMPTS` | `3` | Max retry attempts for Ollama/Pinecone calls |
| `RETRY_BASE_MS` | `500` | Base delay for exponential backoff |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

> ⚠️ **v1.1 Change — Shared Database No Longer Required**
>
> In v1.0, `DATABASE_URL` had to point to the same PostgreSQL instance as the Auth Service so this service could read `organizations` and `users` directly. In v1.1 that coupling is removed — the Chat Service only owns `conversations` and `messages`. Auth lookups go through `AUTH_SERVICE_URL` instead. `JWT_SECRET` must still be shared for local JWT signature verification.

---

## 9. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | `^4.18.2` | HTTP server framework |
| `jsonwebtoken` | `^9.0.2` | Local JWT signature verification (shared secret with Auth Service) |
| `axios` | `^1.6.0` | HTTP calls to Auth Service (`validate-jwt`, `validate-hmac`) |
| `@pinecone-database/pinecone` | `^3.0.0` | Pinecone vector DB client |
| `node-fetch` | `^2.7.0` | HTTP calls to Ollama API |
| `pg` | `^8.11.3` | PostgreSQL client for `conversations` + `messages` tables |
| `helmet` | `^7.1.0` | Security headers |
| `express-rate-limit` | `^7.1.5` | Per-org rate limiting |
| `prom-client` | `^15.1.0` | Prometheus metrics exposition |
| `uuid` | `^9.0.0` | UUID generation |
| `winston` | `^3.11.0` | Structured JSON logging |
| `dotenv` | `^16.3.1` | Environment variable loading |
| `jest` *(dev)* | `^29.7.0` | Test runner |
| `supertest` *(dev)* | `^6.3.4` | HTTP integration testing |
| `nodemon` *(dev)* | `^3.0.2` | Dev hot-reload |

> **v1.1 Change:** `axios` is now a runtime dependency — required for the two Auth Service calls in `requireAuth`. `pg` is still required for the `conversations` and `messages` tables, but no longer used for org/user lookups (those go through Auth Service). The old `HMAC_SECRET` env var and direct crypto HMAC computation inside this service are removed.

---

## 10. Observability

### 10.1 Prometheus Metrics

| Metric | Type | Labels / Notes |
|--------|------|----------------|
| `chat_requests_total` | Counter | `status`: `success` \| `error` |
| `chat_duration_seconds` | Histogram | Buckets: 0.1, 0.5, 1, 2, 5, 10, 20, 30 |
| `retrieval_passages_count` | Histogram | Number of passages returned by Pinecone per query |
| `ollama_tokens_total` | Counter | `type`: `prompt` \| `completion` |
| `retrieval_failures_total` | Counter | Pinecone errors (graceful fallback triggered) |
| `generation_failures_total` | Counter | Ollama errors after all retries exhausted |

### 10.2 Health Endpoints

| Endpoint | Auth | Checks |
|----------|------|--------|
| `GET /health` | None | Liveness: process is up (200 always if app started) |
| `GET /ready` | None | Readiness: PostgreSQL (`SELECT 1`), Pinecone (`describeIndexStats`), Ollama (`GET /api/tags`). Returns 503 if any fail. |
| `GET /metrics` | None (internal) | Prometheus metrics scrape endpoint |

### 10.3 Alerting Thresholds

- Error rate > 5% over 5 minutes → **Warning**
- Error rate > 10% over 5 minutes → **Critical**
- `chat_duration_seconds` p95 > 10s → **Warning**
- `retrieval_failures_total` increasing → Pinecone degraded
- `generation_failures_total` increasing → Ollama overloaded

### 10.4 Structured Log Fields

Every log entry includes these fields where applicable:

```json
{
  "level":           "info",
  "timestamp":       "2026-02-22T10:00:00.000Z",
  "service":         "chat-orchestration-service",
  "org_id":          "uuid",
  "user_id":         "uuid",
  "conversation_id": "uuid",
  "stage":           "retrieval",
  "duration_ms":     142,
  "passages_count":  4
}
```

Secrets (`JWT_SECRET`, `PINECONE_API_KEY`, `Authorization` header values) are always redacted before logging.

---

## 11. Testing Strategy

### 11.1 Unit Tests (Jest)

| Module | Key Scenarios |
|--------|--------------|
| `auth middleware` | Missing headers (JWT + all three HMAC headers), stale timestamp, expired JWT, malformed JWT, refresh token rejected, `validate-jwt` returns invalid, `validate-hmac` returns invalid (signature + client_id), `ORG_MISMATCH` (JWT org ≠ HMAC org), circuit breaker opens after 5 infra failures, circuit breaker does NOT open on 401s, valid request injects `req.user` + `req.org`, both remote calls fired in parallel |
| `embeddingService` | Successful embedding, Ollama 500 → retry, dimension mismatch throws, empty text throws |
| `retrievalService` | Namespace = `org_{org_id}`, score filter, `document_id` filter, empty matches, `orgId` required |
| `generationService` | `buildRagPrompt` with/without context, non-streaming response, Ollama error throws, history included in messages |
| `orchestrationService` | Creates new conversation if null, uses existing, 404 on wrong org, retrieval failure → graceful fallback, persists user + assistant messages, returns sources |
| `conversationService` | Create/get/list/delete scoped by `org_id`, `pruneHistory` trims to N turns |

### 11.2 Integration & E2E Tests

- Docker Compose with PostgreSQL + Ollama (or mock) + real Pinecone sandbox
- `POST /v1/chat/query` with valid JWT + HMAC → 200 with answer and sources
- `POST /v1/chat/query` with wrong org → 403 `ORG_MISMATCH`
- `POST /v1/chat/query` with expired JWT → 401 `EXPIRED_TOKEN`
- Streaming: SSE events arrive in correct order (`sources` → `token` × N → `done`)
- Conversation persisted and retrievable via `GET /v1/chat/conversations/:id/messages`

### 11.3 Performance Gates

| Metric | Target |
|--------|--------|
| Single query end-to-end (no stream) | < 5s typical |
| Embedding latency (Ollama) | < 500ms |
| Pinecone query latency | < 300ms |
| Memory per worker | < 256MB |

### 11.4 Coverage Targets

| Test Type | Lines | Branches |
|-----------|-------|----------|
| Unit | > 80% | > 75% |
| Integration / E2E | All critical paths | — |

---

## 12. Open Issues & Decisions Required

| # | Issue | Decision Needed / Notes |
|---|-------|------------------------|
| 1 | ~~Auth middleware placement: in-service vs API Gateway~~ | **Resolved (v1.1)** — Middleware stays in-service. Auth Service provides validation endpoints; no API Gateway dependency required. |
| 2 | ~~Shared database vs service-to-service call for user lookup~~ | **Resolved (v1.1)** — Now uses `POST /v1/auth/validate-jwt` for org/role lookup. Chat Service no longer reads `organizations` or `users` tables directly. Schema coupling removed. |
| 3 | Conversation ownership — user-scoped vs org-scoped | Admin users can currently only see their own conversations. Should `admin`/`owner` roles be able to see all conversations in the org for support purposes? |
| 4 | Context window management strategy | Currently prunes history to last 10 messages. Smarter strategies (sliding window, summary, token counting) may be needed for long conversations. |
| 5 | Kafka event publishing for chat messages | Architecture doc lists a `kafka.topicChatCreated`. Is the chat service expected to publish events? If so, what downstream service consumes them? |
| 6 | Pinecone vector deletion on document delete | When a document is deleted via the Content Service, the Pinecone vectors for that document (`namespace: org_{org_id}`, id prefix `{document_id}_*`) must also be deleted. Confirm whether this is the Content Service's or AI Processing Service's responsibility — the Chat Service does not handle it. |
| 7 | `validate-hmac` network exposure | Auth Service docs mark this endpoint as having no auth (service-to-service). Must confirm it is bound to internal network only and not reachable via the public API gateway. |

---

## 13. Operational Runbooks

### Ollama model not loaded

**Symptom:** 400/404 from Ollama on embedding or generation requests

**Check:** `GET http://ollama:11434/api/tags` — confirm `nomic-embed-text` and `llama3` are listed

**Fix:**
```bash
ollama pull nomic-embed-text
ollama pull llama3
```

Then restart the chat service or wait for the retry mechanism (3 attempts, exponential backoff).

---

### Pinecone dimension mismatch

**Symptom:** Pinecone returns 400, or embedding service throws `"Embedding dimension mismatch"`

**Check:** `EMBEDDING_DIMENSIONS` env var vs the Ollama model's actual output dimensions

**Fix:** Ensure `OLLAMA_EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` are consistent with:
- The Pinecone index configuration (set at index creation time, cannot be changed)
- The AI Processing Service's env vars (must use the same model for ingestion and query)

---

### Zero retrieval results (passages_count always 0)

**Symptom:** All responses say "No relevant context found" regardless of query

**Check 1:** Confirm the AI Processing Service has successfully indexed documents (`status = completed` in `documents` table)

**Check 2:** Confirm namespace format — the `org_id` in the query namespace must exactly match the `org_id` used during indexing

**Check 3:** Lower `RAG_MIN_SCORE` (e.g. to `0.1`) temporarily to see if low-score results appear

**Check 4:** Confirm `OLLAMA_EMBEDDING_MODEL` is identical in both services — a model mismatch produces incompatible vector spaces

---

### ORG_MISMATCH errors for legitimate users

**Symptom:** Real users getting `403 ORG_MISMATCH`

**Likely cause:** User's JWT was issued for one org but the `X-Client-ID` belongs to a different org (misconfigured SDK, or user logged into the wrong app instance)

**Investigate:** Check logs for these fields on the `ORG_MISMATCH` warn entry:
- `user_id` — which user triggered it
- `jwt_org_id` — which org the JWT/user belongs to (from `validate-jwt` response)
- `hmac_org_id` — which org the `X-Client-ID` belongs to (from `validate-hmac` response)

If `jwt_org_id` and `hmac_org_id` differ, the client is sending credentials from two different orgs — fix the SDK configuration, not the server.

> ⚠️ Never bypass the `org_id` cross-check — it is a security boundary, not a bug.

---

### High generation latency (chat_duration_seconds p95 > 10s)

**Symptom:** Queries taking >10s end-to-end

**Check 1:** Is Ollama running on CPU instead of GPU? Check `ollama ps` for the model's memory type

**Check 2:** Is `OLLAMA_MAX_CONCURRENCY` set too high, causing resource contention?

**Check 3:** Is the context window too large? Lower `RAG_TOP_K` or `RAG_MAX_CONTEXT_TOKENS`

**Check 4:** Consider switching to a smaller/faster generation model (e.g. `phi3` instead of `llama3`) for latency-sensitive paths

---

### Auth Service unavailable (circuit breaker open)

**Symptom:** All requests returning `503 AUTH_SERVICE_UNAVAILABLE`; circuit breaker log entry shows `state: OPEN`

**Check 1:** `GET http://auth-service:3000/health` — confirm Auth Service is up

**Check 2:** Check Auth Service logs for errors (`docker logs auth-service`)

**Check 3:** Check network connectivity between Chat Service and Auth Service containers

**Recovery:** Circuit breaker automatically retries after `AUTH_CB_RECOVERY_MS` (default 60 seconds). Once the Auth Service responds successfully, the breaker closes and normal traffic resumes with no restart needed.

**Tuning:** If the Auth Service has intermittent slowness rather than being fully down, increase `AUTH_HMAC_TIMEOUT_MS` or `AUTH_CB_FAILURE_THRESHOLD` to be less aggressive about opening the circuit.

---

*AI FAQ Platform — Chat & Orchestration Service Documentation — v1.1.0 — Feb 2026*
