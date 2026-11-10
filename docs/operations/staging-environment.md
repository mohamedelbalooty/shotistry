# Shotistry Staging Environment Specification & Inventory

## 1. Overview & Strategy
The Shotistry staging environment is an isolated, production-like deployment configured for controlled testing, live third-party integration smoke verification, and closed beta validation for Egyptian (EGP) and Saudi Arabian (SAR) commercial merchants.

In accordance with the **Free-First Infrastructure Strategy**, staging uses free and developer tiers wherever compliant and available:
- **Compute / Hosting:** Vercel Preview Deployments (`NODE_ENV=production`, `SHOTISTRY_DEPLOY_ENV=staging`, region: `fra1` Frankfurt).
- **Relational Persistence:** Managed PostgreSQL 16 (Neon Free Tier, isolated project: `shotistry-staging`, never shared with production).
- **Object Storage:** Cloudflare R2 (`shotistry-staging-assets`, free tier: 10GB storage, 10M Class B operations/month).
- **Transactional Email:** Resend Free Tier (3,000 emails/month, 100/day limit, domain-verified).
- **Distributed Rate Limiting:** Managed PostgreSQL Store (`RateLimitBucket` row locks) with optional Upstash Redis Free REST fallback.
- **AI Processing:** Google Gemini Interactions API (`gemini-3.1-flash-image` default, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) on Paid Tier, with request-level safeguards and an explicit spending cap.
- **Payments:** Paymob Sandbox (independent Egyptian Pound `EGP` and Saudi Riyal `SAR` merchant test credentials).

---

## 2. Environment Taxonomy (`SHOTISTRY_DEPLOY_ENV`)
Shotistry enforces strict environment classification to prevent mock leakages or accidental payment simulation in production-like environments:

| Environment | `SHOTISTRY_DEPLOY_ENV` | `NODE_ENV` | Local FS Fallback | Mock AI Fallback | Webhook Simulation | Rate Limiter |
|---|---|---|---|---|---|---|
| **Local Dev** | `local` | `development` | Enabled (`.data/`) | Enabled | Enabled | `memory` |
| **Unit Test** | `test` | `test` | Enabled (`.data/`) | Enabled | Enabled | `memory` |
| **Staging** | `staging` | `production` | **Disabled** (R2 required) | **Disabled** (Fails closed) | **Disabled (403)** | `postgres` / `upstash` |
| **Production** | `production` | `production` | **Disabled** (R2 required) | **Disabled** (Fails closed) | **Disabled (403)** | `postgres` / `upstash` |

### 2.1 Staging vs Test Database Isolation Invariant
To prevent destructive test runners from mutating or dropping staging application data, Shotistry enforces a strict **Dual-Database Isolation Architecture**:
1. **Application Staging Database (`shotistry_staging`):**
   - Configured via `DATABASE_URL` (pooled `-pooler` endpoint) and `DIRECT_URL` (direct port 5432 endpoint).
   - Only non-destructive, audited migrations (`prisma migrate deploy`) and safe smoke probes (`npm run smoke:pg`) may execute against this database.
   - Destructive test runners, schema drops, and `deleteMany` operations are strictly forbidden.
2. **Dedicated Test Database (`shotistry_staging_test`):**
   - Configured exclusively via `POSTGRES_TEST_URL`.
   - Must strictly end with `_test`.
   - Test runner (`scripts/run-pg-tests.mjs`) validates that `POSTGRES_TEST_URL` does not point to `DATABASE_URL` or `DIRECT_URL`.
   - Any attempt to run tests against the staging application database immediately terminates with a fatal `SAFETY_ABORT`.

---

## 3. Environment Variable Inventory for Staging

| Variable Name | Required | Example / Value Format | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Enables Next.js optimizations and strict security cookies. |
| `SHOTISTRY_DEPLOY_ENV` | Yes | `staging` | Declares deployment environment; blocks mocks and sandbox simulations. |
| `APP_BASE_URL` | Yes | `https://staging.shotistry.com` (or preview URL) | Base URL for email verification links and action tokens. |
| `DATABASE_URL` | Yes | `postgresql://user:pass@ep-staging-pooler.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require` | Pooled connection URL for serverless application queries. |
| `DIRECT_URL` | Yes | `postgresql://user:pass@ep-staging.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require` | Direct connection URL on port 5432 for `prisma migrate deploy`. |
| `POSTGRES_TEST_URL` | Testing Only | `postgresql://user:pass@ep-staging.eu-central-1.aws.neon.tech/shotistry_staging_test?sslmode=require` | Dedicated isolated integration test database (strictly requires `_test` suffix; never points to staging DB). |
| `SHOTISTRY_DB_DRIVER` | Yes | `postgres` | Enforces PostgreSQL driver and repository implementation. |
| `ASSET_SIGNING_SECRET` | Yes | 32-byte secure random hex | Signs temporary asset download capabilities. |
| `CRON_SECRET` | Yes | 32-byte secure random hex | Authenticates `/api/cron/*` endpoints from Vercel Cron. |
| `SHOTISTRY_RATE_LIMIT_BACKEND` | Yes | `postgres` (or `upstash`) | Enforces distributed rate limiting backend. |
| `SHOTISTRY_TRUSTED_PROXY_COUNT` | Yes | `1` | Trusted proxy hop count behind Vercel reverse proxy. |
| `SHOTISTRY_MAX_CONCURRENT_HASHES` | Yes | `4` | Maximum concurrent Argon2id hashing operations. |
| `R2_ACCOUNT_ID` | Yes | `<cloudflare_account_id>` | Cloudflare account ID for R2 storage. |
| `R2_ACCESS_KEY_ID` | Yes | `<r2_access_key>` | S3-compatible R2 access key. |
| `R2_SECRET_ACCESS_KEY` | Yes | `<r2_secret_key>` | S3-compatible R2 secret access key. |
| `R2_BUCKET_NAME` | Yes | `shotistry-staging-assets` | Target private storage bucket. |
| `GEMINI_API_KEY` | Yes | `AIzaSy...` | Paid Google Gemini API key. |
| `PAYMOB_EG_SECRET_KEY` | Yes | `sec_test_eg_...` | Paymob Egypt Sandbox secret key. |
| `PAYMOB_EG_PUBLIC_KEY` | Yes | `pk_test_eg_...` | Paymob Egypt Sandbox public key. |
| `PAYMOB_EG_HMAC_SECRET` | Yes | Hex string | Paymob Egypt Sandbox HMAC-SHA512 secret. |
| `PAYMOB_SA_SECRET_KEY` | Yes | `sec_test_sa_...` | Paymob KSA Sandbox secret key. |
| `PAYMOB_SA_PUBLIC_KEY` | Yes | `pk_test_sa_...` | Paymob KSA Sandbox public key. |
| `PAYMOB_SA_HMAC_SECRET` | Yes | Hex string | Paymob KSA Sandbox HMAC-SHA512 secret. |
| `RESEND_API_KEY` | Yes | `re_...` | Resend API key for transactional emails. |
| `EMAIL_FROM` | Yes | `Shotistry Staging <no-reply@mail.staging.shotistry.com>` | Verified sending identity. |
| `EMAIL_REPLY_TO` | Optional | `support@shotistry.com` | Customer support reply address. |
| `SHOTISTRY_BETA_INVITE_REQUIRED` | Yes | `1` | Restricts registrations to invited beta merchants. |

---

## 4. Health & Monitoring Check
The staging environment exposes a public health telemetry endpoint:
- **URL:** `GET /api/health`
- **Response Format:**
```json
{
  "status": "healthy",
  "deployEnv": "staging",
  "timestamp": "2026-11-09T20:30:00.000Z",
  "uptimeSeconds": 1420,
  "database": {
    "driver": "postgres",
    "connected": true
  },
  "storage": {
    "driver": "r2",
    "ready": true
  },
  "config": {
    "valid": true,
    "missingCount": 0
  }
}
```
If the database or critical configurations are missing in staging, the endpoint returns HTTP 503 `degraded`.

