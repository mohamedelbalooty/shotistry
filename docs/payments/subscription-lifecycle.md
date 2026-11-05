# Subscription Lifecycle & State Machine

## 1. Subscription State Transition Matrix

```
                      ┌───────────────┐
                      │   INCOMPLETE  │ (Initial intent created, awaiting payment)
                      └───────┬───────┘
                              │
                    Webhook: payment_success
                              │
                              ▼
                      ┌───────────────┐
           ┌─────────►│    ACTIVE     │◄─────────┐
           │          └───────┬───────┘          │
           │                  │                  │
    Webhook: payment_success  │ Webhook: payment_failed
           │                  │                  │
           │                  ▼                  │
           │          ┌───────────────┐          │
           └──────────┤   PAST_DUE    │──────────┘
                      │ (3-day grace) │ (Retry successful)
                      └───────┬───────┘
                              │
                    All Retries Exhausted
                              │
                              ▼
                      ┌───────────────┐
                      │   SUSPENDED   │ (Credits frozen)
                      └───────┬───────┘
                              │
                    User cancels or 30 days lapse
                              │
                              ▼
                      ┌───────────────┐
                      │   CANCELED    │
                      └───────────────┘
```

---

## 2. Event Triggers and Handlers

| Lifecycle Event | Paymob Trigger Type | System Action | Credit Impact |
|---|---|---|---|
| **Subscription Creation** | `Subscription Created` | Set status to `ACTIVE`; set `currentPeriodEnd = now + 30 days` | Grant full monthly plan credits to `CreditLedger` |
| **Renewal Success** | `payment_success` / `renewed` | Advance `currentPeriodEnd = currentPeriodEnd + 30 days` | Reset base monthly credits to plan quota |
| **Renewal Failure** | `suspended` / `payment_failed` | Set status to `PAST_DUE`; notify user via email/SMS; initiate 72-hour grace period | Lock generation access until card updated |
| **User Cancellation** | `canceled` | Set `cancelAtPeriodEnd = true`; keep active until `currentPeriodEnd` | Remaining credits usable until end of current cycle |
| **Card Update** | `change_primary_card` | Update card token on file; re-attempt outstanding debit | Re-activate if suspended |

---

## 3. Failed Payment & Dunning Strategy
1. **Day 0:** Automated debit fails $\to$ System marks subscription `PAST_DUE` $\to$ In-app notification and email with a secure 1-click card update link.
2. **Day 2:** Paymob automated retry #1. If successful, state restored to `ACTIVE`.
3. **Day 4:** Paymob automated retry #2. If failed, status transitions to `SUSPENDED` and generative actions are disabled.
4. **Day 14:** Final notice. If no payment received, subscription marked `CANCELED`.

