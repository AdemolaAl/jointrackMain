# Launch Joinvoo: step by step

This gets Joinvoo live on your own domain, with payments, emails and the admin panel. Plan on about an hour the first time.

You need:
- a domain (for example `joinvoo.com`)
- a GitHub account
- a Railway account (about $5–20 a month), **or** a VPS with Ubuntu (Hetzner, DigitalOcean, Contabo: about $5–10 a month)

---

## Option A: Railway (easiest)

1. **Put the code on GitHub.** Create a new *private* repository and upload everything in this folder (drag and drop works on github.com).
2. **Create the app.** In Railway, choose **New Project → Deploy from GitHub repo** and pick your repo. Railway finds the `Dockerfile` by itself.
3. **Add storage.** Right-click the service → **Attach volume**. Set the mount path to `/data`. *Without this, your database is wiped on every deploy.*
4. **Add settings.** Open the service → **Variables** → **Raw editor**, paste the contents of `.env.example`, and fill in at least:
   - `BASE_URL` = `https://joinvoo.com` (your domain, with https, no slash at the end)
   - `DATA_DIR` = `/data`
   - `ADMIN_EMAILS` = your email
5. **Connect your domain.** Service → **Settings → Networking → Custom domain**, enter `joinvoo.com`. Railway shows a CNAME record. Add it at your domain registrar (or in Cloudflare). Wait until Railway shows the green tick.
6. Open `https://joinvoo.com/health`. It should say `{"ok":true}`. Done.

**Railway tips**
- No GitHub? Install the Railway CLI, run `railway login`, `railway link` (pick the project), then `railway up` from this folder. It uploads and deploys the same way.
- Until the custom domain is ready, Railway's own `*.up.railway.app` address works: if `BASE_URL` is not set, Joinvoo uses Railway's public domain automatically. Set `BASE_URL` to your real domain before you go live (Telegram webhooks, emails and payment return links use it).
- If you set the volume to a different mount path, `DATA_DIR` is picked up from Railway's `RAILWAY_VOLUME_MOUNT_PATH` automatically, so you can leave `DATA_DIR` empty.
- After changing `BASE_URL`, restart the service: on start Joinvoo re-registers every bot webhook at the new address automatically.

Only run **one** replica. Joinvoo keeps its database in one file, so it doesn’t run on several servers at once. One server comfortably handles a busy launch; if traffic grows a lot, raise the service's CPU/RAM in Railway.

## Tracking link domain (recommended)

Ad links can run on their own domain, e.g. `gojoinly.com/c/9tcWGkQ` instead of `joinvoo.com/c/…`. If an ad platform ever blocks a link domain, joinvoo.com stays safe and you switch to a backup in one tap.

1. **Railway:** service → **Settings → Networking → Custom domain** → add `gojoinly.com` (the same service as joinvoo.com, no second app needed). Railway shows a CNAME record.
2. **DNS:** add that record where you bought the domain (or in Cloudflare). For a root domain on Cloudflare, a CNAME at `@` works (CNAME flattening). Wait for Railway's green tick.
3. **Check:** open `https://gojoinly.com/health`. It should say `{"ok":true}`.
4. **Switch it on:** Admin → Settings → **Link domains** → enter `gojoinly.com` → Save. (Or set `LINK_BASE_URL=https://gojoinly.com` in Railway Variables.)

New links shown in dashboards now use gojoinly.com. Links already in running ads on joinvoo.com keep working. The link domain only serves tracking links: anything else on it redirects to joinvoo.com, and it tells search engines not to index it. Buy one or two backup domains, add them to Railway the same way, and list them under "Backup domains" so they're ready.

## Option B: Your own VPS (Ubuntu 22.04 or 24.04)

```bash
# 1. Node 22 and Caddy (Caddy handles https for you)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# 2. The app
sudo useradd -r -m -d /opt/joinvoo joinvoo
sudo -u joinvoo git clone <your-private-repo-url> /opt/joinvoo     # or upload the folder there
cd /opt/joinvoo && sudo -u joinvoo cp .env.example .env && sudo -u joinvoo nano .env
#    set BASE_URL, DATA_DIR=/opt/joinvoo/data, ADMIN_EMAILS, and the rest

# 3. Run it forever
sudo cp deploy/joinvoo.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now joinvoo

# 4. https: put your domain in deploy/Caddyfile, then
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy

# 5. Nightly backups
sudo crontab -u joinvoo deploy/backup.cron
```
Point your domain’s **A record** at the server’s IP before step 4. Check the logs with `journalctl -u joinvoo -f`.

### Cloudflare (recommended either way)
Put your domain on Cloudflare. It soaks up traffic spikes and gives Joinvoo each visitor’s country. In **SSL/TLS**, choose **Full (strict)**. For Railway, the CNAME can stay proxied (orange cloud). **When the orange cloud is on, set `TRUST_CLOUDFLARE=1`**, otherwise leave it at 0 (so nobody can fake their IP).

### Visitor addresses behind proxies (`TRUST_PROXY`)
Rate limits (log-in, sign-up, VooSquare login) and click IPs use the visitor's address. By default Joinvoo believes the last
`X-Forwarded-For` hop only when the connection comes from a private or loopback address (Caddy on the same machine, Railway's edge),
so someone reaching the app directly cannot pick their own address. Set `TRUST_PROXY=<number of proxies>` if you run behind more
than one proxy, or `TRUST_PROXY=0` to never read the header.

---

## Turn on payments
Everything is done in **/admin → Settings → Payment methods**. Each method is a card you can switch on, reorder, edit or delete. A method has:
- a **type**: Card (Stripe), Paystack, Bank / manual, or Crypto wallet;
- **where it’s offered**: Global, Only these countries, or All except some (customers pick their country at sign-up);
- **money**: the currency it charges in, the rate (how many units = $1), an optional fee, and the smallest/largest top-up;
- its own **keys**, stored in the database and only ever shown masked (••••last4). Sending the masked value back keeps the saved key.

Three methods are already there, switched off, waiting for keys: **Bank card (Stripe)** (global), **Paystack** (only NG, GH, KE, ZA) and, if you have no USDT wallet yet, **USDT (TRC20)**. You can add more of any type, for example one Paystack method per currency.

**Stripe (cards everywhere)**
1. Create an account at **dashboard.stripe.com** and finish the business details so live payments are allowed.
2. **Developers → API keys**: copy the **Secret key** (`sk_live_…`). A restricted key (`rk_live_…`) with write access to Checkout Sessions also works.
3. Open the **Bank card (Stripe)** method in /admin, paste the key and tap **Test connection** (it reads your Stripe balance).
4. Copy the **Webhook URL** shown on the same screen. It looks like `https://joinvoo.com/webhooks/stripe/stripe` (the last part is the method’s id).
5. In Stripe: **Developers → Webhooks → Add endpoint**. Paste that URL and pick the event **`checkout.session.completed`** (add `checkout.session.async_payment_succeeded` too if you enable bank debits).
6. Open the new endpoint, reveal its **Signing secret** (`whsec_…`) and paste it into the method’s **Webhook signing secret**. Save and switch the method on.
Customers go to Stripe Checkout and come back to their Credits page; the credits land as soon as Stripe calls the webhook (and again checked when they return).

**Paystack (the countries Paystack serves)**
1. Paystack dashboard → **Settings → API Keys & Webhooks**.
2. Copy the **Live Secret Key** (`sk_live_…`) into the **Paystack** method in /admin (and the public key if you like). Tap **Test connection**.
3. Copy the **Webhook URL** from the method (e.g. `https://joinvoo.com/webhooks/paystack/m_paystack`) into **Live Webhook URL** on the same Paystack page. Paystack signs every call with your secret key; Joinvoo checks the signature.
4. Set **Charge in** (NGN, GHS, KES, ZAR or USD) and the **rate**: how many of that currency make $1. A $50 top-up at 1,600 NGN charges ₦80,000. Update the rate as the market moves. An optional fee is added on top and shown to the customer.
If you used `PAYSTACK_SECRET` before, your old Paystack method keeps working on `https://joinvoo.com/webhooks/paystack`.

**Crypto wallets and bank transfer (you approve each one)**
1. Add a **Crypto wallet** (quick start: USDT TRC20, BTC, USDT BEP20, USDC, ETH) with your address, or a **Bank / manual** method with account lines (label + value) and instructions.
2. When a customer says they paid, it appears in **/admin → Deposits**. Each top-up has its own exact amount with odd cents (e.g. 50.37 USDT), so you can tell transfers apart. Check it arrived, then tap **Approve**.

**Flutterwave** (older setups): a Flutterwave method made from `FLW_SECRET` keeps working. Webhook `https://joinvoo.com/webhooks/flutterwave` with the secret hash in `FLW_WEBHOOK_HASH`.

Every top-up, whatever the method, gets the same bonus tiers, promo codes, receipt email and inbox notice. Changes in /admin apply instantly.

## Telegram alerts for your customers (optional)
1. In @BotFather create a bot just for alerts (e.g. `@JoinvooAlertsBot`) and copy its token into `ALERT_BOT_TOKEN`.
2. Restart. Joinvoo sets the bot’s webhook to `https://joinvoo.com/tg-alert` by itself.
3. Customers tap **Connect** in their dashboard to get daily reports and problem alerts. Without the token the feature shows “Coming soon”.

## Turn on Joe’s AI answers (optional)
Joe works without any setup: insights and chat answers come from each customer’s own numbers and `joe/knowledge.md`.
For AI chat answers:
1. Create an API key at **console.anthropic.com**.
2. Paste it in **/admin → Settings → Integrations & API keys** (stored masked; it wins over the server’s value), or set `ANTHROPIC_API_KEY` on the server.
3. Pick the model (default `claude-haiku-4-5-20251001`) and the questions per customer per day (default 30).
4. Use **Test Joe** on the same page to ask a question as yourself or as a customer.
Joe only reads the asking customer’s data and never invents numbers. If the API fails, he falls back to rule-based answers.

## Turn on emails
1. Create a free account at **resend.com**.
2. Add your domain and add the DNS records it shows.
3. Create an API key and paste it in **/admin → Settings → Integrations & API keys**, or put it in `RESEND_API_KEY`. A key saved in /admin wins; clear it to go back to the server’s.
4. Set `MAIL_FROM`, for example `Joinvoo <hello@joinvoo.com>`.

Without a key everything still works, but email links (confirm, password reset…) are only printed in the server log. You can copy one from there for a customer if needed.

Check every email in **/admin → Emails**: live previews (desktop, phone, plain text) and a “Send test to me” button. In **Settings → Brand & emails** set the support email (customers’ replies go there) and the sender name.

## Your admin panel
Sign up on your site with the email you put in `ADMIN_EMAILS`, **click the confirmation link in your inbox** (if emails aren’t set up yet, the link is printed in the server log), then open `https://joinvoo.com/admin`. Admin accounts track for free. The confirmation step stops anyone from grabbing your admin email by signing up first.

| Tab | What you do there |
|---|---|
| Overview | Money in, sign-ups, joins, anything waiting for you |
| Users | Search anyone, see their wallet, level, plan and trial, bots and channels; **Add credits** (quick +1,000 / +5,000 / +10,000 / +50,000, custom, minus to remove, reason, email toggle) for one person or everyone you tick; give Pro or reset a trial; suspend |
| Deposits | Approve or reject manual top-ups (crypto, bank). Each shows the method and a link to the transaction. The customer gets a receipt or a rejection email. |
| Payouts | Referral withdrawals: copy the address, send the crypto, paste the transaction hash |
| Support | Live chat with customers and website visitors, with your team’s faces, saved replies, and the customer’s plan, balance, channels and latest joins beside the chat. Set `SUPPORT_TG_BOT_TOKEN` + `SUPPORT_TG_CHAT_ID` to get a Telegram ping for new messages. |
| Emails | Preview every email, send yourself a test, see what was sent |
| Settings | Feature switches, pricing, plans & Pro trial, levels, Joe (AI key, model, limits, extra knowledge, Test Joe), credits & loyalty (bonus tiers, ranks), promo codes, payment methods, affiliate integrations (logos, templates), support team, brand |
| Health | Broken bots, channels missing admin rights, failed Meta/TikTok events (retry button), **database backup download** |
| Team & roles | Invite staff, pick their role, add or take away single permissions, suspend or remove them, create your own roles |
| Zedapex apps (Settings) | Our other tools shown to customers (Replyvoo, Castvoo, Advoo, Affleego, Landvoo): order, colours, offers, clicks |
| VooSquare (Settings → Integrations & API keys) | One login for all Zedapex tools, the summary key, the events webhook and the referrals mode. Off until you set it up (UPGRADE.md §6) |
| Audit log | Every change made in the admin panel: who, what, before → after, when, IP. Filter by person, action type and date |

## Your team
Everyone in `ADMIN_EMAILS` is an **owner**: they can do everything and can only be changed on the server. Everyone else is invited from **/admin → Team & roles**:
1. Tap **Invite someone**, type their email and pick a role. They get an email with a link to set a password (valid 7 days). If they already have a Joinvoo account, the role is added to it and the email just links to /admin. Either way they must confirm the email before they get in.
2. Built-in roles (change what each can do any time; owners always have everything):
   - **Owner**: everything, including other owners and the team. There is always at least one; only another owner can change an owner, and nobody can change their own access.
   - **Admin**: everything except owners (can’t make, change or remove an owner, or create roles).
   - **Finance**: deposits, withdrawals, payment methods, adding/removing credits, promo codes, reading users and settings.
   - **Support**: the support inbox (reply, assign to themselves, close), reading users (no money actions), sending a password reset, reading the broadcast history.
   - **Marketing**: inbox broadcasts, sister products, Joe’s persona and knowledge, email previews, the overview.
   - **Viewer**: read-only overview, users and health.
3. Open a person to tick or untick single permissions just for them (shown as **Custom**), suspend them (they’re logged out at once), resend the invite or remove them (their customer account stays).
4. Owners can create roles (e.g. “Night support”) with exactly the permissions you tick.
5. To show a support agent’s name and photo in the chat, add them in **Settings → Support team** with the same email; Team & roles shows the link.

Each person only sees the sections their role allows, and the server checks every action again, so hiding a button is never the only protection. Everything they change lands in the **Audit log**. Two-factor login for staff isn’t built yet (it’s on the list).

---

## Before you take money: the real test (15 minutes)

Do this yourself, with real Telegram and Meta, before telling anyone about Joinvoo.

1. Sign up on your live site with a **non-admin** email, so billing applies like a customer.
2. Create a new bot in @BotFather and paste its token. You should see “connected”.
3. Create a **private test channel**, tap **Add to my channel**, confirm. The channel should appear by itself within seconds.
4. In Meta Events Manager:
   1. Copy your dataset ID and generate an access token.
   2. Open **Test events** and copy the test code.
   3. Paste all three into Joinvoo and tap **Save and send a test**. It should show up in Test events within a minute.
5. Open the tracking link **on your phone** with a second Telegram account, and join.
   - It should appear in **People** as *From ad*, with the *Meta ✓* tag.
   - The *Subscribe* event should appear in Meta Test events.
6. Leave the channel. The person should change to *Left*.
7. Repeat steps 2–5 choosing **Bot subscribers** with a second bot: press Start from the tracking link.
8. In **Conversions**, copy your postback URL, replace `{telegram_id}` with your second account's Telegram ID (see it in People), and open it in a browser with `status=ftd&payout=10`. The FTD shows on that person and a Purchase arrives in Meta Test events.
9. Optional: connect Snapchat and TikTok the same way and send a test from Channels.
10. Top up $10 with each method you switched on (use Stripe/Paystack test keys first). The wallet should update as soon as you return.
11. Clear the Meta test code (and switch Snapchat test mode off). You’re live.

If anything fails, the server log (Railway → **Deployments → Logs**, or `journalctl -u joinvoo -f`) says why.

## Launch checklist
- [ ] `BASE_URL` is your https domain, and `/health` works
- [ ] Volume or data folder is persistent (redeploy once: your account should still be there)
- [ ] `ADMIN_EMAILS` set and `/admin` opens
- [ ] At least one payment method works with a real small payment
- [ ] Emails work: try “Forgot your password?” (and preview a few in /admin → Emails in each language)
- [ ] Plans & trial and Levels checked in /admin → Settings; Joe answers in Test Joe
- [ ] In /admin → Settings: pricing checked, payment methods added, support team + hours filled in, support email set
- [ ] Terms and Privacy pages read through, ideally checked by a lawyer (`build/legal/`)
- [ ] The real test above passed
- [ ] You downloaded a backup from /admin → Health, and know where nightly backups go

## Updating later
**Already live? Read UPGRADE.md first** (backup, deploy, checks, rollback, switching on VooSquare).

- **Railway:** push to GitHub and it redeploys by itself.
- **VPS:**
  ```bash
  cd /opt/joinvoo && sudo -u joinvoo git pull && sudo systemctl restart joinvoo
  ```

The database upgrades itself on start. Pages are edited in `build/`, then `python3 build/build.py` regenerates `public/`. The dashboard is built from `src/dashboard/` with `sh src/dashboard/make.sh`. Before deploying a change, run `bash tests/runall.sh` (all suites must say `0 FAIL`).

The Docker image includes `server.js`, `public/`, `joe/` and `scripts/`. If you build your own image, copy `joe/` too, or Joe loses his guide.

## Videos
After deploying, run `sh scripts/fetch-media.sh` once on the server (or add the four files to `public/media/` before pushing) so the homepage "why" video and the guide walkthrough appear. Until then those players stay hidden.
