# Vertical: Crypto and Web3 (Exchanges, Wallets, Launchpads, Airdrop Communities)
> Use when: someone runs or plans traffic for crypto exchanges, wallets, trading apps, launchpads, token projects or airdrop/community channels: platform approval rules, scam-risk messaging, funnels, offer models and metrics.

Crypto audiences live on Telegram, which makes this vertical a natural fit for Joinvoo. It is also the vertical with the most scams, so platforms are strict and users are suspicious. Trust and compliance are the competitive advantage. Rules of thumb only; check current platform policies and local law.

---

## 1. Products and offers

| Product | Conversion event | Typical model |
|---|---|---|
| Centralised exchange / trading app | Registration, KYC, first deposit or first trade | CPA (often on KYC + deposit or trade), RevShare on trading fees, Hybrid |
| Wallet (custodial or self-custody) | Install, wallet creation, first funding | CPI/CPA, sometimes fixed fee |
| Launchpad / token project | Sign-up, KYC, participation | Usually direct deals; high regulatory risk in many countries |
| Crypto cards / payments | Card order, first top-up | CPA |
| Airdrop / community channels | Joins, engagement, wallet connections | Monetised via partner offers, sponsorships, exchange referrals |
| Education / signals | Joins, course purchases | Sales, subscriptions, exchange referrals |

### Offer model notes
- **CPA baselines** often require KYC passed plus a minimum deposit or minimum trading volume within a set number of days.
- **RevShare** is a share of trading fees from referred users, often for a long period. Good for active traders, small for holders who rarely trade.
- **Geo rules**: exchanges serve some countries and exclude others (licensing, sanctions). FTDs from excluded countries are not paid.
- Postbacks: `reg` (sign-up), `lead` (KYC passed, if reported), `ftd` (first deposit), `dep` (repeat deposit), `qualified`, `rejected`. Telegram ID in sub1.

---

## 2. Platform policy (check the current policy)

### Meta
- Ads promoting crypto products and services (exchanges, trading platforms, wallets, lending, mining and similar) generally require prior written permission. Eligibility is usually based on holding a recognised regulatory licence or being approved through Meta's application process. The list of accepted licences and the process change; check the current Meta cryptocurrency policy.
- Some crypto-related products have been prohibited or tightly restricted at times (for example initial coin offerings and certain token sales). Assume a token sale needs explicit approval and legal advice.
- General news and education about crypto, without promoting a product or service, is treated differently, but the destination matters: if the channel exists to push an exchange signup or token, the ad is promoting that.
- Many countries also require financial services advertiser verification.

### TikTok
- Generally restrictive on crypto: most crypto trading, exchange and token promotion is prohibited, with limited exceptions in specific markets for licensed advertisers. Check the current TikTok policy for the target country.

### Snapchat
- Crypto ads typically require licensing and pre-approval in approved countries, with restrictions on claims. Check the current Snap policy.

### Local law
- Several countries have their own crypto advertising rules (registration of the provider, mandatory risk warnings, bans on certain claims or incentives). Licensed exchanges usually supply compliant wording.

Joe does not help run crypto ads without the required permission, or with landing pages or channels that differ from what was reviewed.

---

## 3. Scam-risk messaging: build trust, protect users

Crypto users are targeted by scams constantly. Clear safety messaging builds trust and reduces reports that get channels banned.

Put these in the pinned post, welcome message and regularly in posts:
- "We will never DM you first asking for money, seed phrases or private keys."
- "Never share your seed phrase or private key with anyone, including us."
- "Only use the official link in this channel's pinned post."
- "We never ask you to send crypto to receive crypto."
- "Crypto is volatile. You can lose your money. Do your own research."

Avoid content that looks like known scam patterns, even if your intent is honest:
- "Send X, get 2X back" giveaways.
- Doubling schemes, guaranteed yields, "risk-free" staking claims.
- Fake celebrity or founder endorsements.
- "Connect your wallet to claim" links to unknown contracts (wallet drainers).
- Urgent countdowns pressuring people to deposit.

In groups: set strict anti-spam, restrict who can post links, warn about impersonators, and keep admin usernames visible so users can verify.

---

## 4. Funnels

### Exchange / trading app funnel
Ad → Telegram channel (request-to-join) → welcome message with tracked referral link + safety notice → education posts (how to buy safely, how to use the app, fees, security) → registration (`reg`) → KYC → first deposit (`ftd`) → first trade → repeat activity (`dep`).

Key friction points:
- **KYC**: explain what documents are needed and how long it takes. Many users stall here.
- **Funding**: local payment methods, P2P options where legal, minimum deposits.
- **Security setup**: 2FA guides increase trust and retention.

### Wallet funnel
Ad → channel or bot → "how to set up a wallet safely" guide → install → create wallet → first funding. Usually tracked as app events through the partner's attribution; Joinvoo tracks the Telegram side and matches postbacks.

### Airdrop / community funnel
Ad → channel with curated, verified opportunities → engagement → monetisation through exchange referrals, sponsored posts (clearly labelled), or partner offers.
- Verify projects before posting. Posting a scam airdrop destroys trust and can get the channel reported and banned.
- Label sponsored posts as sponsored.
- Avoid "free money" framing; focus on "learn about new projects, with safety checks".

### Education / signals funnel
See vertical-trading.md and vertical-education-courses-info.md. The same rules apply: no guaranteed returns, show honest track records, risk warnings.

---

## 5. Angles

### Generally safer
- Security and how to avoid scams.
- Beginner explainers: what a wallet is, how to buy safely, how fees work.
- Market news and context in the local language.
- Product features: low fees, local payment methods, app usability (truthful, in line with the licensed brand's approved claims).
- Community: "Discuss the market with other users".

### Risky or prohibited
- Returns claims ("10x guaranteed", "passive income every day").
- Lifestyle and wealth imagery implying typical results.
- Celebrity, influencer or founder deepfakes and fake endorsements.
- Fake news articles and fake "government-backed" claims.
- Pressure tactics, fake scarcity.
- Promoting unlicensed token sales or unregistered investment schemes.

---

## 6. Geos

- Check where the exchange or product is allowed to operate and accept users.
- Some countries restrict crypto advertising or the products themselves; some require providers to register locally.
- Payment methods and P2P availability decide FTD rates in many emerging markets.
- Language-specific channels for each market.
- Sanctioned countries are always excluded.

---

## 7. Metrics

| Metric | Formula | What to watch |
|---|---|---|
| Click→join | joins ÷ clicks | Trust in the channel preview; scams have made users cautious |
| Join→reg | registrations ÷ joins | Strength of welcome message and guides |
| Reg→KYC | KYC passed ÷ registrations | Document friction in the geo |
| KYC→FTD | FTDs ÷ KYC passed | Funding friction, minimum deposit |
| CPFTD | spend ÷ FTDs | Compare with break-even |
| Repeat deposit / trading activity | `dep` events per FTD | Value of users for RevShare |

Targets:
- Break-even CPFTD (CPA) = CPA payout × qualification rate.
- Break-even CPFTD (RevShare) = expected fee share per user over your payback window (from cohorts, conservatively).
- Target CPFTD = break-even × (1 − margin).
- Crypto activity follows the market: in quiet markets, registrations and trading volume drop; in busy markets, CPMs and competition rise. Watch trends weekly, not daily.

---

## 8. Common mistakes
1. Running crypto ads without Meta's prior permission or without licences required by the platform.
2. Return or profit claims in ads or channel posts.
3. No safety messaging, leading to impersonator scams in comments and DMs, reports and bans.
4. Posting unverified airdrops or projects.
5. Ignoring KYC and funding friction.
6. Counting registrations as success when the program pays on KYC + deposit.
7. Not passing the Telegram ID as sub1 to the exchange referral link.
8. No backup channel; crypto channels are frequently reported, including by competitors.

---

## 9. Launch plan for an exchange offer

1. Confirm the platform permission and the exchange's licence for the target country; get compliant wording from the exchange.
2. Channel set up with safety notice pinned, request-to-join on, welcome message with tracked referral link (sub1 = Telegram ID) and a short "how to register safely" guide.
3. Postbacks: `reg`, KYC (`lead` or `qualified` depending on the program), `ftd`, `dep`.
4. 3–4 educational creatives in the local language; optimise for joins.
5. After 5–7 days, rank by cost per KYC-passed FTD. Kill at about 2–3× target with none.
6. Add a "KYC help" and "how to fund your account" post series; measure reg→KYC and KYC→FTD before and after.

## 10. Joe's quick answers
- "Can I run crypto ads on Meta without approval?" → Ads promoting crypto products generally need prior written permission. Running them without it risks rejections and account restrictions. Apply first or work with an exchange that can support the application.
- "Our channel keeps getting impersonated." → Pin a safety notice, keep admin usernames visible, restrict links in comments, report impersonators to Telegram, and tell members you never DM first.
- "Registrations are fine, FTDs are low." → Check KYC and funding friction in the geo; add step-by-step guides; answer questions fast (Replyvoo can help at volume); check sub1 matching in Conversions.
- "Should I promote this new token presale?" → High legal and policy risk; many platforms prohibit or restrict token sales and some countries treat them as securities. Get legal advice and explicit platform approval, or choose a licensed exchange offer instead.
