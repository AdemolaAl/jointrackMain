# Affiliate Programs, Payout Models and RevShare
> Use when: someone asks how affiliate programs work, which payout model to choose (CPA, RevShare, Hybrid, CPL), how to compare deals, negotiate a raise, detect shaving, understand payment terms, pick a program, or set up postbacks in Joinvoo.

This is the affiliate side of the business: the deal you sign decides what each FTD is worth, and that decides how much you can pay for traffic. All numbers in examples are example arithmetic to show the method, not market rates. Every program's terms differ; read the actual deal.

---

## 1. How affiliate programs work

### Networks vs direct programs
| | Affiliate network | Direct (in-house) program |
|---|---|---|
| What it is | A middleman with many advertisers' offers in one panel | The brand's own affiliate program |
| Pros | Many offers, one payment, quick switching, sometimes faster payouts | Often higher payouts at volume, direct data, direct relationship, custom deals |
| Cons | Network takes a margin; one more party between you and the data | One brand only; you depend on their reporting and payments |

Many buyers use both: networks to test offers and geos quickly, direct programs to scale proven offers.

### Affiliate managers
- Your manager is your contact for deals, raises, caps, approvals, payment questions and problems with tracking.
- A good manager answers quickly, explains rejections with data, warns you about offer changes and proposes tests.
- Keep communication in writing (chat or email) so deal terms are documented.

### Click IDs and sub IDs
- When someone clicks your affiliate link, the program creates its own **click ID** and stores any **sub IDs** you put in the link.
- Sub IDs (often `sub1` to `sub5`, sometimes called `subid`, `aff_sub`, `s1`, `click_id`, `tid`) are free fields you fill. Common use:
  - `sub1` = the person's Telegram ID (needed by Joinvoo to match conversions).
  - `sub2` = campaign, `sub3` = ad set, `sub4` = ad, `sub5` = channel or language (optional, for the program's own reports).
- When a conversion happens, the program sends those sub IDs back to you in the postback.

### Postbacks (server-to-server) vs pixels
| | Postback (S2S) | Pixel (browser) |
|---|---|---|
| How | The program's server calls your URL with the conversion data | A script or image loads in the user's browser on the program's page |
| Reliability | High; not affected by ad blockers or browsers | Lower; blocked by browsers, iOS limits, ad blockers |
| Needs | A sub ID that identifies the person (sub1 = Telegram ID) | Access to place code on the advertiser's page (rarely given) |
| Use with Joinvoo | Yes, this is how Joinvoo receives reg/FTD/deposits | Not used |

---

## 2. Payout models in depth

### CPA (cost per acquisition)
- A fixed amount per qualified conversion (usually a qualified FTD).
- **Pros**: predictable, fast feedback, simple break-even (CPA × qualification rate).
- **Cons**: baselines; the program carries the long-term risk and upside, so CPA is usually lower than the true lifetime value of good players/traders.

### RevShare (revenue share)
- A percentage of the revenue the brand earns from your referred users.
- **Lifetime vs time-limited**: lifetime RevShare pays as long as the user is active; time-limited pays for a set period (for example the first months). Lifetime is worth more on long-lived users, but check the conditions (some programs end lifetime payments if your account is inactive).
- **GGR vs NGR (gambling terms; trading programs use similar ideas)**:
  - GGR (gross gaming revenue) = bets − wins (what players lost).
  - NGR (net gaming revenue) = GGR minus deductions such as bonuses, taxes/levies, payment fees, platform or game provider fees, chargebacks. Most programs pay RevShare on NGR. Ask exactly which deductions apply.
- **Admin fee**: some programs deduct a flat percentage from NGR before your share. This can reduce your income a lot; compare deals after the admin fee.
- **Negative carryover**: if your users win more than they lose in a month, your NGR is negative. With carryover, the negative balance is subtracted from next month's earnings. Without carryover ("no negative carryover", often reset monthly), each month starts at zero. No negative carryover is much better for affiliates.
- **Chargebacks**: deposits reversed by the bank are removed from revenue and from your earnings, sometimes after payout (deducted later).
- **Trading programs**: RevShare is usually a share of the broker's revenue from your clients (spreads, commissions, client losses on some models). Ask how revenue is defined.

### Hybrid
- A smaller CPA plus a RevShare percentage.
- Balances cash flow now with value later. Compare the total against pure CPA and pure RevShare for your traffic.

### CPL / SOI / DOI
- **CPL**: paid per lead (form or registration).
- **SOI** (single opt-in): one-step registration.
- **DOI** (double opt-in): registration confirmed (email click, phone code).
- Lower payouts, strict quality checks, high rejection risk for bad traffic.

### Baselines and qualification
Common rules that turn an FTD into a paid CPA (QFTD):
- Minimum first deposit amount.
- Minimum wagering/turnover (betting/casino) or trading activity (trading).
- Number of bets/trades or active days.
- KYC passed (identity verified).
- Deposit within a time window after registration.
- Allowed geo, one account per person, no bonus abuse, no fraud.

### Holds and hold periods
- Conversions are often "pending" for a hold period before they are confirmed and paid. This allows quality checks and chargeback detection.
- Plan cash flow: you pay for traffic today and get paid after the hold plus the payment cycle.

### Caps
- A **cap** is the maximum number of conversions the program will pay (per day, week or month, per geo). Conversions above the cap may be paid at a lower rate, moved to RevShare, or not paid. Always ask about caps before scaling and agree in writing when a cap is raised.

### Geo-specific payouts
- Payouts differ per country (and sometimes per traffic source). FTDs from countries outside the deal may be unpaid or paid at a lower rate. Check the geo list and target accordingly.

---

## 3. Comparing a CPA deal with a RevShare deal

### The idea
CPA pays you now for a fixed value. RevShare pays you over time for the real value of your users. To compare, you need an estimate of **revenue per FTD over time** (LTV to you) for your own traffic.

### Cohort thinking
1. Take FTDs from one period (for example one month) as a cohort.
2. Track your RevShare earnings from that cohort month by month.
3. Revenue per FTD after N months = cumulative cohort earnings ÷ cohort FTDs.
4. Compare with the CPA × qualification rate.

If you have no RevShare history, test it on a small slice of traffic (some programs allow two links/deals at once) or ask the manager for anonymised cohort data for similar traffic (treat it with caution).

### Example arithmetic (method only, not real rates)
- CPA deal: 50 per QFTD, 80% of FTDs qualify → 40 per FTD, paid after the hold.
- RevShare deal: your cohort data shows 15 per FTD in month 1, 30 cumulative by month 3, 45 by month 6, 55 by month 12.
- Comparison: RevShare passes the CPA value (40) somewhere between month 3 and month 6. If you need your money back within 2 months, CPA is better for you. If you can wait 6+ months and the program is reliable, RevShare earns more on this traffic.
- Risks to include: negative carryover months, admin fees, the program changing terms, the program closing, and your own cost of capital.

### Cash flow rules of thumb
- Scaling on RevShare needs money in the bank to fund traffic while revenue arrives slowly.
- A common approach: CPA or Hybrid for most traffic while scaling, RevShare on a portion to build long-term income.
- Never treat projected RevShare as cash until it is paid.

---

## 4. Negotiating raises

### What to show
- **Volume**: QFTDs per week/month and the trend.
- **Quality**: qualification rate, repeat deposit rate, average deposit, retention of your players/clients over time (the program can see their side; ask them to confirm).
- **Consistency**: stable traffic over weeks, not one spike.
- **Compliance**: clean traffic, no complaints, compliant creatives.
- **Plan**: how much more volume you can send with a better payout ("with X, I can move budget from another program and scale this geo").

### When to ask
- After several weeks of stable, good-quality volume.
- When your data shows your users are worth more than the deal (e.g. strong repeat deposits).
- When you have a competing offer (be honest; do not invent offers).
- Before scaling into a big season (tournaments, market events), when the program wants volume.

### How to ask
- Be specific: the payout, cap or baseline change you want, and the volume you will commit to.
- Offer a test: "Raise for 30 days; if quality stays at this level, we keep it."
- Get the new terms in writing, with the start date and geo.

---

## 5. Shaving: detecting it with your own tracking

**Shaving** = a program under-reports or does not pay conversions that actually happened.

### Signs
- Your Joinvoo FTD count (from postbacks) and the program's report drift apart for no clear reason.
- Qualification rate drops sharply while traffic, creatives and geos stay the same.
- Postbacks stop arriving for some events while the panel still shows them, or the other way round.
- Users in your channel say they deposited, but no FTD appears.
- Revenue per FTD on RevShare falls suddenly without market reasons.

### How to check with Joinvoo
1. **Compare counts**: for the same dates and time zone, compare Joinvoo FTDs (Conversions) with the program panel. Small gaps can come from time zones, holds and pending statuses; big or growing gaps need explanation.
2. **Check postbacks**: Conversions shows every postback received, including unmatched ones. Missing postbacks may be a setup problem (wrong macro, status mapping), not shaving. Fix setup issues first.
3. **Check matching**: unmatched postbacks usually mean sub1 was empty or wrong. Make sure every offer link carries the Telegram ID.
4. **Track cohorts**: qualification rate per week of FTDs. A sudden drop with no traffic change is a question for the manager.
5. **Test**: register and deposit through your own link (where allowed) and confirm the events arrive.

### What to do
- Ask the manager for a conversion-level report (sub IDs, dates, statuses, rejection reasons).
- Keep records and screenshots of your data.
- Do not accuse without data; often it is a setup or definition problem.
- If problems repeat with no clear answers, move volume to programs with transparent reporting. Diversifying across programs is also how you detect issues (similar traffic, very different results).

---

## 6. Payment terms

| Term | Meaning |
|---|---|
| NET terms (e.g. NET 7, NET 15, NET 30) | You are paid that many days after the end of the billing period |
| Weekly / bi-weekly / monthly payouts | How often payouts happen |
| Hold period | Time conversions stay pending before being approved |
| Minimum payout | The balance you must reach before a payout is sent |
| Payment methods | Bank transfer, e-wallets, crypto (e.g. USDT), others; fees and speed differ |
| Currency | Payout currency and any conversion fees |
| Prepay | Some programs pay faster for trusted partners; usually earned with history |

Practical tips:
- Calculate your cash cycle: days from ad spend to cash received = traffic day → FTD → hold → billing period end → NET days → transfer time.
- Ask for faster terms after a good track record.
- Check fees for each payment method; a cheap payout method can raise your margin.

---

## 7. Choosing programs

Checklist:
- **Reputation**: how long the program has operated, what other affiliates say in professional communities, history of on-time payments, transparency about terms changes.
- **Licensing and legality**: is the brand licensed for the geos you target? Is the product advertisable on your traffic source?
- **Support quality**: fast, knowledgeable manager; clear answers on rejections.
- **Postback reliability**: supports S2S postbacks with sub IDs, for reg, FTD, repeat deposits and qualification/rejection; sends them in real time.
- **Reporting**: conversion-level reports with sub IDs; clear statuses.
- **Terms**: payout model, baselines, caps, hold, NET terms, negative carryover, admin fees, geo list, traffic source restrictions.
- **Promo materials allowed**: what creatives, brand names, bonuses and claims you may use; whether they provide compliant creatives and landing pages; whether they can support platform authorisations for regulated verticals.
- **Product quality**: good product, local payment methods, good support for users. Good products retain users, which is what RevShare and repeat deposits depend on.

Red flags: vague terms, refusal to give conversion-level data, frequent unexplained rejections, pressure to use banned claims, products not licensed where they are offered, late payments.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| FTD | First-time deposit: the first deposit a referred user makes |
| QFTD | Qualified FTD: an FTD that meets the baseline and is paid on CPA |
| GGR | Gross gaming revenue: bets minus wins |
| NGR | Net gaming revenue: GGR minus bonuses, fees, taxes and other deductions |
| EPC | Earnings per click: total earnings ÷ clicks; useful for comparing offers on the same traffic |
| CR | Conversion rate: conversions ÷ clicks (or ÷ joins, ÷ registrations; always say which) |
| LTV | Lifetime value: total revenue (or earnings to you) from a user over time |
| ARPU | Average revenue per user (over a period) |
| Baseline | Minimum requirements for an FTD to qualify for CPA |
| Cap | Maximum conversions the program will pay in a period |
| Hold | Period conversions stay pending before approval |
| Shave | Under-reporting or not paying real conversions |
| Postback | A server-to-server notification of a conversion |
| S2S | Server-to-server (tracking without the browser) |
| Sub ID | A free parameter you add to the affiliate link (sub1–sub5) and get back in postbacks |
| Click ID | The program's or tracker's unique ID for a click |
| Smartlink | One link that routes users to the best offer for their geo/device automatically |
| Offerwall | A page listing many offers users can complete, usually for rewards; often counts as incentivised traffic |
| Traffic source restrictions | Sources the deal forbids or limits (e.g. incentivised, brand bidding, certain ad networks, adult sites) |
| Negative carryover | Negative monthly revenue carried into next month's RevShare |
| Admin fee | A percentage deducted from revenue before RevShare is calculated |
| NET terms | Days after the period end when payment is made |

---

## 9. Setting it up in Joinvoo

1. **Copy your postback URL** from Conversions. Format: `…/pb/<key>?sub1={telegram_id}&status=ftd&payout={amount}&currency=USD&txid={id}`. Replace the `{…}` parts with the program's own macros (ask your manager; names differ between panels).
2. **Use Integrations templates** for popular programs (for example 1win, Pocket Option, Affstore, Kingfin, Keitaro). Templates end with `&net=<program>`, which credits conversions to that program in your reports. Keep it.
3. **Pass the Telegram ID in sub1** on every offer link:
   - Channels: turn on request-to-join; the welcome message's offer link replaces `{tg_id}` with the person's Telegram ID.
   - Bots: insert the user's Telegram ID into the affiliate link your bot sends.
   - Joinvoo also reads `subid`, `aff_sub` or `tg_id` if your program uses those names.
4. **Set one postback per event** with the right status:
   - `reg` (sign-up), `lead`, `ftd` (first deposit), `dep` (repeat deposit), `sale`, `qualified` (CPA qualified), `rejected` (chargeback/refund/fraud: removes the revenue, nothing sent to ads).
   - Joinvoo also understands `event`, `goal` or `type` instead of `status`, and `value` or `amount` instead of `payout`.
5. **txid deduplication**: pass the program's transaction ID as `txid`. The same txid is never counted twice, so retries do not create duplicate FTDs.
6. **Test**: register and deposit through your own link where allowed, or send a test postback, and check Conversions shows it as matched.
7. **What happens next**: FTDs and sales go to Meta/TikTok/Snapchat as Purchase/CompletePayment/PURCHASE with value; repeat deposits as a Meta custom "Deposit" event; registrations as CompleteRegistration/SIGN_UP. With spend entered in Compare, you see cost per FTD and ROAS per campaign, ad set and ad (Pro).
