# Joinvoo architecture

Joinvoo (by Zedapex) tracks which Meta, TikTok or Snapchat ad brought every Telegram join, bot Start and deposit, and sends each one back to the ad platform.
This page is the map for the next engineer: what lives where, how data flows, and how to build and test.

## Shape of the system

```
browser ──► /c/<slug> (click page) ──► /c/<slug>/go ──► invite link / t.me/bot?start=…
                                                           │
Telegram ──► /tg/<bot id> (webhook per bot) ──► joins ──► capi_queue ──► Meta / TikTok / Snapchat
affiliate program ──► /pb/<key> (postback) ──► conversions ──► capi_queue
customer's own bot ──► /hook/<key>/start|blocked
dashboard (/app), admin (/admin), website, blog ──► server.js (JSON API + static files)
```

- **One process, no dependencies.** `server.js` (Node 22, `node:sqlite`, `node:http`, global `fetch`). One SQLite file in `DATA_DIR`. Run one replica only.
- **Pages.** `public/` is served by the server. `build/*.html` + `build/build.py` generate the website pages and the admin (`public/*.html`) and a static demo (`dist/`). The dashboard is `public/app.html`, assembled from `src/dashboard/p*.html` by `src/dashboard/make.sh`.
- **Shared front-end files.** `public/joomoji.js` (avatar renderer, used by website and dashboard), `public/i18n/{web,app,server}.<lang>.json`.

## server.js, top to bottom

| Section | What it does |
|---|---|
| config, database | env vars, `CREATE TABLE`, then an idempotent list of `ALTER TABLE` migrations run at every start |
| settings | `SETTING_DEFS` (default from env + validator) → `setting(key)` (cached) → `C.*` getters. Admin saves go through `setSetting`. Env vars are only defaults |
| integrations, loyalty | affiliate postback presets; ranks by lifetime top-ups; `priceFor(uid)` (plan → custom deal → rank discount) |
| plans + trial | `plansDef()` (Basic = the Pricing page values, Pro in setting `plans`), `userPlan`, `trialInfo`, `startTrial`, `checkTrial`, `isLocked`, `changePlan` |
| money | `addLedger` (every balance change is one `ledger` row, idempotent by `ref`), `trackingState`, `allowTracking` (monthly plan fee on the first ad click), `chargeJoin`, `chargeFtd`, `payCommission` |
| email | Resend `sendMail`; `renderMail` (one table layout + optional header art); `EMAILS` templates (all text from `public/i18n/server.<lang>.json` via `tr()`); `sendTemplate`, `notifyUser` |
| channel/bot wiring | `attachBot`, `recomputeChannel`, link pool (`fillPools`), ad-platform queue (`sendCapi`, `postMeta/TikTok/Snap`, event builders) |
| telegram webhook | `onUpdate` → `onBotUpdate` (bot Starts), `chat_member` joins, `onJoinRequest` (request-to-join mode); all joins go through `recordJoin` (fraud filter, send, count, charge) |
| conversions | `recordConversion` (postback or manual: reg, ftd, dep, sale, qualified, rejected), `onPostback` |
| click page | `clickPage` (pixels + redirect), `onClick` (records click, hands out an invite link), fake-click flags |
| reports | `stats`, `breakdown` (campaign, adset, ad, lang, source, country, platform, channel), `comparePeriods`, `compareInsights`, `compareCampaigns`, `compare` (months), `funnel`, `cohorts`, `joinsQuery`, `conversionsView` |
| profile, levels, Joe | `profileChanges`, `meView`, `levelView`/`updateLevel`, `giveCredits`, Joe (`joeInsights`, `joeRules`, `joeAi`, tools) |
| `api()` | every `/api/*` route for customers; `adminApi()` for `/api/admin/*` |
| alerts | Joinvoo's own Telegram bot (`ALERT_BOT_TOKEN`): link, prefs, `alertJobs` (hourly) |
| router | `http.createServer`: health, payment webhooks, `/verify`, `/pb`, `/tg`, `/hook`, `/c`, `/api`, pages, static files (`sendStatic` with ETag), blog |
| background jobs | link pool every 400 ms, ad-platform sender every 2 s, link expiry, housekeeping, bot health (10 min), trials + "Meet Joe" (10 min), levels + alerts + daily inbox notes + new blog posts + weekly summary (hourly), daily backup |

## Data model (main tables)

| Table | Purpose |
|---|---|
| `users` | account, `voo_id` (VooSquare subject, unique) + `referred_by_voo`, `country` (ISO code) + `country_changed_at` + `country_history` JSON, `balance_cents` (credits; 1 credit = $0.01, cached sum of `ledger`), `free_joins`, `plan`/`plan_pending`, trial columns, profile (`nickname, gender, avatar` JSON, `lang, tz, ad_account_id`), level (`level_id, level_since, level_peak, level_cycle, leads_30d, show_level`), alerts |
| `ledger` | every balance change: `deposit, bonus, gift, welcome, refcredit, adjust, plan, joins, ftds`. `ref` makes each row idempotent |
| `bots`, `channels`, `channel_bots`, `links` | Telegram bots, tracked chats (channel/group/bot), which bot is admin where, the pool of single-use (or join-request) invite links. `channels.redirect_to` = smart link to a backup channel |
| `clicks` | one row per ad click: IP, UA, fbclid/fbc/fbp, ttclid, ScCid, UTM params (JSON), `suspect` + reason |
| `joins` | one row per join/Start: who, which click (null = organic), language, platform statuses, `suspect` + `suspect_reason` |
| `hourly` | pre-counted stats per channel and hour (clicks, joins, organic, leaves, sent/failed per platform, suspect clicks, filtered joins) |
| `conversions` | postbacks and manual marks, matched to a join; per-platform send status; `rejected`, `network` |
| `capi_queue` | outgoing events with retries |
| `spend` | ad spend per day / platform / campaign |
| `deposits`, `payouts`, `ref_earnings`, `promos` | billing, referrals, promo codes. `deposits.gateway_ref` = Stripe session id / Paystack access code |
| `pay_methods` | admin-managed payment methods: `type` (paystack, stripe, manual, crypto_manual, flutterwave), `countries` JSON `{mode: global\|only\|except, list}`, `logo` (built-in id or `/media/paylogos/…`), `currency`, `fx_rate`, `min_usd`, `max_usd`, `fee_pct`, `config` JSON (secret_key, public_key, webhook_secret, network, address, fields). Secrets never leave the server unmasked |
| `tickets`, `ticket_msgs` | live support chat |
| `settings` | admin-edited settings (JSON per key) |
| `email_log` | every email and Telegram alert sent (also used for once-only / throttling) |
| `joe_msgs`, `joe_usage`, `user_notes` | Joe chat history, daily question count, notes Joe shows (e.g. level-ups) |
| `joe_answers` | one row per AI call: user, local `day`, provider, model, rounds, tokens (input, cache write, cache read, output), `cost_micros` (US$ × 10⁶), `credits` charged, `kind` (free, paid, test, error), `deep`, `guard` (cut short). Users also have `joe_autopay`, `joe_monthly_cap`, `joe_bonus` |
| `inbox` | one row per notice in a user’s in-app inbox: `kind` (update, account, alert, joe), title, short markdown body, image, button, `important`, `read_at`, `broadcast_id`, `tag` (makes a notice once-only) |
| `broadcasts` | admin messages: content, `audience` JSON, `also_email`, sent count (read count comes from `inbox`) |
| `staff` | who is on the admin team: `role`, per-person `grants`/`revokes` (JSON lists of permission keys), `status` (invited, active, suspended), `invited_by`, `last_active` |
| `roles` | built-in roles (owner, admin, finance, support, marketing, viewer; editable) and custom ones: `perms` JSON |
| `audit` | one row per admin change: `actor_email`, `action` (e.g. `users.credits`), `area`, `target`, `summary` JSON (before/after, secrets masked), `ip`, `at` |
| `voo_outbox` | events for VooSquare: stable `event_id` (e.g. `jv_join_<id>`), JSON `body`, `attempts`, `next_at`, `sent_at`, `last_error`, `failed` (gave up after 24 h) |
| `trial_keys` | pixel IDs and ad account IDs that already had a Pro trial |

## Request flows

### Click → invite → join → Conversions API
1. The ad's website URL is `BASE_URL/c/<slug>?utm_campaign=…&utm_term=…&utm_content=…`. If the channel has `redirect_to`, the backup channel is served instead (its pixels, links and counts).
2. The click page loads the pixels, waits briefly for `_fbp`/`_ttp`/`_scid` cookies and POSTs to `/c/<slug>/go`.
3. `onClick`: `allowTracking` (charges the month's plan on the first click; if the wallet can't pay, the visitor gets the backup link untracked), `recordClick` (flags bot UAs, data centres, repeats, no-JS), then hands out a pool link assigned to that click (bots: `t.me/<bot>?start=<signed click id>`).
4. Telegram sends `chat_member` (or `chat_join_request` in request mode, or `/start` for bots) to `/tg/<bot id>`. The invite link (or start code) identifies the click.
5. `recordJoin`: fraud check (`burst`, `deleted_account`, `repeat_user`, `fake_click`). Suspect joins are stored with status `filtered`, never sent or charged. Real ones are queued for each connected platform, counted in `hourly`, and charged (`chargeJoin`).
6. `sendCapi` posts batches (≤500) to Meta/TikTok/Snapchat with retries and per-event fallbacks.

### Postback → FTD
1. The affiliate program calls `/pb/<key>?sub1=<telegram id>&status=ftd&payout=…&txid=…` (aliases accepted).
2. `recordConversion` finds the person's join (ad-attributed, non-filtered first), dedupes by `txid`, turns a first deposit into `ftd` and later ones into `dep`, and queues Purchase/CompletePayment/PURCHASE with the value. `rejected` reverses revenue and sends nothing.
3. For attributed FTDs: `chargeFtd` (plan per-FTD fee, default 0) and `checkTrial` (starts the Pro trial at the first one; ends it at the FTD limit or after the days).

## Billing, plans and the Pro trial
- Prepaid **credits** (1 credit = 1 cent of the ledger). Top-ups via Paystack, Flutterwave or manual methods (crypto, bank) approved in /admin. Bonus tiers, promo codes, ranks, custom deals.
- **Plans** (`plans` setting + Pricing page): Basic and Pro, each `base_cents, included, per_join_cents, per_ftd_cents`. The plan fee is charged on the first ad click of the month. `POST /api/billing/plan {plan:'pro'}` charges the prorated difference now (`planup:` ledger ref) and that month's fee is then the Basic one; `{plan:'basic'}` books the switch for the 1st of next month (`userPlan` applies it).
- **Trial** (`trial.days`, `trial.ftd_limit`, `trial.starts`): one per account and per pixel/ad account (`trial_keys`). After it ends on Basic the account is **locked**: postbacks are still matched and sent to the ad platforms, but `/api/conversions` returns `{locked, locked_count, rows:[]}`, stats keep the FTD count with `ftd_locked`, and breakdown/compare rows null FTD money (`locked:true`). Admins and `BILLING=off` see everything.
- **Admin credits**: `POST /api/admin/users/:id/credits` and `/api/admin/credits/bulk`. Positive amounts are `gift` ledger rows (spendable, never withdrawable, no referral commission: commission only counts spend covered by `deposit` rows); negative ones are `adjust`.
- **Levels** (`levels` setting): leads = ad-attributed joins + bot Starts in the last 30 days (filtered joins excluded), recomputed hourly by `levelJobs`. Going above the highest level of the current 30-day cycle sends `level_up` and a Joe note; going down is silent.

## Joe
- `GET /api/joe/insights`: rule-based, always available (no key needed). Built only from the user's data: setup, paused tracking, refused events, broken bots/rights, no joins for 2 h, low invite links, low credits, joins today, cost per FTD vs yesterday, best/weakest campaign, trial progress or lock, filtered fake joins, spend missing, close to the next level, plus recent notes.
- `GET/POST/DELETE /api/joe/chat`: daily limit `joe.daily_limit` (counted per user's local day). With a key (`ANTHROPIC_API_KEY` or admin setting `joe.api_key`) and `joe.ai` on, `joeAi` calls the Anthropic Messages API with `fetch` (`x-api-key`, `anthropic-version: 2023-06-01`, model `joe.model`, base `ANTHROPIC_API_BASE`). The system prompt is the persona + admin persona tweak + user context + `joe/knowledge.md` + admin extra knowledge. Tools (`get_stats, get_breakdown, compare_periods, channels_health, billing_summary, conversions_summary`) call the same functions as the dashboard with the asking user only, and respect the Pro lock. Any AI error falls back to the rules.
- Without a key, `joeRules` answers the common questions from the user's numbers and searches `joe/knowledge.md` sections for the rest. It never makes numbers up.
- Admin: Settings → Joe (on/off, AI on/off, model, daily limit, masked key, persona, extra knowledge) and a Test Joe console (`POST /api/admin/joe/test`, answers as any user, nothing saved).

- **Playbooks.** `builtinPlaybooks()` reads `JOE_PLAYBOOKS_DIR` (default `joe/playbooks`): entries from `INDEX.md` lines `- file.md: use when`, plus any other `.md` (re-read every 30 s; a missing folder means none). Custom playbooks are the `joe.playbooks` setting (validated list; managed through `/api/admin/joe/playbooks`, audited) and override built-in ones with the same name (`allPlaybooks()`, `readPlaybook()` caps text at 40k; answers get the 12k excerpt). The tools `list_playbooks` and `read_playbook` are offered only when at least one playbook exists.
- **Personality and rule routing.** `joe.persona` (default `JOE_PERSONA_DEFAULT`: tone, first name about one reply in three, sample sign-offs) is added to the static prompt; the hard rules stay in `joeSystemParts()`. The user context gives `firstName()` (nickname or first word of the name, never the email). Without AI, `joeRoute()` sends drop-off / RevShare-CPA / postback / founder / refund questions to the best-scoring playbook section (`pbSections()`: ##/### headings and bold FAQ questions) trimmed to ~1,200 characters; `withName()` adds the first name to about one rule reply in three. See TRAINING.md.
- **Cost control.** `read_playbook` returns at most ~12k characters (`playbookForAnswer()`: the head plus the sections that best match the question, with an "ask for one by name" hint), at most 2 reads per answer; 4 rounds / 900 tokens (Deep 6 / 1,600); last 12 messages of history.
- **Pay-as-you-go.** Settings `joe.billing` (free per plan, markup, min/max, Deep model/markup/min, `deep_for`, `show_cost`, default monthly cap) and `joe.prices` ($ per million tokens). `normUsage()` reads usage from both providers (OpenAI: `prompt_tokens` minus `cached_tokens` as input, cached as cache read); `joePrice()` matches the model exactly, then by prefix, then `openai-default`, else the dearest price. `POST /api/joe/chat`: free while free chats or bonus remain (always for admins); otherwise checks Deep allowed → monthly cap → autopay (`needs_confirm`, no AI call) → balance ≥ min(max_credits, cap left), then calls the AI with a budget of that price; the margin guard ends the tool loop early (Anthropic `tool_choice: none`, 450 tokens) when `(cost + 2 × last round) × 1.2` would exceed it. Charge = min(budget, clamp(ceil(cost × markup × 100))) written in one transaction with the `joe_answers` row and a ledger entry (kind `joe`, ref `joe:<id>`). Errors are recorded and never charged. Out-of-free, out-of-balance, cap and Deep notes are rule text (`joeBillNote()`) with action buttons. Reports: `GET /api/admin/joe/usage` (overview.view or audit.view); bonus chats `POST /api/admin/users/:id/joe-bonus` (users.credits).
- **Providers.** `joeAi()` runs the same tool loop (max 4 rounds, 900 tokens; Deep 6 / 1,600) for Anthropic (`/v1/messages`, system = `[{static text, cache_control: ephemeral}, {user context}]`) or an OpenAI-compatible API (`{base}/chat/completions`, tools as `{type:'function', function:{name, description, parameters}}`, assistant `tool_calls` answered with `role:'tool'` messages). `joeAnswer()` falls back to `joeRules()` on any error.

## i18n
- Languages: en, ru, fr, pt, es. Files: `public/i18n/web.*` (website), `app.*` (dashboard), `server.*` (emails, Telegram bot and alert messages). English is the source; a missing key falls back to English.
- Server side: `tr(lang, key, vars)`; emails use the user's `lang` (`users.lang`, set at sign-up or `PATCH /api/me`). Files are re-read when they change. Legal pages stay in English.
- Static: `/i18n/<file>.json` and `/joomoji.js` are served with an ETag (304s), cached 1 day + stale-while-revalidate; with `?v=` they are cached for a year.

## Inbox and broadcasts
- **Every user-facing email also lands in the inbox**, in the user’s language: `sendTemplate` builds the email blocks once, and `inboxFromMail` stores the title, the lead (+ the reason box) as short markdown, the button (email links like `/app#billing` become `#tab:wallet`) and the header art as a thumbnail. `EMAIL_KIND` sets the tab; `trial_ended` is marked important.
- **Email copies follow `notify_prefs`** (`users.notify_prefs`, per kind `{email:bool}`, `PATCH /api/me {notify_prefs}`). When a kind is off, the email is not sent but is still written to `email_log` with `ok=2` (“Inbox only”), so once/throttle rules keep working. Security emails (welcome, password reset, password changed) always go out and never go to the inbox.
- **Alerts** (`alertUser`): refused events, no joins for 2 hours and a campaign without FTDs by 18:00 go to the inbox whether or not Telegram is connected (Telegram still needs the bot, the prefs and `features.alerts`). `inboxDailyJobs` (hourly, once per user’s local day after 09:00): Joe’s tip (his top insight) and yesterday’s filtered fake joins.
- **API**: `GET /api/inbox?kind=&before=` (30 per page, `unread` per kind, `more`), `POST /api/inbox/read {ids}|{all, kind?}`, `DELETE /api/inbox/:id`, `GET /api/inbox/popup` (oldest unread important item, or `null`). `/api/me` has `inbox_unread` and `notify_prefs`.
- **Broadcasts** (`/admin → Inbox / Broadcast`): `POST /api/admin/broadcasts/preview` counts the audience (plan all/basic/pro/trial, language, level, active in the last N days, picked user ids), `POST /api/admin/broadcasts` fans out one inbox row per user (kind `update`) and, with `also_email`, the `broadcast` email a few at a time (skipping people with update emails off). `GET` lists them with sent/read/emailed counts; `DELETE` removes the copies nobody has read yet. Images upload to `DATA_DIR/media/broadcast` and are served at `/media/broadcast/*`.

## Blog inside the dashboard (Learn)
`GET /api/blog` reads `public/blog/posts.json` (cached, reloaded when the file changes; empty list when it’s missing or broken). `GET /api/blog/:slug` returns the post’s meta, `html` from `public/blog/_body/<slug>.html` (leading comment stripped, `{{BASE_URL}}` filled in) and up to 3 related posts. `blogJobs` (startup + hourly) announces every post it hasn’t seen before and that is dated within the last 7 days as an inbox note for all users (no email); seen slugs are kept in the `blog.seen` setting. `BLOG_DIR` overrides the folder (tests use it).

## Emails
Templates live in `EMAILS` (server.js), text in `server.<lang>.json`. Each gets a 600×260 header image from `public/media/email/<art>.gif|png` when the file exists (the art map is `EMAIL_ART`; `level_up` falls back to `rank_up` art, `credits_added` to `payment`). Without the file there is no image row, so nothing breaks. Preview any template in any language at `/admin → Emails`.

## Blog
`build/build.py` (website engineer) writes `public/blog/index.html`, `<slug>.html`, `tag-<tag>.html`, `public/sitemap.xml`, `public/rss.xml` with a literal `{{BASE_URL}}`. The server serves `/blog`, `/blog/<slug>`, `/blog/tag/<tag>`, `/sitemap.xml`, `/rss.xml` (placeholder filled in at serve time, ETag), covers at `/media/blog/*`, and a clean 404 page when a file doesn't exist. `robots.txt` allows `/blog` and lists the sitemap.

## Countries and payments
- `public/countries.json` (250 ISO codes with names and flag emoji) is the one list: the server validates against it and serves it at `/api/countries`; the website and admin use it for pickers.
- `GET /api/geo` guesses a country for the sign-up form: `CF-IPCountry` when `TRUST_CLOUDFLARE` is on, else the Accept-Language region, else null.
- `payMethods(all, country)` filters enabled + configured methods by the country rule (no country → only global ones). Customers get `pmPublic()` (no secrets); the admin gets `adminPm()` with masked config and the webhook URL.
- `POST /api/billing/topup` → `gatewayStart()`: Paystack `/transaction/initialize` (amount = usd × (1 + fee) × fx × 100) or a Stripe Checkout Session (form-encoded). Both return to `BASE_URL/app#credits?paid=<ref>`.
- Webhooks `/webhooks/paystack/:method_id` (HMAC-SHA512 of the raw body with the method’s secret key) and `/webhooks/stripe/:method_id` (`Stripe-Signature` t/v1, HMAC-SHA256 of `t.raw` with the signing secret, 5-minute tolerance) call `gatewayPaid()`, which checks amount and currency and credits once through `markDepositPaid()`. `verifyDeposit()` does the same on return (Paystack verify / Stripe session retrieve).
- `PAYSTACK_API_BASE` / `STRIPE_API_BASE` point the calls at a fake server in tests (`tests/e2e-round8.js` runs one on :4300).
- Keys for Anthropic and Resend can be saved in /admin (`joe.api_key`, `email.resend_key` settings) and win over the env vars.

## Staff and permissions
- `staffOf(user)` (cached 30 s, cleared on any team change) returns the role and the effective permission set: role permissions + grants − revokes; owners always get all. `ADMIN_EMAILS` users are made owners on their first request and can't be changed from the UI. Staff need a confirmed inbox.
- The `/api/admin/*` dispatcher looks up the permission in `ADMIN_ROUTES` (unknown routes need `settings.edit`) and refuses with 403 + `need` before `adminApi()` runs. `PUT /api/admin/settings` also checks each group (`keys`/`links` → `keys.manage`, `payments` → `payments.manage`, `sister` and Joe's persona/knowledge → `marketing.manage`, the rest → `settings.edit`).
- `staffGuard()`: only owners change owners or hand out the owner role; nobody grants permissions they don't have; nobody changes their own access; there is always one owner.
- After every successful non-GET admin call, `auditAuto()` writes an audit row from the path and the (masked) request body unless the handler already wrote a richer one with `audit()` (settings diff, staff role changes, invites, assignment).
- Invites reuse the password-reset table with a 7-day token; the `staff_invite` email links to `/app?reset=…&next=admin`. TODO: optional 2FA for staff.
- The admin page loads `GET /api/admin/whoami` first (role, permissions, badges), hides tabs and settings sections the role can't use, and locks view-only sections.

## VooSquare and the apps catalog
- **Login (OIDC, zero dependencies).** `/auth/voosquare` reads discovery (`${issuer}/.well-known/openid-configuration`, cached 1 h), makes a PKCE S256 verifier, `state` and `nonce`, keeps them in a 10-minute HMAC-signed HttpOnly cookie (`jv_oidc`, path `/auth/voosquare`) and redirects. The callback checks `state`, exchanges the code (client_secret_post or basic, from discovery), and verifies the ID token itself: RS256/ES256 with the JWKS key (`crypto.createPublicKey({format:'jwk'})`, refetched once for an unknown `kid`), `iss`, `aud`/`azp`, `exp`, `iat`, `nonce`. Users are found by `voo_id`; otherwise an existing account with the same email is linked once (both sides verified, audit row + inbox note), otherwise a new user is created from the claims (`country`, `voo_ref` → `referred_by_voo`, email verified). The session row gets `via='voosquare'` and the ID token for `id_token_hint` at logout (`POST /api/logout` returns `logout_url`; `GET /logout` redirects). `return_to` only accepts same-site paths. Mode `only` refuses password login/sign-up for non-staff.
- **Summary API.** `GET /api/voosquare/summary` (Bearer `voo.service_key`, constant-time) answers from `hourly` (joins, filtered), `conversions` (FTDs, revenue) and `spend` with `change_pct` against the previous equal period.
- **Events.** `vooEvent()` queues events only for users with a `voo_id` and only when a webhook secret is set: join/lead/bot_blocked (`recordJoin`), registration/ftd/deposit/lead (`recordConversion`), plan_started/plan_cancelled (`changePlan`), spend (top-ups and plan charges in `addLedger`). Labels name the source (“New subscriber via <channel>”), never Telegram users. `vooFlush()` runs every 15 s (`VOO_OUTBOX_MS`): up to 100 per POST `{"events":[…]}` with `X-Voo-Signature` = hex HMAC-SHA256 of the raw body; failures back off exponentially (`VOO_BACKOFF_MS` base, max 6 h) and stop after 24 h. Admin → Health shows `voo_outbox` stats.
- **Referrals mode.** `voo.referrals = 'voosquare'` stops `payCommission()`; `/api/referrals`, `/api/me` and `/api/config` report the mode.
- **Apps catalog.** Setting `apps` (validated list; built-in logos in `public/media/applogos/`, uploads in `DATA_DIR/media/applogos/`), clicks in `apps.clicks`. On first start after the upgrade the round-9 `sister` setting is copied into the Replyvoo entry (the old key stays); saving the catalog copies Replyvoo back into `sister`, so `/api/config.sister` keeps working.

## Build and test
```bash
python3 build/build.py          # website pages + admin → public/, static demo → dist/
sh src/dashboard/make.sh        # dashboard parts → public/app.html (then runs build.py)
bash tests/runall.sh            # every end-to-end suite (or: npm test)
bash tests/runall.sh e2e-round6.js
```
The test runner starts a fresh server per suite on :3999 with an empty database, a fake Telegram/Meta/TikTok/Snapchat API (`tests/mock.js`, :4000), fake Paystack/Flutterwave (`tests/paymock.js`, :4100); `e2e-round6.js` runs its own fake Anthropic API on :4200; `e2e-round7.js` writes its own blog files into `tests/.run/blog` (`BLOG_DIR`); `e2e-round8.js` fakes Paystack and Stripe on :4300. Nothing touches the internet. Logs: `tests/.run/`.

| Suite | Covers |
|---|---|
| e2e.js, e2e2.js, e2e3.js | sign-up, bots, channels, joins, leaves, bot Starts, Meta events |
| e2e-bill.js, e2e-trial.js, e2e-pay.js | plan fee, extra joins, free joins, paused tracking, Paystack/Flutterwave |
| e2e-ftd.js, e2e-hook.js | postbacks, FTD/dep logic, TikTok/Snapchat, own-bot hook |
| e2e-admin.js, e2e-phaseA.js | admin, settings, emails, integrations, request mode, compare/funnel/cohorts, spend, fake clicks, ranks, promos |
| e2e-round6.js | profile/Joomoji, levels, plans + trial + lock, adset/lang, compare insights/campaigns, smart links, fraud joins, alerts, Joe (rules + AI), admin credits, i18n, email art, static, blog |
| e2e-round7.js | inbox rows from events (language, prefs, security emails), inbox API + pop-up, broadcasts (reach, send, email, read counts, delete, image), Joe’s daily tip, blog API + new-post notes |
| e2e-joe2.js | playbook tools against fixtures (INDEX parsing, 12k excerpts), custom playbooks overriding built-ins (+ permissions, audit), Anthropic request shape (prompt caching, tools, 900 tokens, model choice), OpenAI-compatible function calling, provider switching, masked keys, 4-round cap and fallback to rules (fake Anthropic :4500, fake OpenAI :4600) |
| e2e-joe3.js | Joe pay-as-you-go: defaults and price table, free chats per plan and local-midnight reset, bonus chats, autopay confirm, price math and clamps, ledger rows, margin guard (tool_choice none), cache_control on the last tool_result, no charge on errors, monthly cap, balance check, Deep mode, OpenAI usage cost, admins free, earnings report, permissions, admin Pricing card |
| e2e-voo.js | VooSquare OIDC against `tests/oidcmock.js` (:4400): PKCE/state/nonce, new user from claims, one-time linking, bad nonce/aud/iss/signature/expiry/state, unsafe return_to, login modes, logout to end_session, summary API, signed batched events with retry and no personal data, referrals mode, admin card + Test discovery, Zedapex apps catalog |
| e2e-staff.js | roles on representative endpoints (support, finance, marketing, viewer, admin), invites (new and existing accounts), per-person permissions, custom roles, owner protection, suspend/remove, chat assignment, audit log and filters |
| e2e-round9.js | sister-product card: defaults, UTM tags, admin edits and validation, click counter + rate limit, off switches |
| e2e-round8.js | country on sign-up / me (30-day lock, admin override, history), /api/geo, /api/countries, country-filtered payment methods, masked secrets, Paystack + Stripe top-ups with signed webhooks, replay, amount/currency checks and verify-on-return, crypto/manual methods, logos, admin country filter / overview / broadcast audience, Integrations & API keys |
