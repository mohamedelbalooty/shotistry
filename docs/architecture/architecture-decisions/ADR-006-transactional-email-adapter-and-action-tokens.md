# ADR-006: Transactional Email Adapter & Single-Use Auth Action Tokens

## Status: ACCEPTED (Design) — NOT YET IMPLEMENTED
**Deciders:** Principal Security Architect, Staff Backend Engineer, Product Lead
**Date:** November 8, 2026
**Design Reference:** [auth-security-hardening-design.md §5](../auth-security-hardening-design.md)

---

## 1. Context & Problem Statement
`User.emailVerifiedAt` exists, but there is no email transport, no verification flow, no password recovery and no email-change flow. There is no `AuthActionToken` table in Prisma, migrations, or the SQLite DDL.

---

## 2. Decision Drivers
- Real, verifiable delivery (no fake "sent" states).
- Tokens must not be stored in plaintext or leak via logs, `Referer`, or link scanners.
- Anti-enumeration on all public recovery endpoints.
- Offline-testable without a provider.

---

## 3. Considered Alternatives
- **Option A:** Resend REST API via native `fetch` with `Idempotency-Key` [SELECTED].
- **Option B:** AWS SES / Postmark / SendGrid (Viable; not selected to keep one simple REST adapter. The `EmailTransport` interface keeps switching cheap).
- **Option C:** SMTP via nodemailer (Rejected: TCP connections are a poor fit for serverless; adds a dependency).
- **Option D:** Stateless signed tokens (HMAC/JWT) (Rejected: cannot be revoked or made single-use without server state).

---

## 4. Decision
1. `EmailTransport` interface; `ResendEmailTransport` (prod) and `MemoryEmailTransport` (tests only). Production with missing or placeholder `RESEND_API_KEY` / `EMAIL_FROM` → `EmailTransportUnavailableError`.
2. Bilingual (`ar`/`en`) templates: verify email, password reset, password-changed notice, email-change confirm, email-change notice, workspace invite.
3. `AuthActionToken` (`EMAIL_VERIFY` 30 min, `PASSWORD_RESET` 15 min, `EMAIL_CHANGE` 15 min): `randomBytes(32)` base64url raw token, SHA-256 `tokenHash` stored, prior same-type tokens revoked on issue, atomic conditional-UPDATE consumption.
4. Links carry the token in the URL fragment (`#token=`); pages POST the token. No `GET` consumption.
5. `Referrer-Policy: no-referrer` on token pages and `Cache-Control: no-store` on auth APIs (via new `next.config.ts` + route headers).
6. `forgot-password` always returns a uniform `202` body; `ADMIN`/`SUPPORT` are ineligible for self-service reset (out-of-band rotation instead).
7. A successful reset revokes **all** sessions and outstanding reset/change tokens and bumps `passwordUpdatedAt`.
8. Registration succeeds even if the initial verification email fails; resend returns `503` when the transport is unavailable.

---

## 5. Consequences
- **Positive:** Verified, revocable, single-use flows; testable offline; provider can be swapped behind the interface.
- **Negative:** Requires a verified sending domain (SPF, DKIM, DMARC) before production use.
- **Blocked:** Real delivery cannot be claimed until `RESEND_API_KEY`, `EMAIL_FROM` and DNS are provisioned and a live smoke test passes.
