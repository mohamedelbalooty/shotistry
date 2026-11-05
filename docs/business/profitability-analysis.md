# Profitability Analysis & Financial Scenarios

## 1. Breakeven Analysis & Sensitivity Modeling

To evaluate business resilience under different macroeconomic conditions (currency fluctuations, API price changes, user behavior), we modeled three scenarios: Conservative, Expected, and Aggressive.

### Scenario Modeling Across 1,000 Active Paying Subscribers
Assumed blend: 40% Starter, 45% Pro, 15% Agency.
- Egyptian cohort (500 users): 200 Starter, 225 Pro, 75 Agency.
- Saudi cohort (500 users): 200 Starter, 225 Pro, 75 Agency.

```
Monthly Egyptian Revenue:
= (200 * 349) + (225 * 899) + (75 * 1,899)
= 69,800 + 202,275 + 142,425 = 414,500 EGP (~$8,459 USD)

Monthly Saudi Revenue:
= (200 * 79) + (225 * 189) + (75 * 399)
= 15,800 + 42,525 + 29,925 = 88,250 SAR (~$23,533 USD)

Total Combined Monthly Recurring Revenue (MRR):
= $8,459 + $23,533 = $31,992 USD / month ($383,904 ARR)
```

---

## 2. Direct Costs & Gross Profit Under Scenarios

| Financial Dimension | Conservative (85% Credit Utilization) | Expected (65% Credit Utilization) | Aggressive / High Efficiency (50% Utilization) |
|---|---|---|---|
| **Total MRR** | $31,992 USD | $31,992 USD | $31,992 USD |
| **Combined Direct AI & Storage COGS** | $8,520 USD | $6,515 USD | $5,010 USD |
| **Payment Gateway Fees (Paymob)** | $985 USD | $985 USD | $985 USD |
| **Net Gross Profit** | **$22,487 USD** | **$24,492 USD** | **$25,997 USD** |
| **Gross Margin Percentage** | **70.3%** | **76.6%** | **81.3%** |

---

## 3. Fixed Operating Expenses & Net Margin (1,000 Subscribers)
- **Vercel Pro / Hosting Infrastructure:** ~$100 / mo
- **Database (Neon / Supabase PostgreSQL Managed):** ~$150 / mo
- **Redis / Background Queue (Upstash):** ~$60 / mo
- **Customer Support & Local Admin Operations:** ~$1,200 / mo
- **Total Fixed OpEx:** ~$1,510 / mo
- **Net Operating Income (EBITDA):** **$22,982 USD / month**
- **Net Operating Margin:** **71.8%**

---

## 4. Currency Devaluation Stress Test (Egyptian Pound -25%)
- If USD/EGP shifts from 49.00 to 61.25 (+25% depreciation):
  - API costs in EGP increase from 1.60 EGP to 2.00 EGP per image.
  - On the Egyptian Pro Plan (899 EGP, 130 expected images): COGS becomes $(130 \times 2.00) + 27.72 = 287.72\text{ EGP}$.
  - Egyptian Pro Plan Gross Margin shifts from 73.9% to **68.0%**.
  - Because Saudi Arabia represents ~73% of overall USD revenue, the blended portfolio gross margin drops by only 1.9% (from 76.6% to 74.7%), proving extraordinary portfolio resilience.
