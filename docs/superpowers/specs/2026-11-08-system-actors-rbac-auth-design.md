# Shotistry — System Actors, RBAC, and Database-Backed Session Architecture Design Specification

- **Date:** November 8, 2026
- **Branch:** `audit/production-readiness` (isolated; preserve until final sign-off; do not merge into `main` or deploy)
- **Status:** Approved Design (Option A — Database-Backed Opaque Session Architecture)
- **Scope:** Full actor taxonomy, multi-tier RBAC authorization, opaque SHA-256 session lifecycle, `scrypt` authentication, CSRF & rate-limiting controls, secure admin bootstrap, removal of legacy default/header identity trust, route/UI remediation, and comprehensive test & architectural documentation deliverables.

---

## 1. Current State Security Audit (Baseline Findings Verified in Code)

An independent line-by-line inspection of `src/`, `prisma/`, and `tests/` revealed critical authentication and authorization defects that must be remediated together:

1. **Forged Client Header & Unsigned Cookie Trust (`src/lib/auth/session.ts`):**
   - `resolveWorkspaceSession()` blindly reads `x-user-id`, `x-workspace-id`, `x-user-role`, `x-country`, and unsigned `shotistry_*` cookies.
   - Any unauthenticated caller can assert `x-user-role: ADMIN` or impersonate another user's `userId` and `workspaceId`.
   - Unauthenticated requests silently default to `user-default-merchant` / `ws-default-studio` and auto-provision a workspace + 5 free credits (`ensureWorkspace()`), enabling unlimited anonymous trial abuse and identity forgery.
   - `role === 'ADMIN'` bypasses workspace membership validation on tenant routes (`src/lib/auth/session.ts`, `src/app/api/jobs/[id]/route.ts`).
2. **Unauthenticated Admin Access & Automatic Admin Account Creation (`src/app/api/admin/metrics/route.ts`, `src/app/api/admin/credits/adjust/route.ts`):**
   - `/api/admin/metrics` defaults to `isAuthorizedAdmin() === true` when `x-user-role` is omitted.
   - `/api/admin/credits/adjust` defaults missing `x-user-role` to `'ADMIN'` and missing `x-user-id` to `'admin-system'`, automatically inserts an `'ADMIN'` user into `"User"` from an unauthenticated HTTP request, and auto-provisions non-existent target workspaces.
   - Client UI `src/app/admin/page.tsx` explicitly sends `'x-user-role': 'ADMIN'` headers and renders admin controls to unauthenticated visitors.
3. **Hardcoded Fallback Signing Secret & Prefix Traversal Risk (`src/lib/storage/asset-storage.ts`):**
   - `getSigningSecret()` falls back to a static string `'shotistry-local-asset-signing-key-hmac-sha256'`.
   - `readStoredAsset()` checks `fullPath.startsWith(getAssetsBaseDir())` without enforcing a trailing path separator (`path.sep`).
4. **Silent Workspace Auto-Provisioning on Webhook & Ledger Reads (`src/app/api/webhooks/paymob/route.ts`, `src/lib/ledger/credit-ledger-service.ts`, `src/lib/ledger/postgres-ledger-service.ts`):**
   - `webhooks/paymob` falls back to `'ws-default-studio'` and calls `ensureWorkspace()`.
   - `getWorkspaceBalance()` auto-creates workspaces on lookup miss rather than failing with not-found.
5. **No Password Authentication or Registration Lifecycle:**
   - `User.passwordHash` is unused; `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, and `/api/auth/session` do not exist; `docs/security/security-checklist.md` inaccurately checks boxes for CSRF, Rate Limiting, and RBAC session protection.

---

## 2. System Actor Model Overview

Actors are classified strictly by **who initiates or participates in interactions across trust boundaries** — separate from database entities (`User`, `Workspace`, `Brand`, `Product`, `CreditLedger`), permission sets, and internal technical modules:

1. **Anonymous / Guest Actor:**
   - **Guest Visitor:** Unauthenticated user browsing marketing landing (`/`), pricing plans (`/pricing`, `GET /api/billing/plans`), `/login`, `/register`, or checking `GET /api/auth/session`. Has zero workspace data access and receives `401 Unauthorized` on all protected APIs.
2. **Human Platform Actors (`User.role`):**
   - **Platform Super Administrator (`ADMIN`):** Bootstrapped solely out-of-band (`SYSTEM_ADMIN_BOOTSTRAP`). Manages platform telemetry, unlimited positive/negative credit adjustments with mandatory audit logs, platform support operator governance, and abuse response. Never gains implicit tenant workspace member access.
   - **Customer Support Operator (`SUPPORT`):** Reads platform telemetry and audit logs (`/api/admin/metrics`), issues bounded positive goodwill credit compensations (`+1` to `+200` credits, no negative debits, no role changes).
3. **Merchant Workspace Human Participants (`User.role = 'USER'` + `WorkspaceMember.role`):**
   - **Workspace Owner (`OWNER`):** Creator/owner of workspace. Full control within assigned workspace(s), including billing checkout (`POST /api/billing/checkout-intent`), workspace membership management, brand/product management, asset uploads, studio generations, and job inspection.
   - **Workspace Admin (`ADMIN`):** Delegated studio manager inside a workspace. Manages `MEMBER`/`VIEWER` seats, uploads assets, generates photoshoots, views jobs/balance. Restricted from billing checkout, ownership transfer, and platform admin routes.
   - **Workspace Member (`MEMBER`):** Content creator / photographer. Uploads assets, generates shoots, inspects jobs, downloads renders. Restricted from billing and member administration.
   - **Workspace Viewer (`VIEWER`):** Read-only reviewer. Views workspace balance, jobs, and downloads existing signed renders. Restricted (`403`) from uploading assets, generating shoots, billing, and membership changes.
4. **External System Actors:**
   - **Paymob Payment Gateway (`PAYMOB_WEBHOOK`):** Authenticated via fail-closed HMAC-SHA512 webhook signatures. Records idempotent payment events, updates subscription states, and credits existing workspaces.
   - **Signed Asset Bearer (`SIGNED_ASSET_TOKEN`):** Client/browser fetching time-limited HMAC-SHA256 signed URLs at `GET /api/assets/download`.
   - **Google Gemini Interactions Engine (`GEMINI_API_CLIENT`):** Outbound multimodal AI inference provider (`ai.interactions.create`) authenticated with server-side `GEMINI_API_KEY`.
5. **Internal Automated / System Actors:**
   - **Ledger & Reservation Settlement Engine (`SYSTEM_LEDGER`):** Transactional ACID double-entry reserve/settle/release engine.
   - **Session Expiry & Security Sweeper (`SYSTEM_SESSION_GUARD`):** Enforces idle/absolute expiry, rotation, and cascade revocation on security events.
   - **CLI Admin Bootstrapper (`SYSTEM_ADMIN_BOOTSTRAP`):** Out-of-band initializer holding `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` — sole authority able to create the initial platform `ADMIN`.

---

## 3. Database & Persistence Design (Option A)

### 3.1 Prisma & SQL Schema Additions
1. **Enum `WorkspaceRole`:** `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`.
2. **`User` Extensions:**
   - `emailVerifiedAt DateTime?` (tracks verification status honestly; null until email delivery is provisioned)
   - `trialGrantedAt DateTime?` (idempotency guard guaranteeing one 5-credit free trial per human account, never per extra workspace)
   - `passwordUpdatedAt DateTime?`
   - Relation `sessions Session[]`
3. **`WorkspaceMember.role`:** Typed as `WorkspaceRole` defaulting to `MEMBER` (PostgreSQL migration converts `TEXT` safely via `USING` cast).
4. **New Model `Session`:**
   - `id String @id @default(uuid())` (`sess-<uuid>`)
   - `userId String` (FK `User`, `onDelete: Cascade`)
   - `activeWorkspaceId String?` (FK `Workspace`, `onDelete: SetNull`)
   - `tokenHash String @unique` (64-char hex SHA-256 of raw 32-byte opaque token; raw token is **NEVER** stored in DB or logs)
   - `csrfToken String` (32-byte base64url synchronizer CSRF token bound to this session; cannot authenticate requests on its own)
   - `userAgent String?`
   - `ipAddress String?`
   - `createdAt DateTime @default(now())`
   - `lastActivityAt DateTime @default(now())`
   - `idleExpiresAt DateTime`
   - `expiresAt DateTime` (absolute expiry)
   - `revokedAt DateTime?`
   - `revokedReason String?`
   - Indexes on `userId`, `expiresAt`, `tokenHash`.

### 3.2 Elimination of Default Provisioning
- Remove `user-default-merchant`, `ws-default-studio`, and `admin-system` fallbacks from `CreditLedgerService`, `PostgresCreditLedgerService`, and API routes.
- Replace ad-hoc `ensureWorkspace` HTTP auto-provisioning with explicit operations:
  - `registerMerchantWithInitialWorkspace(...)`: atomic `SERIALIZABLE` registration creating `User` (`role = 'USER'`), initial `Workspace`, `WorkspaceMember` (`OWNER`), `Subscription` (`FREE`, `ACTIVE`), single 5-credit `TRIAL_GRANT` (`idempotencyKey = trial:grant:user:<userId>`), and setting `User.trialGrantedAt`.
  - `createAdditionalWorkspaceForUser(...)`: atomic `SERIALIZABLE` workspace creation for an authenticated user -> creates `Workspace` + `WorkspaceMember` (`OWNER`) + `Subscription` (`FREE`, `ACTIVE`, `0` monthly trial grant) -> **0 credits added** (prevents trial farming).
  - `ensureTestWorkspace(...)` / explicit `provisionWorkspace(...)` requiring explicit `userId`, `email`, `workspaceId` (no defaults, `role` restricted strictly to `'USER'` unless created by trusted test fixture explicitly bypassing HTTP, and never `'ADMIN'` via HTTP).
  - `getWorkspaceBalance(workspaceId)` throws `NOT_FOUND:` if workspace does not exist rather than creating it silently.

---

## 4. Cryptographic Authentication & Session Specification

### 4.1 Password Hashing (`src/lib/auth/password.ts`)
- Hash format: `scrypt$N=16384$r=8$p=1$<saltHex>$<derivedKeyHex>` using `node:crypto` `crypto.scrypt` (async callback promisified with 16-byte random salt, 64-byte derived key, `N=16384, r=8, p=1`, memory limit explicit).
- Verification uses `crypto.timingSafeEqual`.
- Account-enumeration login defense: when email does not exist (or has null `passwordHash`), execute `verifyPassword` against a pre-computed dummy `scrypt` hash so valid-user vs unknown-user login timings remain indistinguishable, and always return `401 { success: false, error: 'Invalid email or password' }`.
- Password policy: min 8 chars (min 12 chars for `ADMIN` bootstrap), max 128 chars, requires at least one letter and one number (admins also require mixed case + symbol or digit).

### 4.2 Opaque Token & Cookie Configuration (`src/lib/auth/session.ts`)
- Raw token: `crypto.randomBytes(32).toString('base64url')` (256 bits entropy).
- Stored digest: `crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex')`.
- Cookie Name:
  - Production (`NODE_ENV === 'production'`): `__Host-shotistry_session`
  - Dev / Test: `shotistry_session`
- Cookie Flags (`Set-Cookie`):
  - `HttpOnly`
  - `SameSite=Lax`
  - `Path=/`
  - **No `Domain` attribute** (required for `__Host-` prefix host-only binding)
  - `Secure` in production (`NODE_ENV === 'production'`)
  - Explicit `Max-Age=<remainingSeconds>` and `Expires=<UTCString>` matching `expiresAt`
- Inbound cookie extraction accepts ONLY `__Host-shotistry_session` in production (`shotistry_session` rejected in production to defeat subdomain cookie-tossing).

### 4.3 Session Lifecycle Controls
- **Default TTLs:** Idle TTL = 7 days (`604_800`s, sliding window capped by `expiresAt`); Absolute TTL = 30 days (`2_592_000`s). Overridable via `SESSION_IDLE_TTL_SECONDS` / `SESSION_ABSOLUTE_TTL_SECONDS` for ops/testing.
- **Rotation on Authentication:** Any prior valid session cookie submitted on `POST /api/auth/login` or `POST /api/auth/register` is revoked (`revokedReason = 'ROTATED_ON_AUTH'`) before creating the new session.
- **Logout & Revocation:** `POST /api/auth/logout` revokes active session (`revokedReason = 'LOGOUT'`) and expires cookie (`Max-Age=0`).
- **Device Session Management:**
  - `GET /api/auth/sessions`: returns active non-revoked, non-expired sessions for `session.userId` with masked/safe metadata (`id`, `activeWorkspaceId`, `userAgent`, `ipAddress`, `createdAt`, `lastActivityAt`, `expiresAt`, `isCurrent`) — zero `tokenHash` or `csrfToken` exposure.
  - `DELETE /api/auth/sessions/[id]`: revokes a specific device session ONLY if owned by `session.userId` (`404`/`403` otherwise).
  - `POST /api/auth/sessions/revoke-all`: revokes all active sessions for `session.userId` (defaulting to including current and clearing cookie unless `keepCurrent: true`).
- **Workspace Switching:** `POST /api/workspace/switch` validates caller's DB `WorkspaceMember` membership for target `workspaceId`, updates `Session.activeWorkspaceId`, and returns refreshed workspace summary.
- **Password Change Invalidation:** `POST /api/auth/password` verifies `currentPassword`, hashes `newPassword`, updates `User`, revokes **ALL** existing sessions for `userId` (`revokedReason = 'PASSWORD_CHANGED'`), and mints a fresh rotated session for the active client.

---

## 5. Authorization, CSRF & Rate-Limiting Architecture

### 5.1 Zero Trust in Client Identity Signals
- `resolveAuthenticatedSession(request)` resolves identity **exclusively** from the opaque `HttpOnly` session cookie -> SHA-256 `tokenHash` lookup in `"Session"` -> live `"User"` + `"WorkspaceMember"` database rows.
- Explicitly ignored on all routes: `x-user-id`, `x-user-role`, `x-workspace-id`, `x-country`, unsigned `shotistry_user_id`/`shotistry_role`/`shotistry_workspace_id` cookies, and client-supplied `role` JSON fields.

### 5.2 Multi-Layer RBAC Enforcement (`src/lib/auth/rbac.ts`)
- Separate `PlatformRole` (`USER | SUPPORT | ADMIN`) from `WorkspaceRole` (`OWNER | ADMIN | MEMBER | VIEWER`).
- Workspace `OWNER`/`ADMIN` has ZERO platform permissions (`hasPlatformPermission === false`).
- Platform `ADMIN` has ZERO implicit tenant workspace bypasses (`resolveWorkspaceAccess` always checks `WorkspaceMember` on active workspace).
- Route enforcement mapping:
  - `GET /api/auth/session`: Public-safe session inspection (`200 { authenticated: false }` when unauthenticated; never auto-creates account).
  - `GET /api/workspace/session`: `401` if unauthenticated; requires `workspace:read` + active workspace membership.
  - `POST /api/assets/upload`: `401` + CSRF `403` + `asset:upload` (`OWNER | ADMIN | MEMBER`; `VIEWER` gets `403`).
  - `POST /api/photoshoots/generate`: `401` + CSRF `403` + `photoshoot:generate` (`OWNER | ADMIN | MEMBER`; `VIEWER` gets `403`) + rejects `body.workspaceId !== session.activeWorkspaceId` (`403`).
  - `GET /api/jobs/[id]`: `401` + `job:read` on `job.workspaceId === session.activeWorkspaceId` (`403` cross-workspace even for `User.role = 'ADMIN'`).
  - `POST /api/billing/checkout-intent`: `401` + CSRF `403` + `billing:checkout` (`OWNER` only) + rejects `body.workspaceId !== session.activeWorkspaceId` (`403`) + disables `sandboxSimulateWebhook` when `NODE_ENV === 'production'`.
  - `POST /api/workspace/switch`, `POST /api/workspaces`, `GET/POST /api/workspaces/[id]/members`: `401` + CSRF `403` (on mutations) + strict membership/role checks.
  - `GET /api/admin/metrics`: `401` if unauthenticated; `platform:metrics:read` (`ADMIN | SUPPORT` ONLY; `403` for `USER` / Workspace `OWNER`).
  - `POST /api/admin/credits/adjust`: `401` + CSRF `403` + `ADMIN` (`platform:credits:adjust`) or `SUPPORT` (`platform:credits:adjust:bounded`, strictly positive `1..200`); `404` if target workspace/email does not exist (NEVER auto-provisions targets or admins).
  - `POST /api/webhooks/paymob`: External HMAC-SHA512 only (`503` unconfigured, `401` invalid HMAC). Must resolve an **existing** workspace (from payload or existing `PaymentTransaction` / `Subscription`); rejects `'ws-default-studio'` fallback and rejects missing/non-existent workspaces (`400`/`404`).

### 5.3 CSRF Protection (`src/lib/security/csrf.ts`)
Three coordinated layers:
1. `SameSite=Lax` + `HttpOnly` cookie attributes.
2. **Origin / Fetch Metadata validation** on all state-changing endpoints (`register`, `login`, and all authenticated mutations):
   - Reject `Sec-Fetch-Site: cross-site` with `403`.
   - When `Origin` (or `Referer`) header is present, enforce exact origin match against request URL / configured `APP_URL` / `Host`.
   - Pre-auth JSON routes (`register`, `login`) enforce `application/json` content-type (blocking HTML form CSRF posts).
3. **Synchronizer CSRF Token (`x-csrf-token`):**
   - Every cookie-authenticated `POST`/`PUT`/`PATCH`/`DELETE` request must supply `x-csrf-token` matching `session.csrfToken` via `crypto.timingSafeEqual` (`403` on missing or mismatched token).

### 5.4 Rate Limiting (`src/lib/security/rate-limit.ts`)
- In-memory sliding-window rate limiter keyed by `<bucket>:<ip>` and `<bucket>:<email>` (deterministic `resetRateLimitsForTests()` for isolated test runs; note serverless production caveat recommending distributed Redis/Upstash backing in scaling deployments).
- Enforced on: `POST /api/auth/login` (e.g., 10/15m per IP+email), `POST /api/auth/register` (10/15m per IP), `POST /api/auth/password` (5/15m per user), returning `429 Too Many Requests` with `Retry-After` header.

### 5.5 Email Verification & Account Recovery Evaluation
- **Verified Status Today:** `User.emailVerifiedAt` is persisted in schema (`NULL` on signup). Transactional email transport (`SMTP` / `Resend` / `Postmark`) is **not currently provisioned** in the repository.
- **Evaluation & Required Controls (Pre-Production Roadmap):**
  - Email verification and password recovery MUST NOT generate mock links in API responses or logs.
  - When email provider credentials are added:
    1. Use single-use CSPRNG 32-byte tokens stored strictly as SHA-256 hashes in a dedicated `AuthActionToken` table (`type: VERIFY_EMAIL | PASSWORD_RESET`, `expiresAt`, `consumedAt`).
    2. Enforce 24h TTL for email verification and 15–30m TTL for password reset.
    3. Rate-limit forgot-password requests and always return generic `200 Accepted` regardless of whether the email exists.
    4. Completing password reset MUST revoke ALL active `Session` rows for that user (`revokedReason = 'PASSWORD_RESET'`) and emit an audit entry.

---

## 6. Asset Storage Signing Hardening (`src/lib/storage/asset-storage.ts`)
- `NODE_ENV === 'production'`: require `ASSET_SIGNING_SECRET` (length >= 16, non-placeholder); fail closed if missing.
- Non-production: read `ASSET_SIGNING_SECRET` if valid, otherwise generate ephemeral per-process CSPRNG 32-byte hex key on `globalThis` (zero hardcoded static strings).
- Enforce `resolvedPath.startsWith(baseDir + path.sep)` in `readStoredAsset()`.

---

## 7. Verification Strategy (Superpowers TDD + 15 Required Security Scenarios)
Every behavior is driven RED -> GREEN -> REFACTOR and verified in automated suites covering all 15 mandatory scenarios:
1. Registration and duplicate accounts (`409` duplicate rejection, single trial credit grant).
2. `scrypt` password hashing and `timingSafeEqual` verification.
3. Valid login, invalid password (`401`), unknown email constant-timing generic error (`401`), rate limiting (`429`).
4. Opaque session token generation & SHA-256 verification (cookie flags + `__Host-` production helper).
5. Idle expiration and absolute expiration (`401` + DB revocation).
6. Immediate server-side session revocation.
7. Logout revoking server session + clearing cookie.
8. Multi-device concurrent sessions + listing + single-device revocation + revoke-all + password-change cascade invalidation.
9. Active workspace creation (zero duplicate trial credits) & switching (`POST /api/workspace/switch`).
10. Cross-workspace access attempts (`403` across `generate`, `jobs`, `checkout-intent`, `members`, `switch`).
11. Anonymous admin access (`401` on `/api/admin/metrics` & `/api/admin/credits/adjust`, even with no headers or forged headers).
12. Role escalation attempts (client `role: 'ADMIN'`, Workspace `OWNER`/`ADMIN` accessing `/api/admin/*`, `VIEWER` uploading/generating, `MEMBER` billing checkout, `SUPPORT` negative/over-cap credit adjust).
13. Forged identity headers & unsigned legacy cookies (`x-user-id`, `x-user-role`, `x-workspace-id`, `shotistry_*`).
14. CSRF protection (`403` on missing/invalid `x-csrf-token`, cross-site `Origin`/`Sec-Fetch-Site`).
15. Admin bootstrap security (requires valid `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET`, strong password, refuses second admin bootstrap, unreachable via HTTP).
