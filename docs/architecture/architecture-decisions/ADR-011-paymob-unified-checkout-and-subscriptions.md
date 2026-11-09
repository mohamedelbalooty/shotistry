# ADR-011: Paymob Unified Checkout, Multi-Region Architecture & Webhook Hardening

**Date:** 2026-11-09  
**Status:** Accepted  
**Deciders:** Core Engineering Team, Security Audit Lead  
**Supersedes/Extends:** Baseline Paymob Integration  

---

## 1. Context & Business Need

Shotistry monetizes commercial AI product photography in two distinct jurisdictions:
- **Egypt (EGP):** Paymob Egypt merchant account, processing Cards (Visa/Mastercard), Meeza national debit cards, and Mobile Wallets (Vodafone Cash, Orange, Etisalat, WE).
- **Saudi Arabia (SAR):** Paymob Saudi Arabia merchant account, processing Mada national debit cards, international Cards (Visa/Mastercard), and Apple Pay.

Prior to Phase 10 Milestone M7, the repository had several critical architectural and security vulnerabilities (identified in Security Finding C5 and the Phase 10 implementation plan):
1. **Unsigned Webhook Field Tampering:** The transaction webhook handler trusted client-controlled or unsigned payload fields (`credits`, `plan_tier`, `workspace_id`) to allocate credits, creating an attack surface where tampering could grant unauthorized credits.
2. **Arbitrary 50-Credit Fallback:** If an incoming transaction did not match a recognized price or order, the webhook awarded a fallback 50 credits to the workspace.
3. **Single Global HMAC Secret:** The system used a single `PAYMOB_HMAC_SECRET`, failing to separate credentials for Egypt (EGP) and Saudi Arabia (SAR), risking cross-environment validation collisions.
4. **Lack of Stored Intent Resolution:** Transactions were not validated against server-side pending intent records in PostgreSQL/SQLite before granting ledger credits.
5. **No Compensating Entries on Refunds/Voids:** If a transaction was voided or refunded, no compensating reversal was written to the credit ledger, permitting bad debt generation.

---

## 2. Decision & Architecture

### 2.1 Multi-Region Configuration Separation
We separate Paymob credentials by jurisdiction:
- `PAYMOB_EG_SECRET_KEY`, `PAYMOB_EG_PUBLIC_KEY`, `PAYMOB_EG_HMAC_SECRET`, `PAYMOB_EG_INTEGRATION_IDS`
- `PAYMOB_SA_SECRET_KEY`, `PAYMOB_SA_PUBLIC_KEY`, `PAYMOB_SA_HMAC_SECRET`, `PAYMOB_SA_INTEGRATION_IDS`

In staging and development environments:
- Any credentials starting with `live_` or `LIVE_` are strictly rejected to prevent accidental live monetary processing in non-production environments.
- Missing regional credentials fail closed for that region while allowing the configured region to operate.

### 2.2 Server-Side Intent Creation (Unified Checkout Intention API)
When a merchant initiates a checkout (`POST /api/billing/checkout-intent`):
1. The server creates an authoritative `PaymentTransaction` record in the database with status `PENDING`, recording:
   - `id`: internal transaction identifier (`pt-...`)
   - `workspaceId`: authenticated workspace
   - `kind`: `'SUBSCRIPTION'` or `'TOP_UP'`
   - `planTier`: requested tier (e.g., `'STARTER'`, `'PRO'`, `'AGENCY'`) or `null`
   - `packId`: requested top-up pack (e.g., `'pack_50'`, `'pack_150'`, `'pack_500'`) or `null`
   - `credits`: exact authorized credits for this purchase
   - `amountCents`: exact required subunit amount (e.g., 349 EGP -> 34,900 piastres; 79 SAR -> 7,900 halalas)
   - `currency`: `'EGP'` or `'SAR'`
   - `region`: `'EG'` or `'SA'`
   - `specialReference`: internal transaction reference passed to Paymob Intention API
2. The server calls the official Paymob Intention API (`POST /v1/intention/`) using `Token <secret_key>`, providing `amount`, `currency`, allowed `payment_methods`, `items`, `billing_data`, `special_reference`, `notification_url`, and `redirection_url`.
3. Paymob returns `client_secret` and `order_id`. The server updates `PaymentTransaction.paymobOrderId` and returns `unifiedCheckoutUrl` to the client.

### 2.3 Strict Server-Side Intent Webhook Resolution (Zero-Trust Webhooks)
When Paymob delivers a webhook (`POST /api/webhooks/paymob`):
1. **Region-Specific HMAC Verification:** The payload is verified using the regional HMAC secret corresponding to the payload's currency (`EGP` -> `PAYMOB_EG_HMAC_SECRET`; `SAR` -> `PAYMOB_SA_HMAC_SECRET`). Constant-time comparison (`crypto.timingSafeEqual`) is strictly enforced.
2. **Intent Resolution:** The pending transaction is resolved **strictly** by `order.id` or `special_reference` matching our database record.
3. **Intent Reconciliation (Zero-Trust):**
   - The granted credits and plan tier are derived **solely from the stored database record**, completely ignoring any incoming `credits`, `plan_tier`, or `workspace_id` properties in the webhook payload.
   - If the payload's `amount_cents` or `currency` does not exactly match the stored intent, the transaction is marked as `UNMATCHED_AMOUNT`, **zero credits are granted**, and an alert is logged.
4. **Removal of Fallback Grant:** The 50-credit fallback is deleted. Unmatched transactions are recorded as `UNMATCHED_INTENT` with **zero credits granted**.
5. **Refund & Void Reversal:** When a webhook arrives with `is_refunded: true` or `is_voided: true`, the system executes an atomic compensating entry (`REFUND_REVERSAL`) in `CreditLedgerService` with negative amount matching granted credits, preventing unearned usage.

---

## 3. Consequences

### Positive:
- Completely eliminates finding C5 (tampered payload parameters cannot grant arbitrary credits).
- Multi-region architecture cleanly separates Egypt and Saudi accounts, fee structures, and HMAC keys.
- Accurate ledger accounting: every credit grant is backed by an authenticated, verified intent record.
- Non-production environments cannot accidentally process live cards or charges.

### Negative / Operational Considerations:
- Staging and production require configuring both Egypt and Saudi Paymob credentials. If credentials for one jurisdiction are missing, checkout for that jurisdiction is gracefully disabled with clear errors.
- Webhook tests must seed a pending transaction intent prior to firing simulated webhooks.

