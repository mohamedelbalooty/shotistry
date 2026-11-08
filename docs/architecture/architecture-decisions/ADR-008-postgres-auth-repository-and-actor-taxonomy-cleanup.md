# ADR-008: Dual-Driver Auth/App Repository Layer, PostgreSQL Verification & Actor Taxonomy Cleanup

## Status: ACCEPTED (Design) — NOT YET IMPLEMENTED
**Deciders:** Staff Backend Engineer, Database Architect, Product Architect
**Date:** November 8, 2026
**Design Reference:** [auth-security-hardening-design.md §7–§8](../auth-security-hardening-design.md)

---

## 1. Context & Problem Statement
Only `CreditLedgerService` switches to `PostgresCreditLedgerService` when `SHOTISTRY_DB_DRIVER=postgres`. `src/lib/auth/session.ts`, `src/lib/auth/admin-bootstrap.ts`, and 10 API route files call synchronous SQLite (`getDb()` / `withSerializableTransaction()`) directly. In PostgreSQL mode, sessions, admin bootstrap, members, jobs, webhooks and admin metrics would read and write the wrong database. `listActiveUserSessions()` is synchronous. The PostgreSQL test harness skips migrations whenever a `Session` table exists, and the local test DB (`shotistry_audit_test`, PostgreSQL 16.15) has 17 tables from the init migration, no `Session` table and no `_prisma_migrations`.

Separately, actor docs use an abbreviated host operator identifier, list the signed-URL bearer among third-party external systems, and do not clearly separate internal `SYS_*` subsystems from external actors.

---

## 2. Decision
1. Introduce driver-resolved async repositories under `src/lib/db/repositories/` (`AuthRepository`, `WorkspaceRepository`, `PhotoshootRepository`, `BillingRepository`, `WebhookRepository`, `AdminRepository`, `ActionTokenRepository`, `InviteRepository`), each with SQLite and Postgres implementations behind `resolveDbDriver()`.
2. All session functions become `async` (including `listActiveUserSessions`). Routes stop importing `getDb`/`withSerializableTransaction`.
3. Postgres dialect rules: booleans (`true/false`, not `1/0`), `ON CONFLICT DO NOTHING` (not `INSERT OR IGNORE`), `timestamptz`, Prisma `P2002` → `CONFLICT:`; `SERIALIZABLE` for multi-row invariants, `READ COMMITTED` for single-statement upserts.
4. New migration `20261109000000_auth_security_hardening` (`AuthActionToken`, `RateLimitBucket`, `WorkspaceInvite`) mirrored in SQLite DDL.
5. The PG test harness applies every migration in lexical order to an **isolated** test database (resetting the `public` schema only when the DB name ends in `_test`). `REQUIRE_POSTGRES_TESTS=1` turns skips into failures in CI.
6. `admin/metrics` reports the live driver and rate-limit backend instead of the hard-coded `'OPERATIONAL_ACID_SQL'`.
7. Taxonomy: Host CLI Operator identifier standardized to `CLI_OPERATOR`; `EXT_SIGNED_ASSET_BEARER` reclassified as a **Signed-Capability Bearer** (client holding an HMAC capability, not a third-party system); `SYS_*` appear only inside the system boundary / sequence diagrams.

---

## 3. Consequences
- **Positive:** Real PostgreSQL parity; one place per data concern; honest PG verification.
- **Negative:** Large refactor touching 12 files; every call site must `await`. Mitigated by doing it first (Phase 1) under the existing green SQLite suite.
- **Blocked:** Production `DATABASE_URL` cutover. Local PG 16.15 verification can run with host access.
