# Shotistry Test Data & Manual Testing Reference Guide

This document provides ready-to-use credentials, fixtures, payloads, and workflows to accelerate manual and automated testing across all user personas, roles, regional currencies, and studio capabilities in Shotistry.

To reset or re-populate all test accounts and database fixtures at any time, run:
```bash
npm run seed
```

---

## 1. Test Accounts & Personas

All accounts are pre-seeded in the operational database (`.data/shotistry.sqlite` in development, or PostgreSQL when `SHOTISTRY_DB_DRIVER=postgres`).

| Role / Persona | Email | Password | Country / Currency | Verified | Workspace Name (ID) | Available Credits | Primary Test Scenarios |
| :--- | :--- | :--- | :---: | :---: | :--- | :---: | :--- |
| **Platform Administrator** (`ADMIN`) | `admin@shotistry.com` | `Admin@Shotistry2026!` | Egypt (EGP) | Yes | Admin Studio Workspace (`ws-admin-primary`) | **100** | Accessing `/admin`, inspecting metrics, adjusting credits, system audit logs |
| **Standard Merchant** (`USER`) | `user@shotistry.com` | `User@Shotistry2026!` | Egypt (EGP) | Yes | Merchant Studio Workspace (`ws-merchant-studio`) | **25** | Studio generations, brand/product creation, credit reservations & settlements |
| **Gulf / Saudi Merchant** (`USER`) | `saudi-merchant@shotistry.com` | `Saudi@Shotistry2026!` | Saudi Arabia (SAR) | Yes | Riyadh Studio Workspace (`ws-riyadh-studio`) | **50** | SAR pricing, Arabic RTL interface, Gulf luxury presets, high-res generation |
| **Customer Support** (`SUPPORT`) | `support@shotistry.com` | `Support@Shotistry2026!` | Egypt (EGP) | Yes | Support Operations (`ws-support-ops`) | **10** | Tenant inspection, read-only operational support, password rotation |
| **Unverified Merchant** (`USER`) | `unverified@shotistry.com` | `Unverified@Shotistry2026!` | Egypt (EGP) | **No** | Pending Studio Workspace (`ws-pending-studio`) | **5** | ADR-007 email verification gating, checkout refusal (403), invite refusal (403) |
| **Legacy Admin Fixture** | `admin-system@admin.shotistry.app` | `Admin@Shotistry2026!` | Egypt (EGP) | Yes | Default Admin Studio | **100** | Automated test suite compatibility |
| **Legacy Merchant Fixture** | `user-default-merchant@merchant.shotistry.app` | `User@Shotistry2026!` | Egypt (EGP) | Yes | Default Studio Workspace (`ws-default-studio`) | **50** | E2E test workflow compatibility |

> [!NOTE]
> All passwords meet the security policy: minimum 8 characters for merchants (12 for admins), containing uppercase, lowercase, numbers, and symbols. Hashed with native Node 24 **Argon2id** (`m=19456`, `t=2`, `p=1`).

---

## 2. Interactive Browser Testing Quickstart

### Step 1: Open the Application
Ensure the local server is running:
```bash
npm run dev
```
Navigate to: **[http://localhost:3000](http://localhost:3000)**

### Step 2: Test Admin Capabilities
1. Navigate to **[http://localhost:3000/login](http://localhost:3000/login)**.
2. Sign in with:
   - **Email:** `admin@shotistry.com`
   - **Password:** `Admin@Shotistry2026!`
3. Navigate to **[http://localhost:3000/admin](http://localhost:3000/admin)**.
4. **Expected Results:**
   - Platform Metrics load successfully (Total Users, Photoshoots, Credit consumption).
   - Credit adjustment tool is functional.
   - Platform audit log displays recent administrative events.

### Step 3: Test Merchant Studio & Photoshoot Generation
1. Log out or open a private browsing window.
2. Sign in with:
   - **Email:** `user@shotistry.com`
   - **Password:** `User@Shotistry2026!`
3. Navigate to **[http://localhost:3000/studio](http://localhost:3000/studio)**.
4. **Expected Results:**
   - Active workspace displays `Merchant Studio Workspace` with **25 Available Credits**.
   - Presets load with preview cards.
   - Sample products appear in the brand selector.
   - Credit balance decrements upon successful photoshoot generation.

### Step 4: Test ADR-007 Email Verification Gate
1. Sign in with the unverified account:
   - **Email:** `unverified@shotistry.com`
   - **Password:** `Unverified@Shotistry2026!`
2. Try to initiate a commercial package checkout or send a workspace invitation.
3. **Expected Results:**
   - The UI displays an unverified email warning banner.
   - Commercial checkout attempts return HTTP `403 FORBIDDEN` (`EMAIL_NOT_VERIFIED`).
   - Workspace invite creation returns HTTP `403 FORBIDDEN` (`EMAIL_NOT_VERIFIED`).

---

## 3. Photoshoot Generation Test Fixtures

### Available Regional Style Presets
The prompt synthesis engine (`PromptSynthesizer`) translates presets into 10-component studio prompts preserving 100% foreground product geometry.

| Preset ID | English Name | Arabic Name | Category | Lighting & Aesthetic |
| :--- | :--- | :--- | :--- | :--- |
| `gulf_luxury_marble` | Gulf Luxury — Black Marble & Brass | الفخامة الخليجية - رخام أسود ونحاس | Fragrance / Luxury | Polished Nero Marquina black marble pedestal, brass trim, warm cove lighting |
| `desert_sunset_dunes` | Arabian Desert Dunes at Twilight | كثبان الصحراء وقت الغروب | Fragrance / Heritage | Natural sandstone block, undulating golden sand dunes, amber golden hour light |
| `botanical_spa_splash` | Pure Botanical & Dewy Water Splash | الطبيعة النقية ورذاذ الماء | Cosmetics / Skincare | Crystal water ripples, micro water droplets, morning daylight, eucalyptus leaves |
| `minimalist_concrete_studio` | Contemporary Minimalist Studio | استوديو معماري معاصر | Apparel / Accessories | Matte grey concrete plinth, ivory architectural wall, geometric window shadows |
| `ramadan_eid_heritage` | Ramadan & Eid Heritage Glow | أجواء رمضان والعيد التراثية | Seasonal / Gifting | Dark walnut carved wood, ornate brass lantern, circular bokeh, warm candlelight |

### Sample Products Pre-Seeded in Database
Pre-linked to Brand **Nile Essence** (`brand-nile-essence`):
- **`Royal Oud Eau de Parfum 100ml`** (Category: Fragrance)
- **`Artisanal Tan Leather Handbag`** (Category: Leather Goods)
- **`Hydrating Vitamin C Glow Serum 50ml`** (Category: Skincare)
- **`Cold-Brew Cardamom Arabica Coffee 250ml`** (Category: Beverages)

### Supported Aspect Ratios
- `1:1` — Square (1024x1024 / 2048x2048) — Best for Amazon, Noon, Shopify product catalogs.
- `4:5` — Instagram Portrait (1024x1280) — Best for Instagram feed posts.
- `9:16` — Vertical Video / Story (1024x1820) — Best for TikTok, Reels, Snapchat.
- `16:9` — Landscape Banner (1820x1024) — Best for website hero banners.

### Supported Gemini Image Models
- `gemini-3.1-flash-image` — Standard commercial model (1 credit, balanced speed & quality).
- `gemini-3.1-flash-lite-image` — High-efficiency model (1 credit, rapid previews).
- `gemini-3-pro-image` — 4K Studio Master (2 credits, ultra-high dynamic range).

### Minimal Base64 Test Image
When testing the API directly via cURL or Postman, use this valid 1x1 transparent PNG:
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=
```

---

## 4. Paymob Subscription & Billing Test Data

### Plan Tiers
| Tier ID | Credits / Month | Price (EGP) | Price (SAR) | Included Models |
| :--- | :---: | :---: | :---: | :--- |
| `FREE` | 5 (one-time trial) | 0 EGP | 0 SAR | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` |
| `STARTER` | 30 | 600 EGP | 75 SAR | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` |
| `PRO` | 100 | 1,500 EGP | 190 SAR | All models including `gemini-3-pro-image` |
| `AGENCY` | 300 | 3,900 EGP | 490 SAR | All models including `gemini-3-pro-image` |

### Paymob Mock Test Cards
When testing Paymob checkout redirection:
- **Card Number:** `5123 4567 8901 2345` (Mastercard) or `4111 1111 1111 1111` (Visa)
- **Expiry:** `12/28`
- **CVV:** `123`
- **3D Secure OTP:** `100200` or `123456`

---

## 5. cURL API Test Snippets

### A. Authenticate and Save Session Cookies
```bash
# 1. Login as Merchant
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"user@shotistry.com","password":"User@Shotistry2026!"}' | jq .

# 2. Login as Admin
curl -s -c admin-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"admin@shotistry.com","password":"Admin@Shotistry2026!"}' | jq .
```

### B. Inspect Authenticated Session
```bash
curl -s -b cookies.txt http://localhost:3000/api/workspace/session | jq .
```

### C. Admin Metrics Inspection (Admin Only)
```bash
curl -s -b admin-cookies.txt http://localhost:3000/api/admin/metrics | jq .
```

### D. Admin Credit Adjustment
```bash
# Extract CSRF token from login response, then adjust workspace balance
curl -s -b admin-cookies.txt -X POST http://localhost:3000/api/admin/credits/adjust \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "x-csrf-token: <CSRF_TOKEN_FROM_LOGIN>" \
  -d '{
    "workspaceId": "ws-merchant-studio",
    "amount": 10,
    "reason": "Customer loyalty bonus"
  }' | jq .
```

### E. Trigger Studio Photoshoot Generation
```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/photoshoots/generate \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "x-csrf-token: <CSRF_TOKEN_FROM_LOGIN>" \
  -d '{
    "productTitle": "Royal Oud Fragrance",
    "productCategory": "Fragrance",
    "presetId": "gulf_luxury_marble",
    "aspectRatio": "1:1",
    "rawImageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  }' | jq .
```

### F. Log Out
```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auth/logout \
  -H "Origin: http://localhost:3000" | jq .
```

---

## 6. Database Schema Quick Reference

- **Users (`User`):** Stores credentials, roles (`ADMIN` \| `USER` \| `SUPPORT`), country (`EG` \| `SA`), locale (`ar` \| `en`), `emailVerifiedAt`.
- **Workspaces (`Workspace`):** Multi-tenant organization boundaries with country and default currency (`EGP` \| `SAR`).
- **Members (`WorkspaceMember`):** Scoped access roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
- **Subscriptions (`Subscription`):** Plan tiers (`FREE`, `STARTER`, `PRO`, `AGENCY`), period windows, credit allowances.
- **Credit Ledger (`CreditLedger`):** Immutable double-entry ledger tracking all adjustments, purchases, trial grants, and settlements.
- **Reservations (`CreditReservation`):** Holds credits in `PENDING` state while AI pipeline renders; releases on error or settles on completion.
- **Action Tokens (`AuthActionToken`):** Secure SHA-256 hashed one-time tokens for `EMAIL_VERIFY`, `EMAIL_CHANGE`, and `PASSWORD_RESET`.
- **Workspace Invites (`WorkspaceInvite`):** Cryptographically hashed tokens for inviting new or existing users into a team workspace.
