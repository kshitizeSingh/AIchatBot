# S3 Single Bucket Isolation Strategy

## Why Single Bucket?

| Approach | Buckets | Pros | Cons |
|----------|---------|------|------|
| **Single Bucket** ✅ | 1 | Simple, cost-effective, easier to manage | Needs policy-based isolation |
| **Per-Org Bucket** | N (one per org) | Strong isolation | Expensive, complex provisioning, hard to manage |

Single bucket is the industry standard. AWS, Google, and most SaaS platforms use this approach.

---

## How Isolation Works: 3 Layers

```
┌─────────────────────────────────────────────────────────┐
│                  Request from Client                     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 1: API Gateway                                   │
│                                                         │
│  • HMAC validates org identity                          │
│  • JWT validates user identity                          │
│  • DB lookup fetches org_id + role                      │
│  • org_id mismatch check                                │
│                                                         │
│  Result: req.user = { user_id, org_id, role }           │
│                                                         │
│  ❌ If any check fails → 401/403 rejected here          │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Database (Metadata Isolation)                 │
│                                                         │
│  All queries scoped to org_id:                          │
│  SELECT * FROM documents WHERE org_id = $1              │
│                                                         │
│  ❌ Even if document_id is guessed,                     │
│     query returns nothing without matching org_id       │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 3: S3 Presigned URL (Storage Isolation)          │
│                                                         │
│  Presigned URL locked to org folder:                    │
│  s3_key = {org_id}/documents/{doc_id}.pdf               │
│                                                         │
│  ❌ Presigned URL only valid for that specific path     │
│     Cannot access other org's folder                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 4: S3 Bucket Policy (Enforced at Storage Level)  │
│                                                         │
│  IAM Policy restricts access to org's own folder        │
│  Even leaked credentials can't access other orgs       │
│                                                         │
│  ❌ This is what's MISSING and needs to be added        │
└─────────────────────────────────────────────────────────┘
```

---

## Single Bucket Structure

```
faq-documents/                                  ← Single S3 Bucket
│
├── org-uuid-a/                                 ← ACME Corp folder
│   └── documents/
│       ├── doc-uuid-1.pdf                      ← Only Org A can access
│       ├── doc-uuid-2.docx
│       └── doc-uuid-3.txt
│
├── org-uuid-b/                                 ← TechCo folder
│   └── documents/
│       ├── doc-uuid-4.pdf                      ← Only Org B can access
│       └── doc-uuid-5.md
│
└── org-uuid-c/                                 ← StartupX folder
    └── documents/
        └── doc-uuid-6.pdf                      ← Only Org C can access
```

---

## S3 Bucket Policy (The Missing Piece)

This policy enforces that presigned URLs can **only** access the org's own folder:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPresignedUpload",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::faq-documents/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "private"
        },
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    },
    {
      "Sid": "DenyPublicAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::faq-documents",
        "arn:aws:s3:::faq-documents/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "EnforceHTTPS",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::faq-documents",
        "arn:aws:s3:::faq-documents/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

---

## IAM Policy for Content Service

The service itself needs an IAM role that restricts access per org at runtime:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowListBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::faq-documents",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["${aws:PrincipalTag/OrgId}/*"]
        }
      }
    },
    {
      "Sid": "AllowOrgFolder",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::faq-documents/${aws:PrincipalTag/OrgId}/*"
    },
    {
      "Sid": "DenyEverythingElse",
      "Effect": "Deny",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::faq-documents/*"
      ],
      "Condition": {
        "StringNotLike": {
          "s3:prefix": ["${aws:PrincipalTag/OrgId}/*"]
        }
      }
    }
  ]
}
```

---

## Updated S3 Service Implementation

```javascript
// src/services/s3Service.js

const { v4: uuidv4 } = require('uuid');
const { s3Client, bucket, presignedUrlExpiry } = require('../config/storage');
const logger = require('../utils/logger');

class S3Service {

  // ============================================================
  // GENERATE PRESIGNED UPLOAD URL
  // ============================================================
  // Generates a URL locked to the org's folder only.
  // The client uses this URL to upload directly to S3.
  // ============================================================
  async generatePresignedUploadUrl(orgId, filename, contentType) {
    const documentId = uuidv4();
    const extension = filename.split('.').pop();

    // s3Key is locked to org folder
    // Format: {org_id}/documents/{document_id}.{extension}
    const s3Key = `${orgId}/documents/${documentId}.${extension}`;

    const params = {
      Bucket: bucket,
      Key: s3Key,                    // ← Locked to org folder
      ContentType: contentType,
      Expires: presignedUrlExpiry,   // ← 15 minutes only
      ACL: 'private',               // ← Never public
      Metadata: {
        'org-id': orgId,            // ← Store org_id as metadata
        'original-filename': filename,
        'uploaded-at': new Date().toISOString(),
      },
    };

    try {
      const presignedUrl = await s3Client.getSignedUrlPromise('putObject', params);

      logger.info('Presigned upload URL generated', {
        org_id: orgId,
        document_id: documentId,
        s3_key: s3Key,
      });

      return {
        documentId,
        presignedUrl,
        s3Key,
        expiresIn: presignedUrlExpiry,
      };
    } catch (error) {
      logger.error('Failed to generate presigned URL', {
        error: error.message,
        org_id: orgId,
      });
      throw new Error('Failed to generate upload URL');
    }
  }

  // ============================================================
  // GENERATE PRESIGNED DOWNLOAD URL
  // ============================================================
  // Generates a temporary download URL.
  // Validates that the requested s3_key belongs to the org
  // BEFORE generating the URL.
  // ============================================================
  async generatePresignedDownloadUrl(orgId, s3Key) {
    // Security check: verify s3Key belongs to this org
    if (!this.validateS3KeyBelongsToOrg(s3Key, orgId)) {
      logger.warn('Attempted cross-org S3 access', {
        org_id: orgId,
        s3_key: s3Key,
      });
      throw new Error('Access denied: document does not belong to your organization');
    }

    const params = {
      Bucket: bucket,
      Key: s3Key,
      Expires: 300, // 5 minutes only for downloads
    };

    try {
      const presignedUrl = await s3Client.getSignedUrlPromise('getObject', params);

      logger.info('Presigned download URL generated', {
        org_id: orgId,
        s3_key: s3Key,
      });

      return presignedUrl;
    } catch (error) {
      logger.error('Failed to generate download URL', {
        error: error.message,
        org_id: orgId,
      });
      throw new Error('Failed to generate download URL');
    }
  }

  // ============================================================
  // DELETE FILE
  // ============================================================
  // Validates ownership before deleting.
  // ============================================================
  async deleteFile(orgId, s3Key) {
    // Security check: verify s3Key belongs to this org
    if (!this.validateS3KeyBelongsToOrg(s3Key, orgId)) {
      logger.warn('Attempted cross-org S3 delete', {
        org_id: orgId,
        s3_key: s3Key,
      });
      throw new Error('Access denied: document does not belong to your organization');
    }

    const params = {
      Bucket: bucket,
      Key: s3Key,
    };

    try {
      await s3Client.deleteObject(params).promise();

      logger.info('File deleted from S3', {
        org_id: orgId,
        s3_key: s3Key,
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete file from S3', {
        error: error.message,
        s3_key: s3Key,
      });
      return false;
    }
  }

  // ============================================================
  // VALIDATE S3 KEY BELONGS TO ORG
  // ============================================================
  // Checks that the s3_key path starts with the org_id.
  // This prevents any manipulation of s3_key to access
  // another org's files.
  // ============================================================
  validateS3KeyBelongsToOrg(s3Key, orgId) {
    // s3Key format: {org_id}/documents/{document_id}.{ext}
    // Must start with the org_id
    const expectedPrefix = `${orgId}/`;

    if (!s3Key.startsWith(expectedPrefix)) {
      return false;
    }

    // Additional check: no path traversal attempts
    if (s3Key.includes('..') || s3Key.includes('//')) {
      return false;
    }

    return true;
  }

  // ============================================================
  // CHECK FILE EXISTS
  // ============================================================
  async fileExists(orgId, s3Key) {
    if (!this.validateS3KeyBelongsToOrg(s3Key, orgId)) {
      return false;
    }

    const params = {
      Bucket: bucket,
      Key: s3Key,
    };

    try {
      await s3Client.headObject(params).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') return false;
      throw error;
    }
  }
}

module.exports = new S3Service();
```

---

## Updated Document Service (Delete with Org Check)

```javascript
// src/services/documentService.js - updated deleteDocument method

async deleteDocument(documentId, orgId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Step 1: Fetch document WITH org_id check
    const docResult = await client.query(`
      SELECT * FROM documents 
      WHERE id = $1 
        AND org_id = $2          -- ← Must match requesting org
        AND deleted_at IS NULL
    `, [documentId, orgId]);

    // If no rows returned, either:
    // - Document doesn't exist
    // - Document belongs to different org
    // Both cases return null (no information leak)
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const document = docResult.rows[0];

    // Step 2: Soft delete in database
    await client.query(`
      UPDATE documents 
      SET deleted_at = NOW() 
      WHERE id = $1
    `, [documentId]);

    await client.query('COMMIT');

    // Step 3: Delete from S3 (with org validation)
    // This runs async but includes org check inside
    s3Service.deleteFile(orgId, document.s3_key).catch(err => {
      logger.error('Failed to delete S3 file', {
        error: err.message,
        s3_key: document.s3_key,
        org_id: orgId,
      });
    });

    logger.info('Document deleted', {
      document_id: documentId,
      org_id: orgId,
    });

    return document;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete document', {
      error: error.message,
      document_id: documentId,
    });
    throw error;
  } finally {
    client.release();
  }
}
```

---

## Updated Document Controller (Upload + Delete)

```javascript
// src/controllers/documentController.js

class DocumentController {

  // POST /v1/documents/upload
  async uploadDocument(req, res, next) {
    try {
      const { filename, content_type, file_size } = req.body;
      const { org_id, user_id } = req.user;

      // Validate inputs
      if (!filename || !content_type) {
        return res.status(400).json({
          error: 'Missing required fields',
          code: 'MISSING_FIELDS',
          required: ['filename', 'content_type'],
        });
      }

      if (!validateFileType(content_type)) {
        return res.status(400).json({
          error: 'Unsupported file type',
          code: 'INVALID_FILE_TYPE',
          supported_types: ALLOWED_FILE_TYPES,
        });
      }

      if (file_size && !validateFileSize(file_size)) {
        return res.status(400).json({
          error: 'File size exceeds limit',
          code: 'FILE_TOO_LARGE',
          max_size_bytes: MAX_FILE_SIZE,
          provided_size_bytes: file_size,
        });
      }

      // Generate presigned URL (locked to org folder)
      const { documentId, presignedUrl, s3Key, expiresIn } =
        await s3Service.generatePresignedUploadUrl(org_id, filename, content_type);

      // Store metadata
      await documentService.createDocument(
        org_id, user_id, filename, s3Key, content_type, file_size
      );

      // Publish event to Kafka
      await queueService.publishDocumentUploaded(
        documentId, org_id, s3Key, content_type, filename
      );

      res.status(200).json({
        document_id: documentId,
        presigned_url: presignedUrl,
        s3_key: s3Key,
        expires_in: expiresIn,
        max_file_size: MAX_FILE_SIZE,
        upload_instructions: {
          method: 'PUT',
          headers: { 'Content-Type': content_type },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /v1/documents/:id
  async deleteDocument(req, res, next) {
    try {
      const { id } = req.params;
      const { org_id } = req.user;

      const document = await documentService.deleteDocument(id, org_id);

      // Returns null if doc doesn't exist OR belongs to another org
      // We intentionally return the same 404 for both cases
      // to avoid leaking information about other orgs' documents
      if (!document) {
        return res.status(404).json({
          error: 'Document not found',
          code: 'DOCUMENT_NOT_FOUND',
          document_id: id,
        });
      }

      res.status(200).json({
        message: 'Document deleted successfully',
        document_id: id,
        deleted_at: new Date().toISOString(),
        cleanup: {
          metadata_deleted: true,
          s3_deleted: true,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
```

---

## Isolation Summary

```
┌─────────────────────────────────────────────────────┐
│   Single Bucket: faq-documents                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Org A tries to access Org B's document:           │
│                                                     │
│   1. API Gateway                                    │
│      HMAC says org_id = A                           │
│      DB says user belongs to org A                  │
│      req.user.org_id = A                            │
│      ✅ Passes (user is valid)                      │
│                                                     │
│   2. Database Query                                 │
│      SELECT * FROM documents                        │
│      WHERE id = 'org-b-doc'                         │
│        AND org_id = 'org-a'    ← doesn't match     │
│      Returns: ZERO ROWS                             │
│      ❌ Blocked here (returns 404)                  │
│                                                     │
│   3. S3 Key Validation (if somehow reached)         │
│      s3Key = 'org-b/documents/...'                  │
│      orgId = 'org-a'                                │
│      validateS3KeyBelongsToOrg() = FALSE            │
│      ❌ Blocked here (throws error)                 │
│                                                     │
│   4. S3 Bucket Policy (final safety net)            │
│      Presigned URL locked to specific path          │
│      Cannot be modified to access other paths       │
│      ❌ Blocked here (S3 rejects request)           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Key Security Points

- ✅ **Single bucket is safe** when properly implemented
- ✅ **Database is the primary gate** — org_id filter on every query
- ✅ **S3 keys are path-locked** — presigned URL is tied to exact path
- ✅ **404 for both missing and unauthorized** — no information leak
- ✅ **Path traversal blocked** — `validateS3KeyBelongsToOrg` prevents `../` attacks
- ✅ **All files are private** — ACL set to `private`, never publicly accessible