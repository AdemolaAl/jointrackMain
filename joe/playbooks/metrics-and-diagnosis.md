# Metrics and Diagnosis: Formulas and Symptom → Cause → Fix
> Use when: a user asks what a number means, how to calculate break-even or target CPA, or why results are bad (high CPM, low CTR, low click→join, high leaves, no FTDs, drop after scaling, CAPI mismatch, rejected ads, restricted account).

Start every diagnosis with the user's own Joinvoo numbers, broken down by campaign, ad set, ad, language and platform, over a fair window (usually the last 3–7 days versus the period before). Averages hide problems. Then find the first step in the funnel where the numbers changed.

---

## 1. Formulas

| Metric | Formula | Notes |
|---|---|---|
| CPM | spend ÷ impressions × 1,000 | Cost to reach people; driven by auction, audience, season, creative quality |
| CTR (link) | link clicks ÷ impressions | Creative interest. Use link CTR, not "all clicks" |
| CPC | spend ÷ clicks | = CPM ÷ (1,000 × CTR) |
| Click→join % | joins ÷ clicks | Ad-to-channel match, Telegram friction, traffic quality |
| CPJ (cost per join) | spend ÷ joins | = CPC ÷ click→join |
| Leave rate | leaves ÷ joins (same cohort/period) | Expectation match, content quality |
| Join→reg % | registrations ÷ joins | Welcome message, offer visibility |
| Reg→FTD % | FTDs ÷ registrations | Payment and KYC friction, intent |
| Join→FTD % | FTDs ÷ joins | Overall funnel conversion |
| CPFTD (cost per FTD) | spend ÷ FTDs | = CPJ ÷ join→FTD |
| Revenue | sum of payouts/values from postbacks | Use qualified/paid amounts when the program pays on qualification |
| ROAS | revenue ÷ spend | 1.0 = break-even on revenue |
| ROI | (revenue − spend) ÷ spend | ROAS − 1 |
| Profit | revenue − spend (− other costs) | Include tools, creatives, team, fees |

### The chain that explains any cost per FTD

CPFTD = CPM ÷ (1,000 × CTR × click→join × join→FTD)

Every change in CPFTD comes from one or more of these four. Find which one moved.

---

## 2. Break-even and target CPA

### Break-even
- **CPA deals**: break-even CPFTD = CPA payout × qualification rate (share of FTDs actually paid).
- **RevShare / own product**: break-even CPFTD = expected revenue (or margin) per FTD over your payback window, from your own cohort data. Be conservative until you have months of data.
- **Hybrid**: CPA part × qualification rate + expected RevShare per FTD over the window.
- **E-commerce**: break-even ROAS = 1 ÷ margin % (margin before ads). Break-even CPA = contribution margin per order.

### Target
- **Target CPFTD** = break-even CPFTD × (1 − desired margin). Example method: for a 30% margin, multiply break-even by 0.7.
- **Target CPJ** = target CPFTD × join→FTD rate.
- **Target CPC** = target CPJ × click→join rate.
- Use the user's own join→FTD and click→join rates from Joinvoo, per geo/language, not averages from elsewhere.

### Kill/keep rules of thumb (in multiples of target CPA)
- About 2–3× target CPA spent with no conversion → kill (after confirming tracking works).
- 1.5–2× target with healthy CTR and click→join → iterate creative before killing.
- At or below target for several days → keep and scale 20–30% per step.
- Remember deposit lag: FTDs can arrive days after the join. Re-check before killing a campaign with recent joins.

---

## 3. Symptom → cause → fix

| Symptom | Likely causes | Fixes |
|---|---|---|
| **High CPM** | Small or very competitive audience; peak season/events; low-quality or policy-borderline creative (lower ad quality ranking); new account; narrow placements | Broaden audience; use automatic placements; improve creative quality and relevance; plan around peak periods; give new accounts time |
| **Low CTR** | Weak hook; creative fatigue; wrong audience; mismatch with platform style; no clear CTA | New hooks in first 3 seconds; native UGC style; clear CTA; refresh creatives; test angles |
| **Good CTR, low click→join** | Ad promises something the channel does not show; channel preview looks unattractive or spammy; desktop/no-Telegram users; bot/suspect clicks; invite links ran out (backup link = untracked); slow redirect | Align ad with channel name/avatar/pinned post; mobile-only; check Joinvoo suspect clicks; add bots for more invite links; check "ready links" count |
| **Joins but high leave rate** | Clickbait hook; content does not match the promise; too many posts or too much selling; wrong language; spam in group | Honest hooks; improve first posts and pinned post; reduce sales posts; one language per channel; moderate |
| **Joins but no FTDs** | Wrong audience (curiosity, freebie seekers); no welcome message with tracked link; generic offer link without sub1 (FTDs happen but do not match); weak content; offer not available in geo; payment methods missing | Turn on request-to-join; check Conversions for unmatched postbacks; verify sub1 = Telegram ID; test the full flow yourself; content that educates and guides to deposit; check geo and payment methods |
| **FTDs but low deposits / revenue** | Low-intent depositors (minimum amounts); bonus seekers; no retention content; program qualification rejects many FTDs | Better-targeted angles; retention content and follow-ups; review qualified vs raw FTDs; check program terms |
| **FTDs not qualifying** | Deposits below baseline; no activity after deposit; KYC fails; duplicates; incentivised traffic | Read baselines; guide users through KYC; stop incentive angles; ask program for rejection reasons |
| **Sudden drop after scaling** | Budget jump reset learning; audience saturation; creative fatigue; bigger share of lower-quality placements; ran out of invite links or credits | Scale 20–30% per step; duplicate horizontally instead; refresh creatives; check invite link supply and wallet; check alerts |
| **CPA spike for everyone at once** | Seasonal auction pressure, platform-wide changes, tracking issue | Compare platform data vs Joinvoo; check events still arrive; hold steady for a day or two before big changes |
| **CAPI events not matching / low EMQ** | Visitors use plain t.me link instead of Joinvoo link; click IDs stripped by redirects/shorteners; wrong dataset ID or token; test event code still set | Use the Joinvoo tracking link in every ad; remove extra redirects; re-save dataset and token and "Send a test"; clear the test code when live |
| **Platform reports far fewer conversions than Joinvoo** | Attribution windows; iOS opt-outs; delayed events; events refused | Normal to differ somewhat; check event errors on the channel card; compare trends, not exact numbers |
| **Platform reports more conversions than Joinvoo** | View-through attribution; modelled conversions; duplicate events from another pixel/integration | Check attribution settings; make sure only one source sends the same event, or use deduplication (event ID) |
| **Deposits in program but not in Joinvoo** | Postback not set; wrong status mapping; sub1 empty | Copy the postback URL from Conversions; use Integrations templates; check unmatched postbacks |
| **Ads rejected** | Policy issue in creative, copy or destination (claims, personal attributes, prohibited product, missing authorisation) | Read the rejection reason; fix the specific issue; request review only if you believe it is a mistake; see compliance-and-account-health.md |
| **Ad account / BM restricted** | Repeated rejections; unauthorised regulated vertical; payment problems; suspicious login; association with restricted assets | Check Account Quality; fix the cause; complete verification; appeal once with honest explanation; do not open new accounts to evade |
| **Telegram channel banned or full** | Reports, policy breach, Telegram limits | Switch Joinvoo backup channel (ads keep working); fix the content issue; appeal to Telegram if appropriate |
| **No joins at all suddenly** | Bot lost admin rights; wallet empty (tracking paused); link domain blocked; ads stopped | Check Channels status, Wallet, ad delivery, and Telegram alerts |

---

## 4. A diagnosis routine Joe can follow

1. **Confirm tracking works**: are clicks arriving? Are joins being tracked? Any platform errors on the channel? Credits available? Ready invite links?
2. **Pick the window**: last 3–7 days vs the previous equal period (Compare page).
3. **Walk the chain**: CPM → CTR → click→join → join→FTD (and reg→FTD) → revenue per FTD. Find the step that changed most.
4. **Segment**: by campaign, ad set, ad, language, platform, country. Is the problem everywhere or in one place?
5. **Match the symptom** in the table above and suggest the fix with the biggest expected impact first.
6. **Set a check-back**: what number should improve, by when, and what to do if it does not.

---

## 5. Reading numbers responsibly
- Small numbers are noisy. 2 FTDs vs 4 FTDs is not a trend.
- Compare like with like: same weekdays, same geos, same offer.
- Deposit lag: recent days look worse until deposits arrive.
- Joinvoo never estimates CPJ, CPFTD or ROAS without spend; ask the user to enter or import spend on the Compare page.
- Platform numbers and Joinvoo numbers measure different things; use Joinvoo for what really happened and the platform for what the algorithm sees.

---

## 6. Worked calculation templates

The numbers below are example arithmetic only, to show the method. They are not benchmarks. Always plug in the user's own payout and rates.

### Template A: CPA offer → target cost per join
1. Payout per qualified FTD = P. Qualification rate = q. Break-even CPFTD = P × q.
2. Desired margin = m. Target CPFTD = P × q × (1 − m).
3. Join→FTD rate from Joinvoo = f. Target CPJ = target CPFTD × f.
4. Click→join rate = c. Target CPC = target CPJ × c.

Example arithmetic: P = 100, q = 0.8, m = 0.3 → target CPFTD = 100 × 0.8 × 0.7 = 56. If f = 0.05 (1 FTD per 20 joins), target CPJ = 56 × 0.05 = 2.80. If c = 0.4, target CPC = 2.80 × 0.4 = 1.12.

### Template B: RevShare cohort value
1. Take all FTDs from one month (a cohort).
2. Sum the revenue those FTDs generated in month 1, months 1–2, months 1–3, and so on.
3. Revenue per FTD after N months = cohort revenue ÷ cohort FTDs.
4. Choose a payback window you can afford (cash flow!). Break-even CPFTD = revenue per FTD at that window.
5. Recalculate monthly; RevShare value can fall when market conditions or program terms change.

### Template C: E-commerce
1. Margin % before ads = (AOV − product − shipping − fees − expected refunds) ÷ AOV.
2. Break-even ROAS = 1 ÷ margin %.
3. Target ROAS = break-even ROAS ÷ (1 − desired profit share of margin). Example arithmetic: margin 40% → break-even ROAS 2.5; to keep half of the margin as profit, target ROAS = 2.5 ÷ 0.5 = 5.0.

### Template D: Budget to exit learning
Daily budget ≈ (50 events ÷ 7 days) × expected cost per event ≈ 7 × expected cost per event. If that is too high for FTD optimisation, optimise for joins (Subscribe) and judge on CPFTD in Joinvoo.

---

## 7. Cohorts, lag and fair windows

- **Join cohort**: group people by the day (or week) they joined, then count how many deposited over the following days. This is the fairest way to compare campaigns, because recent cohorts have had less time to deposit.
- **Time to FTD**: look at how many days typically pass between join and FTD for the user's funnel (People / Conversions). If most FTDs come within 3 days, do not judge campaigns on yesterday's joins.
- **Day-of-week effects**: weekends and match days change behaviour in betting; pay days change deposit sizes in many verticals. Compare the same weekdays.
- **Minimum data before decisions**: rule of thumb, wait for at least a few conversions per variant or about 2–3× target CPA in spend before declaring a winner or loser.

---

## 8. Questions Joe should ask when data is missing

- "What is your payout per FTD (or per sale), and does the program pay on every FTD or only qualified ones?"
- "Have you entered spend on the Compare page? Without spend, cost per join, cost per FTD and ROAS cannot be calculated."
- "Is your postback set up with sub1 = Telegram ID? Do you see postbacks in Conversions?"
- "Which campaign, geo and language are we looking at?"
- "What margin do you want to keep?"
- "When did you last change budgets, creatives or targeting?"

With these answers, Joe can set target CPFTD, CPJ and CPC and say which step of the funnel to fix first.
