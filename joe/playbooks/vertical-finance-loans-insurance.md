# Vertical: Finance Lead Gen (Loans, Credit Cards, Insurance, Banking)
> Use when: someone generates leads for loans, credit products, insurance, banking or similar financial services: offer models, special ad categories and credit ad restrictions, consent, funnels and lead quality metrics.

This vertical is about lead generation for regulated financial products. Payouts can be strong, but quality and compliance decide whether you get paid and whether your ad account survives. Rules vary by country and change often: always check the current platform policy and local regulations.

---

## 1. Products and offer models

| Product | Conversion event | Model |
|---|---|---|
| Personal loans / digital lending apps | Application, approved loan, disbursed loan | CPL, CPA on approval or disbursement |
| Credit cards | Application, approval, activation | CPA |
| Insurance (health, life, auto, travel, device) | Quote request, qualified lead, policy sold | CPL, CPA, sometimes per call |
| Banking / neobanks | Account opened, KYC passed, first funding | CPA |
| Mortgages / refinancing | Qualified lead | CPL |
| Debt solutions | Qualified lead | CPL (heavily regulated; avoid misleading claims) |

### Lead quality is everything
Programs pay for leads that meet criteria: valid contact details, real intent, within eligibility (age, income, location, credit profile where relevant), consent captured correctly, not duplicated. Low-quality leads are returned or not paid, and repeated bad traffic ends the partnership.

Joinvoo statuses: `lead` (submitted), `qualified` (accepted / approved), `sale` (policy sold, loan disbursed, card activated), `rejected` (returned lead).

---

## 2. Platform policy (check the current policy)

### Special ad categories (Meta)
- Ads about credit and other financial products and services must be declared under the relevant special ad category in the countries where it applies. Meta has expanded this category's name and scope over time (it began as "Credit"); check the current category list and which countries it covers.
- Effects: restricted targeting. Typically you cannot target by age, gender or narrow location (like postcodes or small radius), detailed targeting is limited, and some lookalike-style audiences are not available. Plan for broad targeting and let creative and the conversion event do the work.
- Other special ad categories: employment, housing, social issues/elections/politics.

### Credit and lending ads
- Meta prohibits ads for some products, such as payday loans, paycheck advances and bail bonds (check current wording).
- Lending ads must not be misleading about rates, fees, approval chances or terms. "Guaranteed approval", "no credit check" style claims are commonly prohibited or restricted.
- Many countries require lenders to be licensed or registered, and platforms may require proof (financial services advertiser verification).
- TikTok and Snapchat restrict financial services by country and often require licensing; some loan types are prohibited. Check current policies.

### Insurance
- Must be from licensed insurers or brokers; claims about coverage and prices must be accurate.
- Some countries require specific disclosures.

---

## 3. Consent and data

- **Consent**: if leads will be called, texted or emailed, consent must be captured clearly and in a way that meets local law (for example, telemarketing consent rules in some countries are strict). Name who will contact the person and how.
- **Data minimisation**: ask only for what is needed at each step.
- **Privacy notice**: link to a privacy policy on any form, landing page or bot that collects personal data.
- **Sensitive data**: income, credit history and health information (insurance) are sensitive. Do not send them to ad platforms. Only send hashed identifiers and event names via CAPI; Joinvoo sends hashed IDs and event data, not form contents.
- **No lead reselling** without consent.

---

## 4. Funnels

### Telegram-assisted lead gen
1. Ad → Telegram channel or bot about personal finance (budgeting tips, how loans work, how to compare insurance).
2. Bot pre-qualifies with a few questions (country, purpose, approximate amount needed, employment status) and explains eligibility honestly.
3. Bot sends the eligible user to the partner application with sub1 = Telegram ID, or collects the lead with clear consent and passes it to the partner.
4. Postbacks: `lead`, `qualified`, `sale` / `rejected`.
5. Follow-up: application reminders, document checklists, financial education.

### Why pre-qualification helps
- It lowers lead volume but raises the share that qualify, so cost per qualified lead often improves.
- It reduces returned leads and protects the partnership.

### Content that works (and is compliant)
- Explainers: interest rates, fees, APR or total cost (in plain terms), how credit scores work, what insurance covers.
- Comparison guides with real, current terms.
- Budgeting and debt management tips.
- Warnings about loan scams and illegal lenders.

---

## 5. Angles

### Compliant
- "Compare loan offers from licensed lenders in minutes."
- "Check what you could be eligible for" (if that is what the product does).
- "Understand the total cost before you borrow."
- Insurance: "Protect your phone/car/trip, cover explained in 60 seconds".

### Avoid
- "Guaranteed approval", "no credit check" (unless true and allowed), "instant cash with no questions".
- Targeting financial hardship or personal attributes ("In debt?", "Bad credit?").
- Hiding fees or real interest costs.
- Impersonating banks, government schemes or officials.
- Fake urgency about limited-time government grants.

---

## 6. Quality metrics

| Metric | Formula | Meaning |
|---|---|---|
| CPL | spend ÷ leads | Raw efficiency |
| Contact rate | leads reached ÷ leads | Valid phone/email, timing |
| Qualification rate | qualified ÷ leads | Audience and pre-qualification quality |
| Return rate | returned ÷ leads | Fraud, duplicates, ineligibility |
| Approval/sale rate | sales ÷ qualified | Product fit, credit profile, partner process |
| Cost per qualified lead | spend ÷ qualified | What you compare with payout |
| Cost per sale | spend ÷ sales | For CPA-on-sale deals |

Targets:
- Break-even CPL = payout per qualified lead × qualification rate (minus expected returns).
- Target CPL = break-even × (1 − margin).
- For sale-based payouts: break-even cost per lead = payout × lead→sale rate.

Diagnosis:
- **Cheap leads, many returns**: bait angle, incentivised traffic, bots. Add pre-qualification, check Joinvoo suspect clicks and filtered joins.
- **Good qualification, low sales**: partner eligibility rules stricter than your pre-qualification; align the questions with the partner's criteria.
- **CPL rising after switching to the special ad category**: expected (narrower targeting options). Invest in creative and broad, event-optimised campaigns.

---

## 7. Common mistakes
1. Not declaring the special ad category where required, leading to rejections and restrictions.
2. Misleading rate, fee or approval claims.
3. Collecting leads without proper consent.
4. Sending sensitive form data to ad platforms.
5. Judging on CPL instead of cost per qualified lead or sale.
6. Promoting unlicensed lenders.

---

## 8. Launch plan

1. **Eligibility**: confirm the partner is licensed in the target country; confirm whether the special ad category applies; complete any financial services advertiser verification.
2. **Bot pre-qualification**: 3–6 questions aligned with the partner's criteria; honest eligibility messages ("You may not qualify if…"); privacy notice and consent text before collecting contact details.
3. **Postbacks**: `lead`, `qualified`, `sale`, `rejected` with sub1 = Telegram ID.
4. **Creative**: 3 educational or comparison angles with clear, accurate terms. Broad targeting (often required anyway in special categories).
5. **Days 4–7**: rank ads by cost per qualified lead, not CPL. Kill at about 2–3× target cost per qualified lead with no qualified leads.
6. **Week 2+**: feed back return reasons from the partner into the bot questions; iterate winners.

## 9. Joe's quick answers
- "Why can't I target by age for my loan ads?" → If the campaign is in a special ad category (credit/financial products in applicable countries), age, gender and narrow location targeting are restricted by policy. Use broad targeting with a strong conversion event and age-appropriate creative; the partner's eligibility checks handle the rest.
- "My CPL doubled after I switched to the special category." → Expected at first. Judge on cost per qualified lead; improve creative and pre-qualification; let the campaign optimise on qualified events once volume allows.
- "Can I say 'instant approval'?" → Only if it is true for all applicants and permitted by local law and the platform; usually it is not. Use "Check your eligibility in minutes" instead.
- "Partner returns many leads." → Ask for return reasons, adjust bot questions, remove incentive or urgency angles, check suspect clicks and duplicates.

## 10. Insurance specifics
- Quote-based funnels convert better when the bot collects only what is needed for a quote and explains next steps clearly.
- Seasonality: travel insurance around holiday periods, auto insurance around renewal cycles, device insurance around phone launches.
- Never imply a government requirement that does not exist, or a price you cannot show.
