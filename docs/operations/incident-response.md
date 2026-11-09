# Incident Response Runbook & Disaster Recovery Protocol

**Document Version:** 1.0.0  
**Last Updated:** November 2026  
**Status:** ACTIVE  
**Target Environment:** Staging & Production (Shotistry Cloud — Egypt & Saudi Arabia)  

---

## 1. Incident Classification & Severity Taxonomy

| Severity | Definition | Target Ack | Target Resolution / Mitigation | Notification Cadence | Example Scenarios |
|---|---|---|---|---|---|
| **Sev-1 (Critical)** | Core service unavailable, active data loss, payment system down, credit double-spending, or AI generation failure rate > 50% | ≤ 15 minutes | ≤ 2 hours | Every 30 minutes | Database corruption, Paymob HMAC compromise, Cloudflare R2 complete outage, Gemini global outage. |
| **Sev-2 (Major)** | Degraded service or regional outage affecting a subset of merchants (e.g. SA payments failing but EG active), generation failure rate > 15%, or email delivery stoppage | ≤ 30 minutes | ≤ 4 hours | Every 60 minutes | One Paymob region down, Resend IP rate-limited, AI generation latency > 45s, Redis rate limiter backend outage. |
| **Sev-3 (Minor)** | Non-critical feature degradation, isolated merchant edge cases, cosmetic UI discrepancies in RTL/LTR layout | ≤ 2 hours | Next business day / sprint | On status page resolve | Admin UI metrics rendering bug, non-critical translation string mismatch, low-volume style preset failure. |

---

## 2. Incident Response Roles & Protocol

### 2.1 Roles & Responsibilities

1. **Incident Commander (IC):**
   - Owns operational triage, decision authority, and cross-team coordination.
   - Declares severity level and enforces the response timeline.
   - Approves rollbacks, database restore actions, or vendor failover toggles.
2. **Technical Lead (TL):**
   - Leads root-cause investigation, log inspection, and patch implementation.
   - Executes runbook procedures and monitors telemetry metrics.
3. **Communications Lead (CL):**
   - Posts bilingual customer notices in Arabic (`ar`) and English (`en`) on status page and social channels.
   - Coordinates direct merchant communications with impacted brands.

### 2.2 Incident Workflow

```
[ALERT TRIGGERED / REPORTED]
             │
             ▼
   [TRIAGE & SEV DECLARATION (IC)]
             │
    ┌────────┴────────┐
    ▼                 ▼
[INVESTIGATION (TL)]  [BILINGUAL STATUS UPDATE (CL)]
    │                 │
    ▼                 ▼
[MITIGATION / PATCH / ROLLBACK]
             │
             ▼
[RECOVERY VERIFICATION & TELEMETRY MONITORING]
             │
             ▼
[POST-MORTEM & ACTION ITEMS (Within 48h)]
```

---

## 3. Bilingual Communication Templates

### 3.1 Sev-1: Major AI Generation Outage

#### Arabic (ar)
> **تنبيه خدمة: تأخر مؤقت في توليد الصور**  
> "نواجه حالياً تأخراً غير متوقع في معالجة طلبات التصوير عبر استوديوهات الذكاء الاصطناعي بسبب تحديثات تقنية لدى مزود الخدمة. نؤكد لجميع التجار أن رصيدكم محفوظ بالكامل ولن يتم خصم أي رصيد عن أي صورة لم تكتمل بنجاح. يعمل فريقنا الهندسي على استعادة الخدمة بأسرع وقت."

#### English (en)
> **Service Notice: Temporary Delay in Photoshoot Generation**  
> "We are currently experiencing an unexpected delay in photoshoot generation due to technical upstream provider latency. All merchant credits are fully protected; uncompleted generation jobs will automatically release reserved credits. Our engineering team is actively working to restore normal processing."

### 3.2 Sev-1 / Sev-2: Payment Gateway Issue

#### Arabic (ar)
> **تنبيه: تعطل مؤقت في بوابات الدفع**  
> "نواجه عطلاً مؤقتاً في معالجة عمليات الدفع عبر بعض القنوات المحلية. نرجو عدم تكرار محاولة الدفع في حال تم خصم المبلغ من حسابكم البنكي، حيث سيتم ربط العملية وتفعيل باقتكم تلقائياً بمجرد استقرار الاتصال. للتواصل الفوري: support@shotistry.com."

#### English (en)
> **Notice: Temporary Payment Gateway Disruption**  
> "We are currently observing intermittent processing errors with local payment channels. If your account was charged, your subscription and credits will be credited automatically upon gateway reconciliation. For immediate assistance, contact support@shotistry.com."

---

## 4. Operational Runbooks for Critical Failure Modes

### 4.1 Runbook A: Google Gemini API Rate Limit (429) / 503 Upstream Outage

#### Symptoms
- Generation jobs lingering in `PROCESSING` status.
- Admin metrics reporting sharp drop in `generationSuccessRate` (< 80%).
- Server logs contain `GEMINI_HTTP_429` or `GEMINI_HTTP_503` entries.

#### Automated Safeguards in Code
1. **Exponential Backoff:** `GeminiClient` automatically performs bounded retries with jitter up to 3 attempts.
2. **Reaper Cron:** Any job stuck in `PROCESSING` past 300 seconds is automatically released by `/api/cron/generation-reaper`, releasing reserved credits via `RELEASE_FAIL_SAFE`.
3. **No-Double-Spend Invariant:** Credits remain held in escrow until generation completes with verified dimensions; failed jobs never consume credits.

#### Manual Remediation Steps
1. **Inspect Metrics:** Check `/api/admin/metrics` to verify the volume of `PROCESSING` and `FAILED` jobs.
2. **Check Upstream Health:** Verify Google Cloud Service Health dashboard for Vertex AI / Gemini API status in region.
3. **Throttle Ingestion:** If quota limits are exceeded, temporarily lower `auth:generation:burst` rate limiter threshold in `src/lib/security/rate-limit/policies.ts`.
4. **Trigger Reaper Manually:**
   ```bash
   curl -X POST https://staging.shotistry.com/api/cron/generation-reaper \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
5. **Customer Outreach:** Post the bilingual AI Generation notice if degradation exceeds 15 minutes.

---

### 4.2 Runbook B: Paymob Unmatched Webhooks / Payment Failures

#### Symptoms
- Admin page reports `metrics.paymentEventsSummary.unmatched > 0`.
- Merchants report successful card charges but subscriptions/credits not activated.
- Database contains `PaymentTransaction` records with status `UNMATCHED_INTENT` or `UNMATCHED_AMOUNT`.

#### Automated Safeguards in Code
1. **Zero-Trust Webhook Processing:** Webhooks derive credits, plan tier, and workspace strictly from pre-stored `PaymentTransaction` intent, completely ignoring client-provided payloads.
2. **HMAC-SHA512 Verification:** Any payload failing cryptographic signature is rejected immediately with HTTP 401.
3. **Double-Spend Guard:** The ledger records every transaction with unique `idempotencyKey`; duplicate webhook deliveries yield HTTP 200 without duplicate credit grants.

#### Manual Remediation Steps
1. **Locate Unmatched Transactions:**
   ```sql
   SELECT id, "workspaceId", "amountSubunits", "currency", "specialReference", "paymobOrderId", status, "createdAt"
   FROM "PaymentTransaction"
   WHERE status IN ('UNMATCHED_INTENT', 'UNMATCHED_AMOUNT')
   ORDER BY "createdAt" DESC;
   ```
2. **Verify Paymob Dashboard:**
   - Log into Paymob Accept Portal (`accept.paymob.com`).
   - Match `special_reference` or `paymob_order_id` against the transaction history.
3. **Reconcile Legitimate Payments:**
   - If payment succeeded on Paymob and the amount matches:
   ```bash
   # Use the Admin Credit Adjustment tool on /admin
   # Specify the target workspace ID and exact credit grant with reference
   ```
4. **Investigate Fraud / Tampering:**
   - If `UNMATCHED_AMOUNT` was recorded because an attacker attempted to purchase a 500-credit pack for 1 EGP, verify that zero credits were allocated and log the merchant account for review.

---

### 4.3 Runbook C: Cloudflare R2 Storage & Asset Delivery Failures

#### Symptoms
- Merchants cannot upload source product images (presigned upload URL errors).
- Generated studio images fail to display (`403 Forbidden` or `NoSuchKey`).
- Health endpoint `/api/health` indicates `storage: UNHEALTHY`.

#### Manual Remediation Steps
1. **Check Cloudflare System Status:** Inspect `cloudflarestatus.com` for R2 service disruptions.
2. **Validate Credentials & Endpoints:**
   - Confirm `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are valid and not expired.
   - Verify bucket name `R2_BUCKET_NAME` matches Cloudflare dashboard.
3. **CORS Configuration Check:**
   - Ensure the R2 bucket permits `PUT` and `GET` from `https://staging.shotistry.com` and `https://shotistry.com`:
   ```json
   [
     {
       "AllowedOrigins": ["https://staging.shotistry.com", "https://shotistry.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **Test Presigned URL Generation:** Run `node --import ./tests/helpers/env-guard.mjs tests/r2-storage.test.mjs` to verify signature generation logic.

---

### 4.4 Runbook D: Database Connection Spikes & Neon PITR Recovery

#### Symptoms
- Database latency spikes > 500ms; connection timeouts reported in server logs.
- Errors: `remaining connection slots are reserved for non-replication superuser connections` or `Connection pool timeout`.

#### Architecture & Mitigations
1. **Connection Pooling:** Always connect via Neon connection pooler (`-pooler` host suffix) using `DATABASE_URL` with `?pgbouncer=true`.
2. **Direct Connection for Migrations:** Prisma CLI migrations run exclusively through `DIRECT_URL` (direct port 5432).
3. **Driver Fail-Closed:** The application enforces bounded timeouts on database queries.

#### Point-in-Time Recovery (PITR) Drill on Neon

Neon provides instant branching and continuous Point-in-Time Recovery (PITR) up to the retention window (7 days on Free/Pro plans).

##### PITR Drill Procedure (Target RTO: < 15 min, Target RPO: < 1 min)
1. **Identify Recovery Timestamp:** Determine the exact ISO timestamp prior to the incident (e.g. `2026-11-10T00:30:00Z`).
2. **Create Recovery Branch via Neon Console or CLI:**
   ```bash
   # Create a recovery branch from the specific timestamp
   neonctl branches create \
     --project-id <shotistry-staging-project-id> \
     --name pitr-recovery-drill \
     --parent main \
     --timestamp 2026-11-10T00:30:00Z
   ```
3. **Verify Integrity of Recovered Branch:**
   - Obtain connection string for `pitr-recovery-drill`.
   - Run verification suite against the recovered branch:
     ```bash
     DATABASE_URL="postgres://...@ep-drill-pooler.eu-central-1.aws.neon.tech/neondb?pgbouncer=true" \
     node scripts/run-pg-tests.mjs
     ```
   - Verify that all ledger balances sum to zero (`DEBIT` = `CREDIT`) and all user accounts are intact.
4. **Promote Recovered Branch:**
   - Update Vercel environment variable `DATABASE_URL` and `DIRECT_URL` to point to the recovered branch endpoints.
   - Trigger a deployment or redeploy the current preview.
5. **Post-Recovery Verification:** Verify `/api/health` reports `database: POSTGRESQL` and HTTP 200.

---

## 5. Post-Mortem & Incident Review Requirements

Within 48 hours of resolving any Sev-1 or Sev-2 incident:
1. IC publishes a blameless post-mortem document in `docs/operations/post-mortems/YYYY-MM-DD-<incident-name>.md`.
2. The post-mortem must include:
   - Incident timeline (detection, acknowledgment, mitigation, resolution).
   - Root cause analysis (5 Whys).
   - Customer impact (number of merchants impacted, lost revenue, uncompleted jobs).
   - Permanent preventative engineering action items with owners and target completion dates.
