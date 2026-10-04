# Upgrading a live Joinvoo on Railway

This guide is for a developer who already runs Joinvoo on Railway with real customers. You can install this update without logging anyone out or losing any data. Expect about 15 minutes, most of it spent checking.

## What's new in this update

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

- it **only adds** new tables and columns: staff, roles, audit, voo_outbox, users.voo_id, sessions.via and a few more;
- it never deletes or rewrites your data;
- the one exception is a settings copy: the old `sister` card is copied into the new `apps` list, and the old `sister` setting stays where it is.

It's safe to start the same version twice. Each step checks whether it was already done.

In **Deployments → View logs** you should see the usual `Joinvoo running on https://your-domain` line, plus `settings: sister card moved into the Zedapex apps catalog` the first time (only if you had edited the old card).

## 4. Check it (5 minutes)

1. Open `https://your-domain/health`. It should say `{"ok":true}`.
2. **Log in as an existing user** (your own customer test account, or ask one of your users). The dashboard should look the same and show the same balance and channels.
3. **A tracking link still works.** Open one of your `/c/…` links in a private window: it should open Telegram as before. Back in the dashboard, the click shows up under today.
4. Open `/admin`. You land on the Overview as an **Owner** (see the role chip next to the logo). Have a look at **Team & roles** and the **Audit log**.
5. Optional: Admin → Settings → **Zedapex apps** shows the catalog. If you'd rather not promote anything yet, switch off "Sister product card" in Features.

## 5. If you need to roll back

Railway keeps your earlier builds:

1. Open the service → **Deployments**.
2. Find the previous deployment (the one before this update) → **⋯ → Redeploy**.

The older version simply ignores the new tables and columns, so your data is fine either way. Only restore the backup from step 1 if data itself went wrong. To do that, stop the service, copy the backup over `/data/joinvoo.db` (for example with `railway run` or a temporary shell), then start it again.

## 6. Switching on VooSquare later

When the VooSquare team gives you your client details:

1. **Admin → Settings → Integrations & API keys → VooSquare.** You need the "API keys and link domains" permission; owners and admins have it. Fill in:
   - **Issuer**, e.g. `https://auth.voosquare.com`;
   - **Client ID** and **Client secret**;
   - **Service key**: VooSquare uses it to read the summary;
   - **Webhook secret**: Joinvoo signs the events it sends with it;
   - **Events URL**: leave the default unless told otherwise.

   You can set the same values as Railway variables instead (`VOO_ISSUER`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_SERVICE_KEY`, `VOO_WEBHOOK_SECRET`, `VOO_EVENTS_URL`, `VOO_HOME`). Values saved in the admin win over the variables.
2. Give VooSquare:
   - the **Callback URL** shown on the card (`https://your-domain/auth/voosquare/callback`);
   - the **Summary API** URL (`https://your-domain/api/voosquare/summary`).
3. Tap **Test discovery**. It should say "Discovery OK" with the number of signing keys.
4. Set **Login** to **Both**. Your login and sign-up pages then show "Continue with VooSquare" next to the usual form. Try it with your own account:
   - if your email is confirmed on both sides, your existing account is **linked once**;
   - you keep all your data;
   - you get an inbox note saying so.
5. Later, if you want everyone to use VooSquare, set **Login** to **VooSquare only**. Customers then can't use a password any more. Owners and staff still can, as a break-glass, at `https://your-domain/login?local=1`.
6. **Referrals:** set it to **VooSquare** when your referral program moves there. The Earn page then points to VooSquare, no new Joinvoo commissions are added, and balances people already earned stay withdrawable.
7. **Events:** once the webhook secret is set, activity of linked users is sent every 15 seconds. Admin → Health → **VooSquare events** shows how many are waiting and the last error. If VooSquare is down, events wait and are retried for up to 24 hours.

To switch it all off again, set **Login** back to **Off** and clear the webhook secret. Linked accounts keep working with their passwords.
