# AI FAQ Platform - Final Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Authentication Strategy](#authentication-strategy)
3. [Architecture Components](#architecture-components)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [Data Flow](#data-flow)
6. [Database Schema](#database-schema)
7. [Implementation Guide](#implementation-guide)
8. [Deployment Strategy](#deployment-strategy)

---

## System Overview

### Architecture Diagram Summary

```
┌─────────────────────────────────────────────────────────┐
│          React Native Applications                      │
│  ┌──────────────────┐        ┌──────────────────┐      │
│  │ Admin Interface  │        │   User SDK       │      │
│  │ - Login/Register │        │   - Chat UI      │      │
│  │ - File Upload    │        │                  │      │
│  └──────────────────┘        └──────────────────┘      │
└─────────────┬──────────────────────────┬───────────────┘
              │ JWT Token + HMAC         │ JWT + HMAC
              │                          │
┌─────────────┴──────────────────────────┴───────────────┐
│              API Gateway (Node.js)                      │
│  ┌────────────────────┐    ┌────────────────────────┐  │
│  │ JWT Validator      │    │ HMAC Validator         │  │
│  │ Middleware         │    │ Middleware             │  │
│  └────────────────────┘    └────────────────────────┘  │
└──────────────┬─────────────────────┬───────────────────┘
               │                     │
      ┌────────┼─────────┬───────────┼──────────┐
      ▼        ▼         ▼           ▼          ▼
┌──────────┐ ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────┐
│   Auth   │ │Content│ │Query │ │   AI     │ │Vector│
│ Service  │ │Service│ │Service│ │Processing│ │  DB  │
│ (Node.js)│ │(Node) │ │(Python)│ │(Python) │ │(Chroma)│
└──────────┘ └───┬───┘ └──────┘ └─────┬────┘ └──────┘
                 │                    │
                 │    ┌───────────┐   │
                 └────►  Kafka/   ◄───┘
                      │ RabbitMQ  │
                      │    +      │
                      │   DLQ     │
                      └───────────┘
```

### Key Design Decisions

1. **React Native for Both Interfaces**: Single codebase for admin and consumer apps
2. **Dual Authentication**: JWT + HMAC for maximum security
3. **Event-Driven**: Kafka/RabbitMQ for asynchronous document processing
4. **Microservices**: Independent services with clear boundaries
5. **Vector Database**: ChromaDB for semantic search capabilities

---

## Authentication Strategy

### Organization Registration Flow

**Step 1: Register Organization (via Postman/API)**
```http
POST /v1/org/register
Content-Type: application/json

{
  "org_name": "ACME Corporation",
  "admin_email": "admin@acme.com"
}

Response:
{
  "org_id": "uuid",
  "org_name": "ACME Corporation",
  "client_id": "pk_a4f3c2e1d8b9...",
  "client_secret": "sk_x9w8v7u6t5s4..."  // ⚠️ Save immediately
}
```

**Step 2: Set HMAC in Environment**
```javascript
// Store in secure environment variables
REACT_APP_CLIENT_ID=pk_a4f3c2e1d8b9...
REACT_APP_CLIENT_SECRET=sk_x9w8v7u6t5s4...
```

**Step 3: Register User for Organization**
```http
POST /v1/auth/signup
Content-Type: application/json
X-Client-ID: pk_a4f3c2e1d8b9...
X-Signature: <HMAC signature>

{
  "email": "user@acme.com",
  "password": "SecurePass123!",
  "org_id": "uuid"
}
```

**Step 4: Convert User to Admin**
```http
POST /v1/convert-user-to-admin
Authorization: Bearer <admin-jwt-token>
X-Client-ID: pk_a4f3c2e1d8b9...
X-Signature: <HMAC signature>

{
  "user_id": "uuid",
  "role": "admin"
}

Note: Only existing admin can convert users to admin
```

### Authentication Mechanisms

#### For Admin Interface (React Native)
- **Method**: JWT Token + HMAC
- **Flow**:
  1. Admin logs in → receives JWT access token
  2. React Native app includes token in Authorization header
  3. API Gateway validates JWT signature AND HMAC
  4. Extracts `tenant_id` and `role` from DB based on `user_id`
  5. Middleware checks `role = 'admin'` or `role = 'owner'`
  6. Services scope operations to `tenant_id`
  7. Documents stored with tenant isolation

#### For User SDK (React Native)
- **Method**: JWT + HMAC
- **Flow**:
  1. Mobile app signs request with HMAC → POST /v1/chat/query
  2. API Gateway validates signature → Extracts `tenant_id`
  3. Query Service retrieves answer → Returns response

### Security Model

| User Type | Authentication | Endpoints | Permissions |
|-----------|---------------|-----------|-------------|
| **Organization** | Client ID + Secret (HMAC) | All endpoints | Tenant-scoped |
| **Admin User** | JWT + HMAC | Admin + User endpoints | Write access |
| **Regular User** | JWT + HMAC | User endpoints only | Read-only |

---

## Architecture Components

### 1. API Gateway (Node.js)

**Responsibilities:**
- Request routing
- Rate limiting (1000 req/min per tenant)
- CORS handling
- JWT validation
- HMAC validation
- Tenant context injection

**Technology Stack:**
- Runtime: Node.js/Express
- Middleware: JWT middleware, HMAC validator
- Rate Limiting: Redis

**Key Middleware:**
```javascript
// Combined JWT + HMAC Validation
app.use(async (req, res, next) => {
  // 1. Validate HMAC signature
  const isHmacValid = await validateHMAC(req);
  if (!isHmacValid) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }
  
  // 2. Validate JWT token
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing JWT token' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    
    // 3. Fetch tenant_id and role from database
    const userDetails = await db.query(
      'SELECT tenant_id, role FROM users WHERE id = $1',
      [decoded.user_id]
    );
    
    req.tenant_id = userDetails.rows[0].tenant_id;
    req.user_role = userDetails.rows[0].role;
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid JWT token' });
  }
});
```

### 2. Auth & Tenant Service (Node.js)

**Responsibilities:**
- Organization registration (returns client_id and client_secret)
- User authentication (signup/login)
- Tenant management
- Role management (convert user to admin)
- Access revocation
- Session management

**Database Tables:**
- `organizations` - Stores org details, client_id hash, client_secret hash
- `users` - Stores user credentials, org_id, role
- `sessions` - JWT refresh tokens
- `revoked_access` - Blacklisted tokens

**API Endpoints:**
```
POST   /v1/org/register           → Returns client_id & client_secret
POST   /v1/auth/signup            → User registration
POST   /v1/auth/login             → User authentication
POST   /v1/auth/refresh           → Refresh JWT token
POST   /v1/auth/logout            → Invalidate session
GET    /v1/user                   → Get user profile
POST   /v1/convert-user-to-admin  → Promote user (admin only)
POST   /v1/revoke-access          → Revoke user access (admin only)
```

### 3. Content Management Service (Node.js)

**Responsibilities:**
- Document upload (generates presigned S3 URL)
- Document metadata CRUD
- File validation
- Publishing events to Kafka/RabbitMQ queue
- Document status tracking

**Storage Strategy:**
- **Presigned URLs**: Client uploads directly to S3 using presigned URL
- **File Storage**: S3 buckets (or Docker volumes for local dev)
- **Metadata**: PostgreSQL

**API Endpoints:**
```
POST   /v1/documents/upload        → Generate presigned URL
GET    /v1/documents/:id/status    → Check processing status
DELETE /v1/documents/:id           → Delete document
GET    /v1/documents               → List documents
```

**Upload Flow:**
```
1. Client requests upload → POST /v1/documents/upload
2. Service generates presigned S3 URL (valid for 15 minutes)
3. Service stores metadata in PostgreSQL (status: 'pending')
4. Client uploads file directly to S3 using presigned URL
5. S3 triggers Lambda/webhook → Service updates status to 'uploaded'
6. Service publishes event to Kafka: 'document.uploaded'
```

### 4. Query Service / RAG QNA Tool (Python)

**Responsibilities:**
- Chat query handling
- Vector similarity search (ChromaDB)
- LLM prompt construction
- Response generation
- Source attribution
- RAG retrieval logic

**Technology Stack:**
- Runtime: Python/FastAPI
- Vector DB: ChromaDB
- LLM: Ollama (Llama 3.1 8B)
- Embeddings: sentence-transformers

**API Endpoints:**
```
POST   /v1/chat/query             → Send chat message
GET    /v1/chat/conversations     → List conversations
GET    /v1/chat/history/:id       → Get conversation history
WS     /v1/chat/stream            → WebSocket streaming
```

**RAG Pipeline:**
```python
1. Receive query from user
2. Generate query embedding (384-dim vector)
3. Search ChromaDB for top 5 similar chunks (cosine similarity > 0.7)
4. Construct context from retrieved chunks
5. Build prompt with system message + context + query
6. Send to LLM (Ollama/Llama 3.1)
7. Return answer with source attribution
```

### 5. AI Processing Service (Python)

**Responsibilities:**
- Consume events from Kafka/RabbitMQ
- Document parsing (PDF, DOCX, TXT, MD)
- Text chunking (1000 tokens, 200 overlap)
- Embedding generation (sentence-transformers)
- Vector indexing (ChromaDB)
- RAG logic implementation

**Technology Stack:**
- Runtime: Python
- Queue Consumer: Kafka consumer / Pika (RabbitMQ)
- Parsing: PyPDF2, python-docx
- Chunking: LangChain RecursiveCharacterTextSplitter
- Embeddings: sentence-transformers (all-MiniLM-L6-v2)
- Vector DB: ChromaDB

**Processing Pipeline:**
```
1. Listen to 'document.uploaded' topic
2. Download file from S3
3. Extract text based on file type:
   - PDF: PyPDF2
   - DOCX: python-docx
   - TXT/MD: Direct read
4. Chunk text with RecursiveCharacterTextSplitter
5. Generate embeddings for each chunk
6. Store in ChromaDB collection: tenant_{org_id}_knowledge
7. Update document status to 'completed'
8. On error → Send to DLQ (Dead Letter Queue)
```

### 6. Vector Database (ChromaDB)

**Purpose:** Semantic search and retrieval for RAG

**Collection Structure:**
```python
Collection name: f"tenant_{org_id}_knowledge"

Document structure:
{
  "id": f"{document_id}_{chunk_index}",
  "embedding": [384-dim vector],
  "metadata": {
    "document_id": "uuid",
    "org_id": "uuid",
    "chunk_index": 0,
    "text": "original chunk text",
    "filename": "guide.pdf",
    "uploaded_at": "2025-01-20T10:00:00Z"
  }
}
```

### 7. Message Queue (Kafka/RabbitMQ + DLQ)

**Topics/Queues:**
- `document.uploaded` - Published by Content Service
- `document.processed` - Published by AI Processing Service
- `document.failed` - Dead Letter Queue for failed processing

**Configuration:**
- **Kafka**: 3 partitions per topic, replication factor 2
- **RabbitMQ**: Durable queues with message acknowledgment
- **DLQ**: Retry logic (max 3 attempts) → Move to DLQ

---

## API Endpoints Reference

### Auth Service

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/v1/org/register` | None | Register organization (returns client_id/secret) |
| POST | `/v1/auth/signup` | HMAC | Create user account |
| POST | `/v1/auth/login` | HMAC | Authenticate user |
| POST | `/v1/auth/refresh` | Refresh Token | Get new access token |
| POST | `/v1/auth/logout` | JWT + HMAC | Invalidate session |
| GET | `/v1/user` | JWT + HMAC | Get user profile |
| POST | `/v1/convert-user-to-admin` | JWT + HMAC (Admin) | Promote user to admin |
| POST | `/v1/revoke-access` | JWT + HMAC (Admin) | Revoke user access |

### Content Management Service

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/v1/documents/upload` | JWT + HMAC (Admin) | Generate presigned S3 URL |
| GET | `/v1/documents/:id/status` | JWT + HMAC | Check document status |
| DELETE | `/v1/documents/:id` | JWT + HMAC (Admin) | Delete document |
| GET | `/v1/documents` | JWT + HMAC | List documents |

### Query Service

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/v1/chat/query` | JWT + HMAC | Send chat message |
| GET | `/v1/chat/conversations` | JWT + HMAC | List conversations |
| GET | `/v1/chat/history/:id` | JWT + HMAC | Get conversation history |
| WS | `/v1/chat/stream` | JWT + HMAC | WebSocket streaming |

---

## Data Flow

### Admin Uploads Document Flow

```
┌─────────────┐
│ Admin App   │
│ (React      │
│  Native)    │
└──────┬──────┘
       │ 1. POST /v1/documents/upload
       │    Authorization: Bearer <JWT>
       │    X-Client-ID: pk_...
       │    X-Signature: <HMAC>
       ▼
┌─────────────┐
│ API Gateway │
│  - Validate │
│    JWT      │
│  - Validate │
│    HMAC     │
│  - Extract  │
│    tenant_id│
└──────┬──────┘
       │ 2. Forward to Content Service
       ▼
┌─────────────┐
│  Content    │ 3. Generate presigned S3 URL
│  Service    │ 4. Store metadata (status: 'pending')
└──────┬──────┘
       │ 5. Return presigned URL
       ▼
┌─────────────┐
│ Admin App   │ 6. Upload file directly to S3
└──────┬──────┘
       │ 7. S3 upload complete
       ▼
┌─────────────┐
│ S3 Bucket   │ 8. Trigger event
└──────┬──────┘
       │ 9. Update status: 'uploaded'
       ▼
┌─────────────┐
│  Content    │ 10. Publish to Kafka
│  Service    │     Topic: document.uploaded
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Kafka     │ 11. Message queued
│  /RabbitMQ  │
└──────┬──────┘
       │ 12. Consumer reads message
       ▼
┌─────────────┐
│    AI       │ 13. Process document
│ Processing  │     - Parse file
│  Service    │     - Chunk text
│             │     - Generate embeddings
└──────┬──────┘
       │ 14. Store in ChromaDB
       ▼
┌─────────────┐
│  ChromaDB   │ 15. Vectors indexed
│ (Vector DB) │
└─────────────┘
```

### User Query Chatbot Flow

```
┌─────────────┐
│  User App   │
│ (React      │
│  Native)    │
└──────┬──────┘
       │ 1. POST /v1/chat/query
       │    { "query": "How do I reset password?" }
       │    Authorization: Bearer <JWT>
       │    X-Client-ID: pk_...
       │    X-Signature: <HMAC>
       ▼
┌─────────────┐
│ API Gateway │ 2. Validate JWT + HMAC
│             │ 3. Extract tenant_id
└──────┬──────┘
       │ 4. Forward to Query Service
       ▼
┌─────────────┐
│   Query     │ 5. Generate query embedding
│  Service    │
└──────┬──────┘
       │ 6. Search for similar chunks
       ▼
┌─────────────┐
│  ChromaDB   │ 7. Return top 5 chunks (similarity > 0.7)
└──────┬──────┘
       │ 8. Retrieved chunks
       ▼
┌─────────────┐
│   Query     │ 9. Construct prompt with context
│  Service    │ 10. Send to LLM (Ollama)
└──────┬──────┘
       │ 11. LLM generates answer
       ▼
┌─────────────┐
│  User App   │ 12. Return answer + sources
└─────────────┘
```

---

## Database Schema

### Organizations Table
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    
    -- HMAC credentials (stored as hashes)
    client_id_hash TEXT NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    client_id_prefix VARCHAR(20) NOT NULL, -- For display: "pk_a4f3..."
    
    -- Quotas
    max_documents INT DEFAULT 100,
    max_users INT DEFAULT 50,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_org_client_id_hash ON organizations(client_id_hash);
```

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    
    -- Role: 'owner', 'admin', 'user'
    role VARCHAR(50) DEFAULT 'user',
    
    -- Security
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
```

### Documents Table
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    filename VARCHAR(500) NOT NULL,
    s3_key TEXT NOT NULL,
    content_type VARCHAR(100),
    file_size_bytes BIGINT,
    
    -- Status: 'pending', 'uploaded', 'processing', 'completed', 'failed'
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    
    chunks_count INT DEFAULT 0,
    uploaded_by UUID REFERENCES users(id),
    
    uploaded_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_documents_org ON documents(org_id);
CREATE INDEX idx_documents_status ON documents(status);
```

### Refresh Tokens Table
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    
    device_info JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) 
    WHERE revoked = false;
```

### Conversations & Messages Tables
```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    sources JSONB, -- Array of source documents
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```

---

## Implementation Guide

### 1. Organization Registration (Postman Setup)

**Request:**
```http
POST https://api.yourplatform.com/v1/org/register
Content-Type: application/json

{
  "org_name": "ACME Corporation",
  "admin_email": "admin@acme.com",
  "admin_password": "SecurePass123!"
}
```

**Response:**
```json
{
  "org_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "org_name": "ACME Corporation",
  "client_id": "pk_a4f3c2e1d8b9f7e6d5c4b3a2918273645",
  "client_secret": "sk_x9w8v7u6t5s4r3q2p1o0n9m8l7k6j5i4",
  "admin_user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@acme.com",
    "role": "owner"
  },
  "warning": "Save client_secret securely. It will not be shown again."
}
```

**Backend Implementation:**
```javascript
app.post('/v1/org/register', async (req, res) => {
  const { org_name, admin_email, admin_password } = req.body;
  
  const client = await pg.connect();
  
  try {
    await client.query('BEGIN');
    
    // Generate HMAC credentials
    const clientId = `pk_${crypto.randomBytes(24).toString('hex')}`;
    const clientSecret = `sk_${crypto.randomBytes(32).toString('hex')}`;
    
    const clientIdHash = crypto.createHash('sha256').update(clientId).digest('hex');
    const clientSecretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');
    const clientIdPrefix = clientId.substring(0, 12) + '...';
    
    // Create organization
    const orgResult = await client.query(`
      INSERT INTO organizations (name, client_id_hash, client_secret_hash, client_id_prefix)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name
    `, [org_name, clientIdHash, clientSecretHash, clientIdPrefix]);
    
    const org = orgResult.rows[0];
    
    // Create admin user
    const passwordHash = await bcrypt.hash(admin_password, 12);
    
    const userResult = await client.query(`
      INSERT INTO users (org_id, email, password_hash, role)
      VALUES ($1, $2, $3, 'owner')
      RETURNING id, email, role
    `, [org.id, admin_email, passwordHash]);
    
    const user = userResult.rows[0];
    
    await client.query('COMMIT');
    
    res.status(201).json({
      org_id: org.id,
      org_name: org.name,
      client_id: clientId,  // ⚠️ Return ONLY ONCE
      client_secret: clientSecret,  // ⚠️ Return ONLY ONCE
      admin_user: user,
      warning: 'Save client_secret securely. It will not be shown again.'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Org registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});
```

### 2. React Native Setup

**Environment Configuration:**
```javascript
// .env
API_BASE_URL=https://api.yourplatform.com
CLIENT_ID=pk_a4f3c2e1d8b9f7e6d5c4b3a2918273645
CLIENT_SECRET=sk_x9w8v7u6t5s4r3q2p1o0n9m8l7k6j5i4
```

**SDK Implementation:**
```javascript
// src/services/ApiService.js
import CryptoJS from 'crypto-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

class ApiService {
  constructor() {
    this.baseURL = process.env.API_BASE_URL;
    this.clientId = process.env.CLIENT_ID;
    this.clientSecret = process.env.CLIENT_SECRET;
  }

  /**
   * Generate HMAC signature for request
   */
  generateHMAC(method, path, body = null) {
    const timestamp = Date.now();
    const bodyStr = body ? JSON.stringify(body) : '';
    const payload = `${method}|${path}|${timestamp}|${bodyStr}`;
    
    const signature = CryptoJS.HmacSHA256(payload, this.clientSecret).toString();
    
    return {
      timestamp,
      signature
    };
  }

  /**
   * Make authenticated request with JWT + HMAC
   */
  async request(method, path, body = null) {
    const { timestamp, signature } = this.generateHMAC(method, path, body);
    
    // Get JWT token from storage
    const jwtToken = await AsyncStorage.getItem('access_token');
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Client-ID': this.clientId,
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature,
      ...(jwtToken && { 'Authorization': `Bearer ${jwtToken}` })
    };
    
    const options = {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) })
    };
    
    try {
      const response = await fetch(`${this.baseURL}${path}`, options);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  // Auth methods
  async login(email, password) {
    const result = await this.request('POST', '/v1/auth/login', {
      email,
      password
    });
    
    // Store tokens
    await AsyncStorage.setItem('access_token', result.access_token);
    await AsyncStorage.setItem('refresh_token', result.refresh_token);
    
    return result;
  }

  async signup(email, password, orgId) {
    return this.request('POST', '/v1/auth/signup', {
      email,
      password,
      org_id: orgId
    });
  }

  // Document methods
  async uploadDocument(filename, contentType) {
    return this.request('POST', '/v1/documents/upload', {
      filename,
      content_type: contentType
    });
  }

  async getDocuments() {
    return this.request('GET', '/v1/documents');
  }

  // Chat methods
  async sendMessage(query, conversationId = null) {
    return this.request('POST', '/v1/chat/query', {
      query,
      conversation_id: conversationId
    });
  }

  async getConversations() {
    return this.request('GET', '/v1/chat/conversations');
  }
}

export default new ApiService();
```

**Usage in React Native Components:**
```javascript
// screens/ChatScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, FlatList, Text } from 'react-native';
import ApiService from '../services/ApiService';

export default function ChatScreen() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    
    try {
      const result = await ApiService.sendMessage(query);
      
      setMessages(prev => [
        ...prev,
        { role: 'user', content: query },
        { role: 'assistant', content: result.answer, sources: result.sources }
      ]);
      
      setQuery('');
    } catch (error) {
      console.error('Send error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <View>
            <Text>{item.role}: {item.content}</Text>
          </View>
        )}
      />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Ask a question..."
      />
      <Button title="Send" onPress={handleSend} disabled={loading} />
    </View>
  );
}
```

---

## Deployment Strategy

### Local Development Setup

#### Prerequisites
```bash
# Required software
- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
```

#### Docker Compose Configuration

**docker-compose.yml**
```yaml
version: '3.8'

services:
  # ==================== Databases ====================
  
  postgres:
    image: postgres:15-alpine
    container_name: faq-postgres
    environment:
      POSTGRES_DB: faq_platform
      POSTGRES_USER: faq_user
      POSTGRES_PASSWORD: faq_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    networks:
      - faq-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U faq_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: faq-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - faq-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ==================== Vector Database ====================
  
  chromadb:
    image: chromadb/chroma:latest
    container_name: faq-chromadb
    ports:
      - "8000:8000"
    volumes:
      - chromadb_data:/chroma/chroma
    environment:
      - IS_PERSISTENT=TRUE
      - ANONYMIZED_TELEMETRY=FALSE
    networks:
      - faq-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ==================== Message Queue ====================
  
  # Option 1: Kafka (for production-scale)
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: faq-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    networks:
      - faq-network

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    container_name: faq-kafka
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    networks:
      - faq-network
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 10s
      timeout: 10s
      retries: 5

  # Option 2: RabbitMQ (simpler for smaller deployments)
  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    container_name: faq-rabbitmq
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: faq_user
      RABBITMQ_DEFAULT_PASS: faq_password
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - faq-network
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ==================== Microservices ====================
  
  api-gateway:
    build:
      context: ./services/api-gateway
      dockerfile: Dockerfile
    container_name: faq-api-gateway
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      AUTH_SERVICE_URL: http://auth-service:3001
      CONTENT_SERVICE_URL: http://content-service:3002
      QUERY_SERVICE_URL: http://query-service:8001
      REDIS_URL: redis://redis:6379
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      RATE_LIMIT_PER_MINUTE: 1000
    depends_on:
      - redis
      - auth-service
      - content-service
      - query-service
    networks:
      - faq-network
    restart: unless-stopped

  auth-service:
    build:
      context: ./services/auth-service
      dockerfile: Dockerfile
    container_name: faq-auth-service
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://faq_user:faq_password@postgres:5432/faq_platform
      REDIS_URL: redis://redis:6379
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      BCRYPT_ROUNDS: 12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - faq-network
    restart: unless-stopped

  content-service:
    build:
      context: ./services/content-service
      dockerfile: Dockerfile
    container_name: faq-content-service
    ports:
      - "3002:3002"
    environment:
      NODE_ENV: production
      PORT: 3002
      DATABASE_URL: postgresql://faq_user:faq_password@postgres:5432/faq_platform
      # For local dev with Docker volumes
      STORAGE_TYPE: local
      STORAGE_PATH: /app/uploads
      # For production with S3
      # STORAGE_TYPE: s3
      # AWS_REGION: us-east-1
      # AWS_S3_BUCKET: faq-documents
      # AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      # AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      # Message Queue (choose one)
      QUEUE_TYPE: kafka  # or 'rabbitmq'
      KAFKA_BROKERS: kafka:29092
      # RABBITMQ_URL: amqp://faq_user:faq_password@rabbitmq:5672
    volumes:
      - document_uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
    networks:
      - faq-network
    restart: unless-stopped

  ai-processing-service:
    build:
      context: ./services/ai-processing-service
      dockerfile: Dockerfile
    container_name: faq-ai-processing
    environment:
      DATABASE_URL: postgresql://faq_user:faq_password@postgres:5432/faq_platform
      CHROMADB_URL: http://chromadb:8000
      OLLAMA_URL: http://ollama:11434
      # Storage config (must match content-service)
      STORAGE_TYPE: local
      STORAGE_PATH: /app/uploads
      # Message Queue
      QUEUE_TYPE: kafka
      KAFKA_BROKERS: kafka:29092
      KAFKA_GROUP_ID: ai-processing-service
      # Model configuration
      EMBEDDING_MODEL: all-MiniLM-L6-v2
      CHUNK_SIZE: 1000
      CHUNK_OVERLAP: 200
    volumes:
      - document_uploads:/app/uploads
      - model_cache:/root/.cache/huggingface
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
      chromadb:
        condition: service_healthy
      ollama:
        condition: service_healthy
    networks:
      - faq-network
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]  # For GPU acceleration (optional)

  query-service:
    build:
      context: ./services/query-service
      dockerfile: Dockerfile
    container_name: faq-query-service
    ports:
      - "8001:8001"
    environment:
      DATABASE_URL: postgresql://faq_user:faq_password@postgres:5432/faq_platform
      CHROMADB_URL: http://chromadb:8000
      OLLAMA_URL: http://ollama:11434
      REDIS_URL: redis://redis:6379
      EMBEDDING_MODEL: all-MiniLM-L6-v2
      LLM_MODEL: llama3.1:8b
      MAX_CONTEXT_CHUNKS: 5
      SIMILARITY_THRESHOLD: 0.7
    volumes:
      - model_cache:/root/.cache/huggingface
    depends_on:
      postgres:
        condition: service_healthy
      chromadb:
        condition: service_healthy
      ollama:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - faq-network
    restart: unless-stopped

  # ==================== AI Model Server ====================
  
  ollama:
    image: ollama/ollama:latest
    container_name: faq-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_models:/root/.ollama
    networks:
      - faq-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 5
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]  # For GPU acceleration

  # Initialize Ollama with Llama 3.1
  ollama-setup:
    image: ollama/ollama:latest
    container_name: faq-ollama-setup
    depends_on:
      ollama:
        condition: service_healthy
    command: >
      sh -c "
        ollama pull llama3.1:8b &&
        echo 'Llama 3.1 8B model pulled successfully'
      "
    networks:
      - faq-network
    environment:
      OLLAMA_HOST: http://ollama:11434

  # ==================== Monitoring (Optional) ====================
  
  prometheus:
    image: prom/prometheus:latest
    container_name: faq-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    networks:
      - faq-network

  grafana:
    image: grafana/grafana:latest
    container_name: faq-grafana
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
    depends_on:
      - prometheus
    networks:
      - faq-network

networks:
  faq-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  chromadb_data:
  rabbitmq_data:
  document_uploads:
  ollama_models:
  model_cache:
  prometheus_data:
  grafana_data:
```

#### Service Dockerfiles

**services/api-gateway/Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["node", "index.js"]
```

**services/auth-service/Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Run migrations on startup
COPY migrations/ ./migrations/
COPY scripts/run-migrations.js ./scripts/

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3001

CMD ["sh", "-c", "node scripts/run-migrations.js && node index.js"]
```

**services/content-service/Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3002

CMD ["node", "index.js"]
```

**services/ai-processing-service/Dockerfile**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download models during build (optional, for faster startup)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python healthcheck.py

CMD ["python", "main.py"]
```

**services/ai-processing-service/requirements.txt**
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
kafka-python==2.0.2
pika==1.3.2  # For RabbitMQ
psycopg2-binary==2.9.9
chromadb==0.4.18
sentence-transformers==2.2.2
langchain==0.1.0
PyPDF2==3.0.1
python-docx==1.1.0
python-multipart==0.0.6
boto3==1.34.0  # For S3
aiofiles==23.2.1
```

**services/query-service/Dockerfile**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python healthcheck.py

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**services/query-service/requirements.txt**
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
psycopg2-binary==2.9.9
chromadb==0.4.18
sentence-transformers==2.2.2
httpx==0.25.2
redis==5.0.1
aioredis==2.0.1
websockets==12.0
```

#### Environment Variables

**.env.example**
```bash
# ==================== JWT Secrets ====================
# Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=your-256-bit-secret-here
JWT_REFRESH_SECRET=your-256-bit-secret-here

# ==================== Database ====================
POSTGRES_DB=faq_platform
POSTGRES_USER=faq_user
POSTGRES_PASSWORD=faq_password
DATABASE_URL=postgresql://faq_user:faq_password@postgres:5432/faq_platform

# ==================== Redis ====================
REDIS_URL=redis://redis:6379

# ==================== AWS S3 (Production) ====================
AWS_REGION=us-east-1
AWS_S3_BUCKET=faq-documents
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# ==================== Message Queue ====================
QUEUE_TYPE=kafka  # or 'rabbitmq'
KAFKA_BROKERS=kafka:29092
RABBITMQ_URL=amqp://faq_user:faq_password@rabbitmq:5672

# ==================== AI Models ====================
OLLAMA_URL=http://ollama:11434
CHROMADB_URL=http://chromadb:8000
EMBEDDING_MODEL=all-MiniLM-L6-v2
LLM_MODEL=llama3.1:8b

# ==================== API Configuration ====================
API_GATEWAY_PORT=3000
AUTH_SERVICE_PORT=3001
CONTENT_SERVICE_PORT=3002
QUERY_SERVICE_PORT=8001

RATE_LIMIT_PER_MINUTE=1000
MAX_FILE_SIZE_MB=50
```

#### Startup Scripts

**start.sh**
```bash
#!/bin/bash

echo "Starting FAQ Platform..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "Error: .env file not found"
  exit 1
fi

# Start infrastructure services first
echo "Starting databases and message queue..."
docker-compose up -d postgres redis chromadb kafka zookeeper

# Wait for health checks
echo "Waiting for databases to be ready..."
sleep 15

# Run database migrations
echo "Running database migrations..."
docker-compose run --rm auth-service node scripts/run-migrations.js

# Start Ollama and pull models
echo "Starting Ollama and pulling models..."
docker-compose up -d ollama
sleep 10
docker-compose up ollama-setup

# Start microservices
echo "Starting microservices..."
docker-compose up -d api-gateway auth-service content-service ai-processing-service query-service

# Show logs
echo "Services started. Showing logs..."
docker-compose logs -f
```

**stop.sh**
```bash
#!/bin/bash

echo "Stopping FAQ Platform..."
docker-compose down

echo "Stopped all services"
```

**reset.sh**
```bash
#!/bin/bash

echo "⚠️  WARNING: This will delete all data!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" == "yes" ]; then
  echo "Stopping services and removing volumes..."
  docker-compose down -v
  echo "All data has been removed"
else
  echo "Reset cancelled"
fi
```

### Kubernetes Deployment

#### Namespace Configuration

**k8s/namespace.yaml**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: faq-platform
```

#### ConfigMap

**k8s/configmap.yaml**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: faq-config
  namespace: faq-platform
data:
  POSTGRES_DB: "faq_platform"
  REDIS_URL: "redis://faq-redis:6379"
  CHROMADB_URL: "http://faq-chromadb:8000"
  OLLAMA_URL: "http://faq-ollama:11434"
  KAFKA_BROKERS: "faq-kafka:9092"
  EMBEDDING_MODEL: "all-MiniLM-L6-v2"
  LLM_MODEL: "llama3.1:8b"
  QUEUE_TYPE: "kafka"
  RATE_LIMIT_PER_MINUTE: "1000"
  MAX_FILE_SIZE_MB: "50"
```

#### Secrets

**k8s/secrets.yaml**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: faq-secrets
  namespace: faq-platform
type: Opaque
stringData:
  JWT_ACCESS_SECRET: "your-jwt-access-secret-here"
  JWT_REFRESH_SECRET: "your-jwt-refresh-secret-here"
  POSTGRES_PASSWORD: "your-postgres-password"
  AWS_ACCESS_KEY_ID: "your-aws-access-key"
  AWS_SECRET_ACCESS_KEY: "your-aws-secret-key"
```

#### PostgreSQL Deployment

**k8s/postgres.yaml**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: faq-postgres
  namespace: faq-platform
spec:
  serviceName: faq-postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: POSTGRES_DB
        - name: POSTGRES_USER
          value: "faq_user"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: POSTGRES_PASSWORD
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: faq-api-gateway
  namespace: faq-platform
spec:
  type: LoadBalancer
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
```

#### Microservices Deployments

**k8s/auth-service.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: faq-auth-service
  namespace: faq-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: your-registry/faq-auth-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3001"
        - name: DATABASE_URL
          value: "postgresql://faq_user:$(POSTGRES_PASSWORD)@faq-postgres:5432/faq_platform"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: POSTGRES_PASSWORD
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: REDIS_URL
        - name: JWT_ACCESS_SECRET
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: JWT_ACCESS_SECRET
        - name: JWT_REFRESH_SECRET
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: JWT_REFRESH_SECRET
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: faq-auth-service
  namespace: faq-platform
spec:
  selector:
    app: auth-service
  ports:
  - port: 3001
    targetPort: 3001
```

**k8s/query-service.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: faq-query-service
  namespace: faq-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: query-service
  template:
    metadata:
      labels:
        app: query-service
    spec:
      containers:
      - name: query-service
        image: your-registry/faq-query-service:latest
        ports:
        - containerPort: 8001
        env:
        - name: DATABASE_URL
          value: "postgresql://faq_user:$(POSTGRES_PASSWORD)@faq-postgres:5432/faq_platform"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: POSTGRES_PASSWORD
        - name: CHROMADB_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: CHROMADB_URL
        - name: OLLAMA_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: OLLAMA_URL
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: REDIS_URL
        - name: EMBEDDING_MODEL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: EMBEDDING_MODEL
        - name: LLM_MODEL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: LLM_MODEL
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        volumeMounts:
        - name: model-cache
          mountPath: /root/.cache/huggingface
      volumes:
      - name: model-cache
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: faq-query-service
  namespace: faq-platform
spec:
  selector:
    app: query-service
  ports:
  - port: 8001
    targetPort: 8001
```

**k8s/ai-processing-service.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: faq-ai-processing
  namespace: faq-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ai-processing
  template:
    metadata:
      labels:
        app: ai-processing
    spec:
      containers:
      - name: ai-processing
        image: your-registry/faq-ai-processing:latest
        env:
        - name: DATABASE_URL
          value: "postgresql://faq_user:$(POSTGRES_PASSWORD)@faq-postgres:5432/faq_platform"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: POSTGRES_PASSWORD
        - name: CHROMADB_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: CHROMADB_URL
        - name: OLLAMA_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: OLLAMA_URL
        - name: KAFKA_BROKERS
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: KAFKA_BROKERS
        - name: QUEUE_TYPE
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: QUEUE_TYPE
        - name: EMBEDDING_MODEL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: EMBEDDING_MODEL
        - name: AWS_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: AWS_ACCESS_KEY_ID
        - name: AWS_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: AWS_SECRET_ACCESS_KEY
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        volumeMounts:
        - name: model-cache
          mountPath: /root/.cache/huggingface
      volumes:
      - name: model-cache
        emptyDir: {}
```

#### Horizontal Pod Autoscaler

**k8s/hpa.yaml**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: faq-api-gateway-hpa
  namespace: faq-platform
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: faq-api-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: faq-query-service-hpa
  namespace: faq-platform
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: faq-query-service
  minReplicas: 2
  maxReplicas: 8
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 75
```

#### Ingress Configuration

**k8s/ingress.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: faq-ingress
  namespace: faq-platform
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - api.yourplatform.com
    secretName: faq-tls-secret
  rules:
  - host: api.yourplatform.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: faq-api-gateway
            port:
              number: 80
```

#### Kubernetes Deployment Scripts

**k8s/deploy.sh**
```bash
#!/bin/bash

echo "Deploying FAQ Platform to Kubernetes..."

# Create namespace
kubectl apply -f namespace.yaml

# Create secrets (make sure secrets.yaml is populated)
kubectl apply -f secrets.yaml

# Create config maps
kubectl apply -f configmap.yaml

# Deploy databases
echo "Deploying databases..."
kubectl apply -f postgres.yaml
kubectl apply -f redis.yaml
kubectl apply -f chromadb.yaml

# Wait for databases
echo "Waiting for databases to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n faq-platform --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n faq-platform --timeout=300s
kubectl wait --for=condition=ready pod -l app=chromadb -n faq-platform --timeout=300s

# Deploy Kafka
echo "Deploying Kafka..."
kubectl apply -f zookeeper.yaml
sleep 10
kubectl apply -f kafka.yaml
kubectl wait --for=condition=ready pod -l app=kafka -n faq-platform --timeout=300s

# Run migrations
echo "Running database migrations..."
kubectl apply -f migration-job.yaml
kubectl wait --for=condition=complete job/db-migration -n faq-platform --timeout=300s

# Deploy microservices
echo "Deploying microservices..."
kubectl apply -f auth-service.yaml
kubectl apply -f content-service.yaml
kubectl apply -f query-service.yaml
kubectl apply -f ai-processing-service.yaml

# Deploy API Gateway
echo "Deploying API Gateway..."
kubectl apply -f api-gateway.yaml

# Deploy autoscalers
echo "Deploying autoscalers..."
kubectl apply -f hpa.yaml

# Deploy ingress
echo "Deploying ingress..."
kubectl apply -f ingress.yaml

# Wait for all deployments
echo "Waiting for all deployments to be ready..."
kubectl wait --for=condition=available deployment --all -n faq-platform --timeout=600s

echo "Deployment complete!"
echo "Services:"
kubectl get svc -n faq-platform
echo ""
echo "Pods:"
kubectl get pods -n faq-platform
```

**k8s/migration-job.yaml**
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: faq-platform
spec:
  template:
    spec:
      containers:
      - name: migration
        image: your-registry/faq-auth-service:latest
        command: ["node", "scripts/run-migrations.js"]
        env:
        - name: DATABASE_URL
          value: "postgresql://faq_user:$(POSTGRES_PASSWORD)@faq-postgres:5432/faq_platform"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: POSTGRES_PASSWORD
      restartPolicy: OnFailure
  backoffLimit: 3
```

### Production Deployment Checklist

#### Pre-Deployment

```markdown
## Infrastructure Setup
- [ ] Kubernetes cluster provisioned (EKS, GKE, or AKS)
- [ ] kubectl configured and connected to cluster
- [ ] Container registry set up (ECR, GCR, or Docker Hub)
- [ ] Domain name configured and DNS records created
- [ ] SSL certificates provisioned (Let's Encrypt or AWS Certificate Manager)

## Security
- [ ] All secrets generated and stored securely
- [ ] JWT secrets are cryptographically secure (256-bit)
- [ ] Database passwords are strong and unique
- [ ] AWS credentials have minimal required permissions
- [ ] Network policies configured for pod-to-pod communication
- [ ] RBAC roles and service accounts defined

## Storage
- [ ] Persistent volumes configured for PostgreSQL
- [ ] Persistent volumes configured for ChromaDB
- [ ] S3 buckets created for document storage
- [ ] Backup strategy defined and tested
- [ ] Retention policies configured

## Monitoring & Observability
- [ ] Prometheus deployed and configured
- [ ] Grafana dashboards imported
- [ ] Application metrics endpoints exposed
- [ ] Log aggregation configured (ELK or Loki)
- [ ] Alerting rules defined
- [ ] On-call rotation established

## Performance
- [ ] Resource limits and requests tuned
- [ ] Horizontal Pod Autoscalers configured
- [ ] Database connection pooling optimized
- [ ] Redis cache warming strategy defined
- [ ] CDN configured for static assets (if applicable)

## CI/CD
- [ ] GitHub Actions / GitLab CI pipelines configured
- [ ] Docker images built and pushed to registry
- [ ] Automated testing in place
- [ ] Deployment rollback strategy defined
- [ ] Canary deployment strategy (optional)
```

### Monitoring Configuration

**monitoring/prometheus.yml**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['faq-api-gateway:3000']
    metrics_path: '/metrics'
  
  - job_name: 'auth-service'
    static_configs:
      - targets: ['faq-auth-service:3001']
    metrics_path: '/metrics'
  
  - job_name: 'content-service'
    static_configs:
      - targets: ['faq-content-service:3002']
    metrics_path: '/metrics'
  
  - job_name: 'query-service'
    static_configs:
      - targets: ['faq-query-service:8001']
    metrics_path: '/metrics'
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['faq-postgres-exporter:9187']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['faq-redis-exporter:9121']
  
  - job_name: 'kafka'
    static_configs:
      - targets: ['faq-kafka-exporter:9308']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alerts.yml'
```

**monitoring/alerts.yml**
```yaml
groups:
  - name: api_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "{{ $labels.service }} has error rate of {{ $value }}"
      
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s"
      
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.job }} has been down for more than 2 minutes"

  - name: database_alerts
    interval: 30s
    rules:
      - alert: HighDatabaseConnections
        expr: pg_stat_database_numbackends > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High database connection count"
          description: "PostgreSQL has {{ $value }} connections"
      
      - alert: DatabaseDiskSpaceLow
        expr: (pg_database_size_bytes / 1024 / 1024 / 1024) > 8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database disk space running low"
          description: "Database size is {{ $value }}GB"

  - name: resource_alerts
    interval: 30s
    rules:
      - alert: HighCPUUsage
        expr: rate(container_cpu_usage_seconds_total[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "Container {{ $labels.pod }} CPU usage is {{ $value }}"
      
      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High memory usage"
          description: "Container {{ $labels.pod }} memory usage is {{ $value }}"
```

### CI/CD Pipeline

**.github/workflows/deploy.yml**
```yaml
name: Build and Deploy

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main ]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: your-org/faq-platform

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd services/auth-service && npm ci
          cd ../content-service && npm ci
          cd ../api-gateway && npm ci
      
      - name: Run tests
        run: |
          cd services/auth-service && npm test
          cd ../content-service && npm test
          cd ../api-gateway && npm test
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Test Python services
        run: |
          cd services/ai-processing-service
          pip install -r requirements.txt
          pytest
          cd ../query-service
          pip install -r requirements.txt
          pytest

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    strategy:
      matrix:
        service: [api-gateway, auth-service, content-service, query-service, ai-processing-service]
    steps:
      - uses: actions/checkout@v3
      
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v2
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v4
        with:
          context: ./services/${{ matrix.service }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-${{ matrix.service }}:buildcache
          cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-${{ matrix.service }}:buildcache,mode=max

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/staging'
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}
      
      - name: Deploy to staging
        run: |
          cd k8s
          ./deploy.sh
          kubectl set image deployment/faq-api-gateway \
            api-gateway=${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-api-gateway:staging-${{ github.sha }} \
            -n faq-platform
          kubectl set image deployment/faq-auth-service \
            auth-service=${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-auth-service:staging-${{ github.sha }} \
            -n faq-platform
          # ... repeat for other services

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG_PRODUCTION }}
      
      - name: Deploy to production
        run: |
          cd k8s
          ./deploy.sh
          kubectl set image deployment/faq-api-gateway \
            api-gateway=${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-api-gateway:main-${{ github.sha }} \
            -n faq-platform
          kubectl set image deployment/faq-auth-service \
            auth-service=${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-auth-service:main-${{ github.sha }} \
            -n faq-platform
          # ... repeat for other services
      
      - name: Verify deployment
        run: |
          kubectl rollout status deployment/faq-api-gateway -n faq-platform
          kubectl rollout status deployment/faq-auth-service -n faq-platform
          kubectl rollout status deployment/faq-content-service -n faq-platform
          kubectl rollout status deployment/faq-query-service -n faq-platform
          kubectl rollout status deployment/faq-ai-processing -n faq-platform
```

### Backup and Disaster Recovery

**scripts/backup.sh**
```bash
#!/bin/bash

# Backup PostgreSQL
echo "Backing up PostgreSQL..."
kubectl exec -n faq-platform faq-postgres-0 -- \
  pg_dump -U faq_user faq_platform | \
  gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz

# Upload to S3
aws s3 cp backup-*.sql.gz s3://your-backup-bucket/postgres/

# Backup ChromaDB
echo "Backing up ChromaDB..."
kubectl exec -n faq-platform faq-chromadb-0 -- \
  tar czf - /chroma/chroma | \
  aws s3 cp - s3://your-backup-bucket/chromadb/backup-$(date +%Y%m%d-%H%M%S).tar.gz

# Clean up old backups (keep last 30 days)
find . -name "backup-*.sql.gz" -mtime +30 -delete

echo "Backup completed successfully"
```

**scripts/restore.sh**
```bash
#!/bin/bash

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh <backup-file>"
  exit 1
fi

echo "Restoring from $BACKUP_FILE..."

# Download from S3
aws s3 cp s3://your-backup-bucket/postgres/$BACKUP_FILE .

# Restore to PostgreSQL
gunzip < $BACKUP_FILE | \
  kubectl exec -i -n faq-platform faq-postgres-0 -- \
  psql -U faq_user faq_platform

echo "Restore completed successfully"
```

### Health Check Endpoints

**services/api-gateway/healthcheck.js**
```javascript
const http = require('http');

const options = {
  host: 'localhost',
  port: 3000,
  timeout: 2000,
  path: '/health'
};

const healthCheck = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

healthCheck.on('error', (err) => {
  console.error('ERROR:', err);
  process.exit(1);
});

healthCheck.end();
```

**services/query-service/healthcheck.py**
```python
import sys
import httpx

try:
    response = httpx.get('http://localhost:8001/health', timeout=2.0)
    if response.status_code == 200:
        sys.exit(0)
    else:
        sys.exit(1)
except Exception as e:
    print(f"Health check failed: {e}")
    sys.exit(1)
```

---

## Quick Start Commands

### Local Development (Docker Compose)

```bash
# Clone repository
git clone https://github.com/your-org/faq-platform.git
cd faq-platform

# Copy and configure environment
cp .env.example .env
# Edit .env with your secrets

# Start all services
./start.sh

# View logs
docker-compose logs -f

# Stop all services
./stop.sh

# Reset everything (⚠️ deletes all data)
./reset.sh
```

### Kubernetes Deployment

```bash
# Configure kubectl
export KUBECONFIG=~/.kube/config

# Create secrets
kubectl create secret generic faq-secrets \
  --from-literal=JWT_ACCESS_SECRET='your-secret' \
  --from-literal=JWT_REFRESH_SECRET='your-secret' \
  --from-literal=POSTGRES_PASSWORD='your-password' \
  -n faq-platform

# Deploy
cd k8s
./deploy.sh

# Check status
kubectl get pods -n faq-platform
kubectl get svc -n faq-platform

# View logs
kubectl logs -f deployment/faq-api-gateway -n faq-platform

# Scale services
kubectl scale deployment/faq-query-service --replicas=5 -n faq-platform
```

### Access Services

```bash
# Local (Docker Compose)
API Gateway: http://localhost:3000
Grafana: http://localhost:3001 (admin/admin)
Prometheus: http://localhost:9090
RabbitMQ Management: http://localhost:15672 (faq_user/faq_password)

# Kubernetes
kubectl port-forward svc/faq-api-gateway 3000:80 -n faq-platform
# Access at http://localhost:3000
```

---

## Performance Tuning

### Database Optimization

**PostgreSQL Configuration** (`postgresql.conf`)
```conf
# Connection Settings
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 128MB

# Query Optimization
random_page_cost = 1.1
effective_io_concurrency = 200

# Write-Ahead Log
wal_level = replica
max_wal_size = 1GB
min_wal_size = 80MB

# Checkpoints
checkpoint_completion_target = 0.9
```

### Redis Configuration

```conf
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Kafka Optimization

```properties
# Increase batch size for better throughput
batch.size=32768
linger.ms=10

# Compression
compression.type=snappy

# Replication
min.insync.replicas=2
```

---

This completes the comprehensive deployment documentation! You now have:

✅ **Docker Compose** setup for local development
✅ **Kubernetes** manifests for production deployment  
✅ **CI/CD pipeline** with GitHub Actions
✅ **Monitoring** with Prometheus & Grafana
✅ **Auto-scaling** configurations
✅ **Backup & recovery** scripts
✅ **Health checks** for all services
✅ **Performance tuning** guidelines

Would you like me to add anything else, such as:
- Terraform/Infrastructure as Code for cloud provisioning?
- Database migration scripts?
- Load testing configurations?
- Disaster recovery runbooks?:
  name: faq-postgres
  namespace: faq-platform
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
  clusterIP: None
```

#### Redis Deployment

**k8s/redis.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: faq-redis
  namespace: faq-platform
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: faq-redis
  namespace: faq-platform
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

#### ChromaDB Deployment

**k8s/chromadb.yaml**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: faq-chromadb
  namespace: faq-platform
spec:
  serviceName: faq-chromadb
  replicas: 1
  selector:
    matchLabels:
      app: chromadb
  template:
    metadata:
      labels:
        app: chromadb
    spec:
      containers:
      - name: chromadb
        image: chromadb/chroma:latest
        ports:
        - containerPort: 8000
        env:
        - name: IS_PERSISTENT
          value: "TRUE"
        - name: ANONYMIZED_TELEMETRY
          value: "FALSE"
        volumeMounts:
        - name: chromadb-storage
          mountPath: /chroma/chroma
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: chromadb-storage
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 20Gi
---
apiVersion: v1
kind: Service
metadata:
  name: faq-chromadb
  namespace: faq-platform
spec:
  selector:
    app: chromadb
  ports:
  - port: 8000
    targetPort: 8000
```

#### Kafka Deployment

**k8s/kafka.yaml**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: faq-kafka
  namespace: faq-platform
spec:
  serviceName: faq-kafka
  replicas: 1
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:7.5.0
        ports:
        - containerPort: 9092
        env:
        - name: KAFKA_BROKER_ID
          value: "1"
        - name: KAFKA_ZOOKEEPER_CONNECT
          value: "faq-zookeeper:2181"
        - name: KAFKA_ADVERTISED_LISTENERS
          value: "PLAINTEXT://faq-kafka:9092"
        - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
          value: "1"
        volumeMounts:
        - name: kafka-storage
          mountPath: /var/lib/kafka/data
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
  volumeClaimTemplates:
  - metadata:
      name: kafka-storage
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: faq-kafka
  namespace: faq-platform
spec:
  selector:
    app: kafka
  ports:
  - port: 9092
    targetPort: 9092
```

#### API Gateway Deployment

**k8s/api-gateway.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: faq-api-gateway
  namespace: faq-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: your-registry/faq-api-gateway:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: JWT_ACCESS_SECRET
          valueFrom:
            secretKeyRef:
              name: faq-secrets
              key: JWT_ACCESS_SECRET
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: faq-config
              key: REDIS_URL
        - name: AUTH_SERVICE_URL
          value: "http://faq-auth-service:3001"
        - name: CONTENT_SERVICE_URL
          value: "http://faq-content-service:3002"
        - name: QUERY_SERVICE_URL
          value: "http://faq-query-service:8001"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata 