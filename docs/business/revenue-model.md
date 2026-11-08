# Revenue Model & 18-Month Financial Projection (Recalculated November 2026)

## 1. Growth Trajectory & Customer Milestones

```text
M1-M3: MVP Launch & Regional Merchant Acquisition (Target: 150 Paid Users)
M4-M6: Salla/Zid App Store Integrations (Target: 500 Paid Users)
M7-M12: Agency Expansion & Batch Catalog API (Target: 1,500-1,800 Paid Users)
M13-M18: Market Leadership in EG/KSA (Target: 4,000 Paid Users)
```

---

## 2. 18-Month Financial Forecast (Quarterly Snapshots)

Assumptions aligned with [`profitability-analysis.md`](./profitability-analysis.md) and [`src/lib/pricing/model-costs.ts`](../../src/lib/pricing/model-costs.ts):
- **Paid Cohort Blend:** 50% Egypt (`EGP` @ `50.00/USD`) / 50% Saudi Arabia (`SAR` @ `3.75/USD`), 40% Starter / 45% Pro / 15% Agency (`$31.82` blended MRR ARPU).
- **Direct COGS Basis:** `65%` expected credit consumption on **`gemini-3.1-flash-image` (`1K` Standard @ `$0.071050`/img)** + Paymob gateway fees (`$0.98/paid sub`), yielding **`68.3%`** expected blended gross margin (`71.0%` once Agency Batch API routing matures in Y2).

| Metric | Q1 (Month 3) | Q2 (Month 6) | Q3 (Month 9) | Q4 (Month 12) | Q6 (Month 18) |
|---|---|---|---|---|---|
| **Free Active Users** | 1,200 | 4,500 | 12,000 | 25,000 | 60,000 |
| **Paid Subscribers** | 150 | 500 | 1,000 | 1,800 | 4,000 |
| **Paid Conversion Rate** | 12.5% | 11.1% | 8.3% | 7.2% | 6.7% |
| **Monthly MRR (USD)** | `$4,774` | `$15,912` | `$31,823` | `$57,282` | `$127,293` |
| **Top-Up Pack Revenue (~15% MRR)** | `$716` | `$2,387` | `$4,774` | `$8,592` | `$19,094` |
| **Total Monthly Revenue** | **`$5,490`** | **`$18,299`** | **`$36,597`** | **`$65,874`** | **`$146,387`** |
| **Direct AI, Storage & Gateway COGS (~31.7%)** | `$1,740` | `$5,801` | `$11,601` | `$20,882` | `$46,405` |
| **Gross Margin (%)** | **`68.3%`** | **`68.3%`** | **`68.3%`** | **`68.3%`** | **`68.3%`** |
| **Operating Expenses (OpEx)** | `$1,800` | `$3,500` | `$6,200` | `$10,500` | `$22,000` |
| **Net Operating Income (EBITDA)** | **`$1,950`** | **`$8,998`** | **`$18,796`** | **`$34,492`** | **`$77,982`** |

---

## 3. Key Revenue Drivers & Margin Expansion Vectors
1. **Recurring MRR (Primary Engine):** ~87% of total revenue derived from automated Paymob 30-day card debits, anchored in SAR (~`74%` of combined MRR in USD).
2. **Usage Top-Ups & Weighted Pro Tiers:** Model- and resolution-weighted credits (`2` credits for `2K`/`Pro`, `3` for `Flash 4K`, `4` for `Pro 4K`) monetize seasonal bursts (Ramadan & White Friday catalogs) while protecting unit margins.
3. **Batch API COGS Optimization:** Transitioning Agency bulk catalog workflows onto Gemini Batch API (`$0.035775`/1K img vs `$0.071050` Standard) expands blended gross margin by ~`2.7–4.0` percentage points at scale.
4. **Low Churn Vectors:** Saved Brand Profiles (logos, palettes, custom directives) and stored commercial catalog workspaces create sticky retention.
