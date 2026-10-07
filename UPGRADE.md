# Upgrading a live Joinvoo on Railway

This guide is for a developer who already runs Joinvoo on Railway with real customers. You can install this update without logging anyone out or losing any data. Expect about 15 minutes, most of it spent checking.

## Round 19 — DM tracking + mini apps, webhooks, downloads, link tags (7 October 2026)

**Nothing changes for existing users.** Their channels, bots, links and ads work exactly as before, and nobody needs to do anything. The database only gets new columns (`bots.ma_app`, `bots.ma_seen_at`, `channels.biz_conn`, `channels.go_via`, `channels.app_url`, `channels.dm_text`, `hourly.opens`) and one new table (`ma_opens`). On first start the server re-registers every active bot's webhook once (setting `tg.updates_v` → 3) so Telegram also sends `business_connection` and `business_message`. Bots that never turn on Business Mode receive nothing new.

### What changed
- **Manager chats (`channels.type = 'dm'`).** A manager adds the customer's Joinvoo bot under Telegram → Settings → Telegram Business → Chatbots (needs Telegram Premium; Business Mode must be on for the bot in BotFather). Telegram sends `business_connection`; Joinvoo creates a manager chat in **pending** state. Anyone with Premium can add any bot, so the owner must tap **“Yes, that’s my manager”** (dashboard card, wizard, inbox notice; `POST /api/channels/:id/approve`). Pending rows take no plan slot, track nothing and receive no traffic. “Not mine” = `DELETE /api/channels/:id`, and it stays removed if they reconnect.
- **First message = conversion.** On `business_message`, the first message from each person in an approved manager chat is recorded through the normal `recordJoin` (fraud filter, charge, stats, ad platform events). Default events: Meta `Lead`, TikTok `Contact`, Snapchat `SIGN_UP`. The manager's own messages, later messages and edits are ignored. No message text is stored. The bot never replies.
- **Matching.** (1) Mini app: the ad link opens `t.me/<bot>/<app>?startapp=<click code>`; Joinvoo's page `/ma/<bot id>.<sig>` checks Telegram's signed `initData` (HMAC with the bot token, max 24 h old), records the open in `ma_opens` and sends the person on to the manager's chat. Their first message is matched by Telegram user ID. (2) Straight to chat: `t.me/<manager>?text=<ready message>\n\nRef: <signed click code>`; the code in the first message is matched (codes are HMAC-signed, so made-up codes count as organic).
- **Bots with their own mini app.** Bot Settings → Mini app → “Open my mini app instead of the chat” + the app's https address. The ad link opens the mini app, the open counts as the lead (once per person), then Joinvoo hands over to the customer's app with Telegram's launch data intact.
- **Never a dead end.** Bad or old initData, rate limits or a switched-off feature still send the visitor on (untracked).
- **Admin.** Overview → Features: “DM tracking” and “Mini apps” (default on). Plans & trial → “DM tracking & mini apps”: every plan (default) or Pro only (`dm.plan`). Pro only: Basic links still open the chat, untracked.
- **Billing.** A first message from an ad counts as one tracked join (same price). Organic messages are free.
- **Website.** Homepage “Track messages, not just joins” section + 2 FAQs, guide step 9, blog post `track-telegram-dms-and-mini-apps-from-ads`, tutorials t11 + t12 (captions until the MP3s are added — see `public/media/tutorials/README.md`). Joe knows the feature (`joe/knowledge.md`).
- **Tests.** `tests/e2e-round19.js`, `e2e-round19b.js`, `e2e-round19c.js`. Full suite: 1,778 ok, 0 failed. Upgrade tested on a database made by the previous version.

### Also in round 19: DMs on Overview/Results, downloads, webhooks, link tags
- **Overview + Results.** `/api/stats` totals add `dms`, `dms_organic`, `dm_clicks`, `dm_opens` and `counts.has_dm`; `/api/breakdown` rows add `dms` and `dm_clicks`. Overview shows “DMs from ads” and “DM rate” only for accounts with DM tracking; Results gets a DMs column and Cost/lead.
- **Downloads.** New `GET /api/clicks.csv` (ad taps) and `GET /api/conversions.csv` (registrations and deposits), both for the date range; `joins.csv` gains a `kind` column. Media buyers only get their channels. New index `clicks(owner_id, ts)`.
- **Webhooks.** New tables `webhooks`, `hook_queue`. API: `GET/POST /api/webhooks`, `PATCH/DELETE /api/webhooks/:id`, `POST /api/webhooks/:id/test`, `POST /api/webhooks/:id/secret` (owners only, max 5). Sender runs every 3 s, 6 tries with backoff, only public https addresses (checked again at send time, redirects not followed). Signature: `X-Joinvoo-Signature: sha256=HMAC(secret, timestamp + "." + body)`. Admin switch: Features → “Custom webhooks” (`FEATURE_WEBHOOKS`, default on). `WEBHOOK_TEST_ALLOW=1` is for the test suite only, never set it in production.
- **Link tags.** `{utm_source}`, `{utm_medium}`, `{utm_campaign}`, `{utm_term}`, `{utm_content}`, `{sub1}`…`{sub9}` now work next to `{tg_id}`, `{click_id}`, `{name}` in offer links/texts, bot welcome text and button link, and a bot's own mini app address. Tap-to-add chips under those fields.
- **Tutorials.** t13 (webhooks) and t14 (link tags), same female voice and music intro. Guide: three new “Good to know” entries.
- **Tests.** `tests/e2e-round19b.js` (39 checks, webhook receiver on :4950).

### Also in round 19: AI support (Replyvoo) + Telegram support bot + smarter Joe
- **Off by default.** Nothing changes for anyone until an admin turns it on in **Settings → Support → AI support** (needs the AI key from Settings → Joe; same provider and model unless you pick another).
- **What customers see:** the same chat (website + dashboard) with AI teammates (team members marked “AI teammate”; default names Sofia and Daniel with illustrated faces until you upload photos), a small “AI” tag, typing dots, short messages one after another, and “AI support · Powered by Replyvoo”. It says honestly that it's AI if asked, and a person can take over any time.
- **What it can do by itself** (each switchable): read the customer's account, re-check a top-up with the payment provider (credits only what Gatevoo/Paystack/Stripe/Flutterwave confirm, once, up to your limit), resend the confirmation email, send a password reset to the account email, repair a bot's webhook, re-check a link domain, retry failed ad-platform events. It has NO way to add credits, refunds or bonuses.
- **Hands over** refunds, withdrawals, chargebacks, manual top-ups, bugs, account deletion/email change, upset customers and anyone who asks for a person: the chat moves to your team with a short note (only staff see it), and you get a Telegram ping if SUPPORT_TG_BOT_TOKEN / SUPPORT_TG_CHAT_ID are set. When a teammate replies, the AI steps back in that chat; “Let AI continue” hands it back.
- **Telegram support bot:** make a NEW bot in @BotFather (not the tracking bot), paste its token in the AI support card → Connect. Customers link their account by email + 6-digit code before any account tools work.
- **Limits:** daily AI budget (default $25), 400 visitor (not logged-in) AI chats a day, per-chat action limits, link-code brute-force locks. Every AI action is logged on the ticket.
- **Knowledge:** joe/knowledge.md + new joe/support.md (support handbook) + live prices/limits from settings + optional “Notes for the AI” in admin. No founder details; office answer: remote team across the Philippines, Nigeria and the UK.
- **Joe:** now knows what isn't connected (deposits/postback, spend, pixels, link-mode channels) and never judges campaigns on missing data; sharper “senior traffic banker” persona.
- **Joe always sees a live ads snapshot** (today / 7 days / 30 days clicks and joins from ads, last ad click and join) in his instructions, so he can't say ads aren't running when they are, and re-checks when a tool returns zeros. Numbered lists in his answers keep their numbers. Test: `tests/e2e-round19e.js` (fake AI on :4961).
- **Joe ads reports count ads only:** get_stats now gives Joe `ads_only` numbers (joins from ads, people from ads who left, ad leave rate). Organic joins and organic/older members who left are kept apart and not used in ads reports.
- **Also fixed:** the notification bell (and other round icon buttons) are centred the same way on every phone browser; dashboard top bar at 1024px, homepage header in long languages on phones, French chip overflow in Integrations, chat messages keep their order when sent quickly.
- New tables/columns: `support_out`, `support_ai_log`, `support_ai_usage`, `tickets.ai_mode/ai_agent/ai_summary/ai_upto/tg_chat/seen_at/link_*`, `ticket_msgs.internal`. Route `/tgsup/<secret>`. Admin API `/api/admin/support-ai*`, `/api/admin/support/:id/ai`. Tests: `tests/e2e-round19d.js` (39 checks, fake AI on :4960).

### Also in round 19: admin money switches per account
- Users → open someone → **Revenue & referrals** (needs the “Add or remove credits” permission):
  - **Don’t count as revenue** (`users.exclude_revenue`): their paid top-ups leave every revenue total on the admin Overview (month, all time, daily chart, by payment method, by rank). The month tile shows “· $X not counted”. Their referrer earns no commission on them, and no affiliate spend is reported to VooSquare for them. Their account works normally.
  - **No referral commissions** (`users.no_commission`): they stop earning commission on the people they refer. What they already earned stays.
- Admin credit gifts (Users → Add credits) were never revenue: they are `gift` ledger rows, not deposits. The switch is for money that did come in as a deposit but isn't real income (a top-up you paid for someone, staff, tests).
- API: `POST /api/admin/users/:id/flags` `{exclude_revenue, no_commission}`. Tests: `tests/e2e-round19c.js` (18 checks).

### Also in round 19: Blog in the side menu, review fixes
- **Blog in the dashboard menu.** “Blog” sits under Tutorials in the side menu (on phones, in the ☰ menu). It opens the built-in reader (the page that used to be called Learn) and shows a small “New” tag while a recent post is unread. The bottom bar on phones is unchanged.
- **DM tracking approval can't be skipped.** New column `channels.approved_at`, set when the owner taps “Yes, that’s my manager”. Someone who connects the bot and then switches their chatbot off and on stays waiting. Approved managers come back by themselves when the bot's token is reconnected.
- **Only the owner** can change where a bot or DM link sends people (`go_via`, `app_url`), like the forwarding address.
- **Webhooks** have a hard 10-second limit per delivery, so a slow server can't hold up anyone else.
- **People CSV** keeps its old columns in the same order; `kind` is added at the end.
- **Build check.** `make.sh` now stops if a CSS part loses its closing `</style>` tag.
- Two independent reviews (security + UI/upgrade) were run; everything they found is fixed. Full test suite: **1,778 ok, 0 failed**.

### Note for customers who forward their bot's updates
If a customer uses “My bot already runs on a server” (forward URL), their server will now also receive `business_*` updates when their manager uses Business Mode. Normal bots ignore unknown update types.

### Check after deploying (5 minutes, with a real Premium account)
1. In BotFather turn on Business Mode for a test bot connected to Joinvoo; on a Premium account add it under Telegram Business → Chatbots. The manager chat appears; tap “Yes, that’s my manager”.
2. Connect a Meta pixel with a test event code. Open the ad link on another phone and send a message. Meta Test Events shows a `Lead` within a minute.
3. Set up the mini app (Settings → How it opens) and repeat. The status turns green and the open shows under “Opened app”.

## Round 18 — Setup helper + Accounts I manage (6 October 2026)

**Nothing changes for existing users.** One column is added (`team_members.expires_at`, empty for everyone) and one setting (`team.helper_free`, default 1). Existing owners, managers, media buyers, seats, billing, tracking, links and every other feature behave exactly as before; nobody is charged anything new. The API is in `docs/round18-api.md`.

### What changed
- **Setup helper (`role: "helper"`)** — for the marketer or freelancer who sets up a customer's tracking without their password. Same rights as a Manager (the manager allow-list is reused, not copied): every channel and result, set up and edit bots, channels, ad platforms, link domain per channel, request-to-join, website snippets, backups and spend. Never billing, wallet, credits, withdrawals, referrals/affiliate payouts, team, API keys/postback key, a bot's forward URL or account deletion (403).
  - **Free on every plan** (Basic, Pro and the trial): `team.helper_free` helpers per account (default 1) hold no seat, are never charged and are never paused by a downgrade or an unpaid month. A second helper on Basic gets 402 with a clear message; on Pro it takes a normal seat (counted and charged like a manager seat).
  - Same invite flow as other roles (`POST /api/team/invite {email, role:"helper"}`, `/join-team/<token>`). The owner can remove the helper any time (immediate). Audit log entries as for other roles.
- **"Access ends on"** (`expires_at`) for any member, set on the invite or later. When it passes, access is revoked by itself (checked on every request, and by a job every minute). Shown in the Team list.
- **Accounts I manage** (`#accounts`, `GET /api/managed`) for anyone on 2+ teams or a helper on at least one: one card per account (name, role, joins today, joins 7 days, deposits 7 days) with alerts (lost channel, dead link, setup not finished, tracking paused for billing), each limited to what that role may see; media buyers only their channels; never billing amounts. Tap a card to switch to that account. Search when there are more than 6. Entry points: More, the top of the workspace switcher ("All accounts"), and the landing page after login for people with no channels of their own and 2+ accounts to manage.
- **Guide:** Team page explainer card ("Get help setting up — without sharing your password"), roles in one line each, a "Watch how" button for the new tutorial **t10 "Invite a setup helper"**; invite sheet with Setup helper first (marked Free) and role descriptions; when email isn't set up, the invite link with **Send it on WhatsApp** and **Share on Telegram** buttons; a welcome card on the helper's Overview. Website Help page: new FAQ entry "Get help setting up, without sharing your password".
- **Demo:** `dist/app.html?role=helper` opens as a freelancer helping five client accounts (lands on Accounts I manage; opening a client shows the welcome card).

### New settings / environment variables (all optional)
| Variable | Admin setting | Default |
|---|---|---|
| `TEAM_HELPER_FREE` | Settings → Plans & trial → Team seats… → *Free Setup helpers (every plan)* | 1 |
| `TEAM_EXPIRE_MS` | — (tests only) | 60000 (1 minute) |

The admin job runner also accepts `{"job":"team_expire"}`.

### New / changed endpoints
- `POST /api/team/invite`: `role` may be `helper`; optional `expires_at`. `PATCH /api/team/:id`: `role: "helper"`, `expires_at` (or `null`).
- `GET /api/team`: `seats.helper_free`, `seats.helpers_free_used`, `members[].expires_at`, `members[].free` (helpers), a `helper` entry at the end of `roles`, log action `team.expire`.
- `GET /api/managed` (new). `GET /api/workspace`: `workspaces[].expires_at` when set; ended memberships are no longer listed.

### Voice-over to record
`public/media/tutorials/t10.mp3` (script in `public/media/tutorials/README.md` and `docs/tutorials.json`), same voice as t1–t9. Until it's there, t10 plays with captions only.

## Tutorial voiceovers (6 October 2026)

The in-app video tutorials play `public/media/tutorials/t1.mp3` … `t10.mp3` when present (captions-only until then; never an error).
The voiceovers are already recorded in the owner's ElevenLabs account (flow “Joinvoo tutorials voiceover (international)”, voice “Jacob L.” (American), 4 takes each):
download one take per tutorial, name it `t1.mp3` … `t9.mp3` in the order of `docs/tutorials.json`, put them in `public/media/tutorials/`, run
`bash src/dashboard/make.sh && python3 build/build.py`, and deploy. `server.js` now serves `/media/tutorials/*.mp3` (range requests, path-safe).
The website's "Watch how it works" player plays `public/media/tutorials/home.mp3` (also in that flow, the 10th voiceover).

## Round 17 — 6 October 2026: team seats, daily Telegram report, ban protection, Meta spend sync, dead-link warning

**Nothing changes for existing users.** Only new tables and columns are added (`team_members`, `team_channel_access`, `report_log`, `ch_alerts`, `meta_conns`, `meta_accounts`, `meta_campaigns`; `sessions.workspace_owner`; `users.daily_report/report_hour/report_chat_id/report_bot_id`; `channels.created_by/backup_channel_id/auto_failover/lost_at/lost_reason/failed_over_to/fail_streak/recovered_at/link_host/deadlink_at`; `spend.source/channel_id/ext_id/act_id/updated_at` and a partial unique index on Meta spend rows). Existing sessions, links, tracking, request-to-join, custom domains, Voo Connect and billing behave exactly as before; manual spend rows show as `source: "manual"`. **User deletion:** a new database trigger (`r17_owner_gone`, like the one for custom domains) deletes the account's team rows (as owner and as member), Meta connection, report log and alert log, and drops sessions sitting in that workspace. Upgrade checked on a database made by the previous version (old session and spend rows keep working).

The customer dashboard for these features is built next from the API below (`docs/round17-api.md` has the same reference). Admin: the user sheet shows the team (size, seats, members, teams they belong to) and Settings → Plans & trial has a new card **Team seats, ban protection & dead links** (seat prices, thresholds, Meta app ID/secret).

### What changed

- **Team seats.** An account can invite people by email as **Manager** (all channels and results, can add/edit channels; never billing, wallet, withdrawals, team, API keys or account deletion) or **Media buyer** (only the channels given to them, and only those channels' data). Roles are enforced on the server for every `/api/*` call: inside a team workspace a role allow-list decides what may be called (403 otherwise) and every data query (stats, joins/people, CSV, conversions, compare ×4, funnel, cohorts, breakdown, spend, audience guide, leaderboard) is limited to the buyer's channels.
  - Invite link `/join-team/<token>` (7 days): new people sign up with it and land in the team workspace; people with an account log in and confirm. Anyone can switch between their own workspace and their teams (`POST /api/workspace`); the session remembers the active one.
  - Seats: Basic **0** (inviting answers 402 with the upgrade prompt, kind `seats`), Pro **3 included**, extra seats **$5/month** each, charged from the wallet in full when the seat is added and then monthly with the plan renewal (and by the seat job every 10 minutes); empty wallet → 402 with the top-up prompt. Removing someone frees the seat (no refund). Pro → Basic (or the trial ends): members are paused and lose the workspace until the owner upgrades; a month's extra seats the wallet can't pay pause the newest extra members until a top-up.
  - Who added each channel is recorded (`channels.created_by`), and `GET /api/team/leaderboard` shows per person: channels, clicks, joins, FTDs, revenue, spend, cost per FTD. Team actions go to the audit log (area `team`). Without an email provider the invite link is returned in the response so the owner can share it.
- **Daily report in Telegram.** Yesterday's clicks, joins, deposits (FTDs), revenue, spend, cost per join, cost per deposit, best channel and best campaign, each vs the day before (↑↓ %), at the customer's hour (default 08:00 in their profile time zone, UTC if none). The customer connects a chat by pressing Start on `t.me/<their tracking bot>?start=report-<signed code>` (or on the Joinvoo alert bot, when `ALERT_BOT_TOKEN` is set; customers who already linked the alert bot are linked already). Sent once per day per person (`report_log`). Team members can opt in for their own scope (a buyer's report covers only their channels). The old 08:00 alert-bot summary keeps running for customers who never touch the new setting, and stops for those who do (no double report).
- **Channel ban protection.** A channel is marked **lost** (`lost_at`, `lost_reason`; `status` keeps its old meaning) when Telegram says the bot was kicked / left / lost its rights and no other bot can make links, or when invite links are refused N times in a row (`ban.fail_streak`, default 3: the first refusal, then a re-check every 2 minutes with `getChatMember`). A one-off refusal where the bot turns out to still be an admin now heals by itself instead of leaving the channel stuck at "no rights". If the channel has a **backup channel** and auto-failover is on (default ON when a backup is set), its tracking link is pointed at the backup (the existing smart-link mechanism), so running ads keep working. The customer is alerted once per incident (inbox, Telegram, email when an email provider is set); without a backup the alert carries a one-tap "Pick a backup channel" link (picking one switches immediately). When the bot is an admin again the customer is told and offered "Switch back" — never automatic.
- **Automatic ad spend from Meta** (built and tested against a fake Graph API; switch on after Meta approves the app). OAuth "Connect Meta ad account" (`ads_read`), long-lived token stored **encrypted** (AES-256-GCM, key derived from `APP_SECRET`), the customer picks ad accounts, and every hour the last 7 days of spend per campaign per day are upserted into the existing spend table with `source = 'meta'` (USD, and NGN converted at the NGN rate setting; other currencies are listed as not supported yet). Campaigns are matched to channels by `utm_campaign` / `campaign_id` in that channel's clicks, else stored unassigned and mappable by hand. Hand-entered rows are never touched. Expired or revoked tokens → status "reconnect needed" + one alert. Without a Meta app ID/secret every Meta endpoint answers `{available:false, reason:'Waiting for Meta app approval'}` (the UI shows "Coming soon").
- **Dead-link / flagged-domain warning.** Every 15 minutes: clicks on a channel dropped to (almost) zero for the last 2 hours while the same hours on each of the previous 3 days were busy (≥ 10 clicks/hour on average), and — when Meta spend is synced — spend is still running today. One warning per episode, grouped per link domain, with a one-tap switch to a backup link domain (Joinvoo's link/backup domains from Admin → Link domains, or the customer's own active domains). Never switches by itself. Night-time lulls don't trigger it (the same hours on previous days must have been busy). Thresholds are admin settings.
- **Depositor audience.** Verified: a first deposit (FTD) is already sent to Meta's Conversions API as **`Purchase`** with `custom_data.value` and `currency` whenever the postback has an amount (repeat deposits as `Deposit`, registrations as `CompleteRegistration`), once per conversion (event_id `jvconv_<id>`). No change was needed. `GET /api/audience-guide` gives the dashboard the pixel per channel, the event name, how many FTDs were sent in the last 30 days and the exact Ads Manager steps (Custom audience → Website → Purchase → Lookalike).

### New settings / environment variables (all optional)

| Variable | Admin setting (Settings → Plans & trial → Team seats, ban protection & dead links) | Default |
|---|---|---|
| `TEAM_SEAT_CENTS` | Extra seat / month (credits) | 500 ($5) |
| `TEAM_PRO_INCLUDED`, `TEAM_BASIC_INCLUDED` | Seats included on Pro / Basic | 3 / 0 |
| `BAN_FAIL_STREAK` | Lost after refusals in a row | 3 |
| `DEADLINK_QUIET_HOURS`, `DEADLINK_MIN_HOURLY`, `DEADLINK_DAYS`, `DEADLINK_DROP_PCT` | Dead-link thresholds | 2 h, 10 clicks/h, 3 days, 5 % |
| `META_APP_ID`, `META_APP_SECRET` | Meta app ID / secret (needs the `keys.manage` permission) | empty = "Coming soon" |
| `META_GRAPH`, `META_DIALOG` | — | `https://graph.facebook.com/v21.0`, `https://www.facebook.com/v21.0/dialog/oauth` (tests point them at a fake) |
| `TEAM_JOB_MS`, `REPORT_JOB_MS`, `BAN_JOB_MS`, `DEADLINK_JOB_MS`, `META_SYNC_MS` | — | 10 min, 15 min, 2 min, 15 min, 1 h (tests only) |

The admin job runner (`POST /api/admin/jobs/run {"job": …}`, `jobs.run` permission) also accepts `team_seats`, `daily_report`, `ban_check`, `dead_links`, `meta_sync`; these run to the end before it answers.

### Meta App Review: switching on automatic ad spend (developer steps)

1. **Create the app.** developers.facebook.com → My Apps → Create app → use case **"Other"** → type **Business** → name "Joinvoo", contact email, and link it to the Zedapex **Business Portfolio** (Business Manager).
2. **Add the Marketing API** product (App dashboard → Add product → Marketing API → Set up).
3. **Facebook Login for Business** (or Facebook Login) → Settings → **Valid OAuth Redirect URIs**: `https://joinvoo.com/auth/meta/callback` (exactly what Admin shows as "OAuth redirect URI"; it is `BASE_URL` + `/auth/meta/callback`). Turn on "Client OAuth login" and "Web OAuth login"; enforce HTTPS.
4. **App settings → Basic:** App domains `joinvoo.com`; **Privacy Policy URL** `https://joinvoo.com/privacy`; **Terms of Service URL** `https://joinvoo.com/terms`; **User data deletion**: instructions URL `https://joinvoo.com/privacy` (customers disconnect in Spend → Meta → Disconnect, which deletes the token; support deletes everything on request); app icon 1024×1024; category "Business and pages".
5. **Business verification** (Business Settings → Security Center → Start verification) with Zedapex Limited's documents. Advanced Access is not granted without it.
6. **Request Advanced Access for `ads_read`** (App Review → Permissions and features → `ads_read` → Request advanced access). Usage description to paste: *"Joinvoo shows advertisers their own ad spend next to the Telegram joins and deposits it tracks, so they can see cost per join and cost per deposit per campaign. We read campaign-level spend (insights: campaign_id, campaign_name, spend, date) for the ad accounts the user selects, once an hour, and store only daily spend per campaign. We never create or edit ads."*
7. **Screencast** (2–3 minutes, English UI, show the real flow end to end): log in to Joinvoo → Spend → "Connect Meta ad account" → Facebook login dialog with the `ads_read` permission → back in Joinvoo, pick an ad account → "Sync now" → the synced spend rows (source Meta) and cost per join / cost per deposit on the dashboard → Disconnect. Use a real ad account with some spend. Give the reviewer a test login (email + password) for a Joinvoo account in the review notes.
8. While waiting, you can test with your own ad account in **Development mode** (app roles: add yourself as Admin/Developer; Standard Access works for accounts you manage).
9. **Switch it on:** App mode **Live**. Paste the App ID and App secret in Admin → Settings → Plans & trial → *Meta app ID / secret* (or set `META_APP_ID`, `META_APP_SECRET` in Railway). Customers then see "Connect Meta ad account" instead of "Coming soon"; spend syncs every hour.
10. **Check:** connect your own account, Sync now, and compare yesterday's spend with Ads Manager (Ads Manager uses the ad account's time zone; Joinvoo stores Meta's `date_start`). Tokens last about 60 days; when one expires the customer gets one "Reconnect your Meta ad account" alert.

### API for the dashboard

The same reference is in `docs/round17-api.md`.

Team seats, daily Telegram report, channel ban protection, Meta spend sync, dead-link warning, depositor audience guide.
Everything is JSON, same session cookie as the rest of `/api/*`. Money is in **cents = credits** (1 credit = $0.01). Times are
milliseconds since 1970 (UTC). Errors are `{ "error": "Text to show" }` with a 4xx status, as everywhere else.

Deep links used in alerts (inbox `cta_url` is `#tab:<path>`, Telegram/email links are `https://<site>/app#<path>`):

| Path | Show |
|---|---|
| `channels/<id>` | that channel |
| `channels/backup/<id>` | "Pick a backup channel" for that (lost) channel → `PATCH /api/channels/<id> {backup_channel_id}` |
| `channels/switch-back/<id>` | "Switch back" → `POST /api/channels/<id>/switch-back` |
| `channels/link-domain/<id>` | "Switch link domain" → `GET /api/deadlink/options?channel_id=<id>` then `PATCH /api/channels/<id>` with the option's `patch` |
| `spend` | Spend page (Meta connection, "Reconnect Meta") |
| `team` | Team page |
| `wallet` | Wallet (top-up / upgrade) |

---

#### 1. Team seats and workspaces

##### Roles

| Role | Can | Can't |
|---|---|---|
| `owner` (the account) | everything | — |
| `manager` | all channels and all results; add/edit/remove channels, connect bots, spend (add/import/delete), map Meta campaigns, see domains and Meta status | billing, wallet, top-ups, plan, withdrawals, referrals, team management, postback key / API keys, link domains (add/remove), Meta connect/sync/disconnect, Telegram alerts settings, Joe, integrations, account settings of the owner |
| `buyer` (media buyer) | only the channels given to them: stats, joins/people, clicks, deposits, compare, funnel, cohorts, breakdown, CSV export, spend rows of those channels, audience guide, edit those channels' settings (pixel, landing, backup within their channels), record a conversion for their people, own leaderboard row | everything else (403) |

Inside a team workspace every call outside the role's allow-list answers **403** `{ "error": "...", "team_role": "buyer", "team_denied": true }`.
A buyer asking for another channel (`?channel=<id>` on any data endpoint) gets **403**; `/api/channels/<id>…` of a channel they don't have → **404**.
`/api/me`, `/api/me` (PATCH), `/api/password`, `/api/inbox*`, `/api/verify/resend` and `/api/admin/*` always act on the logged-in person.
In a team workspace the postback URL and `hook_start`/`hook_blocked` are returned empty/`null` (they contain the owner's API key).

##### Seats

- Basic: `team.basic_included` seats (default **0**) and no extra seats → inviting answers **402** `{ "error": "...", "upgrade": true, "limit": { "kind": "seats", "used": 0, "max": 0, "plan": "basic" } }`.
- Pro (and the Pro trial, admins, BILLING=off): `team.pro_included` seats included (default **3**). Each extra seat is `team.seat_cents` (default **500** = $5) a month,
  charged from the wallet **in full when the seat is added** and again each month (with the plan renewal / the seat job). Not enough credits → **402**
  `{ "error": "...", "topup": true, "need_cents": 500, "cost_cents": 500, "limit": {...} }`.
- A seat is used by an **active** member or an **open invite** (not expired). Removing someone frees the seat (no refund); re-adding someone in the same month reuses the already-paid seat.
- Pro → Basic (or trial ended): members beyond Basic's seats become `paused` (`pause_reason: "plan"`); their sessions drop back to their own workspace. Upgrading brings them back.
  Wallet can't pay a month's extra seats → newest extra members `paused` (`pause_reason: "unpaid"`); they come back after a top-up.

##### `GET /api/team` (owner)
```json
{
  "seats": { "plan": "pro", "included": 3, "used": 4, "extra": 1, "extra_paid_this_month": 1, "paused": 0, "seat_cents": 500, "can_buy_extra": true, "pro_included": 3, "month": "2026-10" },
  "email_on": false,
  "invite_days": 7,
  "members": [
    { "id": 12, "email": "mia@x.com", "role": "manager", "role_name": "Manager", "status": "active",
      "pause_reason": null, "user_id": 44, "account_email": "mia@x.com", "name": "Mia", "invited_at": 1791..., "joined_at": 1791...,
      "invite_expires_at": null, "channel_ids": [], "all_channels": true, "daily_report": false }
  ],
  "channels": [ { "id": 3, "title": "Alpha", "type": "channel", "status": "active" } ],
  "roles": [ { "id": "manager", "name": "Manager", "can": "..." }, { "id": "buyer", "name": "Media buyer", "can": "..." } ],
  "log": [ { "at": 1791..., "actor_email": "own@x.com", "action": "team.invite", "summary": { "member": "mia@x.com", "role": "manager", "channels": [], "charged_cents": 0 } } ]
}
```
`status`: `invited` | `expired` (invite older than 7 days) | `active` | `paused`. `log.action`: `team.invite`, `team.accept`, `team.update`, `team.resend`, `team.remove`, `team.pause`, `team.resume`.

##### `POST /api/team/invite` (owner)
Request: `{ "email": "ben@x.com", "role": "buyer", "channel_ids": [3, 5] }` (`role`: `manager` | `buyer`; `channel_ids` optional, unknown ids ignored).
Response 200:
```json
{ "ok": true, "member": { ...member }, "invite_url": "https://joinvoo.com/join-team/<token>", "emailed": false, "charged_cents": 500, "seats": { ...seats } }
```
Show `invite_url` with a Copy button (always; when `emailed` is false say "Email isn't set up, share this link"). 400: bad email/role, yourself, already on the team. 402: see Seats. 429: too many invites.

##### `PATCH /api/team/:id` (owner)
Request: `{ "role": "manager" }` and/or `{ "channel_ids": [3] }` (replaces the list). Response: `{ "ok": true, "member": {...} }`.

##### `DELETE /api/team/:id` (owner)
Response: `{ "ok": true, "seats": {...} }`. The person gets an inbox note; their session leaves the workspace.

##### `POST /api/team/:id/resend` (owner, open/expired invites only)
Response: `{ "ok": true, "member": {...}, "invite_url": "...", "emailed": false, "charged_cents": 0 }`. An expired invite needs a seat again (402 rules apply). 400 when they already joined.

##### Invite link flow
- `GET /join-team/<token>` (link in the email):
  - logged out, no account for that email → `302 /signup?team=<token>&email=<email>`
  - logged out, account exists → `302 /login?team=<token>&email=<email>`
  - logged in → `302 /app?team=<token>&email=<email>` → the dashboard shows "Join <owner>'s team as <role>?" and calls `POST /api/team/accept`
  - invalid/expired → `302 /app?team_error=invalid|expired` (or `/login?...` when logged out)
- `GET /api/team/invite-info?token=<token>` (no login needed): `{ "ok": true, "valid": true, "expired": false, "email": "ben@x.com", "role": "buyer", "role_name": "Media buyer", "owner_name": "Ola", "owner_email": "own@x.com", "account_exists": true }` (404 invalid, 410 expired).
- `POST /api/signup` and `POST /api/login` accept an extra `"team_token": "<token>"`; the response then has `"team": { "ok": true, "owner_id": 7, "owner_name": "Ola", "role": "buyer", "status": "active", "paused": false }`
  (or `"team": { "error": "...", "code": "expired" }` — the account/login still succeeds) and the session starts **inside the team workspace**.
  Any email may accept (the link is the secret and is bound to whoever accepts it).
- `POST /api/team/accept` `{ "token": "<token>" }` (logged in) → `{ "ok": true, "owner_id": 7, "owner_name": "Ola", "role": "buyer", "status": "active", "paused": false }` and switches the session into that workspace. Errors: 404 `code: invalid`, 410 `code: expired`, 400 `code: own|member`.

##### Workspace switcher
`GET /api/workspace`, also included as `workspace` in `GET /api/me`:
```json
{ "current": { "owner_id": 7, "own": false, "role": "buyer", "status": "active", "pause_reason": null, "name": "Ola", "email": "own@x.com", "channel_ids": [3] },
  "workspaces": [
    { "owner_id": 44, "own": true, "role": "owner", "status": "active", "name": "Ben", "email": "ben@x.com" },
    { "owner_id": 7, "own": false, "role": "buyer", "status": "active", "pause_reason": null, "name": "Ola", "email": "own@x.com" } ] }
```
`POST /api/workspace` `{ "owner_id": 7 }` → same shape + `"ok": true`. Own workspace: your own id (or 0/null). 403 not a member, 403 `{ "paused": true }` paused.
After switching, reload everything (channels, stats…). `GET /api/channels` also returns `"team_role": "owner" | "manager" | "buyer"`.

##### `GET /api/team/leaderboard?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=<minutes>`
Owner and managers see every row; a buyer only their own.
```json
{ "from": "2026-09-30", "to": "2026-10-06", "locked": false,
  "rows": [ { "member_id": 13, "user_id": 45, "email": "ben@x.com", "name": "Ben", "role": "buyer", "status": "active", "channels": 1, "channel_ids": [3],
              "clicks": 120, "joins": 40, "ftds": 6, "revenue_cents": 30000, "spend_cents": 9000, "cost_per_join_cents": 225, "cost_per_ftd_cents": 1500 } ] }
```
A person's channels = channels they added (`channels.created_by`) + channels given to them. The owner row has channels nobody on the team added.
Spend counts when it's tied to a channel (Meta sync maps campaigns to channels; manual rows can carry `channel_id`). `locked` (Basic after the trial): revenue and cost per FTD are `null`.

##### Other additions
- `POST /api/spend` accepts optional `"channel_id"`. `GET /api/spend` rows now include `"source": "manual" | "meta"` and `"channel_id"`.
- `GET /api/channels` channels include `"created_by"` (user id or `null` = the owner / before round 17).
- `GET /api/billing` → `credits.seats` (credits used on extra seats); ledger rows `kind: "seats"`.

---

#### 2. Daily report in Telegram

##### `GET /api/report-settings`
```json
{ "scope": "own", "enabled": true, "hour": 8, "tz": "Africa/Lagos", "hour_note": null, "linked": true, "via": "tracking_bot",
  "link_options": [ { "via": "alert_bot", "username": "JoinvooAlertsBot", "url": "https://t.me/JoinvooAlertsBot?start=report-1z-3f9a0c1b2d4e" },
                    { "via": "tracking_bot", "bot_id": 4, "username": "mytrack_bot", "url": "https://t.me/mytrack_bot?start=report-1z-3f9a0c1b2d4e" } ],
  "last_sent": { "day": "2026-10-06", "at": 1791..., "ok": true } }
```
- `scope`: `own` (your account) or `team` (inside a team workspace: a report of that team, a buyer's only of their channels; opt-in per member).
- `hour`: local hour (0–23) in the profile time zone; `tz: null` → UTC (`hour_note` says so). Default 8.
- Connect Telegram: show the `link_options` (the alert bot first if present, else "your bot @x"). Opening the link and pressing **Start** links the chat
  (the bot answers "✅ Connected!") and switches the report on. Poll `GET` until `linked` is true. If the customer already linked the Joinvoo alert bot for alerts,
  `linked` is already true (`via: "alert_bot"`).
- Not configured yet (`enabled` false and never saved) the old morning summary of the alert bot keeps working as before; once the customer saves this setting, the new report replaces it.

##### `PATCH /api/report-settings`
Request: `{ "enabled": true, "hour": 7 }` (either), `{ "hour": null }` (back to 8), `{ "disconnect": true }` (forget the chat). Response: `{ "ok": true, ...settings }`. 400 bad hour.

##### `POST /api/report-settings/test`
Sends yesterday's report now. 200 `{ "ok": true, "sent": true, "via": "tracking_bot", "text": "📊 Joinvoo daily report · Mon 5 Oct\n…", "report": {...} }`.
Not linked: 400 `{ "error": "...", "not_linked": true, "text": "...", "report": {...}, "link_options": [...] }` (show the preview anyway). 502 Telegram refused.
`report`:
```json
{ "day": "2026-10-05",
  "totals": { "clicks": 120, "joins": 50, "ftd": 3, "revenue_cents": 12000, "spend_cents": 3000, "cost_per_join_cents": 60, "cost_per_ftd_cents": 1000 },
  "previous": { "clicks": 50, "joins": 20, "ftd": 1, "revenue_cents": 4000, "spend_cents": 2000 },
  "best_channel": { "id": 3, "title": "Main", "n": 3, "by": "FTDs" }, "best_campaign": { "name": "CampA", "n": 2, "by": "FTDs" } }
```
The message: clicks, joins, deposits (FTDs), revenue, spend, cost per join, cost per deposit (each with ↑/↓ % vs the day before), best channel and best campaign.
Sent once per day per person (sent log), by the 15-minute job.

---

#### 3. Channel ban protection

New fields on every channel in `GET /api/channels`:
```json
{ "backup_channel_id": 5, "backup_title": "Backup", "auto_failover": true,
  "lost_at": 1791..., "lost_reason": "bot_kicked", "failed_over_to": 5, "failed_over_title": "Backup", "recovered_at": null, "can_switch_back": false,
  "deadlink_at": null, "link_host": null, "created_by": null }
```
- `lost_reason`: `bot_kicked`, `bot_left`, `admin_rights_removed`, `no_invite_rights`, `chat_not_found` (deleted/banned), `forbidden`, `invite_failed`.
- `auto_failover`: effective value (default ON when a backup is set). `status` keeps its old meaning (`active`, `no_rights`, `removed`); "lost" is `lost_at`.
- When lost with a backup and auto-failover on: the channel's tracking link now sends visitors to the backup (`redirect_to` = `failed_over_to`), so running ads keep working.
- When the bot is admin again: `lost_at` back to `null`, `recovered_at` set, link **stays** on the backup; `can_switch_back` true → show "Switch back".
- Alerts (inbox `kind: "alert"`, Telegram to the report/alert chat, email when an email provider is set), one per incident: "“X” was lost: ads now go to “Y”" / "“X” was lost: pick a backup channel" / "“X” is back".

##### `PATCH /api/channels/:id`
- `{ "backup_channel_id": 5 }` (or `null`) — another channel/group of the account (not a bot, not itself; buyers: one of theirs). If the channel is **already lost**, picking a backup switches the link to it at once (`"switched": true`).
- `{ "auto_failover": false }` (`true`, `false`, or `null` = default).
- `{ "link_host": "go2link.com" }` (or `null`) — see dead-link below.
Response (only these keys sent): `{ "ok": true, "switched": true, "backup_channel_id": 5, "auto_failover": true, "link_host": null, "domain_id": null, "tracking_url": "https://gojoinly.com/c/ab12c", "redirect_to": 5, "failed_over_to": 5, "lost_at": 1791... }`.

##### `POST /api/channels/:id/switch-back`
→ `{ "ok": true, "redirect_to": null, "failed_over_to": null }`. 400 while still lost or when not switched to a backup.

---

#### 4. Meta ad spend sync

All `/api/meta*` answer `{ "available": false, "reason": "Waiting for Meta app approval", "connected": false, "status": "unavailable" }` until the Meta app ID and secret are set → show **Coming soon**.

##### `GET /api/meta`
```json
{ "available": true, "connected": true, "status": "connected", "status_label": "Connected", "fb_name": "Ola FB", "connected_at": 1791..., "expires_at": 1796..., "last_sync_at": 1791..., "last_error": null,
  "connect_url": "/auth/meta/start", "redirect_uri": "https://joinvoo.com/auth/meta/callback",
  "accounts": [ { "id": "act_111", "account_id": "111", "name": "Main USD", "currency": "USD", "account_status": 1, "selected": true, "supported": true, "last_sync_at": 1791..., "last_error": null } ] }
```
`status`: `not_connected` | `connected` | `reconnect_needed` (token expired/revoked → button "Reconnect Meta" = `connect_url`). `supported` false: currency other than USD/NGN (not synced, `last_error` explains).

- **Connect**: open `GET /auth/meta/start` as a normal navigation (owner only). It goes to Facebook (scope `ads_read`) and comes back to
  `/app?meta=connected#spend`, or `/app?meta_error=denied|state|exchange|login|owner_only#spend`, or `/app?meta=unavailable#spend`. One ad account is picked automatically; with more, ask the customer to pick.
- `PATCH /api/meta/accounts` `{ "selected": ["act_111", "222"] }` (owner) → `{ "ok": true, ...meta }`.
- `POST /api/meta/sync` (owner) → `{ "ok": true, "sync": { "ok": true, "rows": 14, "errors": [] }, ...meta }`. The hourly job does this by itself (last 7 days, per campaign per day).
- `DELETE /api/meta` (owner) → disconnect, keeps synced spend; `DELETE /api/meta?purge=1` also deletes the Meta spend rows (manual rows stay).
- `GET /api/meta/campaigns` (owner, manager) → `{ "campaigns": [ { "campaign_id": "238...", "name": "CampA", "account_id": "111", "channel_id": 3, "channel_title": "Main", "mapped_by": "auto", "last_seen": "2026-10-05", "spend_7d_cents": 2500 } ] }`.
  `mapped_by`: `auto` (the campaign name or id matches `utm_campaign` / `campaign_id` in that channel's clicks), `user`, or `null` (unassigned).
- `PATCH /api/meta/campaigns/:campaign_id` `{ "channel_id": 3 }` (or `null`) (owner, manager) → `{ "ok": true, "campaign_id": "238...", "channel_id": 3, "spend_rows_updated": 7 }`. A manual mapping is kept by later syncs.

Synced rows appear in `GET /api/spend` with `"source": "meta"`; they count in stats, compare, breakdown and the leaderboard like manual rows.
Rows typed by hand (`source: "manual"`) are never changed by the sync.

---

#### 5. Dead-link warning

- Every 15 minutes. A channel is flagged when its clicks in the last 2 full hours are ≤ 5% of usual, while the same hours on **each** of the previous 3 days had
  clicks (average ≥ 10 an hour, every day at least half of that), and — if Meta spend is synced — Meta spend is still running today. All thresholds are admin settings.
- One warning per episode (inbox + Telegram + email), grouped per link domain: "Your ad link may be blocked or paused" with a "Switch link domain" deep link
  (`channels/link-domain/<id>`). `deadlink_at` on the channel is set while the episode lasts. Nothing is switched automatically.

##### `GET /api/deadlink/options?channel_id=<id>`
```json
{ "channel_id": 7, "current_host": "gojoinly.com", "deadlink_at": 1791...,
  "options": [ { "type": "joinvoo", "host": "gojoinly.com", "current": true, "patch": { "link_host": "gojoinly.com" } },
               { "type": "joinvoo", "host": "go2link.com", "current": false, "patch": { "link_host": "go2link.com" } },
               { "type": "custom", "domain_id": 4, "host": "go.mybrand.com", "live": true, "current": false, "patch": { "domain_id": 4 } } ],
  "note": "Links already running in your ads keep working on every domain; new links use the one you pick." }
```
One tap = `PATCH /api/channels/<id>` with the option's `patch`. The response has the new `tracking_url` (the customer must update the link in their ads).
`GET /api/channels` also returns `"link_domains": ["gojoinly.com", "go2link.com"]`.

---

#### 6. Depositor audience guide

##### `GET /api/audience-guide`
```json
{ "event_name": "Purchase", "repeat_deposit_event": "Deposit", "registration_event": "CompleteRegistration", "value_sent": true,
  "value_note": "Deposits are sent as Purchase with value and currency whenever your postback includes the amount...",
  "has_ftd_events_last_30d": true, "count": 37, "ftd_30d": 40, "lookalike_min": 100, "ready_for_lookalike": false, "pixels": ["884210395527140"],
  "channels": [ { "channel_id": 3, "title": "Main", "pixel_id": "884210395527140", "has_token": true, "join_event": "Subscribe", "ftd_30d": 40, "ftd_sent_30d": 37, "ftd_with_value_30d": 35 } ],
  "steps": [ "Open Meta Ads Manager → Audiences → Create audience → Custom audience.", "Source: Website. Pick your pixel (884210395527140).", "Events: choose “Purchase” …", "Then Create audience → Lookalike …", "Use the lookalike …" ] }
```
`count` = first deposits sent to Meta in the last 30 days (Meta needs ~100 people for a lookalike → `ready_for_lookalike`).

## Round 16 — 6 October 2026: customer domains, own-landing-page redirect, bot /start ping

**Nothing changes for existing users.** Only new tables/columns are added (`custom_domains`, `domain_trash`, `channels.domain_id`, `channels.snip_origins`, `channels.last_ping_at/last_ping_test/ping_day/ping_count`, `clicks.source`). Every link that runs today (joinvoo.com and gojoinly.com) keeps working forever. **User deletion also removes their domains:** a database trigger deletes a customer's domains whenever their `users` row is deleted (by any tool or by hand), and the domain job removes the HTTPS hostname from Cloudflare. Removing a channel removes a domain that was made only for that channel.

### What changed

- **Customer link domains** (Channels → *Your link domain*). A customer adds a subdomain they own, e.g. `go.theirbrand.com`, then adds two DNS records: a **CNAME** `go` → the CNAME target, and a **TXT** `_joinvoo.go` = the value shown. *Check now* (and a background check every 10 minutes) verifies the TXT record (ownership) and reports separately whether the CNAME points at us. Once verified, the domain is **active** and that customer's tracking links show it (each channel can pick its domain or "Joinvoo default"). Old links keep working on every domain.
  - On a customer domain Joinvoo only answers that customer's `/c/<slug>`, `/c/<slug>/go`, `/r/<slug>.js`, `/robots.txt` (disallow all) and `/health`. Everything else, including other customers' links, is a plain "Not found" with no Joinvoo branding. Cookies there are host-only.
  - Limits: **Basic 1 domain, Pro unlimited.** Change them in Admin → Settings → Plans & trial → Plan limits (*Own link domains*, 0 = unlimited) or with `BASIC_MAX_DOMAINS` / `PRO_MAX_DOMAINS`. Over the limit the customer sees the usual upgrade sheet (HTTP 402).
  - Refused: IPs, localhost, apex domains (they must use a subdomain), anything under joinvoo.com, gojoinly.com, the link/backup domains or the CNAME target, and hosts already claimed by another account.
- **Own landing page script** (Channels → a channel → *Use your own landing page*). Customers paste `<script src="https://<their link host>/r/<slug>.js" async></script>` on their own page. Options: open Telegram instantly, on a button tap (`data-joinvoo` or a CSS selector) or after N seconds. The script reads fbclid/ttclid/ScCid/gclid/utm/sub params and the `_fbp`/`_fbc` cookies (it creates `_fbc` from fbclid), calls `/c/<slug>/go` from the visitor's browser (CORS, so IP and device stay real), gets that visitor's own invite link (or bot deep link) and opens Telegram; after 3 s without an answer it uses the channel's backup link. The script carries a short-lived signed token that counts as the "human" signal (like the `jv_h` cookie on our own page); without it the click is flagged the same way as a script on our page. Clicks are stored with `source = snippet` and the customer's page as `page_url`, so Meta's `event_source_url` is their landing page. Optional per channel: *Only allow my websites*.
- **Bot /start ping** (bots tracked without a token). The *Connect your bot's /start* panel now has HTTP, Node.js, Python (requests), PHP and no-code (ManyChat, SendPulse, BotHelp, Puzzlebot…) instructions, *Send a test*, and shows the last ping and today's count. A ping with the code from our link is matched to the exact ad click and sent to Meta; the same person twice is counted once.

- **Review fixes (same round):** automatic links move to a customer domain only once it really opens (CNAME pointing, and the HTTPS certificate issued when Cloudflare is connected; a domain picked by hand on a channel is used as soon as it is verified), and such domains are re-checked every 10 minutes instead of every 6 hours. A domain someone added but never verified stops blocking other accounts after 24 hours (`DOMAIN_CLAIM_HOLD_MS`). A domain switched off by support can't be removed and re-added by the customer (only an admin deletes it). A Cloudflare hostname created while its domain was being removed is cleaned up. A smart link (backup channel) works on a domain made for one channel.

### New settings / environment variables (all optional)

| Variable | Admin setting | What |
|---|---|---|
| `CUSTOM_DOMAIN_TARGET` | Settings → Link domains → Customer domains → *CNAME target* | Host customers point their CNAME at. Default: the host of the link domain (e.g. `gojoinly.com`). Recommended: `customers.gojoinly.com`. |
| `CF_ZONE_ID` | *Cloudflare zone ID* | Zone of the link domain in Cloudflare (for Cloudflare for SaaS). |
| `CF_API_TOKEN` | *Cloudflare API token* | Token with **SSL and Certificates: Edit** + **Custom Hostnames: Edit** (Zone → that zone). |
| `BASIC_MAX_DOMAINS`, `PRO_MAX_DOMAINS` | Plans & trial → Plan limits | Defaults 1 and 0 (unlimited). |
| `CF_API_BASE`, `DOMAIN_DNS_MOCK`, `DOMAIN_CHECK_MS`, `DOMAIN_CLAIM_HOLD_MS` | — | Tests only (fake Cloudflare, DNS answers from a file, check interval). Don't set in production. |

### One-time setup: Cloudflare for SaaS (recommended, gives every customer domain HTTPS automatically)

1. Put the link domain (e.g. `gojoinly.com`) on Cloudflare (DNS managed by Cloudflare).
2. **Fallback origin:** in Cloudflare DNS add `fallback.gojoinly.com` as a **proxied** CNAME to the Railway app host (Railway → Settings → Networking, e.g. `joinvoo-production.up.railway.app`). Also add `fallback.gojoinly.com` as a custom domain in Railway so Railway accepts the traffic.
3. Cloudflare → `gojoinly.com` → **SSL/TLS → Custom Hostnames** → enable Cloudflare for SaaS → set **Fallback Origin** = `fallback.gojoinly.com` and wait until it shows *Active*.
4. **CNAME target:** add a **proxied** CNAME `customers.gojoinly.com` → `fallback.gojoinly.com`. Enter `customers.gojoinly.com` in Admin → Settings → Link domains → Customer domains → *CNAME target* (or `CUSTOM_DOMAIN_TARGET`).
5. **SSL:** SSL/TLS mode **Full** (Railway serves HTTPS). Joinvoo creates each hostname with `ssl: {method: "http", type: "dv"}`, so certificates are issued automatically once the customer's CNAME points at `customers.gojoinly.com`.
6. Create an API token (My Profile → API Tokens → Custom token: Zone → SSL and Certificates → Edit, Zone → Custom Hostnames → Edit; Zone resources: `gojoinly.com`). Paste the zone ID and token in Admin → Settings → Link domains → Customer domains and save.
7. Test: add a test domain from a customer account, add the two records, *Check now* → Active and "HTTPS certificate on its way", then "HTTPS ready". Open `https://go.yourtest.com/c/<slug>`.

**Important on Railway: add the edge Worker (step 8).** Cloudflare sends each request to the fallback origin with the *customer's* host
(`go.theirbrand.com`), and Railway refuses hosts it doesn't know. So put the small Worker in `scripts/edge-worker.js` in front:

8. Cloudflare → Workers & Pages → Create Worker → paste `scripts/edge-worker.js` → Settings → Variables: `ORIGIN` = `https://fallback.gojoinly.com`
   (a domain added in Railway, step 2) and `EDGE_SECRET` = a long random value (type *Secret*). Add the same value as `EDGE_SECRET` in Railway.
   Then Worker → Settings → Domains & Routes → add route `*/*` on the `gojoinly.com` zone **and exclude** `gojoinly.com/*` and `fallback.gojoinly.com/*`
   (add those two as routes with *no Worker*), so only customer hostnames go through it.
   The Worker sends Host = fallback.gojoinly.com (Railway accepts it) and passes the customer's host and the visitor's IP in
   `x-jv-orig-host` / `x-jv-client-ip`, signed with `x-jv-edge-secret`. Joinvoo only trusts them when the secret matches, so the visitor's
   real IP still reaches Meta. Without `EDGE_SECRET` set these headers are ignored. Test: open `https://go.yourtest.com/c/<slug>` — you
   must see the channel's page, not Railway's "Application not found".

When a customer (or you in Admin) removes a domain, its custom hostname is deleted from Cloudflare too. If Cloudflare refuses (e.g. SaaS not enabled), the domain stays *Checking DNS* with the reason and is retried every 10 minutes.

### Alternative without Cloudflare: Railway by hand

Leave the Cloudflare fields empty. Verified domains still become active, and Admin → Settings → Link domains → Customer domains lists them with **Add in Railway**. For each one: Railway → Settings → Networking → Custom domain → add `go.theirbrand.com`. Railway shows its own CNAME target; set the *CNAME target* setting to that host so customers are told the right value (Railway issues HTTPS once their CNAME points there). Railway limits how many custom domains a service can have, so use Cloudflare for SaaS once you have more than a handful.

### Admin

Admin → Settings → Link domains → **Customer domains**: CNAME target, Cloudflare fields, and the list of every customer domain (owner email, status, HTTPS, last check, last error) with Recheck, Disable/Enable and Delete. Needs the `keys.manage` permission. API: `GET /api/admin/domains`, `POST /api/admin/domains/:id {action: enable|disable|recheck}`, `DELETE /api/admin/domains/:id`.

Customer API: `GET/POST /api/domains`, `POST /api/domains/:id/check`, `DELETE /api/domains/:id`, `PATCH /api/channels/:id {domain_id}` (`null` = automatic, `0` = Joinvoo default, or a domain id) and `{snip_origins}`.

## What's new in this update (round 15, 6 October 2026)

Safe for current users: only new columns (`channels.join_approver`, `channels.approve_after`) and a new table (`join_reqs`). Every existing channel keeps today's behaviour (Joinvoo approves).

- **Request-to-join: "Who lets new members in?"** (Channels → a channel → Request-to-join). Three choices, each with its advantages on screen:
  - **Joinvoo lets them in** (default, as before): instant approval + Joinvoo's welcome message with the offer link.
  - **My own bot lets them in:** for customers with their own welcome/captcha/follow-up bot. Joinvoo never approves or messages; it remembers which ad click each request came from and records the join (and sends it to Meta) when their bot approves.
  - **My bot first, Joinvoo as backup:** like the above, but if their bot hasn't approved someone after N seconds (default 60, 10–3600), Joinvoo approves them.
  Tracking stays exact in all three, even when the approval update doesn't carry the invite link. A tip explains how to track deposits with their own bot (Telegram ID in the offer link + Joinvoo postback), and a card recommends Castvoo for welcome + follow-up flows.
- **Merged the developer's update** (postback URLs on the link domain, Dockerfile copies `lib/` and `voo-connect/`, iOS 16px inputs, dashboard CSS fixes) with the round-11 additions below.

## Round 14: Voo Connect + audit fixes (5 October 2026)

Safe for current users: only new tables and columns (`voo_kit_outbox`, `voo_spends`, `voo_use`, `users.voo_linked_at`,
`users.voo_spent_cents`, `deposits.refunded_cents`, `deposits.charged_back_at`). Nothing changes until VooSquare is set up (section 6).

- **VooSquare through the Voo Connect kit** (`./voo-connect`, copied unchanged from VooSquare). Login, affiliate hand-off, money
  events, summary and support now use the kit. Money is reported the VooSquare way: a top-up is `wallet_topup` (no commission),
  credits actually used are `spend` (commission), refunds and chargebacks point at what they reverse. Details: VOOSQUARE-CONNECT.md.
  Events still queued by the old outbox are moved into the kit's queue on first start.
- **Refunds and chargebacks of top-ups** (Admin → Deposits → Paid → Refund / Chargeback). A refund is capped at the unused money of
  that top-up; a chargeback takes what is left of it out of the wallet (it can go below zero). A chargeback also takes back the
  referral commission earned on what that money paid for (referral terms §6).
- **Fixes from the audit:** a refund and a chargeback clicked at the same moment could take more than the top-up; the old
  `/webhooks/paystack` address could credit a Paystack charge to another provider's top-up or in another currency; referral
  commission counted money already spent on Joe; plan events told VooSquare a customer's custom price as the plan price; rate
  limits could be dodged with a made-up `X-Forwarded-For` when Joinvoo is reached directly (new `TRUST_PROXY` setting, see DEPLOY.md);
  bot forwarding addresses that point at private networks are refused; Admin → Health "sent in 24h" was blank.
- **Big-campaign safe fake-join filter.** The "burst" rule used to flag more than 15 ad joins in 10 seconds on a fresh channel, which could hide a real big launch. It now needs at least 50 in 10 seconds (5 a second) and 10× the channel's normal pace. Tune with `FRAUD_BURST_MIN` (or the `fraud.burst_min` setting).
- **Automatic storage clean-up (for thousands of customers).** Every 6 hours, in small steps that never make visitors wait: ad clicks that never joined are deleted after 90 days (`CLICK_RETENTION_DAYS`); joined clicks older than 180 days (`CLICK_DETAIL_DAYS`) keep their campaign, country and platform but drop IP, device and click cookies; old used invite links and sent queue items are removed. Joins, deposits, revenue and all daily totals are kept forever. Admin → Health shows the database size and the last clean-up.
- **Load test tool.** `node scripts/loadtest.js burst 10000 5 3` (server capacity), `paced 3 180` (real Telegram pacing, 1 bot vs 5), `fleet 2000 20000` (2,000 customers with dashboards and the website open) and `cleanup 500000` (storage clean-up on a big database). Runs locally against fake Telegram/Meta; never touches the real ones.

## Round 11 (5 October 2026)

Everything below is safe for current users: the database only gets new columns and tables, and nothing a customer already has is taken away.

- **Plan limits for channels and bots.** Basic: 3 channels (bot-subscriber trackers count) and 3 bots. Pro and the Pro trial: unlimited.
  - Change the numbers in **Admin → Settings → Plans & trial → Plan limits** (0 = unlimited), or with `BASIC_MAX_CHANNELS`, `BASIC_MAX_BOTS`, `PRO_MAX_CHANNELS`, `PRO_MAX_BOTS`.
  - Limits only apply when **adding**. Customers who already have more keep every channel and bot, and a bot that leaves and rejoins a channel keeps its slot.
  - At the limit, the customer sees "You've used 3 of 3" with **Upgrade to Pro** or **Remove one**. A channel added in Telegram over the limit shows "not tracking yet" and starts by itself when there's room.
- **Customers can add more bots and remove things.** "Add channel" now asks "Which bot?" (an existing bot or **+ Add a new bot**). Each channel has **⋯ → Remove channel**, and **Your bots** has **Disconnect**.
- **Click IDs in Telegram.** Every ad click gets an ID like `c-0a3f9`, and its single-use invite link is renamed in Telegram to e.g. `Meta · c-0a3f9 · NG` (Telegram → channel → Invite links). Renaming is paced separately and never slows down link creation. Switch: feature `link_names` (on by default).
- **Person details.** Tapping anyone in Just joined / People shows the click ID, the Telegram invite link name, campaign, country, device and the match keys sent to Meta (fbc, fbp, IP, device). People search accepts a click ID.
- **"Left" fixed.** It counted members who were there before tracking (e.g. "489% of joins"). Now: people who joined in the period and left, plus "+N older members" separately.
- **Gatevoo crypto checkout (USDT + Bitcoin), confirmed automatically.** A "USDT or Bitcoin · Secure crypto checkout by Gatevoo" method is added **switched off**. To switch it on:
  1. In Gatevoo: Apps → Connect an app → name it "Joinvoo". Copy the API key and webhook secret.
  2. Joinvoo Admin → Settings → Payment methods → Gatevoo: paste them (Gatevoo address `https://gatevoo.com`), copy the **Webhook URL** shown (`https://joinvoo.com/webhooks/gatevoo/gatevoo`) into Gatevoo, switch the method on.
  3. Make one real $10 top-up in USDT. Credits arrive after Gatevoo confirms; Joinvoo re-reads the invoice from Gatevoo before crediting, so a forged webhook can't add credits.
- **Custom payment gateways.** Admin → Payment methods → Add → **Custom gateway**: upload a logo, write the text under it, paste a checkout link template (`{amount} {currency} {reference} {email} {return_url}`) or an API create URL, and a webhook secret. The gateway confirms with a signed webhook (shown on the card).
- **VooSquare login matches VooSquare's real setup.** Joinvoo now speaks VooSquare's own OAuth (`/oauth/authorize`, `/oauth/token`, HS256 id_token signed with the client secret). Login stays **Off** until you switch it on, and email + password always keeps working in "Both" mode. See section 6.
- **VooSquare affiliates.** Visitors arriving with `?aff=CODE` (or `joinvoo.com/a/CODE`) are remembered for 90 days and tied to the account at sign-up, for life. Their sign-up and every payment are reported to VooSquare (with `aff_code`, never their email) so VooSquare pays the affiliate. New page **/affiliates** ("Earn up to 50% for life"), linked from the home page. Joinvoo's own Referral program is unchanged and separate.
- **Support bridge with VooSquare.** Optional: customer chats are copied to the VooSquare HQ inbox and replies typed there appear in the customer's Joinvoo chat (and email). VooSquare can also list, read, reply to and solve Joinvoo tickets through `/api/voosquare/support/*`.
- **Product showcase.** A swipeable, animated card row at the very bottom of the Overview: VooSquare Affiliates, Spyvoo, Replyvoo, Castvoo, Vooads, Gatevoo (waitlist). Edit the apps in Admin → Settings → Zedapex apps; "Advoo" is renamed "Vooads" if you never changed its name.
- **Website.** Pricing now shows the channel/bot limits; new /affiliates page; better error messages after a failed VooSquare login.

### Earlier in this release line

- **Joe pay-as-you-go.** Every customer gets free Joe chats each day (5 on Basic, 30 on Pro and the Pro trial; they come back at the customer's midnight). After that, each AI answer is paid from Joinvoo Credits at the real AI cost × your markup (default 4×), never below 3 or above 40 credits, so every paid answer makes money. Answers Joe gives without AI are always free, and nobody is charged for an error.
  - The first time a customer runs out of free chats, Joe asks "Continue with paid answers?" and charges nothing until they tap Continue. Each customer has a monthly Joe budget (default 1,000 credits; they can lower it or set it to 0).
  - **Deep answer ✨** uses a stronger model for a bigger price (Pro only by default).
  - Joe now keeps answers tighter (4 tool rounds, 900 tokens; Deep: 6 rounds, 1,600 tokens) and reads playbook excerpts instead of whole files, which lowers your AI bill.
  - **How to set prices:** Admin → Settings → Joe → **Pricing**. Change the free chats per plan, the markup, the smallest and largest price, the Deep model and price, and the token price table (copy the numbers from your provider's price list). The card shows a live example: what a typical answer costs you, what the customer pays and your margin. Click **Save pricing**.
  - **Joe earnings** (same page) shows answers, revenue, AI cost and margin by day, by model and for the top customers.
  - You can give a customer bonus free chats from their user sheet (Users → a customer → Joe bonus chats).
  - Admins and owners chatting with Joe are never charged. To switch paid answers off, turn off the switch on the Pricing card: everyone then gets the old daily limit for free.
- **Staff accounts and roles.** You can invite support agents, finance people and other admins, each with their own role (Owner, Admin, Finance, Support, Marketing, Viewer or one you create). Every admin action is checked on the server and written to an **Audit log**. The people in `ADMIN_EMAILS` become owners automatically.
- **Tracking link domain.** Ad links can run on `gojoinly.com` instead of joinvoo.com, so a block on a link domain never touches the main site. To switch it on, follow "Tracking link domain" in DEPLOY.md: add the domain in Railway, check `/health`, then Admin → Settings → Link domains. Links already running in ads on joinvoo.com keep working.
- **Zedapex apps.** The single "sister product" card is now a small catalog of our other tools: Replyvoo, Castvoo, Advoo, Affleego and Landvoo (coming soon). Each has its own colours and logo. You edit them in Admin → Settings → Zedapex apps. Your old Replyvoo card settings are carried over.
- **VooSquare, ready but switched off.** When you're ready:
  - customers can log in with one VooSquare account across all Zedapex tools;
  - VooSquare's home screen can show their Joinvoo numbers;
  - Joinvoo can send VooSquare a feed of activity (new subscribers, deposits and so on, never your customers' Telegram users' personal data);
  - referrals can move to VooSquare.

  None of this does anything until you configure it.
- **Joe is now an expert media buyer.**
  - He opens detailed playbooks before giving advice: campaign basics, Telegram funnels, metrics, compliance, and one per vertical (trading, gambling, crypto, nutra, dating, e-commerce, apps, finance, education).
  - You can add your own playbooks in Admin → Settings → Joe → Playbooks, or customise a built-in one.
  - He can run on Anthropic (the default) or any OpenAI-compatible API such as OpenAI or OpenRouter. Pick it in Settings → Joe.
  - Answers are a bit longer and deeper, and the Anthropic instructions are cached, so repeat questions cost less.
  - The daily question limit per customer stays the same.
  - He's friendlier: warm and a little jovial, uses the customer's first name now and then, and sometimes signs off with a word of encouragement. Without an AI key he still answers common questions (Telegram drop-off, RevShare vs CPA, postbacks, refunds) from the playbooks.
  - **How to train him:** see [TRAINING.md](TRAINING.md).
- **Countries, Stripe and Paystack per country, a new mobile admin,** and the inbox and broadcasts from the previous updates, if you hadn't deployed them yet.

Nothing changes for your customers when you deploy. They keep their sessions, balances, links and settings. The new parts only appear when you switch them on.

## 1. Back up first (2 minutes)

Pick one, or do both:

- **Admin → Health → "Download a database backup".** This downloads a consistent copy of the database as one file. Keep it somewhere safe.
- **The volume.** Joinvoo already writes a daily copy to `/data/backups/` (the last 7 are kept). In Railway you can also take a volume snapshot from the service's **Volume** tab, if your plan has it.

If anything goes wrong later, this file is your safety net.

## 2. Deploy

Use the same method you used the first time:

- **GitHub:** push this code to the branch Railway watches (usually `main`). Railway builds and deploys by itself.
- **Railway CLI:** run `railway up` from this folder.
- **Optional helper:** `bash scripts/deploy.sh` runs the tests (if Node is installed), reminds you to take a backup, then runs `railway up`.

Don't change the volume, `DATA_DIR`, `BASE_URL` or `APP_SECRET`. `APP_SECRET` signs sessions; if it lives in `/data/.secret` (the default), it stays as it is, so everyone stays logged in.

Railway starts the new version, waits for it to be healthy, then switches traffic over. Expect a few seconds of overlap at most.

## 3. Database changes are automatic

On start, Joinvoo upgrades its database by itself:

- it **only adds** new tables and columns: staff, roles, audit, voo_outbox, users.voo_id, sessions.via and a few more; this round adds channels.locked / removed_by_user, links.name, users.aff_code / aff_sub / aff_at, tickets.source / voo_ticket, ticket_msgs.source / ext_id / agent_name and the voo_support_out table;
- it never deletes or rewrites your data;
- the small one-time settings changes: the old `sister` card is copied into the `apps` list; Spyvoo and Gatevoo are added to a saved apps list (your edits stay; Advoo is renamed Vooads only if you never renamed it); a Gatevoo payment method is added **switched off**.

It's safe to start the same version twice. Each step checks whether it was already done.

In **Deployments → View logs** you should see the usual `Joinvoo running on https://your-domain` line, plus `settings: sister card moved into the Zedapex apps catalog` the first time (only if you had edited the old card).

## 4. Check it (5 minutes)

1. Open `https://your-domain/health`. It should say `{"ok":true}`.
2. **Log in as an existing user** (your own customer test account, or ask one of your users). The dashboard should look the same and show the same balance and channels.
3. **A tracking link still works.** Open one of your `/c/…` links in a private window: it should open Telegram as before. Back in the dashboard, the click shows up under today.
4. Open `/admin`. You land on the Overview as an **Owner** (see the role chip next to the logo). Have a look at **Team & roles** and the **Audit log**.
5. Optional: Admin → Settings → **Zedapex apps** shows the catalog. If you'd rather not promote anything yet, switch off "Sister product card" in Features.
6. **New this round:**
   - Channels page shows "N of 3 channels · N of 3 bots on Basic" for a Basic customer, and existing customers with more than 3 still have every channel tracking (no amber "not tracking" badge on their old channels).
   - Click a tracking link, join, and open the person in People: you see a click ID like `c-0a3f9`. In Telegram → channel → Invite links, that link is named `Meta · c-0a3f9 · …` within a few seconds.
   - Admin → Settings → Payment methods shows **Gatevoo** (off until you add its keys) and **Custom gateway** in "Add method".
   - `https://joinvoo.com/affiliates` opens the affiliate page.

## 5. If you need to roll back

Railway keeps your earlier builds:

1. Open the service → **Deployments**.
2. Find the previous deployment (the one before this update) → **⋯ → Redeploy**.

The older version simply ignores the new tables and columns, so your data is fine either way. Only restore the backup from step 1 if data itself went wrong. To do that, stop the service, copy the backup over `/data/joinvoo.db` (for example with `railway run` or a temporary shell), then start it again.

## 6. Switching on VooSquare (login, events, affiliates, support)

Nothing here is needed for Joinvoo to work. Do it when VooSquare is live. Full reference: **VOOSQUARE-CONNECT.md**.

1. **In VooSquare:** Admin → Products → Joinvoo. Set:
   - **URL:** `https://joinvoo.com`, **SSO:** on
   - **Redirect URI:** `https://joinvoo.com/auth/voosquare/callback`
   - **Summary URL:** `https://joinvoo.com/api/voosquare/summary`
   - **Support webhook:** `https://joinvoo.com/hooks/voosquare/support`
   - Copy the **client ID**, **client secret** and **API key**.
2. **In Railway** (Joinvoo service → Variables): `VOO_BASE=https://voosquare.com`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_API_KEY`,
   `VOO_SIGNAL_SECRET` (any long random string), optionally `VOO_SUPPORT_BRIDGE=1`. The same fields are in Admin → Settings →
   Integrations & API keys → VooSquare (values saved there win).
3. Tap **Test connection** on that card (or run `node voo-connect/check.js …`, see VOOSQUARE-CONNECT.md). Every check must pass.
4. Set **Login** to **Both**. Login and sign-up pages show "Continue with VooSquare" next to the usual form.
   - **New people** get a Joinvoo account created from their Voo ID (email, name, country).
   - **Existing customers** are linked once: automatically when the email matches and is confirmed on both sides, or from
     Help → Account → "Connect your VooSquare account" while logged in. All their data stays.
   - **Everyone can still use email and password.** If VooSquare is down, the button shows an error and the password form works.
5. **Off switch:** set Login back to **Off**. Linked accounts keep working with their passwords.
6. "VooSquare only" mode makes everyone use VooSquare; owners and staff keep a break-glass login at `/login?local=1`.
7. **Events** of linked customers are sent every 5 seconds. Admin → Health → **VooSquare events** shows waiting, sent and the last
   error; events wait in the database and retry while VooSquare is down.
8. **Refunds and chargebacks:** record them in Admin → Deposits (Paid) so Joinvoo's wallet, the referral program and VooSquare's
   affiliate commissions all stay right. The money itself is returned in the payment provider.
9. **Referrals:** set to **VooSquare** only when the referral program moves there. Joinvoo's Earn page then points to VooSquare and
   existing balances stay withdrawable.


## Tutorial voiceovers added (round 19)
- All 11 voice files are now in `public/media/tutorials/` (t1–t10.mp3 and home.mp3). The dashboard tutorials and the homepage "Watch how it works" video play them automatically. No code changes; just deploy.
- Only new files were added: nothing else changed, and all 1,619 tests pass.
