# Round 11 contract (server ↔ UI). Server side is being built in server.js in parallel.

All money in cents unless named _usd. All new fields are additive; old fields stay.

## 1. Plan limits for channels and bots
GET /api/channels → existing {bots, channels} plus:
```
limits: { plan: 'basic'|'pro', unlimited: bool,            // unlimited = Pro, trial, admin or billing off
          channels: { used: n, max: n|null },              // null = unlimited. used counts channels with status<>'removed' (bot-subscriber trackers count as channels)
          bots:     { used: n, max: n|null },              // active bots
          pro_price_usd: 99, basic_price_usd: 30 }
bots[i].channels   = number of not-removed channels that use this bot
channels[i].locked = true when the channel was added over the plan limit: it shows in the list but does NOT track until the user upgrades or removes another
```
Any create call over the limit answers **HTTP 402** with
`{ error: "You’ve used 3 of 3 channels on Basic. Upgrade to Pro for unlimited, or remove one.", limit: { kind: 'channels'|'bots', used, max, plan } }`:
- POST /api/bots {token}           (kind 'bots'; reconnecting a bot the user already has is never blocked)
- POST /api/bot-targets {bot_id}   (kind 'channels')
- POST /api/bot-targets/external   (kind 'channels')
- POST /api/channels {bot_id,chat} (kind 'channels')
Remove: DELETE /api/channels/:id → {ok}. Disconnect bot: DELETE /api/bots/:id → {ok}. Both exist already.
A channel the user adds in Telegram (bot made admin) while over the limit arrives with locked:true. Locked channels unlock by themselves when the user is back under the limit (upgrade or remove).
Admin setting (GET/PUT /api/admin/settings): `limits: { basic: { channels: 3, bots: 3 }, pro: { channels: 0, bots: 0 } }` (0 = unlimited).

## 2. People / joins
GET /api/joins rows (and the overview "Just joined" feed rows) add:
- `click_code`: short click ID shown to users, e.g. "c-8f3a21" (null for organic)
- `link_name`: the name of the Telegram invite link that person used, e.g. "Meta · c-8f3a21 · NG" (this is what the user sees in Telegram → channel → Invite links)
- `match`: { fbc: bool, fbp: bool, ip: bool, ua: bool } — which Meta match keys were sent for this person
(fbclid, fbc, fbp, ip, ua, capi_status, tt_status, sc_status, params, country already exist)

## 3. Overview totals ("Left")
Overview stats totals (the object the KPI tiles read as T) add:
- `leaves_new`: people who joined in this range (tracked or organic) and have since left
- `leaves_old`: everyone else who left in this range (members from before, or before Joinvoo tracked them) = max(0, leaves - leaves_new)
The "Left" tile must show leaves_new with `pct(leaves_new, joins+organic) of new joins`, and a small line "+N older members" when leaves_old > 0. Never show a % above 100.

## 4. Product showcase (dashboard, very bottom of Overview)
/api/config (already loaded by the dashboard) → `apps` (catalog, now includes Spyvoo live and Gatevoo soon) and NEW:
```
showcase: { enabled: bool,
  affiliate: { url: 'https://affiliate.voosquare.com', headline: 'Earn up to 50% for life', tagline: '…', cta: 'Become an affiliate' },
  cards: [ { id, name, headline, tagline, url, color, color2, ink, logo_url, status: 'live'|'soon', cta, badge } ] }   // ordered: VooSquare affiliate first, then Spyvoo, Replyvoo, Castvoo, Vooads, Gatevoo (soon → cta "Join the waitlist")
```

## 5. Payments
Payment methods (GET /api/billing → methods, and the top-up flow) can now have type `gatevoo` and `custom`.
- `gatevoo`: label "USDT or Bitcoin", description "Secure crypto checkout by Gatevoo", logo_url /media/paylogos/gatevoo.svg, `brand: 'gatevoo'`. POST /api/billing/topup returns {ok, url, reference} like Paystack/Stripe: send the browser to url. Show the Gatevoo pill (black G mark + "Gate" + grey "voo") under the description.
- `custom`: admin-defined gateway with its own uploaded logo + description. Same redirect flow.
Admin (build/admin.html, Settings → Payment methods): new types in the Add method picker:
- `gatevoo` — fields: config.base_url (default https://gatevoo.com), config.secret_key (Gatevoo API key gv_live_…), config.webhook_secret. Shows webhook_url to paste into Gatevoo.
- `custom` — fields: config.create_url (optional API endpoint), config.checkout_url (link template with {amount} {currency} {reference} {email} {return_url}), config.secret_key (API key, optional), config.webhook_secret. Shows webhook_url and a short "How your gateway confirms payments" box: POST JSON {reference, amount, currency, status:"paid", txid} to webhook_url with header X-Signature = hex HMAC-SHA256(webhook_secret, raw body).
adminPm(m) returns webhook_url for both.

## 6. VooSquare (admin Settings → Integrations → VooSquare card)
New/changed fields on the existing VooSquare card: `api_key` (VOO_API_KEY, secret, masked), `support_bridge` (bool: copy support chats to VooSquare HQ inbox), `support_webhook_url` (read-only, to paste in VooSquare Admin → Products → Joinvoo → Support webhook), `affiliate_url` (default https://affiliate.voosquare.com).
Support tickets that came from / were answered in VooSquare carry `source: 'voosquare'` and agent name; show a small VooSquare badge in the admin support list.

## 7. Affiliates (website)
New public page /affiliates ("Earn up to 50% for life promoting Joinvoo on VooSquare"), linked from the home page nav/footer and a home section. CTA → https://affiliate.voosquare.com (read terms there). Joinvoo keeps its own Referral program (Earn page) — different thing; the page should say so in one line.
Visitors arriving with ?aff=CODE (or ?voo_aff=, ?via=) are remembered by the server (cookie) and tied to the account at sign-up.
