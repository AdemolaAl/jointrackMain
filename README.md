# Joinvoo

> **New developer? Read [START-HERE.md](START-HERE.md) first.**

Track which Meta or TikTok ad brought every Telegram join (channels, groups and bot subscribers), and send each join to the ad platform.

- One small Node.js server with no dependencies. Data is stored in one SQLite file.
- Homepage at `/`, dashboard at `/app`, demo at `/demo`, customer setup guide at `/guide`, admin panel at `/admin`, `/terms` and `/privacy`.
- Many users can sign up. Each user sees only their own bots, channels and joins.

## Deploy
See **[DEPLOY.md](DEPLOY.md)** for the full step-by-step guide: Railway or a VPS, your domain, payments, emails, the admin panel, and a 15-minute real test before launch. All settings are listed in `.env.example`.

## Using it
Once you sign up, the dashboard's **Connect a channel** guide walks you through:
1. Creating a bot with @BotFather and pasting its token.
2. Tapping **Add to channel**. The channel appears in your dashboard by itself.
3. Pasting your Pixel ID and Conversions API access token, then sending a test event.
4. Copying your tracking link into your Meta ad as the Website URL.

Tip: add `?utm_campaign={{campaign.name}}&utm_content={{ad.name}}` to the tracking link to see which ad brought each person.

## Settings: most things are changed in /admin → Settings
Business settings live in the database and are edited from **/admin → Settings**. Changes apply right away, with no restart:
- **Features**: switch sign-ups, live chat, the referral program, withdrawals, TikTok, Snapchat, deposit tracking (FTD) and “track a bot without its token” on or off. Off means hidden in the website/dashboard **and** refused by the server (e.g. sign-ups off → `/api/signup` 403; FTD off → postbacks 403).
- **Pricing**: plan price, joins included, price per extra join, free joins for new accounts, welcome credit, smallest top-up, Naira rate, referral tiers, hold days and withdrawal minimum. A live calculator shows what a customer with N joins pays.
- **Payment methods**: add, edit, enable/disable, reorder and delete. Paystack and Flutterwave (their secret keys can be saved here, and are masked after saving) and any number of **manual** methods: crypto wallets (USDT, BTC, ETH… with an explorer link) or bank transfer. Manual top-ups use a two-step flow (unique odd-cents amount → customer pastes the TX hash or bank reference → you approve in Deposits).
- **Support team**: names, roles, photos (PNG/JPG/WebP up to 1.5 MB, stored in `DATA_DIR/media/team`), reply time, hours and contact link. Link a member to an admin login email and their face shows on replies they send.
- **Brand & emails**: company name (footers say “By … company”), support email (reply-to on all emails), sender name.

**/admin → Emails** previews every email (desktop, phone, plain text), sends a test to you, and shows what was sent recently. Emails: welcome/confirm, password reset, password changed, payment receipt, top-up under review, top-up rejected, low balance (max once every 3 days), tracking paused (max once a day), free joins 80% used, free joins used up, payout requested/sent/rejected, support reply, and an optional weekly summary (off by default). Every send is written to the `email_log` table.

The environment variables below are only the **starting defaults**; a value saved in /admin wins.

## Server settings (environment variables)
| Variable | Default | What it does |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Your public https address. Required for Telegram. |
| `PORT` | `3000` | Port to listen on. |
| `DATA_DIR` | `./data` | Where the database (and uploaded team photos) live. Must be on persistent storage. |
| `ADMIN_EMAILS` | | The owners: full access to /admin (after confirming their inbox). Invite everyone else from /admin → Team & roles. |
| `RESEND_API_KEY`, `MAIL_FROM` | | Email sending. The sender *address* comes from `MAIL_FROM`; the display name can be changed in /admin. |
| `ALLOW_SIGNUP` | `true` | Default for the sign-ups switch. |
| `POOL_SIZE` | `200` | Single-use invite links kept ready for each channel. |
| `LINK_INTERVAL_MS` | `1500` | Minimum gap between link creations for each bot. |
| `RECYCLE_MIN` | `120` | Minutes before an unused link goes back to the pool. |
| `CLICK_RETENTION_DAYS` | `90` | Clicks that never joined are deleted after this many days. Stats are kept. |
| `GRAPH_VERSION` | `v24.0` | Meta Graph API version. |
| `ANTHROPIC_API_KEY` | | Optional. Lets Joe answer chat questions with AI (also settable in /admin → Settings → Joe). Without it Joe answers from the customer’s numbers and `joe/knowledge.md`. |
| `ANTHROPIC_API_BASE` | `https://api.anthropic.com` | Override for the Anthropic API (tests point it at a fake). |
| `JOE_MODEL`, `JOE_DAILY_LIMIT` | `claude-haiku-4-5-20251001`, `30` | Defaults for Joe’s model and questions per customer per day. |
| `PRO_BASE_CENTS`, `PRO_INCLUDED`, `PRO_PER_CENTS` | `9900`, `5000`, `2` | Defaults for the Pro plan (Basic uses the `PRICE_*` values). |
| `TRIAL_DAYS`, `TRIAL_FTDS`, `TRIAL_STARTS` | `7`, `20`, `first_ftd` | Defaults for the Pro trial (`signup` starts it at sign-up). |

## How it handles heavy traffic
- Invite links are created ahead of time in the background, so a click never waits on Telegram.
- If the ready links run out, the visitor is sent to a backup invite link. They still join; only that join goes untracked.
- If Telegram slows a bot down (rate limit), that bot pauses and retries on its own.
- For very high volume, add a second or third bot to the same channel. Links are then created by all of them.
- Telegram doesn't publish its exact limits for link creation. Before a big campaign, watch the **Ready invite links** meter on the Channels page. If it keeps dropping toward zero, add another bot.
- Events go to Meta in batches of up to 500 and are retried on failure, so a Meta outage doesn't lose joins.
- Stats are pre-counted per hour, so a 1-year report stays fast.

## Pages
- `/` homepage, `/login`, `/signup` (4 steps), `/guide` (customer setup guide), `/terms`, `/privacy`
- `/app` dashboard: Overview, Compare, Campaigns, Conversions (FTD), People, Channels, Wallet (plans), Earn, Joe, My Joomoji, Help & live support chat
- `/blog`, `/blog/<slug>`, `/blog/tag/<tag>`, `/sitemap.xml`, `/rss.xml` (static files from `build.py`, `{{BASE_URL}}` filled in by the server)
- `/admin` admin panel: Overview, Support inbox (agent faces, saved replies, customer details, close/reopen, Sales leads), **Inbox / Broadcast** (send a message to everyone or a group: plan, language, level, recently active; live reach count; optional email; sent/read counts), Users (level, plan, trial, rank, custom pricing, **Add credits** one by one or in bulk), Deposits, Payouts, Emails (preview in every language), Settings (features, pricing, plans & trial, levels, Joe + Test Joe, credits & loyalty, promo codes, payment methods, integrations, support team, brand), Health
- Edit pages in `build/` and run `python3 build/build.py`. The dashboard is built from `src/dashboard/` with `sh src/dashboard/make.sh`.

## Ad platforms
- **Meta** (Conversions API): Pixel/Dataset ID + access token per channel.
- **TikTok** (Events API): pixel code + access token. Saves `ttclid` and the `_ttp` cookie.
- **Snapchat** (Conversions API v3): Snap Pixel ID + token, optional test mode (validation endpoint). Saves `ScCid` and the `_scid` cookie.
- **Google Ads**: not built yet.

## Credits, bonus credits, ranks and promo codes
- The wallet is in **Joinvoo Credits**: 1 credit = $0.01. The ledger already stored cents, so nothing was migrated. Plan = 3,000 credits/month incl. 2,000 joins, extra join = 2 credits.
- **Bonus credits** for big single top-ups (default +5% from $100, +10% from $500, +15% from $1,000, +20% from $5,000), written as `bonus` ledger rows. Bonus credits are spendable but never withdrawable/refundable and earn no referral commission (commission only counts spend covered by real deposits).
- **Ranks** by lifetime paid top-ups: Bronze → Silver ($250) → Gold ($1,000, 5% off joins) → Platinum ($5,000, 10%) → Diamond ($20,000, 15%). Fractions of a credit are carried per month, so a 1.9-credit join costs exactly that over time.
- **Promo codes** (`/admin → Settings → Promo codes`): % bonus and/or flat credits, minimum top-up, max uses, end date, once per customer, optionally featured on the Buy credits page.
- **Custom pricing** per customer (`/admin → Users → a user`): plan, included joins and per-join price; replaces list price and rank discount.
- Bonus tiers and ranks are edited in `/admin → Settings → Credits & loyalty`.

## Affiliate integrations and join-request mode
- `/admin → Settings → Integrations`: postback presets for 1win Partners, Kingfin, Affstore (IQ Option), Pocket Option, Olymp Trade, Binomo, Quotex, Exness, 1xBet, Melbet, Keitaro, Binom and a custom postback. Add/edit/delete programs and upload their logos (stored in `DATA_DIR/media/logos`, served at `/media/logos/<id>.png`). Partner panels are behind logins, so every preset ships as **not verified** (“ask your manager for the exact tags”) until you confirm the tag names and tick *verified*.
- Each template ends with `&net=<program>`, so conversions are credited to that program (`network` on conversions, `events_30d` per program).
- **Join-request mode** (`PATCH /api/channels/:id {join_mode:'request', offer_text, offer_btn, offer_url}`): each click gets its own `creates_join_request` invite link. The bot approves the request at once (`approveChatJoinRequest`), records the join against the click, and DMs the person (`sendMessage` to `user_chat_id`, allowed for 5 minutes) with the offer link where `{tg_id}`/`{click_id}` are filled in. The program then reports deposits with sub1 = the Telegram ID, so deposits match for **channels**, not just bots. Bots must be admins with “Invite users” (approving join requests uses the same right). Webhooks are re-registered once on start to receive `chat_join_request`.

## Analytics added in Phase A
- Conversion events: `lead, reg, ftd, dep, sale, qualified, rejected`. `sale/purchase/order` → sale (Meta Purchase / TikTok CompletePayment / Snap PURCHASE with value); `qualified/cpa/baseline` → Meta custom `Qualified`; `rejected/chargeback/reversed/refund/fraud/declined` marks the matching deposit or sale `rejected=1` (by `txid`, else the person’s latest), subtracts it from revenue and sends nothing.
- `/api/compare/periods` (A vs B, by day/week/month), `/api/compare?group=week|day&periods=N`, `/api/funnel` (clicks → joins → sign-ups → FTD → deposits, A vs B by campaign/ad/source/country/platform/channel), `/api/cohorts` (FTD within 1/7/30 days by join week).
- **Ad spend** (`/api/spend`, CSV import `date,platform,campaign,amount[,currency]`, USD or NGN) → `spend_cents`, cost per join, cost per FTD and ROAS in `/api/breakdown` (campaign and platform) and `/api/stats`.
- **Fake-click filter**: clicks are flagged (never blocked) as `bot_ua`, `datacenter` (a short built-in list of AWS/Google Cloud/Azure/DigitalOcean/OVH/Hetzner IPv4 ranges in `DATACENTER_CIDRS`), `repeat` (4th+ click from one IP on one link in 10 minutes) or `no_js` (POST to `/go` without first loading the landing page). `suspect_clicks` in stats and breakdown.

## Telegram alerts
Set `ALERT_BOT_TOKEN` (a bot you create for Joinvoo itself). Customers link it from their dashboard (`/start <code>`); they get: broken tokens / platforms refusing events, invite links running low, tracking paused, a daily report after 07:00 UTC (clicks, joins, FTDs, revenue, spend, cost per FTD), optional cost-per-FTD spike and live FTD pings. Without the token, `features.alerts` is false and the dashboard shows “Coming soon”.

## Talk to us (enterprise)
`POST /api/sales` (public) creates a Support ticket tagged `sales` (plus a Telegram ping if `SUPPORT_TG_*` is set). See them in `/admin → Support → Sales leads`.

## Deposits / FTD tracking
Each account has a secret postback URL (Dashboard → Conversions): `https://your-site/pb/<key>?sub1={telegram_id}&status=ftd&payout={amount}&currency=USD&txid={id}`.
- Accepts GET or POST, and common names: `sub1/subid/aff_sub/tg_id/user_id`, `status/event/goal`, `payout/value/amount`, `txid/transaction_id`.
- Statuses: `reg`, `lead`, `ftd`, `dep`/`deposit`/`sale`. The first deposit of a person is always the FTD; later ones are repeat deposits; the same `txid` is never counted twice.
- Sent as Purchase (Meta), CompletePayment (TikTok), PURCHASE (Snapchat) with the value; registrations as CompleteRegistration / SIGN_UP. Repeat deposits go to Meta as a custom `Deposit` event.
- Only people who came from an ad are sent to the platforms; organic ones are still recorded. Owners can also mark a person as deposited by hand.

## Wallet and payments
Joinvoo is prepaid. Every change to a balance is one row in the `ledger` table.
- New accounts get their **first `FREE_JOINS` (500) tracked joins free** once they confirm their email (straight away if email isn't set up). No plan fee is charged while free joins last; after that the $30 plan starts on the next ad click. One gift per inbox (Gmail dots/+aliases count as the same inbox). `WELCOME_CREDIT_CENTS` can add extra wallet credit (default 0).
- The **$30 monthly plan** is charged on the first ad click of each month. It includes 2,000 tracked joins. Each tracked join after that costs **2¢**. Organic joins are free.
- When the wallet can’t cover it, **tracking pauses**: visitors still reach Telegram, but nothing is tracked or sent until the customer tops up. The dashboard shows a banner.
- Top-ups: each payment method (/admin → Settings → Payment methods) has a type (Stripe, Paystack, manual, crypto), a country rule (global / only / all except), a currency + rate, optional fee and limits, and its own keys. Customers only see methods for their country (`GET /api/billing/methods`) and start one with `POST /api/billing/topup {method_id, usd}` → `{redirect_url}`. Stripe and Paystack confirm themselves (signed webhook per method, plus a check when the customer returns). Manual and crypto methods wait in **/admin → Deposits** for you to approve.
- Country: every account has one (picked at sign-up, pre-filled from `GET /api/geo`; list at `GET /api/countries`). Customers can change it once every 30 days (`PATCH /api/me {country}`); admins can override it in the user sheet.
- The prices above are the defaults; change them in /admin → Settings → Pricing.
- Owners and admins (`ADMIN_EMAILS` and staff with the Owner or Admin role) track for free; other staff roles pay like customers. Set `BILLING=off` to turn billing off for everyone.

## Referrals
- Every account gets a link like `https://your-site/r/abc123`.
- Referrers earn **10%** of what their referrals spend (plan + joins), then **20%** at 3+ paying referrals and **30%** at 10+.
- Commission is only paid on spend covered by real money, never on welcome or admin credit, and settles for `REF_HOLD_DAYS` (14) before it can be withdrawn.
- Earnings can be moved into the wallet, or withdrawn in USDT (TRC20) or BTC from $300. You send withdrawals and mark them paid in **/admin → Payouts**.

## What gets sent to Meta
When a tracked person joins, Joinvoo sends one event (Subscribe by default) with:
- `fbc`, from the ad click ID
- `fbp`, the pixel browser ID
- client IP and user agent
- a hashed Telegram ID as `external_id`
- a hashed country, when Cloudflare provides it

Each event also carries a fixed `event_id` per person and channel, so Meta counts the same person only once.

## Files
- `server.js`: the whole backend (API, Telegram webhooks, link pool, Meta/TikTok/Snapchat sender, billing, plans, Joe, admin, emails, backups). See **[ARCHITECTURE.md](ARCHITECTURE.md)**.
- `scripts/deploy.sh`: optional deploy helper (tests, backup reminder, `railway up`).
- `joe/knowledge.md`: what Joe knows about Joinvoo (edit freely; extra notes can also be added in /admin → Settings → Joe).
- `public/i18n/`: translations (`web.*` website, `app.*` dashboard, `server.*` emails and Telegram messages) in English, Russian, French, Portuguese and Spanish.
- `src/dashboard/`: the dashboard source parts and `make.sh`.
- `tests/`: end-to-end tests. Run `bash tests/runall.sh` (or `npm test`).
- `public/`: the pages the server serves. They are generated from `build/` by `python3 build/build.py`, except `public/app.html` (the dashboard), which is edited directly.
- `build/`: page sources: homepages, sign-up, guide, admin, and legal texts in `build/legal/`.
- `dist/`: a static demo of every page with sample data.
- `scripts/backup.js`, `deploy/`, `Dockerfile`, `railway.json`, `.env.example`: hosting.

## Plans and the Pro trial
- **Basic** (the Pricing page values) and **Pro** (default 9,900 credits/month, 5,000 joins included), edited in /admin → Settings → Plans & trial. Both are paid from credits on the first ad click of the month.
- Upgrading charges the prorated difference at once; switching back to Basic happens on the 1st of next month.
- Pro shows which campaigns, ad sets and ads drove each deposit, with revenue, ROAS and cost per FTD. Every Basic account gets one **Pro trial**: 7 days or 20 attributed FTDs, whichever comes first, starting at the first tracked deposit. One trial per account, Meta pixel and ad account.
- After the trial, deposits are **still matched and sent** to Meta, TikTok and Snapchat; the dashboard shows how many there were and locks which ads drove them.
- Admins can give Pro without charging, or reset a customer’s trial, from Users.

## Levels
Rookie (0) → Hustler (1,000) → Operator (5,000) → Shark (25,000) → Whale (100,000) → Kraken (300,000) → Legend (1,000,000) leads in the rolling last 30 days (ad joins + bot Starts; filtered fake joins don’t count). Recomputed hourly; going up sends a `level_up` email and Joe congratulates them; going down is silent. Edit the ladder in /admin → Settings → Levels.

## Joe, the assistant
Joe gives every customer insights from their own numbers (always on, no AI needed) and a chat. With `ANTHROPIC_API_KEY` (or a key saved in /admin → Settings → Joe) the chat uses the Anthropic Messages API with read-only tools over that customer’s data. Without a key it answers from their numbers and `joe/knowledge.md`. Free Joe chats every day per plan, then pay-as-you-go: each AI answer is priced from its real token cost × your markup and paid in credits (Settings → Joe → Pricing, with a Joe earnings report); “Test Joe” console in admin. Joe never invents numbers. See [TRAINING.md](TRAINING.md).

## Fake joins, smart links, alerts
- Joins that look fake (bursts, deleted accounts, repeat users within 7 days, joins from bot or data-centre clicks) are recorded but **not sent** to the ad platforms and not charged. See them in People → Filtered.
- **Backup channel**: point a channel’s tracking link at another channel (`redirect_to`) and the ads keep working without edits.
- Telegram alerts add: no joins for 2 hours on a channel that usually has them, a campaign with FTDs yesterday and none by 18:00 local, and a morning summary at 08:00 in the customer’s time zone.

## Languages
Website, dashboard, emails and Telegram messages come in English, Русский, Français, Português and Español. Emails follow the customer’s language. Legal documents are provided in English.

## In-app inbox and broadcasts
Every customer has an inbox in the dashboard (the bell). Everything Joinvoo tells them by email also lands there in their language: top-ups, credits added, low balance, free joins, the Pro trial, plan changes, levels, payouts, support replies, paused tracking. Alerts (refused events, no joins for 2 hours, a campaign without deposits today, fake joins filtered) and a daily tip from Joe land there too, even without Telegram. Important ones pop up once at the next visit.
Customers choose which kinds also come by email (Updates, Account, Alerts, Joe); password and sign-up emails always go out.
Send news from **/admin → Inbox / Broadcast**: title, short message (**bold** and links), optional image, a button to a dashboard page or any link, important, also email, and who gets it, with a live count before you send. New blog posts from the last 7 days show up in everyone’s inbox automatically, and the dashboard reads the blog through `GET /api/blog` and `GET /api/blog/:slug`.

## Sister product card
The dashboard can show a small card about a sister Zedapex product (Replyvoo by default). Edit it in **/admin → Settings → Sister products**: name, link, tagline, optional promo code and UTM tags (`utm_source=joinvoo&utm_medium=dashboard&utm_campaign=sister`), with a live preview and a click counter. It reaches the dashboard as `sister:{enabled, name, url, tagline, promo_code}` on `GET /api/config` and `GET /api/me` (`{enabled:false}` when hidden). Button clicks go to `POST /api/sister/click`. The **Sister product card** feature switch (`features.sister_promo`) hides it for everyone.

## Staff, roles and the audit log
The admin panel has roles: **Owner** (`ADMIN_EMAILS`, everything), **Admin** (everything except owners), **Finance**, **Support**, **Marketing**, **Viewer**, plus custom roles owners create. Permissions are granular (`overview.view`, `users.view`, `users.edit`, `users.credits`, `users.plan`, `users.reset`, `support.view`, `support.reply`, `deposits.view`, `deposits.approve`, `payouts.view`, `payouts.send`, `payments.manage`, `promos.manage`, `broadcasts.view`, `broadcasts.send`, `marketing.manage`, `emails.view`, `settings.view`, `settings.edit`, `keys.manage`, `health.view`, `jobs.run`, `backup.download`, `staff.manage`, `audit.view`) and each person can get single extra or removed permissions. Every `/api/admin/*` call is checked on the server (403 with a plain message), and every change is written to the audit log (who, action, target, before → after, time, IP). Invite people from **/admin → Team & roles** (`POST /api/admin/staff`); see DEPLOY.md → “Your team”.

## VooSquare and the Zedapex apps
- **Zedapex apps**: /admin → Settings → Zedapex apps edits the catalog customers see (order, colours, logo, headline, tagline, offer, badge, live/soon, on/off, clicks). `GET /api/config` returns `apps` (enabled, without Joinvoo and the VooSquare hub; links carry `utm_source=joinvoo&utm_medium=dashboard&utm_campaign=apps&utm_content=<where>`) and still returns the old `sister` (= Replyvoo) for older dashboards. `POST /api/apps/click {id, where}` counts a click and returns the link. The Features switch “Sister product card” hides all of it.
- **VooSquare** (off by default, Voo Connect kit in `./voo-connect`): "Continue with VooSquare" login (`/auth/voosquare`, modes off/both/only; existing accounts keep their password and are linked by confirmed email or from Help → Account), the affiliate hand-off (`ref`/`vclick`/`coupon` → `prompt=signup`), money events (top-ups = `wallet_topup`, credits used = `spend`, plan events, refunds and chargebacks), logout everywhere, the summary API and the support bridge. Set it up with `VOO_BASE`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_API_KEY`, `VOO_SIGNAL_SECRET` or in /admin → Settings → Integrations & API keys → VooSquare. See VOOSQUARE-CONNECT.md; **upgrading a live install: read UPGRADE.md.**

## Joe's playbooks and AI providers
**How to teach Joe (knowledge, playbooks, personality, testing, models): see [TRAINING.md](TRAINING.md).**
- Joe is a senior media buyer for Meta, TikTok and Snapchat. Before vertical-specific advice he opens a **playbook** with the tools `list_playbooks` / `read_playbook` (up to about 40,000 characters each). He combines it with the customer's own numbers from the data tools, follows ad-platform policies (no cloaking, ban evasion, fake proof or misleading claims) and never invents numbers.
- **Built-in playbooks** live in `joe/playbooks/*.md`, listed in `joe/playbooks/INDEX.md` (“- file.md: when to use it”). The Docker image copies the whole `joe/` folder. **Custom playbooks** (name, “use when”, up to 60,000 characters) are added in /admin → Settings → Joe → Playbooks; one with the same name as a built-in playbook replaces it.
- **Providers:** `joe.provider` = `anthropic` (default; model `claude-haiku-4-5-20251001`, or e.g. `claude-sonnet-4-5`) or `openai` (any OpenAI-compatible Chat Completions API with tool calling: `joe.openai_base`, `joe.openai_key`, `joe.openai_model`; env `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `JOE_OPENAI_MODEL`). Up to 6 tool rounds and 1,200 output tokens per answer; the Anthropic system prompt's static block is cached (`cache_control: ephemeral`). Any error falls back to the rule-based answers. The per-customer daily limit is unchanged.
- **Personality:** friendly, warm and jovial but expert; uses the customer's first name now and then (never the email), the odd emoji and a varied sign-off (Settings → Joe → Personality, with a Reset to default). Without an AI key, common questions (Telegram drop-off, RevShare vs CPA, postbacks, the founder, refunds) are answered from the best-matching playbook section.
