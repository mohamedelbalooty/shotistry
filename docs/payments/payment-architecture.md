# Payment System Architecture & Data Flow

## 1. End-to-End Subscription Checkout Flow

```
┌────────┐               ┌───────────────┐              ┌────────────┐             ┌────────────┐
│ Client │               │ Shotistry API │              │ Paymob API │             │ User Card  │
└───┬────┘               └───────┬───────┘              └─────┬──────┘             └─────┬──────┘
    │                            │                            │                          │
    │ 1. Select Plan (e.g. Pro)  │                            │                          │
    ├───────────────────────────►│                            │                          │
    │                            │ 2. Create Payment Intent   │                          │
    │                            ├───────────────────────────►│                          │
    │                            │    & Tokenization Request  │                          │
    │                            │◄───────────────────────────┤                          │
    │                            │ 3. Returns client_secret   │                          │
    │ 4. Opens Unified Checkout  │                            │                          │
    │◄───────────────────────────┤                            │                          │
    │                            │                            │                          │
    │ 5. Enters Card / Apple Pay / Mada                       │                          │
    ├───────────────────────────────────────────────────────────────────────────────────►│
    │                            │                            │                          │
    │                            │                            │ 6. Card Debited & Token  │
    │                            │                            │◄─────────────────────────┤
    │                            │ 7. Server Webhook (POST)   │                          │
    │                            │◄───────────────────────────┤                          │
    │                            │    { subscription_data,    │                          │
    │                            │      trigger_type, hmac }  │                          │
    │                            │                            │                          │
    │                            │ 8. Verify HMAC-SHA512      │                          │
    │                            │ 9. Deduplicate in DB       │                          │
    │                            │ 10. Activate Subscription  │                          │
    │                            │ 11. Credit Ledger Grant    │                          │
    │ 12. Polling / SSE Confirms │                            │                          │
    │◄───────────────────────────┤                            │                          │
```

---

## 2. Server-Side Payment Verification Invariant
- **Rule 1 (Zero Client Trust):** Under no circumstances is a subscription activated or are credits granted based on front-end browser redirection parameters (e.g., `?success=true`).
- **Rule 2 (Server Webhook Authority):** Only cryptographically verified, server-to-server Paymob webhook events can mutate subscription state or execute credit ledger transactions.
- **Rule 3 (Idempotency):** Every incoming webhook payload is checked against the `WebhookEvent` table by its unique event ID (`paymob_request_id` or `id`). If already processed, the endpoint returns an immediate HTTP 200 without re-crediting the user.
