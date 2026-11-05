# ADR-002: Double-Entry Credit Ledger and Concurrency Reservation Engine

## Status: ACCEPTED
**Deciders:** Database Architect, Backend Engineer, Financial Analyst  
**Date:** November 2026  

---

## 1. Context & Problem Statement
SaaS platforms with generative AI workloads face credit drain vulnerabilities:
1. Users triggering multiple simultaneous browser requests could generate 10 images concurrently with only 1 credit remaining.
2. Direct mutable integers (`user.credits -= 1`) lead to lost updates, untraceable balances, and customer disputes if a job fails mid-flight.

---

## 2. Decision
Shotistry implements an **immutable double-entry ledger** coupled with a **3-phase credit reservation protocol**:

```
[Phase 1: Reserve]
BEGIN TRANSACTION;
SELECT current_balance FROM CreditLedger WHERE workspace_id = $1 FOR UPDATE;
IF current_balance < required_credits THEN ROLLBACK & RETURN 402;
INSERT INTO CreditReservation (status: PENDING, amount: 1);
COMMIT;

[Phase 2: Generate via AI Engine]
... Asynchronous Google Gemini / Imagen generation ...

[Phase 3: Settle or Refund]
IF generation == SUCCESS THEN
  UPDATE CreditReservation SET status = 'SETTLED';
  INSERT INTO CreditLedger (type: 'JOB_SETTLEMENT', amount: -1, balance_after: balance - 1);
ELSE
  UPDATE CreditReservation SET status = 'RELEASED';
  // Credit is released, no negative entry added to ledger.
END IF;
```

---

## 3. Consequences
- **Positive:** Mathematically impossible to overspend credits; every single credit movement is audit-logged with timestamps and job IDs; failed generations cost the user zero credits.
- **Negative:** Requires row locks during reservation, which is mitigated by fast, indexed lookups on `workspaceId`.

