# Environment Setup & Configuration Variables

## Required Environment Variables

All variables must be defined in your `.env.local` for development and in Vercel Project Settings for production:

```env
# Application Core
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Shotistry"
NODE_ENV="development"

# Database Persistence
DATABASE_URL="postgresql://user:password@localhost:5432/shotistry?schema=public"

# Authentication & Session Security
NEXTAUTH_SECRET="generate-a-secure-32-byte-hex-string-for-production"
NEXTAUTH_URL="http://localhost:3000"

# Google Gemini / Imagen AI Engine
GEMINI_API_KEY="AIzaSyYourProductionGeminiApiKeyHere"

# Paymob Payment Gateway
PAYMOB_API_KEY="sec_your_paymob_api_key"
PAYMOB_PUBLIC_KEY="pk_your_paymob_public_key"
PAYMOB_HMAC_SECRET="your_paymob_hmac_secret_sha512"
PAYMOB_EG_INTEGRATION_ID="12345"
PAYMOB_SA_INTEGRATION_ID="67890"

# Cloudflare R2 / S3 Object Storage
STORAGE_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
STORAGE_ACCESS_KEY_ID="your-r2-access-key-id"
STORAGE_SECRET_ACCESS_KEY="your-r2-secret-access-key"
STORAGE_BUCKET_NAME="shotistry-assets"
NEXT_PUBLIC_CDN_URL="https://cdn.shotistry.com"
```

