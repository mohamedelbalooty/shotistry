# ADR-009: Cloudflare R2 Object Storage & Workspace-Isolated Key Hierarchy

## Status: ACCEPTED
**Deciders:** Solutions Architect, Security Lead, Full-Stack Engineer  
**Date:** November 2026  

---

## 1. Context & Problem Statement
Shotistry requires reliable, scalable, and zero-egress-fee object storage for:
1. High-resolution raw product photos uploaded by merchants (up to 15MB each).
2. Segmented foreground masks and intermediate processing assets.
3. Commercial studio photography deliverables generated in 1K, 2K, and 4K resolutions.

Storing multi-megabyte binary payloads inside relational database tables (BYTEA / BLOB) causes database bloat, degrades backup speeds, and exhausts serverless connection pool limits. Passing raw base64 strings through serverless function request bodies also imposes unnecessary memory and duration overhead on Vercel compute.

---

## 2. Decision
1. **Cloudflare R2 as Object Storage Provider:** Utilize Cloudflare R2 via `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (S3-compatible API). R2 provides zero-egress bandwidth fees, S3 compatibility, and sub-100ms latency to European and Middle Eastern edge nodes (`fra1` region).
2. **Local Filesystem Fallback for Dev & Tests:** In local development and unit test environments (`isMockFallbackAllowed()`), provide `LocalFsObjectStorage` backed by `.data/assets/` to ensure 100% hermetic offline testing without external Cloudflare credentials.
3. **Workspace-Isolated Key Hierarchy:**
   - Merchant uploads: `ws/{workspaceId}/uploads/{uuid}.{ext}`
   - Generated outputs: `ws/{workspaceId}/outputs/{jobId}/{uuid}.{ext}`
   - Strict validation: `validateWorkspaceKeyAccess(workspaceId, key)` enforces strict tenant prefix matching and rejects path-traversal (`..`, `\`, `\0`).
4. **Presigned Upload & Download Lifecycle:**
   - `POST /api/assets/upload-intent`: Generates presigned `PUT` URL with 300s TTL, enforcing 15MB limit and allowed MIME types (PNG, JPEG, WebP).
   - `POST /api/assets/finalize`: Validates image existence, headers, and pixel integrity via Sharp before marking asset ready.
   - `GET /api/assets/url`: Generates presigned `GET` URL with 600s TTL, returning 404 on cross-tenant probes to prevent resource enumeration.
   - `POST /api/cron/storage-cleanup`: Nightly cron (authenticated with `CRON_SECRET`) purges orphaned upload keys older than 24h.

---

## 3. Consequences
- **Positive:** Direct-to-storage uploads bypass Vercel serverless request body limits; zero bandwidth egress costs; multi-tenant isolation mathematically enforced by storage key prefix.
- **Negative:** Requires managing S3-compatible credentials in staging/production environments (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`).

