# Environment Setup & Configuration Variables

## 1. Required & Optional Environment Variables

Define these variables in `.env.local` for local development and in Vercel / Host Environment Secrets for staging & production:

```env
# Application Core
APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Shotistry"
NODE_ENV="development"

# Database Persistence
# Local dev/test defaults to node:sqlite when SHOTISTRY_DB_DRIVER is unset.
# Set SHOTISTRY_DB_DRIVER="postgres" and provide PostgreSQL connection string for Postgres mode:
DATABASE_URL="postgresql://user:password@localhost:5432/shotistry?schema=public"
SHOTISTRY_DB_DRIVER="sqlite" # "sqlite" | "postgres"

# Authentication, Sessions & Asset Signing (Option A)
# Required in production (>=16 chars, non-placeholder) — fail-closed if unset in NODE_ENV=production:
ASSET_SIGNING_SECRET="replace-with-32-byte-random-hex-secret-for-production"
# Required ONLY when running CLI scripts/bootstrap-admin.mjs (>=24 chars, non-placeholder):
SHOTISTRY_ADMIN_BOOTSTRAP_SECRET="replace-with-minimum-24-char-high-entropy-secret"
# Optional Session TTL Overrides (defaults: 7 days idle, 30 days absolute):
SESSION_IDLE_TTL_SECONDS="604800"
SESSION_ABSOLUTE_TTL_SECONDS="2592000"

# Google Gemini Interactions API (AI Engine)
GEMINI_API_KEY="AIzaSyYourProductionGeminiApiKeyHere"

# Paymob Payment Gateway (Unified Checkout & Webhooks)
# PAYMOB_HMAC_SECRET is strictly required for POST /api/webhooks/paymob (503 fail-closed when missing):
PAYMOB_HMAC_SECRET="your_paymob_hmac_secret_sha512"
PAYMOB_SECRET_KEY="egy_sk_live_your_paymob_secret_key"
PAYMOB_API_KEY="your_paymob_api_key"
PAYMOB_PUBLIC_KEY="pk_your_paymob_public_key"
PAYMOB_EG_INTEGRATION_ID="12345"
PAYMOB_SA_INTEGRATION_ID="67890"

# Rate Limiting & Abuse Prevention (Distributed, Fail-Closed in Production)
# Primary production recommendation: Upstash Redis REST (/eval Lua atomic counter)
UPSTASH_REDIS_REST_URL="https://your-database-id.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-rest-token"
# Optional overrides: 'upstash' | 'postgres' | 'memory' ('memory' forbidden in production)
SHOTISTRY_RATE_LIMIT_BACKEND="upstash"
# Number of trusted reverse proxies when inspecting X-Forwarded-For (default: rightmost non-private IP)
SHOTISTRY_TRUSTED_PROXY_COUNT="1"

# Transactional Email Service (Resend API Transport)
RESEND_API_KEY="re_your_resend_api_key_here"
EMAIL_FROM="Shotistry Security <security@mail.shotistry.com>"
EMAIL_REPLY_TO="support@shotistry.com"
APP_BASE_URL="https://app.shotistry.com"

# Password Hashing Concurrency & Safety
SHOTISTRY_MAX_CONCURRENT_HASHES="4"
SHOTISTRY_HASH_SEMAPHORE_TIMEOUT_MS="2500"

# Planned: Cloudflare R2 / S3 Object Storage Adapter (Future External Storage)
# STORAGE_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
# STORAGE_ACCESS_KEY_ID="your-r2-access-key-id"
# STORAGE_SECRET_ACCESS_KEY="your-r2-secret-access-key"
# STORAGE_BUCKET_NAME="shotistry-assets"
# NEXT_PUBLIC_CDN_URL="https://cdn.shotistry.com"
```

---

## 2. Out-of-Band Initial Platform Administrator Bootstrap

Platform `ADMIN` accounts are **never** created via HTTP registration or default runtime seeding. Run the dedicated Node.js 24 CLI once after initial database migration:

```bash
SHOTISTRY_ADMIN_BOOTSTRAP_SECRET="<min-24-char-secret>" \
ADMIN_EMAIL="admin@shotistry.com" \
ADMIN_PASSWORD="<min-12-char-strong-password>" \
ADMIN_NAME="Shotistry Platform Admin" \
node --experimental-strip-types scripts/bootstrap-admin.mjs
```

- Refuses weak secrets (`< 24` chars) or placeholder substrings.
- Enforces `ADMIN_PASSWORD` minimum 12 characters with mixed letters and digits.
- Fails closed (`ADMIN_ALREADY_BOOTSTRAPPED`) if an `ADMIN` row already exists in `"User"`.
- Emits an immutable `PLATFORM_ADMIN_BOOTSTRAP` record in `"AdminAuditLog"`.
