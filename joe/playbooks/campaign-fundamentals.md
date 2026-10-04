# Campaign Fundamentals: Meta, TikTok and Snapchat for Telegram Funnels
> Use when: someone asks how to structure, launch, test, optimise, scale or diagnose paid campaigns on Meta, TikTok or Snapchat that send traffic to a Telegram channel, group or bot tracked by Joinvoo.

This playbook is the core media buying knowledge. Vertical playbooks (trading, gambling, crypto, etc.) build on it. All numbers below are rules of thumb, not guarantees. Platforms change features and policies often: when in doubt, tell the user to check the current help centre.

---

## 1. Account structure and trust

### Meta building blocks
| Asset | What it is | Practical notes |
|---|---|---|
| Business Manager / Business Portfolio | The container that owns ad accounts, pages, datasets, people | Verify the business (legal name, documents, domain) when you can. Verified, real businesses get more stable limits. |
| Ad account | Where campaigns, billing and spend limits live | New accounts start with low daily spending limits that rise with clean payment history. |
| Facebook Page / Instagram account | The identity the ad runs from | Pages with real history, a profile picture, posts and no policy strikes are trusted more than empty pages. |
| Dataset (Pixel) | Where web and server events (CAPI) are received | Joinvoo sends joins and deposits here via the Conversions API. One dataset per funnel/offer keeps learning clean. |
| Domain | The tracking/landing domain | Verify domains you own in Business settings. |

### Trust and warm-up, in general terms
- Platforms trust accounts that behave like real businesses: consistent identity, verified payment method in the business's name, real people with two-factor authentication, steady spend growth, few rejected ads.
- Start a new ad account with modest budgets and compliant, low-risk creatives; increase spend gradually as the account builds payment history.
- Avoid sudden huge budget jumps on a fresh account, repeated rejected ads, many failed payments, or frequent changes of admins. These are common triggers for review.
- Keep admin access tidy: real people, 2FA on, no shared logins.
- Joe does not help with buying, renting or "farming" accounts to evade restrictions, or with cloaking. If an account is restricted, the path is to fix the cause and appeal (see compliance-and-account-health.md).

### TikTok and Snapchat equivalents
- TikTok: Business Center → ad accounts → TikTok Pixel / Events API. Identity can be a linked TikTok account (needed for Spark Ads).
- Snapchat: Business Manager → ad accounts → Public Profile → Snap Pixel / Conversions API.

---

## 2. Choosing the objective for a Telegram funnel

### The options
| Objective | Optimises for | When to use |
|---|---|---|
| Traffic (link clicks / landing page views) | People who click | Only for quick tests or when you cannot send conversion events. Clicks are cheap but often low quality (accidental taps, bots, people who never open Telegram). |
| Leads or Sales (Conversions) with a CAPI event | People who perform the event you send (Subscribe, Lead, Purchase) | Default for Joinvoo users. The algorithm learns who actually joins and later who deposits. |
| Engagement / Messages | Interactions on platform | Rarely useful for Telegram funnels. |

### Why a real server-side event beats link clicks
- A link click says nothing about whether the person opened Telegram and joined. Optimising for clicks teaches the algorithm to find "clickers", who are often the least valuable people.
- Joinvoo sends a server-side "Subscribe" (or the event you choose) only when a real, non-filtered person joins. The algorithm then looks for more people like real joiners.
- When enough deposits come in, Joinvoo also sends Purchase (FTD) with a value. Optimising toward deposits finds people who pay, which is what you are paid for.
- Server events are not blocked by browsers or ad blockers and are less affected by iOS tracking limits than browser-only pixels.

### A practical progression
1. Start: Sales or Leads objective, optimise for Subscribe (join).
2. When a campaign produces enough FTDs (rule of thumb: dozens per week per ad set, so the ad set can exit learning), test a duplicate optimising for Purchase.
3. If Purchase optimisation has too few events and stays in "Learning limited", go back to Subscribe and broaden.
4. Value optimisation (highest value / ROAS goal) only makes sense once you have a steady flow of purchases with real values.

---

## 3. Budget structure: CBO vs ABO

| | ABO (ad set budget) | CBO (campaign budget, "Advantage campaign budget" on Meta) |
|---|---|---|
| Who controls spend | You, per ad set | The algorithm, across ad sets |
| Best for | Testing (forcing each ad set/creative to get spend) | Scaling proven ad sets and creatives |
| Risk | More manual work | Algorithm may pour budget into one ad set and starve others |

Rules of thumb:
- Test in ABO, scale winners in CBO.
- In CBO, keep ad sets similar in audience size; very different audiences make the split unpredictable.
- Use ad set min/max spend limits sparingly; too many constraints defeat the purpose of CBO.

---

## 4. Targeting: broad, interests, lookalikes, Advantage+

- **Broad** (country, age, maybe language, nothing else): today's default on Meta and TikTok when you send a good conversion event. The algorithm finds buyers from the signal. Works best with strong creatives and enough budget.
- **Interests**: useful for testing angles in a new geo or when your event volume is low. Stack related interests to keep audiences large enough. Many detailed targeting options have been removed or merged over the years; check what is available.
- **Lookalikes**: built from your best people (depositors, not just joiners). Joinvoo's events let you build custom audiences from deposit events in the dataset. A lookalike of depositors is usually better than a lookalike of joiners.
- **Advantage+ audience / Advantage+ campaigns (Meta), Smart+ (TikTok)**: automated targeting and placement. Often efficient once the dataset has good event history; less control during testing.
- **Language targeting**: for Telegram funnels in a specific language, set language or make sure the creative is in the language. Joinvoo's "language" breakdown shows which language groups join and deposit.
- **Age**: always respect the vertical's minimum age (18+ for financial, gambling and dating; higher where local law requires). Never target minors.

---

## 5. Placements

- Start with automatic (Advantage+) placements unless you have a reason not to; the algorithm moves budget to what converts.
- Reels, Stories and in-feed vertical video usually suit mobile Telegram funnels because the user is already on the phone where Telegram is installed.
- Watch out for placements that produce clicks but no joins (for example some Audience Network traffic). Use Joinvoo's click→join rate by placement or by ad set to spot it, then exclude.
- Desktop traffic converts worse to Telegram joins in most funnels because many people do not have Telegram Desktop.

---

## 6. Learning phase and bidding

### Learning phase
- Meta's guidance: an ad set needs about 50 optimisation events within 7 days after the last significant edit to exit learning. TikTok gives similar guidance (around 50 conversions).
- Significant edits restart learning: big budget changes, targeting changes, new creatives in the ad set, bid strategy change, pausing for a long time.
- If you cannot reach ~50 events a week, optimise for a more frequent event (Subscribe instead of Purchase), merge ad sets, or raise budget.
- Budget rule of thumb to exit learning: daily budget ≈ (50 ÷ 7) × expected cost per event, so roughly 7 × your target cost per event per day. If that is unaffordable, choose a higher-frequency event.

### Bid strategies
| Strategy | How it works | Use when |
|---|---|---|
| Lowest cost (highest volume) | Spends the budget getting as many events as possible | Default for testing and most scaling. |
| Cost per result goal (cost cap) | Tries to keep average cost near your goal | You know your target CPA and want to protect margin; may underspend. |
| Bid cap | Hard limit on each auction bid | Advanced. Controls cost tightly but often underdelivers. |
| ROAS goal (minimum ROAS) | Optimises for value with a return floor | Steady purchase volume with real values. |

Tip: when setting a cost cap, start near or slightly above your real target (for example 1.0–1.3× target CPA) and lower slowly. A cap set too low simply does not spend.

---

## 7. Testing frameworks

### What to test, in order of impact
1. Creative (hook, format, angle): biggest lever by far.
2. Offer and funnel (channel content, welcome message, bot flow, landing page).
3. Audience (broad vs interest vs lookalike, geo, language).
4. Placement and bid strategy.

### Creative testing setups
- **3-3-3 style**: 3 angles × 3 hooks × 3 formats (or 3 ad sets × 3 creatives × 3 copies). Gives a structured matrix; find the winning angle first, then iterate hooks within it.
- **One ad set per concept (ABO)**: each creative concept gets its own ad set with equal budget so the algorithm cannot starve it.
- **Dynamic creative / flexible ad format**: upload several images/videos, headlines and texts; the system combines them. Good for finding winning elements quickly; less clean to read results.
- **Iterate winners**: when a creative wins, make 3–5 variations of its hook, first frame, captions and length. Winners usually come from iterating, not from brand-new ideas.

### Kill or keep: rules of thumb
Express thresholds in multiples of your target CPA (cost per FTD, or cost per join if FTD volume is too low to judge):

| Situation | Rule of thumb |
|---|---|
| Spent ~1× target CPA, zero joins | Check tracking first (is Joinvoo receiving clicks? are invite links ready?). If tracking is fine and CTR is weak, consider killing. |
| Spent ~2–3× target CPA, no conversion | Kill the ad / ad set. |
| Converting at 1.5–2× target CPA after a fair spend | Give it more time only if click→join and CTR look healthy; otherwise iterate the creative. |
| Converting at or below target CPA | Keep. Start scaling carefully. |
| Was good, drifts above target for 2–3 days | Check fatigue and frequency, then refresh creative before killing. |

Judge on enough data. One or two conversions either way is noise. Look at the last 3–7 days, not hours. Remember that deposits can arrive days after the join, so a "zero FTD" day may fill in later.

---

## 8. Scaling

### Vertical scaling (more budget on what works)
- Raise budget about 20–30% at a time, every 24–72 hours, while CPA stays in range.
- Large jumps (doubling or more) often reset learning and spike CPA.
- On CBO, scale at campaign level; on ABO, scale the winning ad set.

### Horizontal scaling (more surface)
- Duplicate winning ad sets with new audiences (broad, lookalike of depositors, new interest stacks).
- New geos with the same language, then new languages with translated creatives and a localised channel.
- New platforms: a winning angle on Meta can be adapted to TikTok and Snapchat with native-style creative.
- Separate channels or backup channels per geo/language keep content relevant and reduce single-channel risk.

### Surfing
- "Surfing" means riding a good day: raising budget during the day when results are strong, then pulling back if they turn. It can work for experienced buyers on stable accounts but increases volatility and learning resets. Use sparingly, with clear rules (for example "only if today's CPA is below 0.8× target by midday").

### Before you scale, check
- Backup channel is set (Channels → Backup channel) in case the main channel is banned or full.
- Enough bots as admins so invite links do not run out at higher volume.
- Wallet has credits so tracking does not pause.
- Your follow-up (welcome message, posts, DMs) can handle more people.

---

## 9. Creative: hooks, fatigue, formats

### First 3 seconds
- Most people decide in the first 1–3 seconds. Lead with the most interesting thing: a bold statement that you can back up, a visual surprise, a question the viewer cares about, a familiar problem.
- Show motion immediately. Avoid logos and slow intros.
- Use on-screen captions; many people watch without sound.
- One clear call to action: "Join the channel", "Tap to get the free guide on Telegram".

### UGC (user-generated style)
- Person talking to the camera, filmed on a phone, in the local language and accent. Often outperforms polished ads on TikTok, Reels and Snapchat.
- Use real creators with consent and disclose paid partnerships where required. Do not fake testimonials or results.

### Formats per platform
| Platform | Formats that usually work |
|---|---|
| Meta | 9:16 Reels/Stories video, 4:5 feed video/image, carousels for "steps" content |
| TikTok | 9:16 native-looking video, 9–30 seconds, trending sounds that are licensed for ads, Spark Ads from real accounts |
| Snapchat | 9:16 full-screen video, fast, casual, creator-style, short |

### Fatigue signals
- Frequency rising (rule of thumb: watch closely above about 2–3 in a week for prospecting; it depends on audience size).
- CTR declining over several days at similar spend.
- CPM rising while CTR falls.
- Click→join rate stable but cost per join climbing: usually fatigue or audience saturation, not funnel trouble.
Fix: new hooks on the winning angle, new first frames, new creators, new formats. Do not just duplicate the same ad.

---

## 10. Attribution, iOS and data quality

### Attribution windows
- Meta's default is 7-day click / 1-day view (options and names change; check current settings). Platform numbers use the platform's window; Joinvoo counts real joins and deposits by its own matching. They will not match exactly.
- Joinvoo's numbers are your source of truth for what actually happened in Telegram and with the affiliate program. Platform numbers are what the algorithm optimises on.

### iOS / ATT effects
- Since Apple's App Tracking Transparency, many iOS users opt out of tracking. Browser pixels lose signal. Server-side events (CAPI, Events API, Snap CAPI) with good identifiers recover much of it.
- Expect some under-reporting in platform dashboards; compare against Joinvoo.

### Event Match Quality (EMQ) and identifiers
- EMQ (Meta, scored out of 10) shows how well your server events can be matched to Meta users. Higher match = better optimisation and attribution.
- What helps: fbc (click ID from fbclid), fbp (browser ID), client IP and user agent, external_id (a stable hashed ID, such as the hashed Telegram ID Joinvoo sends). Joinvoo sends these by default.
- TikTok uses ttclid (click ID) and similar identifiers; Snapchat uses its click ID (ScCid) and similar.
- Low EMQ: check that people go through the Joinvoo tracking link (not a plain t.me link), that link shorteners or redirects do not strip click IDs, and that the dataset ID and token are correct.

---

## 11. Reading Joinvoo numbers

| Metric | Formula | What it tells you |
|---|---|---|
| Click→join rate | joins ÷ clicks | Creative-to-channel match, Telegram friction, traffic quality |
| Cost per join (CPJ) | spend ÷ joins | Efficiency of the top of the funnel |
| Join→FTD rate | FTDs ÷ joins | Quality of joiners plus strength of channel content and offer |
| Cost per FTD (CPFTD) | spend ÷ FTDs | The number that decides profit |
| ROAS | revenue ÷ spend | Return per unit of spend (needs spend entered in Compare) |
| Leaves | people who left the channel | Content and expectation mismatch |

### Diagnosis by metric
- **Low click→join**: ad promises something the channel does not show; channel name/preview looks spammy; many clicks from people without Telegram (desktop, some geos); suspect/bot clicks (check Joinvoo suspect clicks); slow redirect. Fix: match the ad to the channel, improve channel avatar/description/pinned post, restrict to mobile, exclude bad placements.
- **High CPJ with healthy click→join**: the ad itself is expensive (high CPM or low CTR). Fix creative and audience.
- **Low join→FTD**: wrong audience (clickbait creative), weak channel content, no welcome message with the offer link, missing sub1 matching (deposits happen but are not attributed: check Conversions for unmatched postbacks). Fix the funnel and tracking before blaming the ads.
- **High CPFTD**: break it down: CPFTD = CPJ ÷ join→FTD rate. Find which side moved.
- **Low ROAS with OK CPFTD**: low deposit values or few repeat deposits. Work on retention content and offer choice.
- **High leaves**: ad over-promised, too many posts, spammy content, or the channel did not match the language. See telegram-funnels.md.

Always segment by campaign, ad set, ad and language in Joinvoo before deciding. Averages hide winners and losers.

---

## 12. TikTok specifics

- **Spark Ads**: run ads from real organic TikTok posts (your own or a creator's with authorisation code). Feel native, keep social proof (likes/comments), usually better engagement than "dark" ads.
- **Creative velocity**: TikTok creatives fatigue faster than Meta. Plan a steady pipeline of new videos per week for any campaign you scale.
- **Native style**: shot on phone, trends, text overlays, fast cuts, real people. Polished TV-style ads tend to underperform.
- **TikTok Events API**: Joinvoo sends joins (Subscribe or CompleteRegistration) and deposits (CompletePayment) server-side with ttclid. Optimise campaigns on these events.
- **Policy**: TikTok is generally stricter than Meta on financial services, crypto and gambling, and rules vary by country. Check the current TikTok advertising policies for your vertical and country before spending.
- **Smart+ / automated campaigns**: useful once you have good event history.

## 13. Snapchat specifics

- **Audience skew**: Snapchat's user base skews younger. For 18+ verticals, set the age floor correctly and expect a smaller usable audience in some countries. Never target under-18s with age-restricted offers.
- **Creative**: full-screen 9:16 vertical video, the first second matters even more, casual creator-style content, sound on is more common than on Meta.
- **Snap Conversions API**: Joinvoo sends SUBSCRIBE for joins and PURCHASE for deposits with the Snap click ID. Optimise on these events rather than swipe-ups.
- **Policy**: Snapchat requires pre-approval and licensing for regulated verticals such as gambling and many financial products, and is conservative on claims. Check the current Snap Advertising Policies.

---

## 14. Quick checklist before launching
1. Joinvoo channel connected, bot admin with "Invite users", ready invite links available, backup channel chosen.
2. Dataset/pixel ID and token saved, test event received, test code removed before going live.
3. UTM tags on the tracking link so campaign, ad set and ad show in reports.
4. Postback set up with sub1 = Telegram ID; test postback visible in Conversions.
5. Spend entered or imported so CPJ, CPFTD and ROAS appear.
6. Objective = Sales/Leads with Subscribe; age and geo correct; creatives compliant with policy.
7. Kill/keep thresholds written down before launch, as multiples of target CPA.
