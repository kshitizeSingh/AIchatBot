# Startup Guide - Content Management Service

This guide covers initial setup for AWS (S3), Kafka, and Database for the Content Service.

## 1. Database (PostgreSQL)

Environment (from request):
- DB_HOST=postgres
- DB_PORT=5432
- DB_USER=fce_user
- DB_PASSWORD=SecurePass123
- DB_POOL_SIZE=20
- DB_IDLE_TIMEOUT=30000
- DB_CONNECTION_TIMEOUT=2000

Add DB_NAME if not present (default: faq_platform). You can also set a DATABASE_URL directly.

Steps:
1. Create database and grant privileges to `fce_user` if not already provisioned.
2. Configure env in `.env`.
3. Run migrations:
```
cd services/content-service
npm install
npm run migrate
```

## 2. Kafka

- Ensure a Kafka broker is reachable at KAFKA_BROKERS (e.g., `kafka:29092` in Docker, or `localhost:9092`).
- Create topics (if auto-create is disabled):
```
# Using Kafka CLI
kafka-topics --bootstrap-server localhost:9092 --create --topic document.uploaded --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --topic document.processed --partitions 3 --replication-factor 1
kafka-topics --bootstrap-server localhost:9092 --create --topic document.failed --partitions 3 --replication-factor 1
```

## 3. AWS S3 (or MinIO)

### Option A: AWS S3
1. Create a bucket (e.g., `faq-documents`).
2. Apply the bucket policy from `solution/contentManagement/s3_isolation.md` to enforce secure uploads.
3. Create an IAM user/role for the service with restricted access (org-scoped if using tags).
4. Set env:
```
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=faq-documents
AWS_ACCESS_KEY_ID=... 
AWS_SECRET_ACCESS_KEY=...
PRESIGNED_URL_EXPIRY=900
```

### Option B: MinIO (Local S3-compatible)
1. Run MinIO locally (or via Docker).
2. Set env and override S3 endpoint:
```
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export AWS_REGION=us-east-1
export AWS_S3_BUCKET=faq-documents
# Add SDK override in code or environment if using custom endpoint
```
3. Create bucket `faq-documents`.


## 4. Local Development (Docker)

We provide Dockerfile and docker-compose for local spin-up.

Build and run service with dependencies:
```
cd services/content-service
# Build image
docker build -t content-service:local .

# Or use docker-compose to build and start Postgres + Kafka + service
docker compose up -d --build

# View logs
docker compose logs -f content-service

# Stop
docker compose down
```

The compose starts:
- Postgres (db: faq_platform, user: fce_user)
- Zookeeper + Kafka (PLAINTEXT)
- Content Service on http://localhost:3002

## 5. Service Startup (Non-Docker)
```
cd services/content-service
npm install
npm run migrate
npm run dev
```

Health:
- /health → basic liveness
- /ready → DB readiness

- /docs → Swagger UI (served from static OpenAPI)
- /openapi.json → Raw OpenAPI specification

## 6. Security Notes
- All endpoints expect JWT+HMAC at API Gateway. For local dev we inject req.user from headers.
- All queries include org_id filtering.
- Presigned URLs lock path to `{org_id}/documents/{docId}.ext`.


## 7. Troubleshooting
- DB connection issues: verify env, network, and that migrations ran.
- Kafka: check broker address and topic existence.
- S3: verify credentials and bucket policy; ensure system clock is correct for presigned URLs.
