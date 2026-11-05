# Product Requirements Document (PRD): Shotistry

## 1. Product Vision & Positioning
**Shotistry** is the AI commercial product photography studio for e-commerce brands in Egypt and Saudi Arabia. It turns ordinary smartphone photos into commercial, studio-grade advertising assets in under 30 seconds, eliminating the time, friction, and expense of traditional photo studios.

---

## 2. Core Functional Requirements (MVP Release)

### A. Authentication & Onboarding
- **FR-01:** Email/Password registration and login with country selection (`Egypt` or `Saudi Arabia`) and preferred language (`Arabic` or `English`).
- **FR-02:** Instant provisioning of a default workspace with 5 free starter credits.
- **FR-03:** Guided 3-step onboarding tour introducing product upload, preset selection, and high-res export.

### B. Brand & Product Management
- **FR-04:** Brand Profile creation (Brand Name, Industry Category, Primary Brand Colors, Aesthetic preference).
- **FR-05:** Product Catalog storage (Title, Description, Dimensions, multiple raw image assets).
- **FR-06:** Automatic foreground segmentation extracting sharp transparent PNGs and binary alpha masks.

### C. Creative Photoshoot Studio
- **FR-07:** Intuitive photoshoot creation wizard:
  - Step 1: Select Product.
  - Step 2: Choose Photoshoot Style Preset (Gulf Luxury, Desert Sunset, Minimalist Studio, Botanical Splash, Ramadan Glow, etc.).
  - Step 3: Choose Aspect Ratio (1:1 Square, 4:5 Portrait, 9:16 Story/Reel, 16:9 Landscape).
  - Step 4: Optional creative prompt customizer (lighting warmth, props, camera angle).
- **FR-08:** Live Credit Cost indicator displayed prior to generation.
- **FR-09:** Real-time generation progress feedback (Queueing $\to$ Segmenting $\to$ Synthesizing $\to$ Rendering $\to$ Complete).

### D. Results Canvas & Asset Export
- **FR-10:** Side-by-side comparison between original uploaded photo and generated commercial shoot.
- **FR-11:** 1-Click Variations & Regenerations.
- **FR-12:** High-resolution asset download (PNG / JPG) with aspect ratio tags for Salla, Zid, Instagram, and TikTok.

### E. Billing, Paymob & Credit Management
- **FR-13:** Localized pricing view (EGP for Egypt, SAR for Saudi Arabia).
- **FR-14:** Paymob Unified Checkout integration supporting Cards, Mada, Meeza, and Apple Pay.
- **FR-15:** Automated 30-day recurring subscription lifecycle.
- **FR-16:** Double-entry credit ledger with full transaction audit history.
- **FR-17:** On-demand non-expiring credit top-up packages.

### F. Internal Administration Portal
- **FR-18:** Executive KPI Dashboard: Total Users, Paying Subscribers, MRR in EGP/SAR/USD, AI API costs, and Gross Margin.
- **FR-19:** Generation job inspector (investigating failed jobs, viewing prompts, tracking latency).
- **FR-20:** Manual credit adjustment tool with mandatory audit reason logging.
