# System Actors, RBAC & Database-Backed Session Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task following strict Red-Green-Refactor TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Shotistry's official System Actor Model, multi-tier RBAC engine, hardened database-backed opaque SHA-256 session authentication, CSRF/rate-limit defenses, secure one-time admin bootstrap, updated frontend consumers, full test coverage, and architectural/security documentation.

**Architecture:** Option A (Database-Backed Opaque Session Architecture). Random 32-byte session tokens are returned only via `HttpOnly` cookies (`__Host-shotistry_session` in production without `Domain`), stored solely as SHA-256 hashes in `"Session"`, paired with per-session synchronizer CSRF tokens (`x-csrf-token`), `Origin`/`Sec-Fetch-Site` validation, sliding-window rate limits, `scrypt` password hashing, and strict database-backed separation of `PlatformRole` (`USER | SUPPORT | ADMIN`) and `WorkspaceRole` (`OWNER | ADMIN | MEMBER | VIEWER`). Legacy default merchant/workspace IDs and client-supplied identity headers/unsigned cookies are completely eliminated.

**Tech Stack:** Node.js 24+ LTS (`node:crypto`, `node:sqlite`, `node:test`), Next.js 15 App Router, React 19, TypeScript (strict), Prisma 5.22 (`PostgreSQL` + `node:sqlite` dual parity), Zod, Tailwind CSS.

**Spec:** [2026-11-08-system-actors-rbac-auth-design.md](../../superpowers/specs/2026-11-08-system-actors-rbac-auth-design.md)

## Global Constraints
- Follow Superpowers TDD: write a failing test first (RED), verify failure output, write minimal production code (GREEN), verify pass, refactor.
- Explicit `.ts` import extensions are mandatory across all server/lib/route imports loaded by `tests/*.test.mjs` (`node --experimental-strip-types --test`), whereas client React components (`src/app/**/*.tsx`, `src/components/**/*.tsx`, `src/context/**/*.tsx`) use extensionless imports for Next.js bundler compatibility.
- Keep `PostgreSQL` (`PostgresCreditLedgerService` + `prisma/schema.prisma` + migrations) and `node:sqlite` (`src/lib/db/prisma.ts` + `CreditLedgerService`) 100% schema-aligned.
- Preserve branch `audit/production-readiness`; do not merge to `main` or deploy.
- Cookie rules: `HttpOnly: true`, `SameSite=Lax`, `Path=/`, no `Domain` attribute, `Secure` + `__Host-shotistry_session` when `NODE_ENV === 'production'`.
- Never return `passwordHash`, raw session tokens, `tokenHash`, or `csrfToken` (except active caller's own `csrfToken` from login/register/session inspection) in logs or admin responses.

## Review Focus
1. Unprefixed cookie shadowing in production: `extractSessionToken(request, true)` MUST ignore `shotistry_session` and accept only `__Host-shotistry_session` in production -> tested in Task 2.
2. Trial credit farming via multi-workspace creation or repeated registration -> verified via `trialGrantedAt` & `createAdditionalWorkspaceForUser` (`0` credits) -> tested in Task 1 & Task 4.
3. Forged identity headers (`x-user-id`, `x-user-role`, `x-workspace-id`, `shotistry_*` cookies) and unauthenticated default `ADMIN` bypasses -> tested in Task 5 & Task 7.
4. Workspace membership live revocation/demotion mid-session (`VIEWER` or removed member holding valid session cookie) -> tested in Task 3 & Task 5.
5. CSRF bypass vectors (`cross-site` Fetch Metadata, mismatched `Origin`, form-encoded POST on login/register, missing/invalid `x-csrf-token`) -> tested in Task 2 & Task 4 & Task 7.

---

### Task 1: Database Schema, Migrations, SQLite Parity & Removal of Default Auto-Provisioning

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261108000000_sessions_rbac/migration.sql`
- Modify: `src/lib/db/prisma.ts`
- Modify: `src/lib/ledger/credit-ledger-service.ts`
- Modify: `src/lib/ledger/postgres-ledger-service.ts`
- Test: `tests/db-ledger.test.mjs`, `tests/postgres-ledger.test.mjs`, `tests/auth-security.test.mjs`

**Interfaces:**
- Produces in `src/lib/db/prisma.ts`: updated `"User"`, `"WorkspaceMember"`, `"Session"` DDL + column upgrade guard in `initSqliteDb()`.
- Produces in `CreditLedgerService` & `PostgresCreditLedgerService`:
  - `registerMerchantWithInitialWorkspace(input: { email: string; passwordHash: string; name?: string; phone?: string; country?: 'EG' | 'SA'; locale?: 'ar' | 'en'; workspaceName?: string }): Promise<{ user: PublicUserRecord; workspace: WorkspaceBalanceSummary; trialGranted: boolean }>`
  - `createAdditionalWorkspaceForUser(input: { userId: string; workspaceName: string; country?: 'EG' | 'SA' }): Promise<WorkspaceBalanceSummary>`
  - `ensureWorkspace(input: WorkspaceProvisionInput)` — rejects missing `userId` or `workspaceId` (no `'user-default-merchant'` or `'ws-default-studio'` defaults; enforces `'USER'` role on automatic provisioning unless explicitly seeded by trusted test setup).
  - `getWorkspaceBalance(workspaceId: string)` — throws `NOT_FOUND: Workspace <id> not found` if absent instead of auto-creating.

- [ ] **Step 1: Write failing test for schema tables & removal of silent default provisioning**

```js
// In tests/auth-security.test.mjs (initial batch)
test('Session table exists in SQLite schema and getWorkspaceBalance rejects missing workspace instead of auto-provisioning', async () => {
  await resetDbForTests();
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info("Session")`).all().map((c) => c.name);
  assert.ok(cols.includes('tokenHash'));
  assert.ok(cols.includes('csrfToken'));
  assert.ok(cols.includes('idleExpiresAt'));
  assert.ok(cols.includes('expiresAt'));
  assert.ok(cols.includes('revokedAt'));

  const userCols = db.prepare(`PRAGMA table_info("User")`).all().map((c) => c.name);
  assert.ok(userCols.includes('trialGrantedAt'));
  assert.ok(userCols.includes('emailVerifiedAt'));
  assert.ok(userCols.includes('passwordUpdatedAt'));

  const ledger = new CreditLedgerService();
  await assert.rejects(() => ledger.getWorkspaceBalance('non-existent-ws'), /NOT_FOUND/i);
});
```

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --experimental-strip-types --test tests/auth-security.test.mjs` -> expect FAIL (`Session` columns empty / `getWorkspaceBalance` does not throw).
- [ ] **Step 3: Update Prisma schema, PostgreSQL migration SQL, `src/lib/db/prisma.ts`, and Ledger services**
  - Add `WorkspaceRole` enum (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`), `Session` model, and `User.emailVerifiedAt`, `User.trialGrantedAt`, `User.passwordUpdatedAt` to `prisma/schema.prisma` + matching `prisma/migrations/20261108000000_sessions_rbac/migration.sql`.
  - Update `SCHEMA_DDL` + idempotent column-migration check in `src/lib/db/prisma.ts`.
  - Implement `registerMerchantWithInitialWorkspace()` (atomic `USER` + workspace + `OWNER` + `FREE` sub + single 5-credit trial grant gated on `trialGrantedAt` & `trial:grant:user:${userId}`) and `createAdditionalWorkspaceForUser()` (creates workspace with `0` trial credits). Update `ensureWorkspace()` to require explicit `userId`/`workspaceId` (no default `'ws-default-studio'` / `'user-default-merchant'`) and refuse creating `'ADMIN'` users; update `getWorkspaceBalance()` to throw `NOT_FOUND`. Mirror identically in `PostgresCreditLedgerService`.
- [ ] **Step 4: Run schema validation & tests**
  - Run: `npx prisma validate && npx prisma generate && node --experimental-strip-types --test tests/auth-security.test.mjs tests/db-ledger.test.mjs`
- [ ] **Step 5: Commit Task 1**

---

### Task 2: Password Hashing (`scrypt`), Rate Limiter, CSRF Defense & Opaque Session Lifecycle

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/security/rate-limit.ts`
- Create: `src/lib/security/csrf.ts`
- Modify: `src/lib/auth/session.ts`
- Test: `tests/auth-security.test.mjs`

**Interfaces:**
- Produces in `src/lib/auth/password.ts`:
  - `validatePasswordStrength(password: string, minLength?: number): { valid: boolean; reason?: string }`
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean>`
  - `constantTimeDummyVerify(password: string): Promise<void>`
- Produces in `src/lib/security/rate-limit.ts`:
  - `consumeRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; retryAfterSeconds: number }`
  - `getClientIp(request: Request): string`
  - `resetRateLimitsForTests(): void`
- Produces in `src/lib/security/csrf.ts`:
  - `validateSameOrigin(request: Request): { valid: boolean; reason?: string }`
  - `validateCsrfRequest(request: Request, sessionCsrfToken: string): { valid: boolean; reason?: string }`
- Produces in `src/lib/auth/session.ts`:
  - `getSessionCookieName(isProduction?: boolean): string`
  - `buildSessionCookieHeader(rawToken: string, expiresAt: Date, isProduction?: boolean): string`
  - `buildClearSessionCookieHeader(isProduction?: boolean): string`
  - `extractSessionToken(request: Request, isProduction?: boolean): string | null`
  - `hashSessionToken(rawToken: string): string`
  - `createSession(params: { userId: string; activeWorkspaceId?: string | null; userAgent?: string | null; ipAddress?: string | null; rotateFromRawToken?: string | null; idleTtlSeconds?: number; absoluteTtlSeconds?: number }): Promise<{ rawToken: string; cookieHeader: string; session: SessionRecord }>`
  - `resolveOptionalSession(request: Request, options?: { isProduction?: boolean; touchActivity?: boolean }): Promise<AuthenticatedSessionContext | null>`
  - `resolveAuthenticatedSession(request: Request, options?: { requireWorkspace?: boolean }): Promise<AuthenticatedSessionContext>`
  - `revokeSessionById(sessionId: string, ownerUserId: string, reason?: string): Promise<boolean>`
  - `revokeSessionByRawToken(rawToken: string, reason?: string): Promise<boolean>`
  - `revokeAllUserSessions(userId: string, reason?: string, exceptSessionId?: string): Promise<number>`
  - `listActiveUserSessions(userId: string, currentSessionId?: string): UserSessionSummary[]`
  - `switchSessionActiveWorkspace(sessionId: string, userId: string, targetWorkspaceId: string): Promise<WorkspaceBalanceSummary>`

- [ ] **Step 1: Write failing tests for password hashing, rate limiting, CSRF, opaque sessions, `__Host-` cookies, expiry & rotation**
  - Test `scrypt` hashing randomness, `verifyPassword` pass/fail, tampered hash rejection, weak password rejection.
  - Test cookie builder formatting in dev (`shotistry_session=...`) and production (`__Host-shotistry_session=...; Secure; HttpOnly; SameSite=Lax; Path=/` with zero `Domain=`), and confirm `extractSessionToken(req, true)` ignores plain `shotistry_session`.
  - Test SHA-256 hashing invariant (DB `"Session"."tokenHash"` != raw cookie token).
  - Test idle expiry, absolute expiry, session rotation on auth, single-device revocation, cross-user revocation blocked, and revoke-all.
  - Test CSRF origin checks (`Sec-Fetch-Site: cross-site`, mismatched `Origin`), `x-csrf-token` timing-safe verification, and rate limiting (`consumeRateLimit`).
- [ ] **Step 2: Run tests to verify failure**
  - Run: `node --experimental-strip-types --test tests/auth-security.test.mjs` -> expect FAIL (modules not found).
- [ ] **Step 3: Implement `password.ts`, `rate-limit.ts`, `csrf.ts`, and `session.ts`**
  - Completely remove legacy `resolveWorkspaceSession` header/cookie trust and default provisioning from `src/lib/auth/session.ts`.
  - Ensure `resolveAuthenticatedSession` verifies cookie -> SHA-256 lookup -> non-revoked -> `now <= expiresAt` & `now <= idleExpiresAt` -> extends `idleExpiresAt` -> queries live `User` & `WorkspaceMember` from DB.
- [ ] **Step 4: Run tests to verify pass**
  - Run: `node --experimental-strip-types --test tests/auth-security.test.mjs` -> expect PASS.
- [ ] **Step 5: Commit Task 2**

---

### Task 3: RBAC Permission Engine & Secure One-Time Admin Bootstrap

**Files:**
- Create: `src/lib/auth/rbac.ts`
- Create: `src/lib/auth/admin-bootstrap.ts`
- Create: `scripts/bootstrap-admin.mjs`
- Modify: `src/lib/storage/asset-storage.ts`
- Test: `tests/auth-security.test.mjs`

**Interfaces:**
- Produces in `src/lib/auth/rbac.ts`:
  - Types `PlatformRole = 'USER' | 'SUPPORT' | 'ADMIN'`, `WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'`, `PlatformPermission`, `WorkspacePermission`.
  - `hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean`
  - `hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission): boolean`
  - `requirePlatformPermission(session: AuthenticatedSessionContext, permission: PlatformPermission): void`
  - `requireWorkspacePermission(session: AuthenticatedSessionContext, permission: WorkspacePermission): WorkspaceBalanceSummary`
  - `canManageWorkspaceMemberRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean`
- Produces in `src/lib/auth/admin-bootstrap.ts`:
  - `bootstrapPlatformAdmin(input: { email: string; password: string; name?: string; bootstrapSecret: string }): Promise<{ userId: string; email: string; role: 'ADMIN'; auditLogId: string }>`
  - `createSupportOperatorByAdmin(input: { adminUserId: string; email: string; password: string; name?: string }): Promise<{ userId: string; email: string; role: 'SUPPORT' }>` (server/CLI helper enforcing acting admin check).

- [ ] **Step 1: Write failing tests for RBAC separation, non-escalation, Admin Bootstrap & hardened asset signing secret**
  - Verify Workspace `OWNER` and Workspace `ADMIN` have `hasPlatformPermission(..., 'platform:metrics:read') === false` and `hasPlatformPermission(..., 'platform:credits:adjust') === false`.
  - Verify `VIEWER` has `job:read` & `workspace:read`, but `asset:upload`, `photoshoot:generate`, `billing:checkout`, `workspace:members:manage` are `false`.
  - Verify `ADMIN` Workspace role cannot perform `billing:checkout` (`OWNER` only) or assign `OWNER` role.
  - Verify `bootstrapPlatformAdmin`: rejects missing/wrong/weak secret (`< 24` chars), rejects weak password (`< 12` chars), creates first `ADMIN` + `AdminAuditLog`, and fails closed if a second bootstrap is attempted when an `ADMIN` already exists.
  - Verify `asset-storage.ts` fails closed in `NODE_ENV=production` when `ASSET_SIGNING_SECRET` is missing, and blocks path traversal (`..` / sibling dir).
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement `rbac.ts`, `admin-bootstrap.ts`, `scripts/bootstrap-admin.mjs`, and harden `asset-storage.ts`**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Commit Task 3**

---

### Task 4: Authentication, Session Management & Workspace API Routes

**Files:**
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/app/api/auth/sessions/route.ts`
- Create: `src/app/api/auth/sessions/[id]/route.ts`
- Create: `src/app/api/auth/sessions/revoke-all/route.ts`
- Create: `src/app/api/auth/password/route.ts`
- Create: `src/app/api/workspaces/route.ts`
- Create: `src/app/api/workspace/switch/route.ts`
- Create: `src/app/api/workspaces/[id]/members/route.ts`
- Test: `tests/rbac-routes.test.mjs`

**Interfaces:**
- `POST /api/auth/register` -> Zod validates `{ email, password, name?, phone?, country?, locale?, workspaceName? }`; rejects non-JSON / cross-site Origin; rate-limited; rejects client `role`; atomically provisions user (`USER`), initial workspace, `OWNER` membership, `FREE` sub, 5 trial credits (`trialGrantedAt`), rotates any prior session, sets HttpOnly cookie, returns `201`. Duplicate email returns `409` without granting extra credits or creating second user.
- `POST /api/auth/login` -> Zod validates `{ email, password }`; rate-limited; checks Origin + `application/json`; constant-timing generic `401 Invalid email or password` on bad credentials; rotates prior session; sets HttpOnly cookie; returns `200` with `{ success: true, user, activeWorkspace, workspaces, csrfToken }`.
- `POST /api/auth/logout` -> Requires valid session (`401`) + CSRF (`403`); revokes session + clears cookie.
- `GET /api/auth/session` -> Returns `200 { authenticated: false, user: null, activeWorkspace: null, workspaces: [] }` when unauthenticated, or full authenticated summary + `csrfToken`. Never auto-provisions accounts.
- `GET /api/auth/sessions`, `DELETE /api/auth/sessions/[id]`, `POST /api/auth/sessions/revoke-all`, `POST /api/auth/password` -> Multi-device listing, single/all revocation, and password-change invalidation of all existing sessions.
- `GET/POST /api/workspaces`, `POST /api/workspace/switch`, `GET/POST /api/workspaces/[id]/members` -> Workspace creation (`0` trial credits), switching (DB membership check), and member addition/role updates (`OWNER` / `ADMIN`).

- [ ] **Step 1: Write failing API tests covering auth endpoints, multi-device sessions, workspace switching, duplicate accounts, password change invalidation, CSRF, rate limits & role escalation via body**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement all `/api/auth/*` and `/api/workspace*` route handlers**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Commit Task 4**

---

### Task 5: Harden All Existing API Routes Against Bypass & Cross-Tenant Access

**Files:**
- Modify: `src/app/api/workspace/session/route.ts`
- Modify: `src/app/api/assets/upload/route.ts`
- Modify: `src/app/api/photoshoots/generate/route.ts`
- Modify: `src/app/api/jobs/[id]/route.ts`
- Modify: `src/app/api/billing/checkout-intent/route.ts`
- Modify: `src/app/api/admin/metrics/route.ts`
- Modify: `src/app/api/admin/credits/adjust/route.ts`
- Modify: `src/app/api/webhooks/paymob/route.ts`
- Test: `tests/rbac-routes.test.mjs`

**Interfaces:**
- All user/admin/merchant API routes call `resolveAuthenticatedSession()` -> return `401` on unauthenticated calls (never fallback to `ADMIN` or default IDs, ignore forged `x-user-id`/`x-user-role`/`x-workspace-id` headers and unsigned `shotistry_*` cookies).
- State-changing routes enforce `validateCsrfRequest()` -> `403`.
- Tenant mutations (`generate`, `checkout-intent`) reject `body.workspaceId !== session.activeWorkspaceId` with `403`, enforce plan & RBAC role permissions (`VIEWER` gets `403` on upload/generate; `MEMBER`/`ADMIN` get `403` on `billing:checkout` -> `OWNER` only), and block `sandboxSimulateWebhook` in production (`403`).
- `GET /api/jobs/[id]` removes `session.role !== 'ADMIN'` bypass: checks strict workspace match `jobRow.workspaceId === session.activeWorkspaceId`.
- `/api/admin/metrics` enforces `ADMIN` or `SUPPORT`; `/api/admin/credits/adjust` enforces `ADMIN` (full positive/negative) or `SUPPORT` (positive `1..200` only), rejects missing/unknown target workspace with `404` (zero HTTP admin/workspace auto-creation), and logs authentic `session.userId`.
- `/api/webhooks/paymob` removes `'ws-default-studio'` fallback and `ensureWorkspace()`: resolves workspace via `PaymentTransaction` (`paymobOrderId`) or `Subscription` (`paymobSubscriptionId`) or explicit existing `workspace_id`, returning `400`/`404` if missing or unknown.

- [ ] **Step 1: Write failing security tests for every hardened route** (anonymous access `401`, forged headers ignored/`401`/`403`, cross-workspace `403`, `VIEWER`/`MEMBER`/`OWNER` role enforcement, `SUPPORT` credit cap, `ADMIN` isolated from tenant job bypass, Paymob unknown workspace `404`, missing CSRF token `403`, live mid-session demotion `403`).
- [ ] **Step 2: Run `tests/rbac-routes.test.mjs` to verify failures**
- [ ] **Step 3: Refactor all 8 existing route files cleanly**
- [ ] **Step 4: Run `tests/rbac-routes.test.mjs` to verify pass**
- [ ] **Step 5: Commit Task 5**

---

### Task 6: Update Frontend Consumers & Auth/Session UI

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/components/Footer.tsx`
- Modify: `src/lib/i18n/translations.ts`
- Modify: `src/app/studio/page.tsx`
- Modify: `src/app/pricing/page.tsx`
- Modify: `src/app/admin/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/app/account/page.tsx`

**Interfaces:**
- `AppContext`: removes hardcoded `ws-default-studio` & `user-default-merchant` and spoofed headers; exposes `isAuthenticated`, `isAuthLoading`, `user`, `activeWorkspace`, `workspaces`, `csrfToken`, `login()`, `register()`, `logout()`, `switchWorkspace()`, `authorizedFetch()` (injects `x-csrf-token` on mutations, relies strictly on HttpOnly session cookies).
- `Navbar`: displays Sign In / Register CTA for guests, active workspace selector + credits badge + Account link + Logout button for authenticated users, and Admin link ONLY when `user.role === 'ADMIN' || user.role === 'SUPPORT'`.
- `AdminPage`: removes hardcoded `'x-user-role': 'ADMIN'` header and default email placeholder; displays clear Access Denied state (`401`/`403`) if visitor is not an authenticated Platform `ADMIN`/`SUPPORT`.
- `StudioPage` & `PricingPage`: require authenticated session (prompt sign-in/register cleanly for guests before actions; use `authorizedFetch` without spoofed headers).
- `/login`, `/register`, `/account`: clean RTL/LTR Arabic & English Tailwind UI covering login, registration (`EG`/`SA`, `ar`/`en`), password change, workspace creation/switching, and active device session inspection/revocation.

- [ ] **Step 1: Add translations and update `AppContext.tsx`**
- [ ] **Step 2: Create `/login`, `/register`, `/account` pages and update `Navbar`, `Footer`, `StudioPage`, `PricingPage`, `AdminPage`**
- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run lint` to verify frontend compilation and clean types**
- [ ] **Step 4: Commit Task 6**

---

### Task 7: Update Existing Integration Tests & Verify Complete Security Matrix

**Files:**
- Modify: `tests/admin-metrics.test.mjs`
- Modify: `tests/api-photoshoots.test.mjs`
- Modify: `tests/e2e-workflow.test.mjs`
- Modify: `tests/paymob-webhook.test.mjs`
- Modify: `tests/db-ledger.test.mjs`
- Modify: `tests/postgres-ledger.test.mjs`
- Verify: `tests/auth-security.test.mjs`, `tests/rbac-routes.test.mjs`

- [ ] **Step 1: Update existing test suites to authenticate via `/api/auth/register`, `/api/auth/login`, cookie + `x-csrf-token`, and `bootstrapPlatformAdmin`** (removing forged `x-user-id`/`x-workspace-id`/`x-user-role` assumptions). Keep every real assertion (`mrr`, AI expenses, double-spend concurrency, HMAC webhook replay, product fidelity) intact!
- [ ] **Step 2: Run full test suite (`npm test`), verify zero unintended skips or failures**
- [ ] **Step 3: Run `npx tsc --noEmit`, `npm run lint`, `npm run build` and inspect outputs**
- [ ] **Step 4: Commit Task 7**

---

### Task 8: Author Required System Actors, Use Cases, RBAC & Auth Documentation + Sync Docs

**Files:**
- Create: `docs/product/system-actors.md` (with **System Context** Mermaid diagram)
- Create: `docs/product/use-case-specification.md` (with **Use Case Diagram** Mermaid diagram)
- Create: `docs/security/rbac-matrix.md` (with **Actor Permission Relationships** Mermaid diagram)
- Create: `docs/security/authentication-authorization.md` (with **Authentication & Authorization Flow** Mermaid diagram)
- Modify: `docs/security/security-checklist.md`, `docs/security/threat-model.md`, `docs/architecture/database-design.md`, `docs/architecture/api-specification.md`, `docs/audit/production-readiness-audit.md`, `project-status.md`, `CHANGELOG.md`

- [ ] **Step 1: Draft all 4 core specification documents cross-checked 1:1 against verified code & test evidence** (strictly distinguishing verified implemented capabilities from planned roadmap items such as live email verification delivery, R2 direct presigned upload, async worker queue, full Paymob cancellation API).
- [ ] **Step 2: Synchronize `security-checklist.md` (truthfully noting what is implemented vs planned/ops-dependent), `threat-model.md`, `database-design.md`, `api-specification.md`, `production-readiness-audit.md`, `project-status.md`, `CHANGELOG.md`**
- [ ] **Step 3: Final verification run (`npx prisma validate && npm test && npx tsc --noEmit && npm run lint && npm run build`)**
- [ ] **Step 4: Final commit on `audit/production-readiness`**
