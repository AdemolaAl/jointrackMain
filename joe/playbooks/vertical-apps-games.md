# Vertical: Apps and Games (Mobile Apps, Telegram Mini Apps, Tap-to-Earn)
> Use when: someone promotes mobile apps, games or Telegram mini apps: CPI/CPA/in-app event offers, tracking, tap-to-earn style products, retention metrics and how Joinvoo fits next to app attribution.

App and game marketing is measured on installs and what users do after installing. Telegram adds a second world: mini apps that run inside Telegram, opened from a bot, with no app store install. The principles are the same: buy users who stay and pay, not just installs or Starts. Rules of thumb only.

---

## 1. Offer models

| Model | Paid on | Notes |
|---|---|---|
| CPI | Install (first open) | Simple, but programs check for fraud and low retention |
| CPA / CPE (cost per event) | A specific in-app event: registration, tutorial complete, level X, first purchase | Higher payout, aligns with quality |
| CPS / first purchase | First in-app purchase or subscription | Highest payout |
| RevShare | Share of in-app revenue | For direct partnerships |
| Own app | You keep the revenue | You need LTV models to set CPI/CPA targets |

Joinvoo statuses: `reg` for registration, `lead` for a qualifying event, `ftd` or `sale` for first purchase, `dep` for repeat purchases. Telegram ID in sub1.

---

## 2. Tracking: where Joinvoo fits

### Native mobile apps
- Store apps are usually tracked by the platform's SDK and a mobile measurement partner (MMP). Platform app campaigns (Meta App Promotion, TikTok App campaigns, Snap App Install) optimise on SDK/MMP events.
- Joinvoo's role is the Telegram side: if your funnel is ad → Telegram channel/bot → app link, Joinvoo tracks the join/Start and can match later postbacks (registration, purchase) by Telegram ID.
- To match, the app or offer must receive the Telegram ID (for example in a deep link parameter) and send it back in postbacks.

### Telegram mini apps
- Mini apps are web apps opened inside Telegram from a bot (menu button, inline button or a direct link like `t.me/<bot>/<app>?startapp=<param>`).
- Funnel: ad → Joinvoo bot tracking link → bot Start → mini app open. Joinvoo tracks the Start and sends it to the ad platform as the optimisation event.
- The mini app knows the user's Telegram ID from Telegram's init data. Use it to report in-app events (registration, first purchase, level reached) to Joinvoo via postback with sub1 = Telegram ID.
- Use the `startapp` or `start` parameter to carry campaign info if needed.

---

## 3. Tap-to-earn and "earn" games

Tap-to-earn and similar "play and earn rewards" mini apps became very popular on Telegram. They raise specific risks:

- **Financial promises**: if users are told they will earn money or tokens with value, the product may count as a crypto or financial promotion. Platform crypto rules (often prior permission) and local laws may apply. Avoid any income claims.
- **Token airdrop expectations**: users join expecting a future token or payout. If it is delayed or worth little, churn and complaints spike.
- **Bots and farms**: tap-to-earn attracts automated accounts. Joinvoo filters suspicious joins and marks suspect clicks; programs and projects also filter fake users.
- **Low monetisation**: many users never pay; revenue relies on ads, partnerships or token economics.

Compliant approach:
- Market the game as entertainment: gameplay, competition, friends, leaderboards.
- If rewards exist, describe them accurately with terms, without implying income.
- Check crypto ad rules (see vertical-crypto-web3.md) if tokens are involved.
- Measure real engagement and retention, not just Starts.

---

## 4. Retention metrics

| Metric | Definition | Why it matters |
|---|---|---|
| D1 / D7 / D30 retention | Share of new users who return on day 1 / 7 / 30 | Core quality signal; programs often judge traffic on it |
| Session length / sessions per day | Engagement depth | Predicts monetisation |
| Tutorial / onboarding completion | Share who finish onboarding | First drop-off point |
| Payer conversion | Share of users who ever pay | Monetisation |
| ARPU / ARPPU | Revenue per user / per paying user | LTV inputs |
| LTV (window) | Revenue per user over N days | Sets your CPI/CPA ceiling |

Benchmarks vary enormously by genre and geo. Compare your campaigns against each other and against your own history, not against market averages.

---

## 5. Targets

- **CPI offer**: break-even CPI = payout × acceptance rate (share of installs the program accepts after fraud and retention checks).
- **CPA/CPE offer**: break-even cost per event = payout × acceptance rate. Cost per Start/install target = break-even × (event ÷ Start rate).
- **Own app**: target CPI = predicted LTV over your payback window × (1 − margin). Use D7 data to predict longer LTV only when you have historical curves.
- For Telegram mini apps: target cost per Start = target cost per paying user × (paying users ÷ Starts).

---

## 6. Creative for apps and games

- Show real gameplay or the real app in the first seconds. "Fake gameplay" ads (showing mechanics the game does not have) lead to poor retention, rejections in some platforms and user complaints.
- Hooks: a challenge ("Only 1% pass this level"), satisfying mechanics, a fail/success moment, a clear benefit of the app.
- Playable or interactive formats where available.
- Localise text and voice for each geo.
- Refresh often; game creatives fatigue fast, especially on TikTok.

---

## 7. Campaign setup notes

- **Store apps**: use the platform's app campaign types with SDK/MMP events. Optimise for a meaningful event once volume allows; installs alone attract low-quality users.
- **Mini apps / bots**: web conversion campaigns with Joinvoo sending the Start as the event; later optimise for a purchase or qualifying event sent through postbacks.
- **Geo**: tier 1 for payers, lower tiers for volume; segment by geo because LTV differs a lot.
- **Age**: respect the app store age ratings and platform rules; do not target minors with apps that have payments, gambling-like mechanics or age-restricted content.

---

## 8. Diagnosis

| Symptom | Likely cause | Fix |
|---|---|---|
| Cheap installs/Starts, low D1 | Misleading creative, incentivised or bot traffic | Show real product; check suspect clicks and filtered joins |
| Good D1, poor D7 | Weak core loop or onboarding | Product fix; creative that attracts the right players |
| Good retention, no payers | Monetisation design, wrong geo | Test geos with higher spending power; offers in-app |
| Program rejects many installs | Fraud flags | Clean traffic sources; never incentivise installs unless the offer allows it |
| Mini app Starts but few opens | Bot flow friction | Put the "Open app" button first; reduce steps |

---

## 9. Common mistakes
1. Optimising for installs/Starts forever instead of a quality event.
2. Fake gameplay creatives.
3. Income promises for tap-to-earn games.
4. Not passing Telegram ID from mini apps back to postbacks.
5. Judging on CPI without retention or LTV.
6. Ignoring fraud: bot farms love reward-based apps.

---

## 10. A first-14-days launch plan for a Telegram mini app or bot game

| Days | Focus | What to look at in Joinvoo |
|---|---|---|
| 1–3 | 3–5 creative concepts showing real gameplay, broad targeting in 1–2 geos, optimise for bot Start | Click→Start rate, cost per Start, suspect clicks, filtered joins |
| 4–7 | Kill concepts at about 2–3× target cost per Start with weak engagement; iterate winning hooks | Starts that open the app, D1 return (from your app data) |
| 8–10 | Add postbacks for a quality event (registration, level reached, first purchase) with sub1 = Telegram ID | Cost per quality event per campaign/ad |
| 11–14 | Shift budget to campaigns with the best cost per quality event, not the cheapest Start; add a second geo or language | Cost per paying user, revenue per Start |

### Joe's quick answers
- "My Starts are cheap but nobody plays." → Check that the bot's first message opens the app in one tap; check suspect clicks; make the creative show the actual game so the right players click.
- "Should I optimise for Start or purchase?" → Start until the campaign sends enough purchase events per week to exit learning (rule of thumb around 50 per ad set per week); then test a purchase-optimised duplicate.
- "Can I advertise that players earn crypto?" → Treat it as a crypto/financial promotion: check the platform's crypto policy (often prior permission), avoid income claims, and promote the game as entertainment.
- "My numbers on the platform and in Joinvoo differ." → Platforms use attribution windows and modelled conversions; Joinvoo counts actual Starts and matched postbacks. Compare trends rather than exact totals.

### Retention levers inside Telegram
- Daily reminders or streak messages from the bot (opt-out respected).
- Community channel for updates, tournaments and leaderboards.
- Events and seasons that give players reasons to return.
- Referral mechanics that reward real friends joining, not bot farms.
