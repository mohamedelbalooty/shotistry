# Shotistry — Email Deliverability & DNS Authentication Specification

**Document Version:** 1.0.0  
**Phase:** Phase 10 — Milestone M8  
**Status:** COMPLETE / FOUNDER ACTION REQUIRED (DNS RECORDS)  
**Provider:** Resend Transactional Email API  

---

## 1. Sending Subdomain Strategy

To isolate application email deliverability from corporate Google Workspace email and protect the root domain reputation, Shotistry uses dedicated sending subdomains:
- **Staging / Beta:** `mail.staging.shotistry.com` (From: `Shotistry Staging <no-reply@mail.staging.shotistry.com>`)
- **Production:** `mail.shotistry.com` (From: `Shotistry <no-reply@mail.shotistry.com>`)
- **Support / Reply-To:** `support@shotistry.com` (routed to Zendesk / Google Workspace inbox)

---

## 2. Required DNS Records Checklist

The following DNS records must be provisioned in Cloudflare / domain registrar for `shotistry.com`:

| Type | Name / Host | Content / Value | TTL | Purpose |
|---|---|---|---|---|
| **TXT** | `mail.staging.shotistry.com` | `v=spf1 include:resend.com ~all` | Auto | SPF: Authorizes Resend sending servers |
| **CNAME** | `resend._domainkey.mail.staging.shotistry.com` | `dkim.resend.com.` | Auto | DKIM: Cryptographic signature verification |
| **MX** | `mail.staging.shotistry.com` | `feedback-smtp.resend.com` (Priority 10) | Auto | MX: Return-Path for bounce processing |
| **TXT** | `resend._domainkey.shotistry.com` | `(Resend-provided DKIM public key)` | Auto | DKIM for root / production |
| **TXT** | `_dmarc.shotistry.com` | `v=DMARC1; p=none; rua=mailto:dmarc@shotistry.com; sp=none; aspf=r; adkim=r` | Auto | DMARC Phase 1: Monitoring / Reporting |

> [!IMPORTANT]
> **DMARC Transition Path:**
> 1. **Closed Beta Phase:** `p=none` (collect aggregate deliverability reports without rejecting messages).
> 2. **Production Launch:** Upgrade policy to `p=quarantine` (`v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@shotistry.com`) once SPF and DKIM pass 100% on Gmail and Outlook tests.

---

## 3. Transient Error Classification & Retry Policy

The Resend email transport (`src/lib/email/resend-transport.ts`) implements bounded exponential backoff:

| HTTP Status | Classification | Retry Behavior | Backoff Delay |
|---|---|---|---|
| **200 OK / 201 Created** | Success | No retry | Returns Resend `messageId` |
| **429 Too Many Requests** | Transient Rate Limit | Retried up to 2 times | Reads `Retry-After` header (or 1s -> 2s) |
| **500 / 502 / 503 / 504** | Transient Resend Outage | Retried up to 2 times | Exponential (100ms -> 200ms -> 400ms) |
| **Connection Timeout** | Network Interruption | Retried up to 2 times | AbortSignal timeout: 5000ms |
| **400 Bad Request** | Fatal Client Error | **No retry** (fails immediately) | Throws `EmailTransportUnavailableError` |
| **401 Unauthorized** | Invalid API Key | **No retry** (fails closed) | Throws `EmailTransportUnavailableError` |
| **422 Unprocessable** | Invalid Email / Domain | **No retry** (fails immediately) | Throws `EmailTransportUnavailableError` |

---

## 4. Deliverability Validation Protocol (Drill)

Before welcoming external merchants to Closed Beta:
1. Trigger all 6 transactional emails to test inboxes on major mailbox providers:
   - Gmail / Google Workspace (`@gmail.com`)
   - Microsoft Outlook / Hotmail (`@outlook.com` / `@hotmail.com`)
   - Apple iCloud (`@icloud.com`)
2. Inspect the raw RFC 822 email headers (`Show original` in Gmail):
   - `SPF: PASS with IP ...`
   - `DKIM: 'PASS' with domain mail.staging.shotistry.com`
   - `DMARC: 'PASS'`
3. Verify that zero emails land in the **Spam** or **Junk** folders.
4. Verify that bilingual RTL formatting renders seamlessly on both desktop webmail and mobile native mail apps (Apple Mail, Gmail app).

---

## 5. Security & Privacy Invariants

1. **Fragment URLs (`#token=...`):**
   - Action tokens are strictly placed in URL fragments (hash): `https://staging.shotistry.com/verify-email#token=<token>`.
   - URL fragments are never sent over the wire in HTTP GET requests and never appear in Vercel or Cloudflare access logs.
2. **Zero-Token Logging Policy:**
   - Loggers and observability pipelines are strictly forbidden from logging raw tokens, `#token=` URLs, or password hashes.
   - Enforced by automated test suite `tests/no-secret-logging.test.mjs`.
3. **HTML Sanitization:**
   - All user-supplied strings interpolated into emails (merchant name, workspace name) are escaped via `escapeHtml()` in `src/lib/email/templates.ts` to prevent email HTML injection or styling override attacks.

