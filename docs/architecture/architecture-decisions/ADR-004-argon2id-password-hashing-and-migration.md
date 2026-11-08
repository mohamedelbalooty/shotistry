# ADR-004: Argon2id Password Hashing & Transparent scrypt Migration

## Status: IMPLEMENTED
**Deciders:** Principal Security Architect, Staff Backend Engineer
**Date:** November 8, 2026 (Implemented: November 8, 2026)
**Design Reference:** [auth-security-hardening-design.md §3](../auth-security-hardening-design.md)

---

## 1. Context & Problem Statement
`src/lib/auth/password.ts` hashes passwords with `crypto.scrypt` using `N=16384, r=8, p=1` (~16 MiB per operation). OWASP's Password Storage Cheat Sheet (checked 2026-11-08) sets the scrypt minimum at `N=2^17, r=8, p=1` (~128 MiB), so the current setting is 8× below guidance. Raising scrypt to the OWASP minimum would use 128 MiB per login and risk running out of memory on Vercel Fluid Compute (2 GB default) under concurrent logins.

Node.js `v24.7.0+` ships a native `crypto.argon2()` (checked 2026-11-08); local runtime is `v24.11.1`.

---

## 2. Decision Drivers
- OWASP compliance.
- Bounded memory per serverless instance under concurrent logins.
- No native addon builds (`node-gyp`) on Vercel.
- Zero-downtime migration for existing `scrypt$` hashes.

---

## 3. Considered Alternatives
- **Option A:** Native Node 24 `crypto.argon2('argon2id')`, `m=19456 KiB, t=2, p=1, tagLength=32`, 16-byte salt, PHC string format [SELECTED].
- **Option B:** scrypt at OWASP minimum `N=131072` (Rejected: 128 MiB/op; 16 concurrent logins ≈ 2 GiB).
- **Option C:** `argon2` / `@node-rs/argon2` npm packages (Rejected: unnecessary dependency now that Node provides Argon2 natively).
- **Option D:** bcrypt (Rejected: 72-byte input limit, not OWASP first choice).

---

## 4. Decision
1. New hashes: `$argon2id$v=19$m=19456,t=2,p=1$<b64nopad salt>$<b64nopad hash>`.
2. `verifyPassword` accepts Argon2id (bounded params: `8192<=m<=65536`, `1<=t<=10`, `1<=p<=4`, 32-byte tag) and legacy `scrypt$` (bounded `16384<=N<=131072`). Anything else → `false`.
3. Passwords longer than 128 characters are rejected before hashing.
4. An in-process async semaphore caps concurrent hash operations (default 4, `SHOTISTRY_MAX_CONCURRENT_HASHES`); waiting longer than 2500 ms → `503 SERVICE_BUSY`.
5. On successful login with a legacy/weak hash, rehash to Argon2id **without** bumping `passwordUpdatedAt` and **without** revoking sessions.
6. `constantTimeDummyVerify` uses an Argon2id dummy hash.
7. `package.json` adds `"engines": { "node": "24.x" }`; `src/types/node-argon2.d.ts` supplies typings because `@types/node@22.20.5` lacks them.
8. No global pepper in v1 (future peppering must be key-versioned).

---

## 5. Consequences
- **Positive:** OWASP-compliant; ~19 MiB per op; no new dependencies; existing users migrate on next login.
- **Negative:** Requires Node 24 on every runtime (local, CI, Vercel). Legacy scrypt hashes stay in the DB until each user logs in again; this is acceptable because they remain salted and verified in constant time.
- **Verification required:** concurrency benchmark (c = 1/4/8/16/25; p50/p95/p99 latency, RSS delta) recorded in `docs/qa/test-results.md`.
