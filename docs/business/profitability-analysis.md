# Profitability Analysis & Financial Scenarios (Recalculated November 2026)

## 1. Breakeven Analysis & Sensitivity Modeling

All models below use verified **`gemini-3.1-flash-image` (`1K` Standard)** direct unit economics (**`$0.071050` USD / image** = `3.5525 EGP` at `50.00 EGP/USD` and `0.266438 SAR` at `3.75 SAR/USD`), computed programmatically by [`src/lib/pricing/model-costs.ts`](../../src/lib/pricing/model-costs.ts).

### Scenario Modeling Across 1,000 Active Paying Subscribers
Assumed blend: **40% Starter** (`80 cr`), **45% Pro** (`200 cr`), **15% Agency** (`500 cr`).
- **Egyptian cohort (500 users):** 200 Starter (`349 EGP`), 225 Pro (`899 EGP`), 75 Agency (`1,899 EGP`) — Max Monthly Credits: `98,500`.
- **Saudi cohort (500 users):** 200 Starter (`79 SAR`), 225 Pro (`189 SAR`), 75 Agency (`399 SAR`) — Max Monthly Credits: `98,500`.

```text
Monthly Egyptian Revenue:
= (200 * 349) + (225 * 899) + (75 * 1,899)
= 69,800 + 202,275 + 142,425 = 414,500 EGP ($8,290.00 USD @ 50.0 EGP/USD)

Monthly Saudi Revenue:
= (200 * 79) + (225 * 189) + (75 * 399)
= 15,800 + 42,525 + 29,925 = 88,250 SAR ($23,533.33 USD @ 3.75 SAR/USD)

Total Combined Monthly Recurring Revenue (MRR):
= $8,290.00 + $23,533.33 = $31,823.33 USD / month ($381,880 ARR)

Combined Payment Gateway Fees (Paymob):
- Egypt: 12,898.75 EGP ($257.98 USD)
- Saudi: 2,706.25 SAR ($721.67 USD)
= $979.64 USD / month
```

---

## 2. Direct Costs & Gross Profit Under Utilization Scenarios (`gemini-3.1-flash-image` 1K Standard)

| Financial Dimension | Worst-Case (100% Consumption / 197,000 imgs) | Conservative (85% Consumption / 167,450 imgs) | Expected (65% Consumption / 128,050 imgs) | High Efficiency (50% Consumption / 98,500 imgs) |
|---|---|---|---|---|
| **Total MRR** | `$31,823.33 USD` | `$31,823.33 USD` | `$31,823.33 USD` | `$31,823.33 USD` |
| **Combined Direct AI & Storage COGS (`$0.071050`/img)** | `$13,996.85 USD` | `$11,897.32 USD` | `$9,097.95 USD` | `$6,998.43 USD` |
| **Payment Gateway Fees (Paymob)** | `$979.64 USD` | `$979.64 USD` | `$979.64 USD` | `$979.64 USD` |
| **Net Gross Profit** | **`$16,846.84 USD`** | **`$18,946.37 USD`** | **`$21,745.74 USD`** | **`$23,845.27 USD`** |
| **Gross Margin Percentage** | **`52.9%`** | **`59.5%`** | **`68.3%`** | **`74.9%`** |

*Batch Upside:* Routing the `15%` Agency cohort's asynchronous catalog jobs (`37,500` max monthly credits / `24,375` expected credits) through the **Gemini Batch API (`$0.035775`/img)** reduces Expected AI COGS by `$860/mo` and raises Expected Portfolio Gross Margin from `68.3%` to **`71.0%`**.

---

## 3. Fixed Operating Expenses & Net Margin (1,000 Subscribers, Expected 65% Case)
- **Vercel Pro / Hosting Infrastructure:** `~$100 / mo`
- **Database (Managed PostgreSQL):** `~$150 / mo`
- **Redis / Background Queue:** `~$60 / mo`
- **Customer Support & Local Admin Operations:** `~$1,200 / mo`
- **Total Fixed OpEx:** **`~$1,510 / mo`**
- **Net Operating Income (EBITDA):** `$21,745.74 - $1,510.00` = **`$20,235.74 USD / month`**
- **Net Operating Margin:** **`63.6%`**

---

## 4. Currency Devaluation Stress Test (Egyptian Pound -25%)
- If `USD/EGP` depreciates `+25%` from `50.00` to `62.50`:
  - `gemini-3.1-flash-image` (`1K` Standard @ `$0.071050`) cost in EGP rises from **`3.5525 EGP`** to **`4.4406 EGP`** per image.
  - On the **Egyptian Pro Plan** (`899 EGP`, 130 expected images, `27.72 EGP` Paymob fee): COGS rises from `461.83 EGP` to `577.28 EGP` (`Total Cost = 605.00 EGP`, `Gross Profit = 294.00 EGP`).
  - Egyptian Pro Plan Expected Gross Margin shifts from **`45.5%`** to **`32.7%`** *(still comfortably profitable, whereas Worst-Case 200-image Pro usage compresses near breakeven without Batch routing or price indexing)*.
  - Egyptian Agency Plan (`1,899 EGP`, 500 credits) would go negative (`-20.1%`) at `100%` Standard consumption under `62.50 EGP/USD`, reinforcing the operational rule to route Agency bulk catalogs to Batch API (`$0.035775`) and adjust EGP pricing quarterly.
  - Across the 50/50 subscriber cohort, Saudi revenue (`$23,533.33 USD`, ~`78%` of devalued USD MRR) anchors blended Expected Portfolio Gross Margin at **`66.8%`** (down only `1.5` percentage points from `68.3%`).
