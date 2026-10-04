# Vertical: Trading (Forex/CFD, Binary/Digital Options, Crypto Exchanges, Prop Firms, Copy Trading, Signals)
> Use when: someone runs or plans traffic for broker, options, crypto trading, prop firm, copy trading or signals offers: offer models, funnels, angles, geos, metrics, compliance and postback setup.

Trading offers are among the most common uses of Telegram funnels and among the most regulated. The money is in quality depositors, not cheap joins. The risk is in policy and in the honesty of the content. Rules of thumb below are not guarantees; payouts and rules differ by program, product and country.

---

## 1. The products

| Product | What the user does | Regulation (general) | Paid ads reality |
|---|---|---|---|
| Forex / CFD brokers | Trades currency pairs, indices, commodities, stocks via CFDs | Licensed by financial regulators in many countries; retail restrictions (leverage caps, risk warnings) in some regions | Heavily restricted; often requires proof of authorisation per country on Meta. Check current policy. |
| Binary / digital / fixed-time options | Predicts up/down in a fixed time | Banned for retail clients in some regions (for example the EU/UK), unregulated or offshore in many others | Meta's financial products policy has prohibited binary options ads; TikTok and Snapchat are also restrictive. Check current policy before any spend. |
| Crypto exchanges / trading apps | Buys, sells, trades crypto | Licensing regimes vary by country and are changing fast | Meta requires eligibility/approval for many crypto ads; see vertical-crypto-web3.md |
| Prop firms (funded trader programs) | Pays a fee for a challenge; if passed, trades firm capital for a profit split | Regulatory status is evolving and varies | Avoid income claims; some platforms treat these as financial services |
| Copy trading | Automatically copies another trader | Often regulated as investment service | Treated as financial services |
| Signals communities | Receives trade ideas | Investment advice may require a licence in some countries | Avoid guarantees; disclose risk |

Joe's position: help users run compliant campaigns for products that are allowed to be advertised in their target country, by advertisers who hold the authorisations the platform requires. Joe does not help disguise a prohibited product (for example advertising "education" while the real destination pushes a product the platform bans). Platform policies apply to the ad and to the destination and the experience after the click.

---

## 2. Offer models

| Model | How you are paid | Pros | Cons |
|---|---|---|---|
| CPA | Fixed amount per qualified FTD | Predictable, fast cash flow, easy to calculate break-even | Baselines and qualification rules; program can reject FTDs |
| RevShare | Percentage of the revenue the broker/platform earns from your referred clients, often lifetime | Long tail, can exceed CPA on good traffic | Slow, variable, can go negative on some programs (negative carryover), depends on trust in the program's reporting |
| Hybrid | Smaller CPA plus a RevShare percentage | Balance of cash flow and long-term value | More complex to evaluate |

### Baselines and qualification (what turns an FTD into a paid CPA)
Programs often require some of:
- Minimum first deposit amount.
- Minimum trading activity (number of trades or volume) within a time window.
- Passed KYC (identity verification).
- Geo match (the FTD must come from the countries in the deal).
- No duplicate, bonus abuse, fraud or self-referral.

In Joinvoo, the `ftd` status is the first deposit; `qualified` marks the CPA-qualified event; `rejected` removes revenue (for example a chargeback or a disqualified FTD). Send both if your program reports them so you see the gap between FTDs and paid CPAs.

### Holds and shaves
- **Hold**: payouts are confirmed after a hold period (days or weeks) to check quality. Budget your cash flow for it.
- **Shave**: a program under-reports conversions. Signs: Joinvoo shows deposits confirmed by users or registrations steady, but qualified CPAs drop suddenly with no change in traffic. Compare cohorts over time, ask the manager for a breakdown, and diversify across programs. Do not accuse without data; do keep records.
- **KYC impact**: if a geo has difficult verification (few people have accepted ID documents, or verification is slow), many registrations never deposit or never qualify. This shows up as a weak reg→FTD or FTD→qualified rate.

### Choosing the right model
- New to an offer or geo: CPA gives faster feedback.
- Proven, stable traffic with long-term depositors: test RevShare or Hybrid on a portion.
- Always calculate with what is actually paid (qualified), not raw FTDs.

---

## 3. The funnel

Ad → Telegram channel (request-to-join) → welcome message with tracked link → education and honest proof content → registration (`reg` postback) → first deposit (`ftd`) → qualification (`qualified`) → repeat deposits (`dep`).

### Each step
1. **Ad**: honest angle that pre-qualifies people interested in learning about markets, not "get rich" seekers.
2. **Join**: request-to-join mode so Joinvoo's bot can approve and send the welcome message with the tracked link (Telegram ID as sub1).
3. **Education**: how the product works, risk, how to practise on a demo account, how to manage position size. Educated users often stay longer and deposit more over time.
4. **Proof**: transparent track records including losses, explanations of reasoning, answers to member questions. Never fake screenshots, never invented results.
5. **Registration**: step-by-step guide, help with KYC.
6. **FTD**: explain local payment methods and minimum deposit; answer payment questions quickly (an AI closer like Replyvoo can help with volume).
7. **Retention**: regular content, market context, responsible-trading reminders; drip messages to registered-but-not-deposited users (for example Castvoo).

---

## 4. Angles

### Angles that work and are generally safer
- Education: "Learn how the markets move", "Understand candlestick charts in 5 minutes".
- Community: "Join a community of traders who share analysis daily".
- Tools: "Free trading journal / calculator / market calendar in our channel".
- Process and discipline: "How professionals manage risk".
- Demo first: "Practise with a free demo account before risking real money".
- Market news and context in the local language.

### Angles that get ads rejected or accounts restricted
- Guaranteed or "risk-free" profit, fixed daily returns ("Earn $500 a day").
- Screenshots of earnings, bank balances or payouts (often fake, and even real ones imply typical results).
- Lifestyle bait (cars, cash piles, luxury) implying trading makes you rich.
- Impersonating public figures, celebrities, news outlets or official bodies.
- "Secret" bots or methods that "never lose".
- Targeting financial hardship ("In debt? Trade your way out").
- Personal attribute callouts ("Are you broke?").
- Fake news-article-style ads or fake testimonials.

The compliant version of a strong hook keeps the curiosity but drops the false promise: instead of "This strategy made me $3,000 this week", use "The 3 mistakes that wipe out most new traders, and how to avoid them".

---

## 5. Country considerations

### Tiers (general)
| Tier | Typical traits | Implications |
|---|---|---|
| Tier 1 (e.g. US, UK, Western Europe, Australia) | High CPMs, strict regulation, high deposit values | Often only licensed brokers can advertise; many offshore offers do not accept these countries |
| Tier 2 (e.g. parts of Eastern Europe, Latin America, Middle East, Southeast Asia) | Medium CPMs, mixed regulation | Good balance for many offers; check local rules |
| Tier 3 (e.g. many markets in Africa and South Asia) | Low CPMs, lower deposit values, payment friction | Volume is cheap, but qualification, KYC and payment methods decide profitability |

### What matters per country
- **Is the product legal and advertisable there?** Some countries ban certain products or require local licences. Some platforms require advertiser verification per country.
- **Language**: creatives and channel content in the local language; separate channels per language.
- **Payment methods**: local cards, bank transfer, mobile money, e-wallets, crypto. If people cannot deposit easily, reg→FTD collapses.
- **Minimum deposit vs local income**: a minimum deposit that is high relative to local spending power lowers FTD rate.
- **KYC documents**: what IDs people have and whether the program accepts them.
- **Time zones**: post and run support when the audience is awake.

---

## 6. Healthy metric relationships (relative, not fixed)

There are no universal benchmarks; they depend on the product, geo, creative and payout. Use relationships:

- **Break-even cost per FTD** = average paid amount per FTD. For CPA: CPA payout × qualification rate (share of FTDs that get paid). For RevShare: expected revenue per FTD over your payback window (from your own cohorts).
- **Target CPFTD** = break-even × (1 − target margin). Example method: if you want a 30% margin, target CPFTD = 0.7 × break-even.
- **Target cost per join** = target CPFTD × join→FTD rate. If join→FTD is low, you need very cheap joins; improve the funnel before trying to buy cheaper joins.
- **Signs of a healthy campaign**: CPFTD stable and below target for several days, qualification rate stable, repeat deposits appearing (`dep` postbacks), leaves not spiking.
- **Warning signs**: cheap joins with near-zero FTDs (wrong audience), FTDs that do not qualify (deposit too small, no trading activity, KYC failing, fraud), revenue concentrated in very few users.

Measure everything per campaign/ad/language in Joinvoo, and over a long enough window: trading FTDs can arrive days after the join.

---

## 7. Compliance essentials

- **Meta financial products and services policy**: ads for financial products must not be misleading; some products (historically including binary options) are prohibited; some countries require advertisers to verify that they are authorised by the local financial regulator before running financial services ads. Check the current policy and country list.
- **TikTok and Snapchat**: generally stricter; many trading products are prohibited or need licensing and pre-approval. Check current policies per country.
- **No guaranteed-profit claims**, no "risk-free", no typical-earnings implications.
- **Risk disclaimers**: include a clear risk warning in the channel description, pinned post and landing pages (for example: "Trading involves significant risk of loss. Only trade with money you can afford to lose. Past performance does not guarantee future results."). Some regulators require specific wording for licensed brokers; use the broker's required wording.
- **No fake screenshots** of earnings or trades. Real results must be representative and include losses.
- **Age**: 18+ (or higher where required). Never target minors.
- **Signals and advice**: in some countries giving investment advice requires a licence. Frame content as education and general information unless you are licensed.
- **Data**: send hashed identifiers via CAPI; respect privacy laws and the platforms' data terms.

---

## 8. Postback setup

1. In Joinvoo Conversions, copy your postback URL: `…/pb/<key>?sub1={telegram_id}&status=ftd&payout={amount}&currency=USD&txid={id}` (use the program's own macros).
2. In the affiliate program, add postbacks for each event: `reg`, `ftd`, `dep`, and `qualified` / `rejected` if available. Ready-made templates for popular programs (1win, Pocket Option, Affstore, Kingfin, Keitaro and others) are in Integrations.
3. Make sure the offer link carries the Telegram ID in sub1: for channels via request-to-join welcome message ({tg_id}), for bots by inserting the user's ID into the link.
4. Test: register a test account through your own link and check Conversions shows the postback and the match.
5. Unmatched postbacks in Conversions usually mean sub1 is empty or wrong, or the person used a generic link.

What Joinvoo sends to ad platforms: FTD as Purchase/CompletePayment/PURCHASE with value; repeat deposits as a Meta custom "Deposit" event; registrations as CompleteRegistration/SIGN_UP. This lets you build depositor lookalikes and later optimise for Purchase.

---

## 9. Optimisation path for trading campaigns

1. Launch on Subscribe (join) optimisation, broad or a few interest stacks, 2–4 creative concepts.
2. After 3–7 days, rank ads by CPFTD, not CPJ. Kill ads at about 2–3× target CPFTD with no FTD (once you have enough joins to judge).
3. Iterate winning angles; add languages/geos horizontally.
4. When an ad set produces enough FTDs per week, test Purchase optimisation in a duplicate.
5. Build lookalikes from depositors; exclude existing depositors from prospecting.
6. Track qualification and repeat deposits per campaign; shift budget toward campaigns whose users deposit again, not just once.

---

## 10. Common mistakes
1. Optimising for clicks or cheap joins and judging on CPJ.
2. No sub1 = Telegram ID, so FTDs cannot be attributed.
3. Ignoring qualification rules: counting raw FTDs as revenue.
4. Running offers in geos where the product cannot legally be advertised, or without required authorisation.
5. Using income claims and fake proof, then losing ad accounts and channels.
6. One channel for many languages.
7. Not budgeting for holds; running out of cash while scaling.
8. Relying on a single program; no way to detect a shave.
9. Ignoring payment methods and KYC friction in tier 3 geos.
10. Scaling budget faster than the funnel's support capacity (slow replies kill FTDs).
