# Staging Deployment Guide & Rollback Procedure

**Platform:** Vercel (Preview Deployment) & Neon (PostgreSQL 16)  
**Target Domain:** `https://staging.shotistry.com` (or Vercel-assigned branch deployment URL)  
**Target Branch:** `audit/production-readiness`  
**Node.js Runtime:** 24.x LTS  

---

## 1. Architecture & Isolation Invariants

1. **Strict Staging Isolation:**
   - The staging environment operates on dedicated infrastructure completely isolated from production.
   - Database: Dedicated Neon staging project (`shotistry-staging`, region `eu-central-1`). Never connect staging to production databases.
   - Object Storage: Dedicated Cloudflare R2 bucket (`shotistry-assets-staging`).
   - Paymob: Sandbox credentials only (`PAYMOB_EG_*` and `PAYMOB_SA_*`).
   - Gemini API: Bounded test budget / mocked responses until founder approves live spending.
2. **Vercel Preview Scoping:**
   - Vercel staging deployments are mapped to Git branch `audit/production-readiness` as a Preview deployment.
   - Automatic promotion to Production is **DISABLED**.
   - Git push automatic deployment is disabled; staging deployments are triggered manually via Vercel CLI or manual deployment buttons.

---

## 2. Infrastructure Setup & Prerequisites

### 2.1 Neon PostgreSQL Provisioning
1. Log into Neon console (`console.neon.tech`).
2. Create project `shotistry-staging` in region `AWS Europe (Frankfurt) / eu-central-1`.
3. Note two connection strings from the Dashboard:
   - **Pooled URL (`DATABASE_URL`):** `postgres://[user]:[password]@[endpoint]-pooler.eu-central-1.aws.neon.tech/neondb?pgbouncer=true&sslmode=require`
   - **Direct URL (`DIRECT_URL`):** `postgres://[user]:[password]@[endpoint].eu-central-1.aws.neon.tech/neondb?sslmode=require`

### 2.2 Cloudflare R2 Storage Bucket
1. Create R2 bucket: `shotistry-assets-staging`.
2. Generate API token with `Object Read & Write` permissions scoped to `shotistry-assets-staging`.
3. Configure bucket CORS:
   ```json
   [
     {
       "AllowedOrigins": ["https://staging.shotistry.com", "https://*.vercel.app"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

---

## 3. Environment Variables Configuration (Vercel Preview)

Configure the following environment variables in the Vercel project settings, scoped **strictly to Preview environments**:

| Variable Name | Required Value / Source | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production Next.js optimizations |
| `SHOTISTRY_DEPLOY_ENV` | `staging` | Declares staging environment |
| `SHOTISTRY_DB_DRIVER` | `postgres` | Forces PostgreSQL repository driver |
| `DATABASE_URL` | `postgres://...@ep-staging-pooler.eu-central-1.aws.neon.tech/neondb?pgbouncer=true&sslmode=require` | Pooled connection for app runtime |
| `DIRECT_URL` | `postgres://...@ep-staging.eu-central-1.aws.neon.tech/neondb?sslmode=require` | Direct connection for Prisma migrations |
| `SESSION_SECRET` | 64+ char random hex | Cookie session encryption key |
| `CRON_SECRET` | 32+ char random hex | Protects `/api/cron/*` endpoints |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key | Storage credentials |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key | Storage credentials |
| `R2_BUCKET_NAME` | `shotistry-assets-staging` | Staging bucket name |
| `R2_PUBLIC_DOMAIN` | `https://assets-staging.shotistry.com` | Optional CDN delivery domain |
| `GEMINI_API_KEY` | Google AI Studio key | Gemini image generation API key |
| `PAYMOB_EG_API_KEY` | Paymob Egypt test key | Egypt sandbox API key |
| `PAYMOB_EG_HMAC_SECRET` | Paymob Egypt test HMAC | Egypt sandbox HMAC secret |
| `PAYMOB_EG_INTEGRATION_ID` | Paymob Egypt test card ID | Egypt integration ID |
| `PAYMOB_SA_API_KEY` | Paymob Saudi test key | Saudi sandbox API key |
| `PAYMOB_SA_HMAC_SECRET` | Paymob Saudi test HMAC | Saudi sandbox HMAC secret |
| `PAYMOB_SA_INTEGRATION_ID` | Paymob Saudi test card ID | Saudi integration ID |
| `RESEND_API_KEY` | Resend API key | Transactional email delivery |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | Distributed rate limiting store |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Distributed rate limiting token |

---

## 4. Deployment Execution Steps

### Step 1: Execute Database Migrations
Run Prisma migrations against the staging database using `DIRECT_URL`:
```bash
DIRECT_URL="postgres://..." DATABASE_URL="postgres://..." npx prisma migrate deploy
```

### Step 2: Bootstrap Staging Admin Account
Run the secure bootstrap script to create the initial admin user:
```bash
SHOTISTRY_ADMIN_BOOTSTRAP_SECRET="[secure-bootstrap-secret]" \
DATABASE_URL="postgres://..." \
node scripts/bootstrap-admin.mjs
```
*Immediately remove `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` from environment variables once completed.*

### Step 3: Trigger Vercel Staging Deployment
Deploy the verified `audit/production-readiness` commit via Vercel CLI:
```bash
# Pull Vercel preview project configuration
npx vercel pull --environment=preview

# Build and deploy preview
npx vercel deploy --prebuilt
```

### Step 4: Health Check Verification
Verify the deployed staging instance:
```bash
curl -i https://staging.shotistry.com/api/health
```
Expected response:
- HTTP status: `200 OK`
- `status`: `"pass"`
- `checks.database`: `"POSTGRESQL"`
- `checks.storage`: `"OPERATIONAL_SIGNED_URLS"`

---

## 5. Instant Rollback Procedure

In the event of a critical defect, regression, or Sev-1 outage on staging:

### 5.1 Application Rollback (Target RTO: < 2 minutes)
1. Navigate to Vercel Project Dashboard → **Deployments**.
2. Locate the previous verified deployment SHA.
3. Click **Instant Rollback** (or click `Promote / Re-assign Alias` to point `staging.shotistry.com` to the previous deployment).
4. Vercel routes traffic to the previous deployment artifact immediately without rebuilding.

### 5.2 Schema Compatibility Invariant
- All Shotistry database migrations are strictly **additive** (adding nullable columns, new tables, or new indexes).
- Destructive operations (`DROP COLUMN`, `RENAME TABLE`, non-nullable additions without defaults) are prohibited.
- Because migrations are additive, the previous application version can safely run against the latest database schema during a rollback.

---

## 6. Secret Rotation Procedure

| Secret | Frequency | Procedure | Zero-Downtime? |
|---|---|---|---|
| `SESSION_SECRET` | 90 days or on breach | Update Vercel env var and redeploy. All active sessions are safely invalidated and merchants log in again. | Yes |
| `CRON_SECRET` | 90 days | Update Vercel env var and update cron scheduler auth header simultaneously. | Yes |
| `PAYMOB_*_HMAC_SECRET` | 180 days | Generate new HMAC secret in Paymob dashboard; update Vercel env var; redeploy. | Yes |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 90 days | Generate new Cloudflare R2 token; update Vercel env var; test upload intent; revoke old token. | Yes |
| `GEMINI_API_KEY` | 90 days | Generate new key in Google AI Studio; update Vercel env var; redeploy. | Yes |
| `DATABASE_URL` (Neon Password) | On compromise | Reset role password in Neon console; update `DATABASE_URL` and `DIRECT_URL` in Vercel; redeploy. | Brief connection reconnect |
