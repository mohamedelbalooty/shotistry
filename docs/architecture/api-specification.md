# REST API Specification (Verified & Planned Endpoints)

- **Status:** Synchronized with [`src/app/api/**`](file:///Users/tasawk/StudioProjects/shotistry/src/app/api) (**21 route files / 23 HTTP handlers**)
- **Authentication Model:** **Option A** Database-backed `HttpOnly` opaque cookie (`__Host-shotistry_session` in production, `shotistry_session` in dev/test). Zero trust in legacy headers (`x-user-id`, `x-user-role`, `x-workspace-id`).
- **CSRF Convention:** Authenticated `POST` / `DELETE` routes require `x-csrf-token` matching `Session.csrfToken` alongside Same-Origin / `Sec-Fetch-Site` validation (`403` on mismatch). Pre-auth JSON endpoints (`/api/auth/register`, `/api/auth/login`) enforce `Content-Type: application/json` (`415`) and `validateSameOrigin()` (`403`).

---

## Part A — Implemented & Verified REST Endpoints

### 1. Authentication & Session Lifecycle

#### `POST /api/auth/register`
- **Security:** `application/json` required (`415`), `validateSameOrigin`, rate-limited (`10 req / 15m` per IP -> `429`), rejects `role`/`platformRole` in JSON (`403`).
- **Request Body:** `{ email, password (>=8 chars, letter+digit), name?, phone?, country?: "EG" | "SA", locale?: "ar" | "en", workspaceName? }`
- **Response (`201 Created`):** Sets `HttpOnly` session cookie + returns `{ success: true, user, activeWorkspace, workspaceRole: "OWNER", workspaces, csrfToken }`.
- **Behavior:** Hashes password via `scrypt`, atomically provisions `User` (`role='USER'`), initial `Workspace`, `WorkspaceMember` (`OWNER`), active `FREE` subscription, and single-time `5` trial credits (`trialGrantedAt`, `idempotencyKey='trial:grant:user:<userId>'`). Duplicate email returns generic `409`.

#### `POST /api/auth/login`
- **Security:** `application/json` required (`415`), `validateSameOrigin`, rate-limited (`10 req / 15m` IP AND `10 req / 15m` IP+email -> `429`), `constantTimeDummyVerify` on unknown email.
- **Request Body:** `{ email, password }`
- **Response (`200 OK` | `401`):** Rotates prior cookie if present (`ROTATED_ON_AUTH`), sets new `HttpOnly` cookie, returns `{ success: true, user, activeWorkspace, workspaceRole, workspaces, csrfToken }`. Failed credentials return `{ success: false, error: "Invalid email or password" }`.

#### `GET /api/auth/session`
- **Security:** Optional cookie inspection (safe read). Never auto-provisions default users/workspaces.
- **Response (`200 OK`):** Unauthenticated -> `{ authenticated: false, user: null, activeWorkspace: null, workspaceRole: null, workspaces: [] }`. Authenticated -> `{ authenticated: true, user, activeWorkspace, workspaceRole, workspaces, csrfToken }`.

#### `POST /api/auth/logout`
- **Security:** Authenticated session + `x-csrf-token`.
- **Response (`200 OK`):** Revokes current `Session` (`LOGOUT`) and clears cookie (`Max-Age=0`).

#### `GET /api/auth/sessions`
- **Security:** Authenticated session.
- **Response (`200 OK`):** `{ success: true, sessions }` listing active devices for `session.userId` (`tokenHash` and `csrfToken` omitted).

#### `DELETE /api/auth/sessions/[id]`
- **Security:** Authenticated session + `x-csrf-token`. Scoped strictly to `WHERE id = ? AND userId = ?` (`404` otherwise).
- **Response (`200 OK`):** `{ success: true, revokedSessionId, revokedCurrentSession }` (clears cookie if `revokedCurrentSession === true`).

#### `POST /api/auth/sessions/revoke-all`
- **Security:** Authenticated session + `x-csrf-token`. Optional `{ keepCurrent?: boolean }`.
- **Response (`200 OK`):** `{ success: true, revokedCount }` (clears cookie unless `keepCurrent === true`).

#### `POST /api/auth/password`
- **Security:** Authenticated session + `x-csrf-token`, rate-limited (`auth:password:change:user`, `5 req / 15m` per `userId`), enforces >=12 chars for `ADMIN` and >=8 chars otherwise.
- **Request Body:** `{ currentPassword, newPassword }`
- **Response (`200 OK`):** Updates `passwordHash` & `passwordUpdatedAt`, revokes **all** sessions across every device (`PASSWORD_CHANGED`), sends `passwordChangedNotice` email alert, issues fresh rotated session cookie + returns `{ success: true, csrfToken }`.

#### `POST /api/auth/verify-email/confirm`
- **Security:** Public endpoint, rate-limited (`10 req / 15m`).
- **Request Body:** `{ token }` (extracted client-side from `#token=` fragment and stripped via `history.replaceState`).
- **Response (`200 OK`):** Atomically consumes single-use `EMAIL_VERIFY` token, stamps `User.emailVerifiedAt`, and returns `{ success: true }`.

#### `POST /api/auth/verify-email/resend`
- **Security:** Authenticated session + `x-csrf-token`, rate-limited (`auth:verify_email:resend:user`, `3 req / 15m`).
- **Response (`200 OK`):** Issues new 24h `EMAIL_VERIFY` token and dispatches bilingual verification email with `#token=`. Returns `{ success: true }`.

#### `POST /api/auth/email/change-request`
- **Security:** Authenticated session + `x-csrf-token` + verified email (`requireVerifiedEmail`), rate-limited (`auth:email_change:request:user`, `3 req / 15m`).
- **Request Body:** `{ newEmail }`
- **Response (`200 OK`):** Issues 1h `EMAIL_CHANGE` token and dispatches confirmation email to target address. Returns `{ success: true }`.

#### `POST /api/auth/email/change-confirm`
- **Security:** Authenticated session + `x-csrf-token`, rate-limited (`10 req / 15m`).
- **Request Body:** `{ token }`
- **Response (`200 OK`):** Atomically consumes `EMAIL_CHANGE` token, updates `User.email`, stamps `emailVerifiedAt`, and returns `{ success: true }`.

#### `POST /api/auth/forgot-password`
- **Security:** Public endpoint, rate-limited (`auth:forgot_password:ip` & `auth:forgot_password:email`), uniform `202 Accepted` response with constant-time floor padding (~50 ms) to prevent email enumeration.
- **Request Body:** `{ email }`
- **Behavior:** Standard merchants receive a 15-minute `PASSWORD_RESET` token link (`#token=`) via email. Privileged accounts (`ADMIN`, `SUPPORT`) receive no email, no token, and record an immutable `PRIVILEGED_RESET_ATTEMPT` audit row in `AdminAuditLog`.
- **Response (`202 Accepted`):** Always returns `{ success: true, message: "If an account matches this email, reset instructions have been sent." }`.

#### `POST /api/auth/reset-password`
- **Security:** Public endpoint, rate-limited (`auth:reset_password:ip`, `5 req / 15m`).
- **Request Body:** `{ token, newPassword }`
- **Behavior:** Validates password strength (min 8 chars) and pre-hashes with Argon2id before token consumption. Atomically consumes token, updates password hash + `passwordUpdatedAt`, revokes **all** active sessions (`PASSWORD_RESET`) and outstanding reset tokens, clears session cookies (`Max-Age=0`), and sends `passwordChangedNotice` alert email.
- **Response (`200 OK`):** `{ success: true, message: "Password reset successful" }`.

---

### 2. Multi-Workspace & Member Governance

#### `GET /api/workspaces`
- **Security:** Authenticated session.
- **Response (`200 OK`):** `{ success: true, activeWorkspaceId, workspaces }` filtered strictly by `WorkspaceMember.userId = session.userId`.

#### `POST /api/workspaces`
- **Security:** Authenticated session + `x-csrf-token` + verified email (`requireVerifiedEmail` -> `403 EMAIL_VERIFICATION_REQUIRED` if unverified).
- **Request Body:** `{ name, country?: "EG" | "SA" }`
- **Response (`201 Created`):** `{ success: true, workspace }` (`OWNER` membership, `FREE` plan, **`0` trial credits**).

#### `POST /api/workspace/switch`
- **Security:** Authenticated session + `x-csrf-token`. Verifies `WorkspaceMember` row for target `workspaceId` (`403` otherwise).
- **Request Body:** `{ workspaceId }`
- **Response (`200 OK`):** Updates `Session.activeWorkspaceId`, returns `{ success: true, activeWorkspace, workspaceRole, workspaces }`.

#### `GET /api/workspace/session`
- **Security:** Authenticated session with active workspace (`requireWorkspace: true`) + `workspace:read` (`403` if caller has `0` workspaces or lacks membership).
- **Response (`200 OK`):** `{ success: true, workspace, workspaceRole, platformRole, recentJobs }` (up to last 20 jobs for `activeWorkspace`).

#### `GET /api/workspaces/[id]/members`
- **Security:** Authenticated session + `workspace:members:read` (`OWNER` or `ADMIN` only; `MEMBER`/`VIEWER` receive `403`).
- **Response (`200 OK`):** `{ success: true, members, invites }` (pending invites are sanitized to omit `tokenHash`).

#### `POST /api/workspaces/[id]/members`
- **Security:** Authenticated session + `x-csrf-token` + verified email (`requireVerifiedEmail`) + `workspace:members:manage` + [`canManageWorkspaceMemberRole`](file:///Users/tasawk/StudioProjects/shotistry/src/lib/auth/rbac.ts#L128-L139) (`ADMIN` can assign only `MEMBER`|`VIEWER`; `OWNER` cannot have owner role overwritten). Rate-limited (`workspaces:invites:create:ip`).
- **Request Body:** `{ email, role: "ADMIN" | "MEMBER" | "VIEWER" }`
- **Behavior:** If the target user is already an existing member of this workspace, updates their role and returns `200 { status: "UPDATED", member }`. Otherwise, creates an identity-bound `WorkspaceInvite` record, sends an invitation email with a `#token=` link, and returns `202 { status: "INVITED", invite }`.

#### `POST /api/workspaces/invites/accept`
- **Security:** Authenticated session + `x-csrf-token` + verified email (`requireVerifiedEmail`), rate-limited (`workspaces:invites:accept:ip`).
- **Request Body:** `{ token }`
- **Behavior:** Looks up active unexpired invite by SHA-256 hash. Enforces strict identity binding (ADR-007): compares `session.email === invite.invitedEmail`. Mismatch returns `403 INVITE_IDENTITY_MISMATCH` without consuming the invite. On match, atomically consumes invite, adds member to workspace, switches active workspace, and returns `200 { success: true, workspaceId, role }`.

#### `DELETE /api/workspaces/[id]/invites/[inviteId]`
- **Security:** Authenticated session + `x-csrf-token` + `workspace:members:manage`. Validates role hierarchy.
- **Response (`200 OK`):** Marks invite revoked and returns `{ success: true }`.

---

### 3. Asset Storage & Photoshoot Generation Engine

#### `POST /api/assets/upload`
- **Security:** Authenticated session + `x-csrf-token` + `asset:upload` (`OWNER`|`ADMIN`|`MEMBER`). Rejects cross-workspace `workspaceId` (`403`), non-image payloads (`400`), and >20MB payloads (`413`).
- **Request Body:** `{ imageBase64, workspaceId? }`
- **Response (`200 OK`):** `{ success: true, asset: { key, mimeType, fileSize, signedUrl } }` (persisted under `.data/assets/<ws>/<uuid>.<ext>` with HMAC-SHA256 `signedUrl`, `3600s` TTL).

#### `GET /api/assets/download`
- **Query Params:** `?key=...&expires=...&sig=...`
- **Security:** Timing-safe HMAC-SHA256 signature verification (`403` invalid/expired), `baseDir + path.sep` directory traversal protection (`404` missing/traversal).
- **Response (`200 OK`):** Binary `image/png` | `image/jpeg` | `image/webp` with `Cache-Control: private, max-age=3600`.

#### `POST /api/photoshoots/generate`
- **Security:** Authenticated session + `x-csrf-token` + `photoshoot:generate` (`OWNER`|`ADMIN`|`MEMBER`). Rejects cross-workspace `workspaceId` (`403`), disallowed plan model/`2K`/`4K` (`403`), oversized base64 (`413`), and insufficient credits (`402`).
- **Request Body:** `{ productTitle, productCategory?, presetId?, aspectRatio?: "1:1"|"4:5"|"9:16"|"16:9", brandName?, brandAesthetic?, customDirectives?, rawImageBase64, model?: "gemini-3.1-flash-image"|"gemini-3.1-flash-lite-image"|"gemini-3-pro-image", imageSize?: "512"|"1K"|"2K"|"4K", lockProductForeground?: boolean, workspaceId? }`
- **Response (`200 OK`):** Synchronous execution returning `{ success: true, data: { jobId, photoshootId, imageUrl, thumbnailUrl, maskUrl, isolatedUrl, fidelityScore, fidelityVerified, synthIdDetected, executionMode, components, negativePrompt, creditsCharged, remainingCredits, ledgerEntryId } }`. On failure, `CreditReservation` is automatically released (`422` / `500`, `reservationReleased: true`).

#### `GET /api/jobs/[id]`
- **Security:** Authenticated session + `job:read`. Enforces `jobRow.workspaceId === session.activeWorkspaceId` (`403` cross-workspace even for Platform `ADMIN`; `404` missing).
- **Response (`200 OK`):** `{ success: true, job, images }`.

---

### 4. Billing, Webhooks & Platform Operations

#### `GET /api/billing/plans`
- **Security:** Public read. Query `?country=SA|EG`.
- **Response (`200 OK`):** `{ country, currency, plans, topUpPacks, modelCosts }`.

#### `POST /api/billing/checkout-intent`
- **Security:** Authenticated session + `x-csrf-token` + verified email (`requireVerifiedEmail` -> `403 EMAIL_VERIFICATION_REQUIRED`) + `billing:checkout` (`WorkspaceRole.OWNER` **only**; `WS_ADMIN` gets `403`). Rejects cross-workspace `workspaceId` (`403`) and rejects `sandboxSimulateWebhook: true` in `NODE_ENV === 'production'` (`403`).
- **Request Body:** `{ kind?: "SUBSCRIPTION" | "TOP_UP", planTier?: "STARTER" | "PRO" | "AGENCY", packId?: string, currency?: "EGP" | "SAR", paymentMethod?: string, workspaceId?, sandboxSimulateWebhook?: boolean }`
- **Response (`200 OK`):** `{ success: true, intent: { transactionId, paymobOrderId, workspaceId, kind, planTier, packId, amountCents, currency, credits, status, sandboxWebhookResult } }`.

#### `POST /api/webhooks/paymob`
- **Security:** External Paymob HMAC-SHA512 (`paymob-hmac` header / `hmac` field). Fails closed (`503` unconfigured `PAYMOB_HMAC_SECRET`, `401` invalid HMAC). Rejects missing `workspace_id` (`400`) or nonexistent workspace (`404`). Deduplicates `WebhookEvent.eventId` inside `SERIALIZABLE` tx. Never gated on email verification.
- **Response (`200 OK`):** Reconciles subscription triggers (`ACTIVE`/`PAST_DUE`/`SUSPENDED`/`CANCELED`) and transaction events idempotently via `CreditLedger`.

#### `GET /api/admin/metrics`
- **Security:** Authenticated session + `platform:metrics:read` (`ADMIN` or `SUPPORT`; `WS_OWNER` gets `403`).
- **Response (`200 OK`):** `{ totalUsers, payingSubscribers, mrrUsd, mrrSar, mrrEgp, grossMarginPercent, aiExpensesUsd, generationSuccessRate, totalImagesGenerated, recentJobs, recentAuditLogs, systemStatus }`.

#### `POST /api/admin/credits/adjust`
- **Security:** Authenticated session + `x-csrf-token` + `platform:credits:adjust:bounded` (`SUPPORT` restricted to integer `+1..+200`) or `platform:credits:adjust` (`ADMIN` permitted `|amount| <= 10,000`, non-zero integer, prevents negative settled balance). Target workspace must exist (`404` otherwise).
- **Request Body:** `{ workspaceId? | targetEmail?, amount, reason (>= 3 chars) }`
- **Response (`200 OK`):** `{ success: true, workspaceId, newBalance, ledgerEntryId, auditLogId }`.

---

## Part B — Planned Roadmap Endpoints (Not Yet Implemented)

- `POST /api/assets/presign-upload` — Direct-to-R2 presigned PUT URLs (replacing local `.data/assets` write path).
- `GET/POST/PATCH /api/brands` & `/api/products` — Multi-brand and product catalog CRUD UI/API (currently auto-upserts `Default Brand` in `createPhotoshootJob`).
- `POST /api/products/[id]/segment` — Dedicated decoupled segmentation endpoint prior to generation.
- `GET /api/jobs/[id]/stream` — SSE stream for asynchronous `BullMQ` generation queue (generation currently runs synchronously on `POST /api/photoshoots/generate`).
- `POST /api/billing/cancel` — Self-service subscription cancellation flow (backend webhook cancellation handler is already live).
- `POST /api/admin/operators` — HTTP wrapper around [`createSupportOperatorByAdmin`](file:///Users/tasawk/StudioProjects/shotistry/src/lib/auth/admin-bootstrap.ts#L121-L172).
