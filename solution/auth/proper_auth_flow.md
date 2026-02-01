# Proper Authentication & Authorization Flow

## Core Principles

1. **Organization Isolation**: Each org has its own client_id/client_secret (HMAC credentials)
2. **User Authentication**: JWT contains only user_id (no role, no tenant_id)
3. **Authorization**: Role and org_id fetched from database on every request
4. **Separation of Concerns**: 
   - HMAC = Org-level authentication (proves the request is from a valid org)
   - JWT = User-level authentication (proves the user is logged in)
   - Database = Authorization (what can this user do?)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│              React Native Applications                       │
│                                                              │
│  ┌────────────────────┐         ┌────────────────────┐     │
│  │   Admin App        │         │    User App        │     │
│  │   (Org A)          │         │    (Org B)         │     │
│  └────────────────────┘         └────────────────────┘     │
└───────────┬──────────────────────────────┬─────────────────┘
            │                              │
            │ JWT + HMAC (Org A)           │ JWT + HMAC (Org B)
            │                              │
            ▼                              ▼
┌───────────────────────────────────────────────────────────┐
│                    API Gateway                            │
│                                                           │
│  1. Validate HMAC signature → Extract org_id             │
│  2. Validate JWT token → Extract user_id                 │
│  3. Fetch user details from DB:                          │
│     SELECT org_id, role FROM users WHERE id = user_id    │
│  4. Verify org_id from HMAC == org_id from DB            │
│  5. Inject into request context: {user_id, org_id, role} │
│  6. Forward to service                                   │
└───────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────┐
│              Microservices (with context)                 │
│  req.user = { user_id, org_id, role }                     │
│                                                           │
│  All queries scoped to org_id:                           │
│  SELECT * FROM documents WHERE org_id = req.user.org_id  │
└───────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Flows

### **1. Organization Registration (Capstone Setup)**

This is done **once per organization** during initial setup.

```
┌─────────────┐
│  Postman /  │
│   cURL      │
└──────┬──────┘
       │
       │ POST /v1/org/register
       │ {
       │   "org_name": "ACME Corp",
       │   "admin_email": "admin@acme.com",
       │   "admin_password": "SecurePass123!"
       │ }
       ▼
┌─────────────────────────────────────────┐
│  Auth Service                           │
│                                         │
│  1. Create organization record          │
│  2. Generate HMAC credentials:          │
│     client_id = "pk_" + random(32)      │
│     client_secret = "sk_" + random(64)  │
│  3. Hash and store:                     │
│     client_id_hash = SHA256(client_id)  │
│     client_secret_hash = SHA256(secret) │
│  4. Create first admin user             │
│  5. Return credentials (ONCE)           │
└─────────────────────────────────────────┘
       │
       ▼
Response (⚠️ SAVE IMMEDIATELY):
{
  "org_id": "uuid-org-a",
  "org_name": "ACME Corp",
  "client_id": "pk_abc123def456...",
  "client_secret": "sk_xyz789uvw012...",
  "admin_user": {
    "user_id": "uuid-user-1",
    "email": "admin@acme.com",
    "role": "owner"
  },
  "warning": "Save client_secret now. It cannot be retrieved later."
}
```

**Database State After Registration:**

```sql
-- organizations table
INSERT INTO organizations VALUES (
  'uuid-org-a',
  'ACME Corp',
  SHA256('pk_abc123def456...'),  -- client_id_hash
  SHA256('sk_xyz789uvw012...'),  -- client_secret_hash
  'pk_abc123...'                 -- client_id_prefix (for display)
);

-- users table
INSERT INTO users VALUES (
  'uuid-user-1',
  'uuid-org-a',                  -- org_id
  'admin@acme.com',
  BCRYPT('SecurePass123!'),
  'owner'                        -- role
);
```

---

### **2. User Login Flow**

**Admin App (ACME Corp):**

```
┌──────────────────┐
│   Admin App      │
│   (ACME Corp)    │
└────────┬─────────┘
         │
         │ 1. User enters: email + password
         │
         │ 2. App constructs request:
         │    POST /v1/auth/login
         │    Headers:
         │      X-Client-ID: pk_abc123def456...
         │      X-Timestamp: 1737388800000
         │      X-Signature: HMAC-SHA256(payload, sk_xyz789uvw012...)
         │    Body:
         │      { "email": "admin@acme.com", "password": "..." }
         ▼
┌─────────────────────────────────────────┐
│  API Gateway                            │
│                                         │
│  Step 1: Validate HMAC                  │
│    - Lookup org by client_id_hash       │
│    - Verify signature                   │
│    - org_id = "uuid-org-a"              │
│                                         │
│  Step 2: Forward to Auth Service        │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Auth Service                           │
│                                         │
│  1. Verify email + password             │
│  2. Check user belongs to org_id        │
│     (from HMAC validation)              │
│  3. Generate JWT with ONLY user_id:     │
│     {                                   │
│       "user_id": "uuid-user-1",         │
│       "type": "access",                 │
│       "exp": 1737389700                 │
│     }                                   │
│  4. Return tokens                       │
└─────────────────────────────────────────┘
         │
         ▼
Response:
{
  "access_token": "eyJhbGciOiJ...",  // JWT with only user_id
  "refresh_token": "eyJhbGciOiJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "user_id": "uuid-user-1",
    "email": "admin@acme.com",
    "role": "owner",              // ⚠️ Returned for UI, NOT in JWT
    "org_name": "ACME Corp"
  }
}
```

**Key Point:** JWT contains **ONLY** `user_id`. Role and org_id are **NOT** in the token.

---

### **3. Document Upload Flow (Admin Only)**

```
┌──────────────────┐
│   Admin App      │
│   (ACME Corp)    │
└────────┬─────────┘
         │
         │ POST /v1/documents/upload
         │ Headers:
         │   Authorization: Bearer eyJhbGciOiJ... (JWT)
         │   X-Client-ID: pk_abc123def456...
         │   X-Timestamp: 1737388800000
         │   X-Signature: HMAC-SHA256(...)
         │ Body:
         │   { "filename": "guide.pdf", "content_type": "application/pdf" }
         ▼
┌──────────────────────────────────────────────────────┐
│  API Gateway Middleware                              │
│                                                      │
│  async function authorize(req, res, next) {          │
│    // 1. Validate HMAC                               │
│    const orgFromHMAC = await validateHMAC(req);      │
│    // orgFromHMAC = "uuid-org-a"                     │
│                                                      │
│    // 2. Validate JWT                                │
│    const jwt = verifyJWT(req.headers.authorization); │
│    // jwt = { user_id: "uuid-user-1" }              │
│                                                      │
│    // 3. Fetch user details from database            │
│    const user = await db.query(`                     │
│      SELECT org_id, role                             │
│      FROM users                                      │
│      WHERE id = $1                                   │
│    `, [jwt.user_id]);                                │
│    // user = { org_id: "uuid-org-a", role: "owner" }│
│                                                      │
│    // 4. Security check: org from HMAC must match    │
│    if (user.org_id !== orgFromHMAC) {                │
│      return res.status(403).json({                   │
│        error: 'Organization mismatch'                │
│      });                                             │
│    }                                                 │
│                                                      │
│    // 5. Inject context into request                 │
│    req.user = {                                      │
│      user_id: jwt.user_id,                           │
│      org_id: user.org_id,                            │
│      role: user.role                                 │
│    };                                                │
│                                                      │
│    next();                                           │
│  }                                                   │
└──────────────────────────────────────────────────────┘
         │
         │ req.user = {
         │   user_id: "uuid-user-1",
         │   org_id: "uuid-org-a",
         │   role: "owner"
         │ }
         ▼
┌──────────────────────────────────────────────────────┐
│  Content Service                                     │
│                                                      │
│  async function uploadDocument(req, res) {           │
│    // 1. Check permission                            │
│    if (!['owner', 'admin'].includes(req.user.role)) {│
│      return res.status(403).json({                   │
│        error: 'Admin access required'                │
│      });                                             │
│    }                                                 │
│                                                      │
│    // 2. Generate presigned URL                      │
│    const s3Key = `${req.user.org_id}/documents/...`;│
│    const presignedUrl = generatePresignedURL(s3Key); │
│                                                      │
│    // 3. Store metadata (scoped to org)              │
│    await db.query(`                                  │
│      INSERT INTO documents                           │
│      (id, org_id, filename, s3_key, uploaded_by)     │
│      VALUES ($1, $2, $3, $4, $5)                     │
│    `, [                                              │
│      newId,                                          │
│      req.user.org_id,  // ← Org isolation            │
│      filename,                                       │
│      s3Key,                                          │
│      req.user.user_id                                │
│    ]);                                               │
│                                                      │
│    return res.json({ presigned_url: presignedUrl });│
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

---

### **4. Chat Query Flow (Regular User)**

```
┌──────────────────┐
│   User App       │
│   (ACME Corp)    │
└────────┬─────────┘
         │
         │ POST /v1/chat/query
         │ Headers:
         │   Authorization: Bearer eyJhbGciOiJ... (JWT)
         │   X-Client-ID: pk_abc123def456...
         │   X-Timestamp: 1737388800000
         │   X-Signature: HMAC-SHA256(...)
         │ Body:
         │   { "query": "How do I reset my password?" }
         ▼
┌──────────────────────────────────────────────────────┐
│  API Gateway (same authorization middleware)         │
│                                                      │
│  req.user = {                                        │
│    user_id: "uuid-user-5",                           │
│    org_id: "uuid-org-a",                             │
│    role: "user"  // ← Regular user, not admin        │
│  }                                                   │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  Query Service                                       │
│                                                      │
│  async function chatQuery(req, res) {                │
│    // 1. Generate query embedding                    │
│    const queryVector = await embed(req.body.query);  │
│                                                      │
│    // 2. Search in ORG-SPECIFIC collection           │
│    const collectionName = `tenant_${req.user.org_id}`;│
│    const results = await chromaDB.search(            │
│      collectionName,  // ← Org isolation             │
│      queryVector,                                    │
│      { limit: 5 }                                    │
│    );                                                │
│                                                      │
│    // 3. Build context from retrieved chunks         │
│    const context = results.map(r => r.text).join('\n');│
│                                                      │
│    // 4. Generate answer with LLM                    │
│    const answer = await ollama.generate({            │
│      prompt: `Context: ${context}\n\nQ: ${query}`,   │
│      model: 'llama3.1:8b'                            │
│    });                                               │
│                                                      │
│    // 5. Store conversation (scoped to org)          │
│    await db.query(`                                  │
│      INSERT INTO messages                            │
│      (conversation_id, org_id, user_id, role, content)│
│      VALUES ($1, $2, $3, 'user', $4)                 │
│    `, [convId, req.user.org_id, req.user.user_id, query]);│
│                                                      │
│    return res.json({ answer, sources: results });   │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

---

### **5. User Registration Flow**

**Only existing users with 'owner' or 'admin' role can create new users.**

```
┌──────────────────┐
│   Admin App      │
│   (ACME Corp)    │
└────────┬─────────┘
         │
         │ POST /v1/users/register
         │ Headers:
         │   Authorization: Bearer <owner-jwt>
         │   X-Client-ID: pk_abc123def456...
         │   X-Signature: HMAC(...)
         │ Body:
         │   {
         │     "email": "newuser@acme.com",
         │     "password": "SecurePass123!",
         │     "role": "user"
         │   }
         ▼
┌──────────────────────────────────────────────────────┐
│  API Gateway                                         │
│  req.user = {                                        │
│    user_id: "uuid-user-1",                           │
│    org_id: "uuid-org-a",                             │
│    role: "owner"                                     │
│  }                                                   │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  Auth Service                                        │
│                                                      │
│  async function registerUser(req, res) {             │
│    // 1. Check permission                            │
│    if (!['owner', 'admin'].includes(req.user.role)) {│
│      return res.status(403).json({                   │
│        error: 'Admin access required'                │
│      });                                             │
│    }                                                 │
│                                                      │
│    // 2. Validate role assignment                    │
│    const requestedRole = req.body.role;              │
│    if (requestedRole === 'owner' &&                  │
│        req.user.role !== 'owner') {                  │
│      return res.status(403).json({                   │
│        error: 'Only owner can create owner accounts' │
│      });                                             │
│    }                                                 │
│                                                      │
│    // 3. Create user in SAME org                     │
│    const passwordHash = await bcrypt.hash(           │
│      req.body.password, 12                           │
│    );                                                │
│                                                      │
│    await db.query(`                                  │
│      INSERT INTO users                               │
│      (id, org_id, email, password_hash, role)        │
│      VALUES ($1, $2, $3, $4, $5)                     │
│    `, [                                              │
│      newUserId,                                      │
│      req.user.org_id,  // ← Same org as creator      │
│      req.body.email,                                 │
│      passwordHash,                                   │
│      requestedRole                                   │
│    ]);                                               │
│                                                      │
│    return res.json({                                 │
│      user_id: newUserId,                             │
│      email: req.body.email,                          │
│      role: requestedRole                             │
│    });                                               │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

---

## Database Schema

```sql
-- Organizations (one per company/tenant)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    
    -- HMAC credentials (hashed)
    client_id_hash TEXT NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    client_id_prefix VARCHAR(20) NOT NULL,  -- "pk_abc123..." for display
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users (belong to one organization)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    
    -- Role: 'owner', 'admin', 'user'
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    
    -- Security
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_email_per_org UNIQUE (org_id, email)
);

-- Documents (isolated per organization)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    filename VARCHAR(500) NOT NULL,
    s3_key TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_documents_org ON documents(org_id);

-- Conversations (isolated per organization)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages (isolated per organization)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    
    role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    sources JSONB,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_org ON messages(org_id);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints Summary

### **Public (No Auth)**
```
POST /v1/org/register
  → Create organization + first admin user
  → Returns: client_id, client_secret (ONCE)
```

### **Authentication Required (JWT + HMAC)**

**Auth Endpoints:**
```
POST /v1/auth/login
  → Body: { email, password }
  → Returns: access_token, refresh_token

POST /v1/auth/refresh
  → Body: { refresh_token }
  → Returns: new access_token

POST /v1/auth/logout
  → Revokes refresh token
```

**User Management (Admin/Owner Only):**
```
POST /v1/users/register
  → Create new user in same org
  → Requires: role = 'owner' or 'admin'

PATCH /v1/users/:id/role
  → Change user role
  → Requires: role = 'owner'

GET /v1/users
  → List users in org
  → Requires: role = 'owner' or 'admin'
```

**Document Management (Admin/Owner Only):**
```
POST /v1/documents/upload
  → Generate presigned S3 URL
  → Requires: role = 'owner' or 'admin'

GET /v1/documents
  → List documents in org
  → Requires: role = 'owner' or 'admin'

DELETE /v1/documents/:id
  → Delete document
  → Requires: role = 'owner' or 'admin'

GET /v1/documents/:id/status
  → Check processing status
  → Requires: role = 'owner' or 'admin'
```

**Chat (All Authenticated Users):**
```
POST /v1/chat/query
  → Send message to chatbot
  → Requires: Any authenticated user

GET /v1/chat/conversations
  → List user's conversations
  → Requires: Any authenticated user

GET /v1/chat/conversations/:id
  → Get conversation history
  → Requires: Any authenticated user (own conversations only)
```

---

## Authorization Matrix

| Endpoint | Owner | Admin | User |
|----------|-------|-------|------|
| POST /org/register | ✅ Public | ✅ Public | ✅ Public |
| POST /auth/login | ✅ | ✅ | ✅ |
| POST /users/register | ✅ | ✅ | ❌ |
| PATCH /users/:id/role | ✅ | ❌ | ❌ |
| POST /documents/upload | ✅ | ✅ | ❌ |
| DELETE /documents/:id | ✅ | ✅ | ❌ |
| POST /chat/query | ✅ | ✅ | ✅ |
| GET /chat/conversations | ✅ (own) | ✅ (own) | ✅ (own) |

---

## Security Flow Summary

```
Every Request Flow:
1. Extract X-Client-ID header
2. Validate HMAC signature → Get org_id
3. Extract JWT from Authorization header
4. Verify JWT signature → Get user_id
5. Query database:
   SELECT org_id, role FROM users WHERE id = user_id
6. Verify org_id from HMAC matches org_id from database
7. Inject context: { user_id, org_id, role }
8. Check endpoint permissions based on role
9. Execute service logic with org_id scoping
```

**Key Security Features:**
- ✅ JWT contains only `user_id` (stateless but minimal)
- ✅ Role fetched from database (can be changed without re-login)
- ✅ Org-level auth via HMAC (proves app authenticity)
- ✅ User-level auth via JWT (proves user identity)
- ✅ Organization mismatch detection (HMAC org ≠ DB org)
- ✅ All data scoped to `org_id` in database queries
- ✅ Role-based access control at service level

---

## Security Configuration

### **Password Requirements**

```javascript
// Password validation rules
const PASSWORD_RULES = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,      // At least one A-Z
  requireLowercase: true,      // At least one a-z
  requireNumbers: true,        // At least one 0-9
  requireSpecialChars: true,   // At least one !@#$%^&*
};

// Valid special characters: !@#$%^&*()_+-=[]{}|;:,.<>?
// Example: "SecurePass123!"

// Blocked passwords (common weak passwords)
const BLOCKED_PASSWORDS = [
  'password123', 'admin123', '12345678', 'qwerty123',
  'welcome123', 'sunshine123', 'letmein123'
];

function validatePassword(password) {
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    throw new Error('Password must contain special character');
  }
  if (BLOCKED_PASSWORDS.some(bp => 
      password.toLowerCase().includes(bp.toLowerCase()))) {
    throw new Error('Password too common, please choose another');
  }
  return true;
}
```

### **JWT Configuration**

```javascript
// Environment variables to set
process.env.JWT_SECRET = 'your-256-bit-secret-key-change-in-production'
process.env.JWT_ALGORITHM = 'HS256'
process.env.JWT_ACCESS_EXPIRY = '900'   // 15 minutes in seconds
process.env.JWT_REFRESH_EXPIRY = '604800' // 7 days in seconds

// JWT Structure
const ACCESS_TOKEN = {
  header: {
    alg: 'HS256',
    typ: 'JWT'
  },
  payload: {
    user_id: 'uuid-user-1',
    type: 'access',
    iat: 1737388800,     // Issued at
    exp: 1737389700      // Expires at (now + 15 min)
  },
  secret: process.env.JWT_SECRET
};

const REFRESH_TOKEN = {
  header: {
    alg: 'HS256',
    typ: 'JWT'
  },
  payload: {
    user_id: 'uuid-user-1',
    type: 'refresh',
    token_id: 'uuid-token-1',  // For blacklisting
    iat: 1737388800,
    exp: 1737993600      // Expires at (now + 7 days)
  },
  secret: process.env.JWT_SECRET
};

// Token generation
function generateAccessToken(userId) {
  const payload = {
    user_id: userId,
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900  // 15 minutes
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256'
  });
}

function generateRefreshToken(userId) {
  const tokenId = uuid.v4();
  const payload = {
    user_id: userId,
    type: 'refresh',
    token_id: tokenId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 604800  // 7 days
  };
  
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256'
  });
  
  // Store token_id hash in database for revocation
  const tokenHash = crypto
    .createHash('sha256')
    .update(tokenId)
    .digest('hex');
  
  db.query(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, to_timestamp($3))
  `, [userId, tokenHash, payload.exp]);
  
  return token;
}
```

### **Account Security & Lockout**

```javascript
// Failed login tracking
const SECURITY_CONFIG = {
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 30,
  passwordExpiryDays: 90,
  sessionTimeoutMinutes: 30
};

async function handleFailedLogin(userId, orgId) {
  const user = await db.query(
    'SELECT failed_login_attempts, locked_until FROM users WHERE id = $1',
    [userId]
  );
  
  const attempts = user.rows[0].failed_login_attempts + 1;
  
  if (attempts >= SECURITY_CONFIG.maxFailedAttempts) {
    const lockoutUntil = new Date();
    lockoutUntil.setMinutes(
      lockoutUntil.getMinutes() + SECURITY_CONFIG.lockoutDurationMinutes
    );
    
    await db.query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, lockoutUntil, userId]
    );
    
    // Log security event
    logSecurityEvent('account_locked', orgId, userId);
    
    throw new Error(
      `Account locked for ${SECURITY_CONFIG.lockoutDurationMinutes} minutes due to failed login attempts`
    );
  }
  
  await db.query(
    'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
    [attempts, userId]
  );
}

async function handleSuccessfulLogin(userId) {
  await db.query(
    'UPDATE users SET failed_login_attempts = 0, last_login_at = NOW() WHERE id = $1',
    [userId]
  );
}

async function checkAccountLocked(userId) {
  const user = await db.query(
    'SELECT locked_until FROM users WHERE id = $1',
    [userId]
  );
  
  if (user.rows[0].locked_until && user.rows[0].locked_until > new Date()) {
    throw new Error('Account is temporarily locked. Try again later.');
  }
}
```

### **HMAC Signature Validation**

```javascript
// Client-side: Generating HMAC signature
function generateHMAC(clientSecret, method, path, body, timestamp) {
  const payload = JSON.stringify({
    method: method,
    path: path,
    timestamp: timestamp,
    body: body || {}
  });
  
  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(payload)
    .digest('hex');
  
  return signature;
}

// Server-side: Validating HMAC signature
async function validateHMAC(req) {
  const clientId = req.headers['x-client-id'];
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];
  
  if (!clientId || !timestamp || !signature) {
    throw new Error('Missing required HMAC headers');
  }
  
  // Check timestamp freshness (5-minute window)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  
  if (Math.abs(now - requestTime) > 300000) {
    throw new Error('Request timestamp expired (more than 5 minutes old)');
  }
  
  // Lookup organization by client_id_hash
  const clientIdHash = crypto
    .createHash('sha256')
    .update(clientId)
    .digest('hex');
  
  const org = await db.query(
    'SELECT id, client_secret_hash FROM organizations WHERE client_id_hash = $1',
    [clientIdHash]
  );
  
  if (org.rows.length === 0) {
    throw new Error('Invalid client ID');
  }
  
  // Reconstruct payload
  const payload = JSON.stringify({
    method: req.method,
    path: req.path,
    timestamp: timestamp,
    body: req.body || {}
  });
  
  // Verify signature against client_secret_hash
  const clientSecretHash = org.rows[0].client_secret_hash;
  
  const expectedSignature = crypto
    .createHmac('sha256', clientSecretHash)
    .update(payload)
    .digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )) {
    throw new Error('Invalid HMAC signature');
  }
  
  return org.rows[0].id;  // Return org_id
}
```

---

## HTTP Status Codes & Error Responses

### **Standard Response Format**

```javascript
// Success Response (2xx)
{
  "status": "success",
  "data": { /* ... */ },
  "timestamp": "2025-01-28T10:30:00Z"
}

// Error Response (4xx, 5xx)
{
  "status": "error",
  "error_code": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect",
  "details": {},
  "timestamp": "2025-01-28T10:30:00Z"
}
```

### **Authentication Errors (401)**

| Code | Message | Resolution |
|------|---------|-----------|
| `MISSING_AUTH_HEADER` | Authorization header is missing | Include `Authorization: Bearer <token>` |
| `INVALID_TOKEN_FORMAT` | Invalid token format | Use `Bearer <token>` format |
| `EXPIRED_TOKEN` | Access token has expired | Call refresh endpoint to get new token |
| `INVALID_TOKEN` | Token signature is invalid | Re-authenticate with login |
| `TOKEN_REVOKED` | Token has been revoked | Re-authenticate with login |
| `INVALID_CREDENTIALS` | Email or password is incorrect | Verify email and password |
| `ACCOUNT_LOCKED` | Account locked due to failed attempts | Wait 30 minutes and try again |
| `ACCOUNT_INACTIVE` | Account has been deactivated | Contact administrator |

### **Authorization Errors (403)**

| Code | Message | Resolution |
|------|---------|-----------|
| `INSUFFICIENT_PERMISSION` | User role lacks required permission | Contact org admin for role upgrade |
| `ORG_MISMATCH` | Organization mismatch | Verify client credentials |
| `CROSS_ORG_ACCESS_DENIED` | Cannot access resources from another org | Only access your org's resources |

### **Validation Errors (400)**

| Code | Message | Resolution |
|------|---------|-----------|
| `INVALID_PASSWORD_FORMAT` | Password does not meet security requirements | Min 12 chars, uppercase, lowercase, number, special char |
| `WEAK_PASSWORD` | Password is too common | Choose a more unique password |
| `PASSWORD_REUSE` | Cannot reuse recent passwords | Choose a new password |
| `DUPLICATE_EMAIL` | Email already exists in org | Use a different email |
| `INVALID_EMAIL` | Email format is invalid | Verify email format |
| `MISSING_REQUIRED_FIELD` | Required field is missing | Check request body |
| `INVALID_ROLE` | Invalid role specified | Use 'owner', 'admin', or 'user' |
| `INVALID_REFRESH_TOKEN` | Refresh token is invalid or expired | Re-authenticate with login |

### **HMAC/Signature Errors (401)**

| Code | Message | Resolution |
|------|---------|-----------|
| `MISSING_HMAC_HEADER` | HMAC validation headers are missing | Include X-Client-ID, X-Timestamp, X-Signature |
| `INVALID_CLIENT_ID` | Client ID is invalid | Verify client ID from org registration |
| `INVALID_SIGNATURE` | HMAC signature verification failed | Verify signature calculation |
| `EXPIRED_REQUEST` | Request timestamp is expired | Ensure system clock is synchronized |

### **Resource Errors (404, 409)**

| Code | Message | Resolution |
|------|---------|-----------|
| `USER_NOT_FOUND` | User does not exist | Verify user ID |
| `ORG_NOT_FOUND` | Organization does not exist | Verify org ID |
| `DOCUMENT_NOT_FOUND` | Document does not exist | Verify document ID |
| `ORG_ALREADY_EXISTS` | Organization with this name exists | Use different org name |
| `USER_ALREADY_EXISTS` | Email already registered in org | Use different email |

### **Server Errors (5xx)**

| Code | Message | Cause |
|------|---------|-------|
| `INTERNAL_SERVER_ERROR` | Unexpected server error | Server logs needed for debugging |
| `DATABASE_ERROR` | Database operation failed | Retry request, contact support if persistent |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable | Retry with exponential backoff |

### **Example Error Responses**

**401 - Invalid Credentials**
```json
HTTP/1.1 401 Unauthorized

{
  "status": "error",
  "error_code": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect",
  "details": {
    "failed_attempts": 2,
    "remaining_attempts": 3
  },
  "timestamp": "2025-01-28T10:30:00Z"
}
```

**403 - Insufficient Permission**
```json
HTTP/1.1 403 Forbidden

{
  "status": "error",
  "error_code": "INSUFFICIENT_PERMISSION",
  "message": "User role 'user' lacks required permission",
  "details": {
    "required_role": "admin",
    "user_role": "user"
  },
  "timestamp": "2025-01-28T10:30:00Z"
}
```

**400 - Invalid Password**
```json
HTTP/1.1 400 Bad Request

{
  "status": "error",
  "error_code": "INVALID_PASSWORD_FORMAT",
  "message": "Password does not meet security requirements",
  "details": {
    "violations": [
      "Must contain uppercase letter",
      "Must contain special character"
    ],
    "requirements": {
      "minLength": 12,
      "requireUppercase": true,
      "requireLowercase": true,
      "requireNumbers": true,
      "requireSpecialChars": true
    }
  },
  "timestamp": "2025-01-28T10:30:00Z"
}
```

---

## Session Management

### **Refresh Token Strategy**

```javascript
// On successful login, return both tokens
POST /v1/auth/login → {
  access_token: "eyJhbGciOiJ...",     // 15 min expiry
  refresh_token: "eyJhbGciOiJ...",    // 7 day expiry
  expires_in: 900,                     // seconds
  token_type: "Bearer"
}

// Access token expires → Call refresh endpoint
POST /v1/auth/refresh
Body: { "refresh_token": "eyJhbGciOiJ..." }

→ {
  access_token: "eyJhbGciOiJ...",     // New token
  expires_in: 900,
  token_type: "Bearer"
}

// Refresh token expires → User must re-login
POST /v1/auth/login (full auth again)
```

### **Logout & Token Revocation**

```javascript
// Client-side: Delete tokens from storage
localStorage.removeItem('access_token');
localStorage.removeItem('refresh_token');

// Server-side: Revoke refresh token
POST /v1/auth/logout
Headers: Authorization: Bearer <access_token>
Body: { "refresh_token": "eyJhbGciOiJ..." }

// Database update: Mark refresh token as revoked
UPDATE refresh_tokens 
SET revoked = true 
WHERE token_hash = SHA256(token_id)

// On subsequent refresh attempts, verify revocation status
const token = await db.query(`
  SELECT revoked FROM refresh_tokens WHERE token_hash = $1
`, [tokenHash]);

if (token.rows[0]?.revoked) {
  throw new Error('Token has been revoked');
}
```

### **Token Rotation on Refresh**

```javascript
// Old approach: Reuse refresh token
// ❌ Security risk if refresh token leaks

// Better approach: Rotate refresh token on each refresh
POST /v1/auth/refresh

→ {
  access_token: "eyJhbGciOiJ...",    // New access token
  refresh_token: "eyJhbGciOiJ...",   // NEW refresh token
  expires_in: 900,
  token_type: "Bearer"
}

// Implementation:
async function refreshAccessToken(refreshToken) {
  // 1. Verify old refresh token
  const payload = jwt.verify(refreshToken, JWT_SECRET);
  
  // 2. Check if revoked
  const tokenHash = crypto.createHash('sha256')
    .update(payload.token_id).digest('hex');
  
  const stored = await db.query(
    'SELECT revoked FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );
  
  if (!stored.rows[0] || stored.rows[0].revoked) {
    throw new Error('Invalid or revoked refresh token');
  }
  
  // 3. Generate new tokens
  const newAccessToken = generateAccessToken(payload.user_id);
  const newRefreshToken = generateRefreshToken(payload.user_id);
  
  // 4. Revoke old refresh token
  await db.query(
    'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
    [tokenHash]
  );
  
  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_in: 900
  };
}
```

### **Concurrent Request Handling**

```javascript
// Problem: Multiple tabs/windows making requests simultaneously
// Tab 1: Refresh token at 14:59:45
// Tab 2: Refresh token at 14:59:46 (with old token)
// Result: Both get new tokens, but one refresh_token is revoked

// Solution: Use database locking or distributed cache
async function refreshAccessToken(refreshToken) {
  const payload = jwt.verify(refreshToken, JWT_SECRET);
  
  // Use advisory lock to prevent race conditions
  await db.query('SELECT pg_advisory_lock($1)', 
    [hashToNumber(payload.token_id)]);
  
  try {
    // Check if already refreshed
    const token = await db.query(
      'SELECT revoked FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    );
    
    if (token.rows[0].revoked) {
      // Token already used - possible token theft!
      await logSecurityEvent('token_reuse', payload.user_id);
      throw new Error('Token reuse detected - possible token theft');
    }
    
    // Generate new tokens and revoke old
    const newTokens = await generateNewTokenPair(payload.user_id);
    await db.query(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
      [tokenHash]
    );
    
    return newTokens;
  } finally {
    // Release lock
    await db.query('SELECT pg_advisory_unlock($1)',
      [hashToNumber(payload.token_id)]);
  }
}
```

---

This design ensures:
1. ✅ **Org separation**: Each org has unique HMAC credentials
2. ✅ **Clean JWT**: Only user_id, no role or tenant_id
3. ✅ **Flexible authorization**: Roles can change without token refresh
4. ✅ **Admin controls**: Only admins can upload docs
5. ✅ **User access**: All users can query their org's documents
6. ✅ **Capstone feature**: Client secret/ID generation is core functionality
7. ✅ **Strong security**: Password requirements, account lockout, token rotation
8. ✅ **Production-ready**: Error codes, session management, token revocation