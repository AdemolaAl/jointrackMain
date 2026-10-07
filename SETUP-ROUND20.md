# Joinvoo round 20: setup for the developer

Deploy this zip as usual: back up the database, upload, restart. The database updates by itself on start, and existing users need nothing. Check with `bash tests/runall.sh` → every line `ok`, ending `0 FAIL`.

Before anything else, the server needs `BASE_URL=https://joinvoo.com` (a public https address). Telegram, mini apps and webhooks only work with https.

---

## 1. DM tracking (messages to a manager's Telegram)

**Server:** nothing to add. On first start Joinvoo re-registers every bot's webhook so it also receives `business_connection` and `business_message` updates.

**In Telegram:**
1. @BotFather → `/mybots` → pick the Joinvoo tracking bot → Bot Settings → **Business Mode → Turn on**.
2. The manager's Telegram account needs **Telegram Premium**. Telegram Business only exists with Premium.
3. On the manager's phone: Settings → **Telegram Business → Chatbots** → add the tracking bot (e.g. @yourbrand_track_bot). Choose "New chats" or "All non-contacts".
4. The manager should have a Telegram **@username**. The ad link opens `t.me/<username>`.

**In Joinvoo:** a "DM tracking" card appears in Channels. Tap **"Yes, that's my manager"** to approve it, connect Meta/TikTok/Snapchat, and put the card's link in the ad.

**Test:** open the ad link on another phone, send a message, and check that a `Lead` shows in Meta Events Manager → Test events.

---

## 2. Telegram mini app (exact matching)

**Server:** nothing to add.

**In Telegram (2 minutes):**
1. In Joinvoo: open the DM tracking card (or a bot card) → **Settings → How it opens** (bots: **Settings → Mini app**) → choose "Through your mini app" and copy the address it shows. It looks like `https://joinvoo.com/ma/12.AbCdEf…`.
2. @BotFather → `/newapp` → pick the **same tracking bot** → title, description, photo → paste that address as the **Web App URL** → choose a short name like `app`.
3. BotFather replies with a link like `t.me/yourbrand_track_bot/app`. Paste it back into Joinvoo and tap **Save**.
4. Open the mini app once in Telegram. The status in Joinvoo turns green.

**If the customer has their own mini app** (trading or shopping app): bot card → Settings → Mini app → turn on "Open my mini app instead of the chat" and enter the app's https address. Then in BotFather (`/myapps` → the app → Edit Web App URL), point the mini app at the Joinvoo address shown.

---

## 3. AI support (Replyvoo)

It ships **switched off**. To turn it on:

**a) AI key (required).** Use one of these:
- Server env: `ANTHROPIC_API_KEY=sk-ant-…` (create it at console.anthropic.com → API keys, and add billing credit there), or
- Admin → **Settings → Joe → API key** (pasted keys override the env).

Joe and the support AI share this key. The default model is `claude-haiku-4-5-20251001` (fast and low cost). An OpenAI-compatible provider also works (Settings → Joe → provider, or `OPENAI_BASE_URL` + key).

**b) Email (strongly recommended).** `RESEND_API_KEY=re_…` (resend.com) and `MAIL_FROM`. The AI emails password resets, confirmation links and Telegram link codes. Without a key, emails only go to the server log.

**c) Payment checks (for "I paid but no credits").** Admin → Payment methods → **Gatevoo**: secret key + webhook secret (and the Gatevoo address if it isn't gatevoo.com). Paystack, Stripe and Flutterwave keys work the same way if they're used.

**d) Switch it on.** Admin → **Settings → Support → AI support (Powered by Replyvoo)**:
- turn it on → Save;
- check the limits: payment checks up to $500, daily AI budget $25;
- optional: mark team members as **"AI teammate"** and upload their photos (by default there are 4 AI teammates, Sofia, Daniel, Maya and Leo, with illustrated faces; to use real photos, add team members in admin, mark them "AI teammate" and upload photos, or replace `public/media/team/ai-*.png`);
- use the **Try it** box with 10–20 real questions before going live.

**e) Telegram support bot (optional, any time later):**
1. @BotFather → `/newbot` → make a **new** bot just for support (NOT the tracking bot).
2. Admin → Settings → Support → AI support → **Telegram support bot → Connect** → paste its token. Joinvoo sets the webhook (`https://joinvoo.com/tgsup/…`) by itself.
3. Customers write to that bot. To get account help, they verify with the email on their Joinvoo account and a 6-digit code.

**f) Team alerts when the AI hands a chat over (optional):**
- `SUPPORT_TG_BOT_TOKEN` = a bot token (can be the support bot)
- `SUPPORT_TG_CHAT_ID` = the staff Telegram group or user ID that receives the pings

**Speed (round 20b):** replies now start about 1–2 seconds after the customer stops typing, plus the AI's thinking time. Before, it was about 6–15 seconds. For even quicker replies: Admin → Settings → Support → AI support → Typing speed → **Fast**.

**Photos (round 20c):** customers can send photos and screenshots in the website chat, the dashboard chat and the Telegram support bot. The AI reads them, and staff see them in admin. They're stored privately in `DATA_DIR/media/support`. Nothing to set up, but back up the **whole DATA_DIR folder** (database + photos). The admin "Backup" button only downloads the database. On Docker/Railway, `DATA_DIR=/data` is already the persistent volume.

**Payment methods (round 20c):** the AI reads the live list from Admin → Payment methods (switched on and set up) and only offers those, filtered by each customer's country. Nothing to set up. Just keep that list accurate.

**Real faces for the AI teammates:** 4 photos were made in Higgsfield. To use them, either replace `public/media/team/ai-sofia.png`, `ai-daniel.png`, `ai-maya.png`, `ai-leo.png` (square images, keep the same names), or add the 4 people in Admin → Support team, mark each one "AI teammate" and upload their photos.

**Feature switch:** Admin → Settings → Features → "AI support (Replyvoo)". It's on by default; the support card's own switch is what actually starts it. Env `FEATURE_SUPPORT_AI=false` hides it completely.

---

## 4. Customer webhooks
Nothing to set up. Customers add their own in Conversions → Integrations. **Never** set `WEBHOOK_TEST_ALLOW` on the live server (tests only).

## 5. After deploy, check
- [ ] Dashboard loads; Overview, Results and Channels look normal for an existing account
- [ ] DM tracking test (section 1) → `Lead` in Meta Test events
- [ ] Mini app turns green (section 2)
- [ ] Support chat: with AI on, ask "I paid but no credits" from a test account
- [ ] Ask Joe "How's my campaign?" → he quotes the real numbers
