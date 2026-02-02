# Content Management Service

Content Management service for the AI FAQ Platform. Handles document upload (presigned S3 URLs), metadata CRUD, status tracking, and Kafka events.

## Endpoints
- POST /v1/documents/upload
- GET /v1/documents
- GET /v1/documents/:id/status
- DELETE /v1/documents/:id

Swagger: /docs (UI), /openapi.json (raw spec)

## Run locally
1. Copy env: `cp .env.example .env` and set values
2. Run migrations: `npm run migrate`
3. Start service: `npm run dev`

For local testing without API Gateway, set headers:
- x-org-id: <uuid>
- x-user-id: <uuid>
- x-role: owner|admin|user
npm i
## Kafka Topics
- document.uploaded (produced)
- document.processed (consumed)
- document.failed (consumed)

## Notes
- All DB queries are scoped by org_id.
- Presigned URLs lock uploads to org folder: `{org_id}/documents/{document_id}.{ext}`.
- Soft delete is implemented (deleted_at).
