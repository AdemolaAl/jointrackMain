# Telegram Drop-off and Retention
> Use when: someone says "I'm getting Telegram drop-off", "people click but don't join", "people join then leave", "subscribers don't engage", or "joins don't register or deposit". Explains each drop-off, its causes, how to diagnose it with Joinvoo numbers, and fixes including content calendars, welcome sequences and re-engagement.

"Drop-off" can mean five different problems. Each has different causes and fixes. The first job is to find out which one the user has.

---

## 1. The five drop-offs

| Drop-off | Measured as | Where to see it |
|---|---|---|
| Click → join | joins ÷ clicks | Joinvoo Campaigns (by ad, ad set, language, platform) |
| Join → stay | leaves ÷ joins (and when they leave) | Joinvoo leaves; Telegram channel stats |
| Join → engage | post views ÷ subscribers, reactions, replies, bot clicks | Telegram channel stats, bot analytics |
| Join → register | registrations ÷ joins | Joinvoo (needs `reg` postbacks) |
| Register → FTD | FTDs ÷ registrations | Joinvoo (needs `reg` and `ftd` postbacks) |

Ask the user which number looks bad, or check them with Joe's tools, before suggesting fixes.

---

## 2. Click → join drop-off

People clicked the ad but did not join.

### Causes
- **Promise mismatch**: the ad promised one thing; the channel preview (name, photo, description) looks like something else.
- **Channel name or photo looks untrustworthy**: generic names, low-quality avatar, spammy description, no recent posts visible.
- **Telegram not installed**: the person has no Telegram on that device (more common on desktop and in some countries). They see an "open in Telegram" page and leave.
- **In-app browser issues**: Facebook/Instagram/TikTok in-app browsers sometimes struggle to hand off to the Telegram app, especially on some Android setups or older app versions.
- **Request-to-join friction**: the person must tap "Request to join"; a few do not. Usually small, and the benefits (welcome message, deposit matching) normally outweigh it.
- **Link previews and slow redirects**: extra redirects or link shorteners add delay and can strip click IDs.
- **Bot or junk clicks**: accidental taps, data-centre traffic, click fraud. Joinvoo marks suspect clicks.
- **Invite links ran out**: visitors got the backup link; they joined but untracked, which looks like lower click→join.

### Diagnose with Joinvoo
- Compare click→join **by ad**: if one ad is much worse, it is the creative promise.
- Compare **by platform and placement**: a weak platform or placement points to in-app browser or traffic quality.
- Compare **by language/country**: low rates in one geo can mean less Telegram adoption.
- Check **suspect clicks** share: high share = traffic quality problem.
- Check **ready invite links** on the Channels page and Telegram alerts for "invite links running low".

### Fixes
- Make the ad and the channel look like the same brand: same name, colours, promise.
- Improve the channel avatar, name and description; keep strong recent posts on top.
- Target mobile devices; exclude placements with weak click→join.
- Mention Telegram in the ad ("Join our Telegram channel") so people who do not use Telegram self-filter before clicking.
- Remove extra redirects; always use the Joinvoo tracking link directly.
- Add a second or third bot as admin for more invite links at high volume.

---

## 3. Join → stay drop-off (leaves)

### Causes
- **Wrong audience or misleading hook**: they expected something else and leave within hours or a day.
- **Slow or no welcome**: no immediate message telling them they are in the right place.
- **Spammy posting**: too many posts, posts at night, repeated content.
- **Too many ads in-channel**: constant "register now" posts, sponsored posts with no value.
- **No proof or value content**: nothing worth staying for.
- **Wrong language**: content does not match the ad's language.
- **Notification fatigue**: frequent notifications; people mute and later leave.
- **Fake/bot joins**: they "leave" in bulk or are deleted accounts; Joinvoo filters many of these.

### Diagnose with Joinvoo
- Leave rate **by ad**: an ad with high leaves usually has a misleading hook even if its cost per join is cheap.
- **Timing of leaves**: leaves within the first day = expectation mismatch; leaves over weeks = content fatigue.
- **After posting changes**: did leaves rise after a change in frequency or a promo campaign?
- **Filtered joins** (People → Filtered): bursts of fake joins can distort leave numbers.
- **Language breakdown**: high leaves in one language group = language or content mismatch.

### Fixes
- Align the ad promise with the channel; drop clickbait hooks.
- Turn on request-to-join so Joinvoo's bot welcomes each person instantly with a useful first message.
- Reduce sales posts; keep a value-first mix (see the calendar below).
- Post at the audience's active hours; avoid late-night notifications. Use silent posts for minor updates.
- One language per channel.

---

## 4. Join → engage drop-off

Subscribers stay but do not read, react or click.

### Causes
- Posts are long, repetitive or not useful.
- Posting times do not match when the audience is active.
- Muted channel after too many notifications.
- No interaction: no questions, polls or reasons to reply.
- Content is not personalised (one-size-fits-all).

### Fixes
- Short posts with one idea each; visuals; clear headlines.
- Polls and questions ("Which topic next?"); answer replies in comments or a discussion group.
- Recurring formats people expect (e.g. "Monday market outlook", "Friday Q&A").
- A bot for personal follow-ups: segment by interest and send relevant content.
- Check post views vs subscribers weekly; a falling ratio is an early warning before leaves rise.

---

## 5. Join → register drop-off

### Causes
- No clear next step, or the offer link is buried.
- Generic link without the person's Telegram ID, so registrations happen but do not match (looks like drop-off in Joinvoo).
- Audience not warmed: they do not yet trust the offer.
- The offer is not available in their country, or the page is slow or confusing on mobile.

### Diagnose
- Check Conversions for **unmatched postbacks**: if many registrations arrive without a matching Telegram ID, it is a tracking problem, not a funnel problem.
- Join→reg rate **by ad and language**.
- Test the full flow yourself on a phone: join, read the welcome message, tap the link, register.

### Fixes
- Request-to-join welcome message (or bot) with a personal tracked link (`{tg_id}`).
- Pinned post with the next step and a short guide ("How to register in 2 minutes").
- Warming content before asking: education, proof, answers to common questions.
- Fast replies to questions. AI closers such as Replyvoo (a Zedapex tool) can answer in seconds and send the right link.

---

## 6. Register → FTD drop-off

### Causes
- Payment friction: local payment methods missing, high minimum deposit, failed payments.
- KYC friction: unclear documents, slow verification.
- Low intent: people registered out of curiosity or for a bonus.
- No follow-up after registration.

### Fixes
- Deposit guides for local payment methods; answer payment questions fast.
- KYC guides with the accepted documents.
- Follow-ups to registered-but-not-deposited users: helpful, not pushy. Castvoo-style drips (a Zedapex tool) can send these to bot users automatically.
- Check offer fit for the geo; consider offers with lower minimum deposits or better local payment support.

---

## 7. Bot vs channel: which to use against drop-off

| Need | Use |
|---|---|
| Broadcast content to many people, build trust | Channel |
| Personal welcome, personal tracked links, questions answered | Bot (or request-to-join welcome via Joinvoo's bot) |
| Segment people (registered, deposited, inactive) | Bot |
| Social proof and discussion | Channel + discussion group |
| Re-engage inactive people one by one | Bot |

A channel can't message people one by one. If a user's drop-off is mostly join→register or register→FTD, adding a bot (or turning on request-to-join) usually helps most.

---

## 8. Content calendar template (weekly)

Adjust frequency to the vertical; this is a structure, not a rule.

| Day | Morning | Midday | Evening |
|---|---|---|---|
| Mon | Week outlook / plan | Short lesson | Poll: what do you want to learn? |
| Tue | Tip of the day | Case study or example (honest) | Offer reminder with guide |
| Wed | News / context | Q&A answers from members | Value post |
| Thu | Short lesson | Proof/transparency post (incl. losses where relevant) | Engagement question |
| Fri | Tip | Member highlight (with permission) | Weekend plan / offer with real deadline if any |
| Sat | Light content | (optional) | Recap of the week |
| Sun | Rest or one evergreen post | | Next week preview |

Guidelines:
- Most posts give value; a minority ask for action.
- Keep a consistent style and time slots so people know what to expect.
- Use silent notifications for minor posts.
- Review views and leaves weekly; adjust.

---

## 9. Welcome sequence ideas (bot or welcome DM)

| When | Message idea |
|---|---|
| Immediately | Welcome + what the channel is + one quick useful tip + the tracked next-step link + safety/risk note if relevant |
| Day 1 | "Start here": the 3 best posts to read first |
| Day 2 | Answer the most common question (how to register, how deposits work, how to start) |
| Day 3 | Honest proof or example + invitation to ask questions |
| Day 5 | Reminder of the next step with a short guide |
| Day 7 | Ask for feedback: "What would help you most?" (segment by answer) |

Rules: keep messages short, one link each, easy opt-out, no fake urgency, no guaranteed results.

---

## 10. Re-engagement ideas

- **Inactive channel members**: a "best of the month" post, a new series, a live session or AMA announcement.
- **Bot users who stopped responding**: one helpful message ("Here's the guide you asked about") then stop; do not spam.
- **Registered, not deposited**: payment/KYC help, answer common blockers.
- **Deposited once, inactive**: new content, events, honest updates; respect responsible gambling/trading messaging.
- **Ask why**: a one-tap poll ("Too many posts / Not relevant / Other") tells you what to fix.
- Respect Telegram's anti-spam rules and users' choices; heavy messaging gets bots reported and limited.

---

## 11. Quick diagnosis script for Joe

1. Which step drops? Check click→join, leaves, join→reg, reg→FTD for the last 7 days vs the previous 7.
2. Is it everywhere or one ad/language/platform? Segment.
3. Is it a tracking issue? Suspect clicks, filtered joins, ready invite links, unmatched postbacks.
4. Match causes above; suggest the top 1–2 fixes.
5. Agree what to watch and when to check again (e.g. leaves by ad after 3 days).
