# Production Monitoring, Observability & Error Handling

## 1. System Health & Observability Metrics

The production system monitors 4 critical operational health signals:

1. **AI Generation Success Rate:**
   - Monitored continuously. Target: >97% successful generations.
   - Any drop below 90% triggers automated Slack/webhook alert to the engineering team.
2. **Paymob Webhook Delivery & Processing Latency:**
   - Monitored at `/api/admin/metrics`.
   - Webhook processing time must remain under 300ms.
3. **Credit Ledger Discrepancy Watchdog:**
   - Daily automated reconciliation cron comparing sum of `CreditLedger` entries with workspace active balances.
   - Zero discrepancy tolerance.
4. **API Latency & Vercel Execution Duration:**
   - Generation endpoints track time-to-first-token and time-to-final-render.

---

## 2. Centralized Error Handling Protocols
- All external API calls (Gemini, Paymob, R2) are wrapped in custom typed error handlers (`GeminiApiError`, `PaymobPaymentError`, `LedgerConcurrencyError`).
- Customer-facing error messages are sanitized and translated into user-friendly Arabic and English:
  - Never expose raw stack traces or internal API keys.
  - Informative guidance provided (e.g. "الصورة المرفوعة منخفضة الدقة، يرجى رفع صورة أوضح للمنتج" / "The uploaded photo resolution is too low; please upload a clearer image of your product").

