# Telegram Funnels: Channels, Groups and Bots
> Use when: someone asks how to build, warm, run or improve the Telegram side of a paid funnel: channel vs group vs bot, request-to-join, welcome DMs, pinned posts, posting cadence, leave rate, moving subscribers to registration/deposit/sale, deep links, backup channels and ban risk.

The ad gets the click. The Telegram funnel turns the click into money. Two buyers with the same ads can have very different cost per FTD because of what happens after the join. This playbook covers that part.

---

## 1. Channel vs group vs bot

| Format | What it is | Strengths | Weaknesses | Best for |
|---|---|---|---|---|
| Channel | One-way broadcast, only admins post | Clean, controllable, scales to large audiences, easy to read | No conversation, people can mute and forget | Signals, tips, news, education, offers, brand content |
| Group | Many-to-many chat | Community, social proof from real members, questions answered publicly | Spam, scam DMs to members, moderation effort, negative comments visible | Communities, courses, support, local commerce |
| Bot | Automated 1:1 chat, user presses Start | Personalised flows, collect answers, deliver links with the user's Telegram ID, segment users | Less "social proof", needs design and testing | Quizzes, onboarding, lead qualification, mini apps, delivering lead magnets |

Common combinations:
- **Channel + bot**: ad → channel (content and trust) → posts with a deep link to the bot → bot qualifies and sends the offer link with the Telegram ID.
- **Bot first**: ad → bot Start → bot gives value (guide, quiz result) → invites to channel for ongoing content.
- **Channel + discussion group**: comments under posts add interaction without the chaos of an open group.

Joinvoo tracks joins for channels and groups and Starts for bots. All three can send the join/Start back to the ad platform.

---

## 2. Request-to-join mode and welcome DMs

### Why request-to-join matters
- In normal invite mode, a channel cannot message a person who joins. You have no 1:1 contact and no way to pass their Telegram ID into an affiliate link.
- In request-to-join mode, each click gets an invite link that asks to join. Joinvoo's bot approves the request instantly and can send the person a welcome message. The offer link in that message includes {tg_id}, replaced by their Telegram ID.
- That Telegram ID goes to the affiliate program as sub1 and comes back with the registration/FTD postback, so deposits match to the exact ad.
- Turn it on in Channels → Join mode.

### Writing the welcome message
A good welcome message:
1. Thanks them and confirms what they joined ("Welcome to X: daily market breakdowns in plain English").
2. Gives one immediate piece of value (a quick tip, a free guide link, the best post to read first).
3. Gives one clear next step with the tracked link ("Open your account here to follow along: [link]").
4. Sets expectations honestly (what you post, how often, risks where relevant).
5. Is short. Three to six lines.

Avoid: walls of text, many links, pressure ("only 5 minutes left!") that is not true, any guarantee of profit or winnings.

---

## 3. Channel setup that converts

- **Name**: clear and specific. People judge in a second whether the channel is what the ad promised.
- **Avatar**: clean, readable at small size, consistent with the ad's look.
- **Description**: one line on what the channel is, one line on what members get, plus any required disclaimer (for example risk warning, 18+).
- **Pinned post**: the most important message: who you are, what you post, how to start (with the tracked link), the rules, any disclaimer. Update it as the offer changes.
- **First visible posts**: when someone opens the channel, the latest few posts are what they see. Make sure they are strong, recent and on-topic, not a string of "join now" spam.
- **Language**: one language per channel. Mixed-language channels convert worse and raise leaves. Run separate channels per language and use Joinvoo's language breakdown to compare.

---

## 4. Warming content and posting cadence

### What "warming" means
New joiners are cold: they clicked an ad, they do not know you. Warming content builds enough trust and understanding that they take the next step (register, deposit, buy).

### A balanced content mix (rule of thumb)
| Type | Share of posts | Examples |
|---|---|---|
| Value / education | Largest share | How something works, mistakes to avoid, short lessons, market or match context |
| Proof and transparency | Regular | Honest results including losses, member questions answered, behind the scenes |
| Engagement | Some | Polls, questions, "what would you do?" |
| Offer / call to action | Smaller share | Register here, today's promo, limited-time bonus (only if real) |

If most posts are calls to action, leaves rise and conversions fall.

### Cadence
- There is no universal number. A rule of thumb: enough to stay visible (at least daily for most active channels), not so much that people mute or leave.
- Signals/tips channels naturally post more often; education channels fewer, longer posts.
- Post at the times your audience is active (check view counts by hour and Joinvoo's join times).
- Consistency beats bursts. A channel that goes quiet for days and then posts 15 times loses people.
- Watch leaves after posting changes. If leaves jump after you increase frequency, scale back.

---

## 5. Leave rate

### How to read it
- Leaves in the first day or two usually mean expectation mismatch: the ad promised something the channel does not deliver, or the person joined by accident.
- Leaves that build over weeks usually mean content fatigue, too many posts, too much selling or low value.
- Compare leave rate per campaign/ad in Joinvoo. One ad with high leaves often means a misleading or clickbait hook, even if its CPJ is cheap.

### Fixes
- Align ad and channel: same promise, same visuals, same language.
- Strengthen the first-view experience: pinned post, latest posts, welcome message.
- Reduce selling frequency; add more value posts.
- Remove spam and scam comments quickly in groups.
- Do not "fix" leaves by hiding the leave button or other tricks; fix the content.

Remember: a subscriber who stays but never converts is not a success either. Judge on join→FTD and revenue, with leaves as a warning signal.

---

## 6. Moving people from channel to deposit or sale

### The path
Ad → join → welcome message (with tracked offer link) → warming posts → repeated, varied calls to action → registration → first deposit/purchase → retention content → repeat deposits/purchases.

### Tactics that lift conversion
- **Tracked link everywhere**: every offer link should carry the Telegram ID (request-to-join welcome message or bot) so deposits match. Generic links posted in the channel cannot carry each person's ID; send personal links via the bot or welcome DM.
- **Bot deep links**: `t.me/YourBot?start=payload` opens the bot with a parameter. Use payloads to know which post or campaign sent the person (for example `start=post_guide1`). Joinvoo can track bot Starts.
- **Step-by-step help**: many people drop off at registration or payment. Short guides ("How to register in 2 minutes", "How to deposit with local payment methods") reduce drop-off.
- **Answer questions fast**: speed of reply matters a lot for conversion. If you get many DMs, an AI closer such as Replyvoo (a Zedapex tool) can reply in seconds and send the right link.
- **Follow-ups**: people who joined but did not register often convert after a reminder or a useful message a few days later. Broadcasts and drip sequences (for example with Castvoo, a Zedapex tool) automate this to people who started your bot. Respect opt-outs and Telegram's rules on spam.
- **Real urgency only**: bonuses that genuinely expire, events that happen at a time. Fake countdowns damage trust and may break platform and consumer rules.

### Segmenting
- Bots let you tag users (registered, deposited, inactive) using postbacks. Send different messages to each: onboarding to new users, tips to depositors, re-activation to inactive users.

---

## 7. Deep links and bot starts

- Format: `https://t.me/<bot_username>?start=<payload>` (payload: letters, digits, underscore, hyphen; limited length).
- Use cases: track which post sent the user, deliver a specific lead magnet, start a specific flow, carry a campaign code.
- In Joinvoo, bot subscriber tracking uses its own tracking link; keep using that in ads so the click IDs are captured. Use your own payloads for in-channel links.
- In bot messages, build the offer link with the user's Telegram ID as sub1 so postbacks match.

---

## 8. Backup channels and ban risk

### Why channels get restricted
- Reports from users (spam, scam).
- Content that breaks Telegram's terms (fraud, illegal goods, impersonation).
- Sudden bursts of fake joins or bot activity.
- Copyright complaints.

### Reduce risk
- Keep content honest. No fake screenshots, no impersonating brands or public figures, no "guaranteed profit".
- Avoid buying fake members or views. They damage trust, distort your numbers and attract restrictions. Joinvoo filters fake joins so they are not sent to ad platforms.
- Moderate groups; remove scam DMs and spam.
- Have more than one admin with 2FA.

### Prepare a backup
- Create a backup channel in advance, with the same branding and some content.
- In Joinvoo: Channels → Backup channel. Your existing ad link keeps working and new visitors go to the backup without editing or re-reviewing ads.
- Post a link to the backup in your main channel occasionally so existing members can follow if needed.
- The backup is a business continuity tool for honest channels, not a way to keep running content that was banned for breaking rules.

---

## 9. Content that converts (by intent)

| Audience intent | Content that converts | Content that hurts |
|---|---|---|
| Learn a skill | Short lessons, examples, quizzes, free mini-course | Vague "secrets", constant upsells |
| Get tips/signals | Clear format, explained reasoning, honest track record incl. losses | Cherry-picked wins, fake results, pressure |
| Buy a product | Real photos/videos, prices, delivery info, reviews from real buyers | Stock images only, hidden prices |
| Community | Active admins, member questions, events, rules | Spam, unanswered questions |

---

## 10. Funnel metrics on the Telegram side

| Metric | Meaning | Where to look |
|---|---|---|
| Click→join rate | How many clickers actually join | Joinvoo Campaigns |
| Leaves (and leave rate) | How many joiners leave, and when | Joinvoo |
| Post views ÷ subscribers | How many members still see your posts | Telegram channel stats |
| Join→reg rate | How many joiners register on the offer | Joinvoo (with reg postbacks) |
| Reg→FTD rate | How many registrations deposit | Joinvoo |
| Join→FTD rate | Overall funnel conversion | Joinvoo |
| Time to FTD | Days between join and first deposit | Joinvoo People / Conversions |

How to use them:
- If click→join is fine but join→reg is weak: improve the welcome message and pinned post, make the offer link more visible, add step-by-step help.
- If join→reg is fine but reg→FTD is weak: payment friction (local methods, minimum deposit), KYC friction, offer mismatch, or low intent. Add deposit guides and answer payment questions fast.
- If time to FTD is long: keep tracking campaigns over a longer window before judging; build follow-up sequences.

---

## 11. Common mistakes
1. Sending ads to a plain t.me link instead of the Joinvoo tracking link (joins not tracked or sent).
2. Not using request-to-join or a bot, so no Telegram ID reaches the affiliate program and deposits do not match.
3. Channel content does not match the ad.
4. Too many sales posts; not enough value.
5. One channel for many languages.
6. No backup channel before scaling.
7. Buying fake members to look bigger.
8. Slow or no replies to DMs.
9. Judging the funnel on joins alone instead of FTDs and revenue.
