# Shotistry Closed Beta Operational Plan & Merchant Onboarding Strategy

**Document Version:** 1.0.0  
**Status:** APPROVED FOR STAGING VALIDATION  
**Target Execution Date:** Post-Staging Deployment  
**Lead Contacts:** Product, Engineering & Merchant Operations  

---

## 1. Executive Summary & Mission

The **Shotistry Closed Beta** is a controlled, high-touch validation phase designed to transition Shotistry from an engineering baseline into a validated, customer-ready commercial SaaS platform. 

The primary objectives are:
1. Validate real-world AI image quality, product identity preservation, and commercial acceptance across authentic smartphone photos captured by merchants.
2. Stress-test the asynchronous job queue, reaper automation, and Cloudflare R2 presigned storage pipeline under real multi-merchant usage.
3. Validate Paymob sandbox/checkout journeys, localized currency displays (EGP/SAR), and double-entry ledger invariants.
4. Establish operational support SLAs, bilingual feedback loops, and customer satisfaction metrics before public commercial launch.

---

## 2. Cohort Composition & Merchant Selection Criteria

The Closed Beta cohort consists of **15 to 20 vetted e-commerce and social-commerce brands** representing an equal split between Egypt (EGP) and Saudi Arabia (SAR).

### 2.1 Category Mix & Target Brand Profiles

| Category | Country | Preset Affinity | Primary Quality Evaluation Criteria |
|---|---|---|---|
| **Fragrances & Oud** | Saudi Arabia (SAR) | `gulf_luxury_marble`, `majlis_warm_wood` | Flawless glass transparency, metallic cap reflections, crisp label typography preservation. |
| **Leather Goods & Footwear** | Egypt (EGP) | `cairo_artisan_leather`, `minimalist_neutral` | Organic leather grain fidelity, accurate color reproduction, natural shadow casting. |
| **Jewelry & Luxury Watches** | Saudi Arabia (SAR) | `gulf_luxury_marble`, `doha_skyline_modern` | High specular highlight accuracy, zero facet blurring, reflection realism. |
| **Apparel & Fashion Accessories** | Egypt (EGP) | `cairo_artisan_leather`, `red_sea_lifestyle` | Fabric texture integrity, crisp edges without haloing, natural contextual drape. |
| **Packaged Food & Beverages** | Egypt & Saudi Arabia | `desert_dusk_gold`, `minimalist_neutral` | Label text retention (zero hallucinated Arabic/English characters), packaging proportions. |
| **Cosmetics & Skincare** | Saudi Arabia (SAR) | `minimalist_neutral`, `red_sea_lifestyle` | Clean cosmetic packaging, smooth lighting gradients, natural water droplet rendering. |

---

## 3. Merchant Onboarding & Invitation Architecture

### 3.1 Invite-Only Registration Gate
Registration during Closed Beta is restricted by the feature flag:
```env
SHOTISTRY_BETA_INVITE_REQUIRED=1
```
Any registration request submitted without a valid, unexpired, and unexhausted beta invite code is rejected with HTTP 403 `BETA_INVITE_REQUIRED`.

### 3.2 VIP Merchant Invitation Package
Each beta merchant receives a personalized onboarding pack containing:
1. **Dedicated Beta Invite Code:** Formatted as `VIP-<BRAND_SLUG>-2026` (e.g., `VIP-OUDKING-2026`), provisioned for 1 to 3 team members.
2. **Initial Credit Grant:** 5 Free Trial credits + 50 Closed Beta Testing credits (sufficient for 50 1K commercial renders or 12 4K studio renders).
3. **Smartphone Photography Best-Practices Card (Bilingual PDF):**
   - Place product on flat, neutral surface (white table or paper).
   - Ensure clean diffuse lighting (avoid direct harsh overhead glare).
   - Capture at 1x to 2x optical zoom to prevent barrel distortion.
   - Clean the smartphone camera lens before shooting.

---

## 4. Merchant Feedback Loop & Telemetry Instrumentation

### 4.1 In-App 1-Click Evaluation (ImageFeedback API)
Merchants evaluate each generated photoshoot directly from the Studio interface via the newly implemented `POST /api/images/[id]/feedback` endpoint:
- **Rating:** `THUMBS_UP` (Acceptable for commercial use) or `THUMBS_DOWN` (Rejected).
- **Categorical Reason Tags (for rejections):**
  - `POOR_LIGHTING` (Unnatural light direction or harsh reflections).
  - `BLURRY_FOREGROUND` (Loss of focus on product details).
  - `HALLUCINATED_TEXT` (Altered brand logo or illegible label text).
  - `STYLE_MISMATCH` (Background scene does not match selected preset).
  - `DISTORTED_PRODUCT` (Bottle, lid, or packaging geometry deformed).
  - `OTHER` (Detailed merchant comment).

### 4.2 Weekly Touchpoint & Qualitative Interviews
- **Cadence:** 15-minute weekly video call or WhatsApp voice check-in with the product manager.
- **Topics:** Studio usability, preset requests, generation speed perception, and willingness to pay at published pricing tiers.

### 4.3 Support Channels & Service Level Agreements (SLA)

| Channel | Availability | Primary Purpose |
|---|---|---|
| **VIP WhatsApp Support Desk** | Sun–Thu, 9:00 AM – 9:00 PM (Cairo / Riyadh) | Real-time assistance, prompt tuning advice, fast bug triage. |
| **Priority Beta Email** (`vip-beta@shotistry.com`) | 24/7 Monitoring | Bug reports, asset upload issues, invoice inquiries. |

#### Support SLAs
- **Sev-1 (System outage, stuck job, credit deduction without image):** First response < 30 minutes; resolution / credit auto-release < 2 hours.
- **Sev-2 (Quality issue on specific product category):** Response < 4 hours; prompt tuning assistance within 24 hours.
- **General Inquiry / Feature Request:** Response < 24 hours.

---

## 5. Legal, Privacy & Regulatory Compliance

### 5.1 Cloudflare R2 Storage Disclosures
- Source product photos and generated studio photography are stored encrypted at rest (AES-256) in Cloudflare R2 object storage in `eu-central-1` (Frankfurt, Germany).
- Asset access is strictly restricted by HMAC-SHA256 time-limited signed URLs expiring after 60 minutes.

### 5.2 Google Gemini AI Interactions Disclosure
- Image generation and background scene synthesis utilize official Google Gemini API image models via `@google/genai` under commercial enterprise terms.
- **Zero Training Data Retention:** Under paid enterprise API terms, customer product images and prompt directives are **never** used to train Google or third-party foundation models.

### 5.3 Intellectual Property & Commercial Rights
- Merchants retain **100% exclusive intellectual property and ownership** of all input product photography and all generated studio images.
- Shotistry claims zero licensing rights or royalties over merchant commercial assets.

---

## 6. Closed Beta Exit & Public Launch Go / No-Go Criteria

The Closed Beta will conclude, and Public General Availability (GA) will be authorized, only when all of the following empirical criteria are satisfied:

| Metric | Target Threshold | Measurement Source |
|---|---|---|
| **Customer Quality Acceptance Rate** | ≥ 85% of rated images marked `THUMBS_UP` | `ImageFeedback` table aggregates |
| **Product Logo & Text Integrity** | 100% zero altered logos or hallucinated text | Image quality benchmark & merchant reports |
| **Generation Success Rate** | ≥ 98.0% of generation jobs completed successfully | `AdminRepository.getPlatformMetrics()` |
| **Job Timeout / Reaper Rate** | < 1.0% of jobs requiring reaper intervention | Generation reaper telemetry logs |
| **Ledger ACID Invariant** | Exactly 0 double-spends or balance mismatch | Double-entry SQL ledger reconciliation audit |
| **Merchant Activation** | ≥ 70% of cohort generates at least 5 completed photoshoots | `funnelMetrics` in Admin dashboard |
| **Unit Economics Margin** | Blended gross margin ≥ 60% across completed shoots | `financial-config.ts` scenario audit |
