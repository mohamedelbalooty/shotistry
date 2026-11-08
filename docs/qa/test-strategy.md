# Quality Assurance & Testing Strategy (Superpowers TDD)

## 1. Testing Pyramid Architecture

```
                    ┌─────────────────────────┐
                    │  End-to-End Tests (E2E) │ Playwright / Smoke Tests
                    │  Complete User Journey  │ Signup -> Upload -> Shoot -> Pay
                    └────────────┬────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │     Integration Tests     │ API Routes, Webhook Handlers,
                   │     & Service Contracts   │ DB Transactions, Paymob HMAC
                   └─────────────┬─────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │                  Unit Tests                   │ Prompt Synthesizer,
         │                  & Domain Logic               │ Credit Ledger Math,
         └───────────────────────────────────────────────┘ Currency Formatter
```

---

## 2. Test Suites Specification

### A. Unit Tests (Vitest / Node Test Runner)
1. **Credit Ledger Calculations:**
   - Balance summation, negative balance prevention, concurrency reservation hold and release.
2. **Pricing & Currency Conversion:**
   - Proper rounding for EGP (Piastres) and SAR (Halalas); fee calculations.
3. **Prompt Synthesizer Engine:**
   - Validating that user selected presets generate all 10 schema components with correct lighting and negative directives.
4. **Paymob HMAC Verification:**
   - Validating correct HMAC-SHA512 calculations for subscription events (`${trigger_type}for${subscriptionId}`) and standard transaction strings.

### B. Integration Tests
1. **Paymob Webhook Endpoint:**
   - Sending valid signed subscription payload $\to$ Expects 200 OK and credit ledger update.
   - Sending invalid HMAC signature $\to$ Expects 401 Unauthorized and zero DB mutation.
   - Sending duplicate payload $\to$ Expects 200 OK without re-crediting.
2. **Generation Job State Machine:**
   - Reserve $\to$ Process $\to$ Settle on success.
   - Reserve $\to$ Error $\to$ Automatic Refund on failure.

### C. End-to-End User Journey Tests
- Automated test script simulating user registration, onboarding, product creation, photoshoot generation, and credit depletion.

---

## 3. Test Fixtures & Manual Testing Data
For manual and interactive testing across all roles (`ADMIN`, `USER`, `SUPPORT`), currencies (`EGP`, `SAR`), and studio presets, refer to:
- **[Test Data Reference Guide](file:///Users/tasawk/StudioProjects/shotistry/docs/qa/test-data.md)**
- Reset and seed all test accounts and presets at any time with: `npm run seed`
