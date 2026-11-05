# Paymob API Integration Research: Egypt & Saudi Arabia

## 1. Paymob Architectural Overview

Paymob (`paymob.com`) is the leading payment infrastructure provider across Egypt and Saudi Arabia. It offers two core API paradigms:
1. **Paymob Intention API:** Modern Unified Checkout for initializing one-time and first-time recurring payments.
2. **Paymob Subscription / Recurring API:** Manages scheduled recurring card debits (e.g. 30-day cycles) using tokenized cards.

---

## 2. Regional Specifics: Egypt vs. Saudi Arabia

| Specification | Egypt (EG) Configuration | Saudi Arabia (KSA) Configuration |
|---|---|---|
| **Currency Code** | `EGP` | `SAR` |
| **Smallest Currency Subunit** | Piastres (1 EGP = 100 Piastres) | Halalas (1 SAR = 100 Halalas) |
| **Primary Payment Channels** | • Visa & Mastercard<br>• Meeza (ميزة)<br>• Mobile Wallets (Vodafone Cash, Orange, Etisalat, WE)<br>• InstaPay & valU installments | • Mada (مدى)<br>• Apple Pay<br>• Visa & Mastercard<br>• Tabby / Tamara (installments) |
| **Recurring / Tokenization** | Card Tokenization via Accept MOTO/Recurring integration ID | Mada & Credit Card Tokenization with regional acquirer compliance |
| **Settlement Frequency** | T+1 to T+2 Business Days | T+1 to T+2 Business Days |

---

## 3. Subscription Billing Interval & Frequency
- Paymob Subscriptions accept a numeric `frequency` parameter in days: `[7, 15, 30, 60, 90, 180, 360]`.
- For monthly SaaS billing, **`frequency: 30`** is the standard, officially supported interval.
- Each subscription plan is registered with:
  - `name`: e.g., "Shotistry Pro - Monthly (EGP)"
  - `amount_cents`: e.g., `89900` (899.00 EGP)
  - `frequency`: `30`
  - `webhook_url`: Dedicated server-side HTTPS callback endpoint.
