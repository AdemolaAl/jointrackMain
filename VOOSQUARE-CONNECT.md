# Joinvoo ↔ VooSquare: what each side does

For the developer of VooSquare (and Joinvoo's developer, to check). Joinvoo follows the VooSquare Integration Spec. Everything below is already built and tested on the Joinvoo side; VooSquare needs the matching pieces. Nothing on Joinvoo breaks if VooSquare is down: login falls back to email + password, and events and support messages wait and retry for 24 hours.

## 1. Product settings in VooSquare (Admin → Products → Joinvoo)

| Field | Value |
|---|---|
| Redirect URI | `https://joinvoo.com/auth/voosquare/callback` |
| Summary URL | `https://joinvoo.com/api/voosquare/summary` |
| Support webhook | `https://joinvoo.com/api/voosquare/support/webhook` |

Give Joinvoo the client ID, client secret and API key. Joinvoo uses one API key (`VOO_API_KEY`) in both directions.

## 2. Login (VooSquare OAuth)

Joinvoo sends people to `https://voosquare.com/oauth/authorize?client_id=…&redirect_uri=…&state=…&response_type=code&scope=openid email profile`, plus:
- `prompt=signup` when they came from Joinvoo's sign-up page;
- `ref=<code>`, `aff=<code>` and `sub1=<sub>` when they arrived through an affiliate link. **Please use these to attribute the new Voo ID to that affiliate** if VooSquare's own affiliate cookie is missing (e.g. they came straight to joinvoo.com/?aff=CODE).

Extra standard parameters (`nonce`, `code_challenge`, `code_challenge_method`) can be ignored.

Joinvoo exchanges the code at `POST /oauth/token` (form: `grant_type`, `code`, `redirect_uri`, `client_id`, `client_secret`). It accepts either:
- `user` in the reply: `{voo_id, email, name, country, voo_ref}`; or
- an `id_token` signed HS256 with the client secret (`sub`, `aud` = client ID, `exp`); or
- `access_token`, then `GET /oauth/userinfo`.

If an `id_token` is present, Joinvoo checks its signature, `aud` and `exp`. VooSquare must only return verified emails; if an email isn't verified, send `email_verified: false` and Joinvoo won't link it to an existing account.

Logout: Joinvoo redirects to `/oauth/logout?redirect_uri=https://joinvoo.com&post_logout_redirect_uri=…&client_id=…`.

## 3. Events → `POST https://voosquare.com/api/v1/events`

Header `Authorization: Bearer <API key>`. If a webhook secret is also set, Joinvoo adds `X-Voo-Signature` (HMAC-SHA256 of the raw body). Body: `{"events":[…]}`, up to 100 events per call.

Each event has:
- `event_id` (unique; retries are safe), `type`, `tool: "joinvoo"`, `occurred_at`, `label`;
- `voo_id` when the customer is linked to VooSquare;
- `value_usd` for money events.

Types: `join`, `lead`, `signup`, `registration`, `ftd`, `deposit`, `bot_blocked`, `plan_started`, `plan_cancelled`, `spend`.

**Affiliate events for customers without a Voo ID.** A customer who signed up on joinvoo.com with email and password after an affiliate link still sends their `signup`, `spend`, `plan_started` and `plan_cancelled` events. They have no `voo_id`, but carry:
- `aff_code`: the affiliate's code;
- `aff_sub`: the affiliate's sub ID, if any;
- `customer_ref`: a stable, anonymous ID for that customer (`jv_…`). It is never their email.

**Please credit commissions using `aff_code` + `customer_ref` when `voo_id` is missing.** `spend.value_usd` is the money that customer paid inside Joinvoo (top-ups and plan charges).

No end-customer data (Telegram IDs, names, emails of the customer's subscribers) is ever sent.

## 4. Support

**Joinvoo → VooSquare.** With "Support bridge" on, each customer message is sent to `POST /api/v1/support/messages` with `{email, name, subject, body, external_ref: "joinvoo-<id>", voo_id?, product: "joinvoo"}`. One `external_ref` is one conversation. Joinvoo stores the `ticket_id` VooSquare returns.

**VooSquare → Joinvoo.** Staff replies arrive on the support webhook `{type: "support.reply", ticket_id, external_ref, body, agent, created_at}`, with `Authorization: Bearer <API key>`. The customer sees the reply in their Joinvoo chat, from the agent's name, and gets an email if they're away. A repeated delivery is ignored.

**HQ reading Joinvoo's desk.** All of these need `Authorization: Bearer <API key>`:
- `GET /api/voosquare/support/boxes`
- `GET /api/voosquare/support/tickets?status=open|solved|all&q=`
- `GET /api/voosquare/support/tickets/jv-<id>`
- `POST /api/voosquare/support/tickets/jv-<id>/reply {text, agent?, voo_id?, note?}`: a `note` stays in VooSquare.
- `POST /api/voosquare/support/tickets/jv-<id>/update {status: "open"|"solved"}`

Not mirrored yet: replies typed inside Joinvoo's own admin do not appear in the HQ inbox.

## 5. Summary

`GET https://joinvoo.com/api/voosquare/summary?voo_id=…&period=1d|7d|30d` with `Authorization: Bearer <API key>`. It returns joins, ftds, revenue_usd, cost_per_ftd_usd and bots_blocked. An unknown `voo_id` returns `{"linked": false}` with HTTP 200.

## 6. Affiliate links that point at Joinvoo

Send affiliate traffic to `https://joinvoo.com/?aff=<CODE>&sub1=<sub>` or `https://joinvoo.com/a/<CODE>`. Joinvoo remembers the first affiliate for 90 days and locks it to the account at sign-up, for life. It never moves an existing customer to another affiliate.
