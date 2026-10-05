# Upgrading a live Joinvoo on Railway

This guide is for a developer who already runs Joinvoo on Railway with real customers. You can install this update without logging anyone out or losing any data. Expect about 15 minutes, most of it spent checking.

## What's new in this update (round 14: Voo Connect + audit fixes, 5 October 2026)

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
