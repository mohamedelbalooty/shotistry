# Pre-Production Release & Launch Checklist

## Phase Sign-Off Gate
Before deploying to production and declaring completion:

### 1. Business & Monetization
- [x] Dual-currency pricing validated (EGP & SAR) with 70%+ gross margin target.
- [x] Paymob integration plan verified for Egypt and Saudi Arabia.
- [x] Double-entry credit ledger prevents race conditions and overspending.

### 2. AI & Product Quality
- [x] Official `@google/genai` SDK configured with Imagen 3 / Gemini 2.5 Flash routing.
- [x] Curated regional photoshoot prompt library implemented.
- [x] Dual-stage mask-guided inpainting architecture designed for 100% product fidelity.

### 3. Engineering & Security
- [x] Strict TypeScript build checks with zero errors.
- [x] All database mutations run inside ACID transactions.
- [x] Paymob HMAC-SHA512 verification active on webhook receiver.
- [x] Environment variable schema validated with zero hardcoded credentials.

### 4. User Experience & Localization
- [x] Bilingual English & Arabic layout with native RTL typography.
- [x] Responsive layout tested for mobile, tablet, and desktop viewports.
- [x] Clear loading and error states with user-friendly Arabic copy.
