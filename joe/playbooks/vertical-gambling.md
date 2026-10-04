# Vertical: Gambling (Sports Betting, Casino, Crash/Instant Games, Lottery)
> Use when: someone runs or plans traffic for betting, casino, crash/instant games or lottery offers: offer models, baselines, seasonality, tipster channels, angles, geos, responsible gambling, platform policies, fraud and qualification problems.

Gambling is a high-volume, high-payout and high-risk vertical. Platform rules are strict, local laws differ a lot, and programs are strict about traffic quality. The goal is a compliant, honest funnel that brings players who deposit more than once. All numbers are rules of thumb; check your program's terms and the current platform policies.

---

## 1. Products

| Product | Typical player behaviour | Notes |
|---|---|---|
| Sports betting | Bets around matches; activity follows the sports calendar | Strong seasonality; tipster/prediction channels are a common Telegram funnel |
| Casino (slots, live casino) | Frequent sessions, deposits spread over time | Higher repeat deposits on good traffic; bonus abuse risk |
| Crash / instant games | Very short rounds, mobile-first | Very popular in some markets; strongly associated with "predictor bot" scams, which you must avoid |
| Lottery | Periodic draws | Often state-run or licensed; different ad rules from casino in some countries |

---

## 2. Offer models and baselines

| Model | Paid on | Notes |
|---|---|---|
| CPA | Each qualified FTD | Fixed payout; baselines apply |
| RevShare | Share of net gaming revenue (player losses minus bonuses, fees, etc.) from your players | Long tail; can be negative in a month if players win; check carryover rules |
| Hybrid | CPA + RevShare | Balance of cash now and value later |
| CPL / CPR | Registrations | Less common, low payout, strict quality checks |

### FTD vs qualified FTD
- **FTD**: first deposit of any amount (`ftd` in Joinvoo).
- **Qualified FTD**: the FTD meets the baseline, for example minimum deposit, minimum wagering/turnover, minimum number of bets, a deposit within X days of registration, passed KYC, allowed geo (`qualified` in Joinvoo).
- Only qualified FTDs are paid on CPA. Your break-even must use the qualified rate, not raw FTDs.

### Typical qualification and fraud rules
- One account per person/device/household; duplicates are rejected.
- Bonus abuse (signing up only for bonuses and withdrawing) can be disqualified.
- Self-referral, incentivised traffic ("deposit and I'll pay you back"), and fake accounts are disqualified and can get you banned from the program.
- Traffic sources may be restricted in the deal (some programs forbid certain sources or brand bidding).
- Chargebacks remove commission (`rejected` in Joinvoo removes revenue).

Read the deal's terms before launching. Ask the manager what share of your FTDs qualify each week.

---

## 3. Seasonality

- **Football**: European league seasons run roughly from August to May; activity drops in the summer break, except in tournament years.
- **Big tournaments** (World Cup, continental championships, Champions League finals, major cricket, basketball and combat events): sharp spikes in interest, more competition in the ad auctions (higher CPMs), many first-time bettors.
- **Local leagues and sports**: cricket, basketball, tennis and local football leagues create their own peaks by country.
- **Weekly rhythm**: weekends and match days bring more betting interest.
- **Casino**: less tied to sports, can be steadier; people often play more around pay days and evenings.

Tactics:
- Prepare creatives, channels and backup channels weeks before big tournaments.
- Raise budgets gradually into the event; do not jump on day one.
- Expect a drop after the event; retention content (other leagues, casino offers if allowed) keeps players active.

---

## 4. Telegram tipster and prediction channels done honestly

Telegram tipster channels can work well and can be done ethically:

**Do**
- Post your full record, wins and losses, in a consistent format.
- Explain reasoning: form, injuries, line movement, stats.
- Use realistic language: "pick", "analysis", "value bet"; never "sure win".
- Show responsible gambling messages: stake management, set limits, 18+.
- Put the tracked offer link in the welcome message (request-to-join mode) and in bot messages so deposits match.
- Post at match times: line-ups, live notes, results.

**Never**
- "Fixed matches", "100% sure", "guaranteed wins". These are scams and illegal in many places.
- "Predictor" or "hack" bots claiming to predict crash/instant game outcomes. Crash games use random outcomes; these products are deceptive and lead to bans and harm.
- Deleting losing tips to fake a record.
- Fake screenshots of winnings or withdrawals.
- Pressuring people to chase losses or borrow money.
- Content aimed at minors (school themes, cartoons that appeal to children, under-age creators).

Honest channels keep subscribers longer and get fewer reports, which protects both the channel and the ad accounts.

---

## 5. Angles

### Safer, compliant angles (where gambling ads are permitted and you are authorised)
- Match previews and analysis in the local language.
- Odds comparison and "where the value is" content.
- Live scores, line-ups, news community.
- Welcome bonus explained with the key terms (wagering requirement, minimum deposit, expiry).
- Entertainment framing for casino: "new games this week", with responsible gambling messaging.

### Angles that break policy or law
- Gambling as a way to earn money or escape poverty, solve debts or replace a job.
- Guaranteed wins, "risk-free bets" (unless genuinely risk-free and allowed by local rules; often restricted wording).
- Showing or appealing to minors; using youth culture that appeals mainly to under-18s.
- Celebrity endorsements without rights (and some countries ban celebrity/athlete use in gambling ads).
- Fake winnings, fake news formats, impersonation of brands or public figures.
- Hiding that the destination is a gambling offer.

---

## 6. Geos

- **Legality first**: gambling is legal and licensed in some countries, restricted to state operators in others, and illegal in others. Promote only offers licensed or legal for the target country, and only where the ad platform allows gambling ads.
- **Licensing**: many countries require operators to hold a local licence and affiliates to follow local advertising codes (age limits, time-of-day rules, required warnings).
- **Language and local sports**: local language channels around local leagues and favourite international leagues.
- **Payment methods**: mobile money, local cards, e-wallets, bank transfer, crypto. Depositing must be easy in the geo.
- **Tier dynamics**: tier 1 = high CPMs and payouts, strict rules; tier 3 = cheap traffic but lower deposit values and more qualification issues.

---

## 7. Age and responsible gambling

- Minimum age: 18+ in most countries; 21+ in some countries or states, and some platforms set higher floors in certain places. Use the higher of the platform rule and local law.
- Set the ad age targeting accordingly; do not rely on the operator to filter minors.
- Include responsible gambling messages in the channel description, pinned post and regularly in posts: "18+ only. Gamble responsibly. Set deposit limits. If gambling stops being fun, seek help." Add local helpline information where required.
- Never encourage chasing losses, borrowing to gamble, or gambling as income.

---

## 8. Platform policies (be conservative; check the current policy)

| Platform | General position (verify current rules) |
|---|---|
| Meta | Online gambling and games ads (real-money betting, casino, lottery in many cases) require prior written permission from Meta, are only allowed in permitted countries where the advertiser is properly licensed, and must target people of legal age (18+ or higher where required). Running gambling ads without permission leads to rejections and account restrictions. |
| TikTok | Generally prohibits gambling ads, with limited, market-specific exceptions for licensed operators that are approved. Assume "not allowed" unless you have confirmed approval for your specific market. |
| Snapchat | Gambling ads require Snap's pre-approval, valid licences, targeting only legal-age users in approved countries, plus responsible gambling messaging. |

Notes:
- Policies apply to the destination too. Sending gambling traffic through a "sports news" ad without the required permission is a policy violation; Joe does not help disguise it.
- Social casino (no real money) has separate, usually lighter rules but still age requirements.
- Affiliates often need the operator's permission and must also hold or rely on the operator's approval for the ad account; ask the program what they can provide.

---

## 9. Metrics and targets

- **Break-even CPFTD (CPA)** = CPA payout × qualification rate.
- **Break-even CPFTD (RevShare)** = expected net revenue per FTD over your payback window, from your own cohort data. Use a conservative estimate early.
- **Target CPFTD** = break-even × (1 − desired margin).
- **Target CPJ** = target CPFTD × join→FTD rate.
- **Watch**: FTD→qualified rate per campaign, repeat deposits (`dep`), time to FTD (sports traffic often deposits close to big matches), leaves after losing streaks.

Healthy patterns (relative):
- Qualified rate stable across campaigns.
- A meaningful share of FTDs make repeat deposits.
- CPFTD stable for several days at rising budgets.

Unhealthy patterns:
- Many FTDs at the minimum amount that do not qualify (incentivised or low-intent traffic, often from "free money" angles).
- Spikes of joins from one source with no deposits (fake traffic; check Joinvoo's filtered joins and suspect clicks).
- High CPFTD only during big events (auction competition); plan around it.

---

## 10. Fraud and qualification issues

| Problem | Signs | Fix |
|---|---|---|
| Duplicate/multi-accounting | Program rejects many FTDs | Avoid incentives, avoid "make several accounts" content |
| Bonus abuse | FTDs at minimum, quick withdrawals | Promote the product, not the bonus alone |
| Incentivised traffic | High FTD count, low qualification | Stop cashback/"refund your deposit" schemes |
| Fake joins/bots | Bursts of joins, no activity | Joinvoo filters them; review traffic source |
| Program shaving | FTDs in your data, qualified CPAs drop without a traffic change | Compare cohorts, ask for player-level reports, diversify programs |

---

## 11. Common mistakes
1. Launching gambling ads without the platform's written permission or in countries where they are not allowed.
2. Using "sure win" or "fixed match" language, or promoting predictor bots.
3. Not setting age targeting correctly.
4. Judging on raw FTDs instead of qualified FTDs.
5. Scaling hard on day one of a tournament when CPMs spike.
6. No backup channel before peak season.
7. No responsible gambling messaging.
8. Ignoring local payment methods.
9. Generic links in the channel without sub1, so deposits cannot be attributed.
10. Relying on one program and one channel.
