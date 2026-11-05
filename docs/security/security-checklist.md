# Production Security & Hardening Checklist

- [x] **Zero Hardcoded Secrets:** All API keys (`GEMINI_API_KEY`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `DATABASE_URL`) stored strictly in environment variables.
- [x] **Server-Side Key Isolation:** No API keys or secret credentials exposed to client-side bundles.
- [x] **Timing Attack Defense:** Paymob HMAC-SHA512 verification uses `crypto.timingSafeEqual()`.
- [x] **SQL & Query Injection Prevention:** 100% parameterized queries via Prisma ORM.
- [x] **Input Validation:** All API inputs strictly validated using Zod schemas with sanitization.
- [x] **CORS & CSRF:** Strict CORS headers permitting only origin domain; Next.js server actions inherently immune to cross-site scripting attacks.
- [x] **Rate Limiting:** IP-based and user-based token bucket rate limits on authentication and generation endpoints.
- [x] **Secure Upload Gateways:** File uploads restricted to valid image MIME types (`image/jpeg`, `image/png`, `image/webp`) and max 20MB.
- [x] **Role-Based Authorization:** Admin routes protected with session checks and strict `ADMIN` role verification.

