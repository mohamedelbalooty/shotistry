# ADR-007: Verified-Email Gating Policy & Identity-Bound Workspace Invites

## Status: ACCEPTED (Design) — NOT YET IMPLEMENTED
**Deciders:** Product Lead, Principal Security Architect, Staff Backend Engineer
**Date:** November 8, 2026
**Design Reference:** [auth-security-hardening-design.md §6](../auth-security-hardening-design.md)

---

## 1. Context & Problem Statement
Any registered user can start paid checkout, create workspaces and add members without proving they own their email address. `POST /api/workspaces/[id]/members` adds an already-registered user to a workspace immediately, without that user's consent.

---

## 2. Decision Drivers
- Keep the free-trial experience frictionless (5 trial credits usable at once).
- Require proven email ownership before money, team, or multi-tenant actions.
- Payments already initiated must always settle.
- Invites must only be accepted by the intended person.

---

## 3. Decision
1. **Not gated:** login/logout/session, device sessions, password change, verification endpoints, asset upload, photoshoot generation, job read, workspace session read. Trial credits and existing balances stay usable.
2. **Gated (`403 { success:false, code:'EMAIL_VERIFICATION_REQUIRED' }`):**
   - `POST /api/billing/checkout-intent`
   - `POST /api/workspaces`
   - `POST /api/workspaces/[id]/members`
   - `POST /api/workspaces/invites/accept`
   - `POST /api/auth/email/change-request`
3. **Never gated:** `POST /api/webhooks/paymob` (HMAC-authenticated; settles independently of the owner's verification state).
4. `POST /members`: existing member → synchronous role update (`200 UPDATED`); non-member → `WorkspaceInvite` (7 days, SHA-256 `tokenHash`, prior pending invites for the same workspace+email revoked) → `202 INVITED`; the raw token is never returned in JSON.
5. `POST /api/workspaces/invites/accept`: session + CSRF + verified email + `session.email` equals `invite.invitedEmail` (case-insensitive), else `403 INVITE_IDENTITY_MISMATCH` **without consuming** the invite. Membership insert is idempotent.
6. `GET /members` returns sanitized `pendingInvites` to `OWNER`/`ADMIN`; `DELETE /api/workspaces/[id]/invites/[inviteId]` revokes, subject to `canManageWorkspaceMemberRole`.
7. Session payloads (`GET /api/auth/session`, `AppContext`) expose `emailVerified: boolean`; UI shows a verification banner and disables gated actions.

---

## 4. Consequences
- **Positive:** Closes the "add anyone without consent" path; ties money and team actions to a proven mailbox; trial UX unchanged.
- **Negative:** Breaks existing tests that check out or add members right after registration (exact list in the implementation plan, Existing-Test Impact Matrix). Those tests must verify email first through a test helper.
- **Dependency:** Requires ADR-006 (email + tokens).
