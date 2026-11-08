# Production Deployment Guide: Vercel & Managed Services

## 1. Hosting Architecture
- **Primary Hosting:** Vercel (Edge Network + Serverless Functions).
- **Database:** Managed PostgreSQL (Neon, Supabase, or AWS RDS).
- **Object Storage:** Cloudflare R2 / AWS S3.
- **Payment Gateway:** Paymob Production Portal.

---

## 2. Step-by-Step Vercel Deployment Workflow

1. **Connect GitHub Repository:**
   - Link `shotistry` repo to Vercel team/account.
   - Framework preset: `Next.js`.
2. **Configure Environment Variables:**
   - Add all production keys as specified in `.env.example`.
3. **Database Migration:**
   - Run `npx prisma migrate deploy` in the build step or via GitHub Actions CI.
4. **Custom Domain & SSL:**
   - Configure production domain (e.g., `shotistry.com` and `app.shotistry.com`).
   - Vercel automatically issues Let's Encrypt Wildcard SSL certificates.
5. **Paymob Webhook Registration:**
   - In Paymob Merchant Dashboard $\to$ Settings $\to$ Webhooks:
     - Set Transaction Webhook URL to: `https://app.shotistry.com/api/webhooks/paymob`
     - Set Subscription Webhook URL to: `https://app.shotistry.com/api/webhooks/paymob`
     - Copy HMAC Secret to Vercel `PAYMOB_HMAC_SECRET`.
6. **Resend Transactional Email Domain Verification:**
   - Add sending domain (e.g., `mail.shotistry.com`) in Resend dashboard.
   - Configure DNS records: SPF TXT, DKIM CNAMEs, and DMARC TXT (`v=DMARC1; p=quarantine; rua=mailto:dmarc@shotistry.com`).
   - Add `RESEND_API_KEY` and `EMAIL_FROM="Shotistry <security@mail.shotistry.com>"` to Vercel environment secrets.
7. **Out-of-Band Initial Platform Administrator Bootstrap:**
   - Run the bootstrap script once against the production database:
     ```bash
     SHOTISTRY_ADMIN_BOOTSTRAP_SECRET="<random-min-24-char-secret>" \
     ADMIN_EMAIL="admin@shotistry.com" \
     ADMIN_PASSWORD="<strong-min-12-char-password>" \
     ADMIN_NAME="Shotistry Super Admin" \
     node --experimental-strip-types scripts/bootstrap-admin.mjs
     ```
8. **Deployment Health & Concurrency Verification:**
   - Run `npm run test:pg` against the staging/production database before routing public merchant traffic.
