# Joinvoo: start here (developer handover, 5 October 2026)

This folder is the complete, current Joinvoo: website, dashboard, admin, server, Joe (AI assistant) and tests. Everything from today's work is included and tested (905 automated checks, 0 failures, plus an independent review and an upgrade test on a copy of the previous version). It replaces any earlier zip.

Joinvoo is already live on Railway with real users. This update is safe to deploy on top: the database only gets new tables and columns, sessions and balances stay, and new features stay off until you switch them on.

## Read these, in this order

| File | What it's for | When |
|---|---|---|
| **START-HERE.md** | This page: the overview and the checklist | Now |
| **UPGRADE.md** | Deploying this update on the live Railway service: backup, deploy, checks, rollback | Before deploying |
| **DEPLOY.md** | Full setup reference: Railway, domains, the gojoinly.com link domain, payments, emails, team | When configuring |
| **TRAINING.md** | How Joe works, where his knowledge lives, how to update it, pricing and costs | After deploying |
| **ARCHITECTURE.md** | How the code is organised, the data model and request flows | When changing code |
| **README.md** | Short project summary, commands and settings list | Any time |
| **VOOSQUARE-CONNECT.md** | How Joinvoo connects to VooSquare with the Voo Connect kit (`./voo-connect`): settings, login, affiliate hand-off, money events, refunds/chargebacks, support, `check.js` | When connecting VooSquare |

## Deploy today's update (about 15 minutes)

1. **Back up:** Admin → Health → "Download a database backup". Keep the file.
2. **Deploy** the same way as last time: push to the GitHub branch Railway watches, or run `railway up` in this folder. Optional: `bash scripts/deploy.sh` runs the tests, asks you to confirm the backup, then runs `railway up`.
3. **Don't change** the volume (`/data`), `DATA_DIR`, `BASE_URL` or `APP_SECRET`.
4. **Check:**
   - `https://joinvoo.com/health` says `{"ok":true}`;
   - log in as an existing user and see the same balance and channels;
   - open one existing tracking link and it still goes to Telegram.
5. **If anything looks wrong:** Railway → Deployments → previous deployment → Redeploy. Details are in UPGRADE.md.

## Then switch things on (owner decides; each step is independent)

- [ ] **Tracking link domain `gojoinly.com`.**
  1. Railway → Networking → Custom domain → add gojoinly.com.
  2. Add the CNAME record Railway shows.
  3. Check `https://gojoinly.com/health`.
  4. Admin → Settings → **Link domains** → enter gojoinly.com.

  See "Tracking link domain" in DEPLOY.md.
- [ ] **Team.** Admin → **Team & roles** → invite staff with a role (Support, Finance, Marketing, Viewer, Admin). The **Audit log** records every action.
- [ ] **Joe AI.** Admin → Settings → **Integrations & API keys** → paste an Anthropic key, or choose an OpenAI-compatible provider in Settings → Joe. Without a key, Joe still answers common questions from his playbooks, for free.
- [ ] **Joe pricing.** Admin → Settings → Joe → **Pricing**. The defaults:
  - 5 free chats a day on Basic and 30 on Pro / the trial;
  - then real AI cost × 4, between 3 and 40 credits per answer;
  - Deep answers start at 10 credits.

  Check **Joe earnings** after a few weeks.
- [ ] **Joe's team details.** Fill in the "TEAM (fill this in)" section in `joe/playbooks/about-zedapex-and-team.md`, or add a custom playbook with the same name in Admin → Settings → Joe → Playbooks.
- [ ] **Plan limits.** Admin → Settings → Plans & trial → **Plan limits**. Default: Basic 3 channels + 3 bots, Pro unlimited. Existing customers keep everything they already have.
- [ ] **Gatevoo (USDT + Bitcoin).** Admin → Settings → Payment methods → **Gatevoo**: paste the API key and webhook secret from Gatevoo (Apps → Connect an app → "Joinvoo"), paste the webhook URL shown into Gatevoo, switch it on, and make one real $10 USDT top-up. Details in UPGRADE.md.
- [ ] **Custom payment methods (optional).** Admin → Payment methods → Add → **Custom gateway**: logo, text, checkout link or API URL, webhook secret.
- [ ] **Zedapex apps.** Admin → Settings → **Zedapex apps**: check each app's link (spyvoo.com, replyvoo.com, castvoo.com, vooads.com, affleego.com, gatevoo.com). They feed the swipeable showcase at the bottom of the customer Overview.
- [ ] **Payments.** Admin → Settings → **Payment methods**: add your Paystack and/or Stripe keys and set which countries see each method.
- [ ] **VooSquare (login, affiliates, support).** Leave Login **Off** until VooSquare is live; email + password always keeps working. When ready: UPGRADE.md section 6 (10 minutes) and VOOSQUARE-CONNECT.md; `node voo-connect/check.js` must show every line PASS.
- [ ] **Forgot password needs email.** Reset links are sent by email, so a Resend key must be set (Admin → Settings → Integrations & API keys, or `RESEND_API_KEY`). Check Admin → Emails shows "password_reset" sent after you try it once.

## Joe's training: what lives where (don't delete these)

```
joe/knowledge.md                  ← core product knowledge, always loaded
joe/playbooks/INDEX.md            ← list of playbooks Joe can open
joe/playbooks/*.md                ← 18 expert playbooks (campaigns, verticals, affiliates, Telegram drop-off, FAQ, about Zedapex)
Admin → Settings → Joe            ← personality, extra knowledge, custom playbooks, pricing, provider, Test Joe console
```

Built-in files ship with the code (the Dockerfile copies `joe/`). Anything added in the admin is stored in the database, so it survives deploys. Full details are in TRAINING.md.

## Project map

```
server.js            the whole backend (Node 22, zero dependencies, SQLite in DATA_DIR)
build/               website, admin and blog sources → `python3 build/build.py` writes public/ and dist/
src/dashboard/       dashboard source parts → `bash src/dashboard/make.sh` writes public/app.html
public/              what the server serves (already built: no build step needed to deploy)
joe/                 Joe's knowledge and playbooks
tests/               `bash tests/runall.sh` runs every suite (local mocks, no internet needed)
scripts/             backup and deploy helpers
Dockerfile, railway.json, .env.example   hosting
```

`public/` is already built, so deploying needs no build step. Only run the build commands if you change files in `build/` or `src/dashboard/`.

## Not yet tested live (do these once with real accounts)

- Meta, TikTok and Snapchat events: use the platform's test-event code in the channel settings first.
- An affiliate postback from each network you use: check the exact parameter names in each panel.
- Paystack and Stripe live payments: start with a small top-up.
- Joe with your real AI key: try the 15 sample questions in TRAINING.md in the Test Joe console.
