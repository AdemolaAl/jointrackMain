# Joinvoo ↔ VooSquare (Voo Connect)

Joinvoo connects to VooSquare with the **Voo Connect kit**, exactly as VooSquare's `docs/VOO_CONNECT.md` (Joinvoo section) describes.
The kit is in `./voo-connect`, copied unchanged from the VooSquare repo (`sdk/voo-connect`). Never edit it; to update it, copy the
folder again. `lib/voo.js` builds the kit from Joinvoo's settings; `server.js` wires it in (search for "Voo Connect").

Nothing changes until a VooSquare address is set. Without it Joinvoo runs exactly as before: no snippet on the pages, no cookies,
`/auth/voosquare` goes back to the normal login, the support webhook answers 404. If VooSquare is down, email + password login keeps
working and events wait in the database and retry.

## 1. Settings

Railway variables (or Admin → Settings → Integrations & API keys → VooSquare; values saved there win):

| Variable | What |
|---|---|
| `VOO_BASE` | `https://voosquare.com` (older name `VOO_ISSUER` still works) |
| `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET` | from VooSquare Admin → Products → Joinvoo |
| `VOO_API_KEY` | same page; events, summary, support (both directions) |
| `VOO_SIGNAL_SECRET` | any long random string; hashes payment fingerprints before they leave Joinvoo (default: derived from `APP_SECRET`) |
| `VOO_LOGIN_MODE` | `off` (default), `both` (password + "Continue with VooSquare"), `only` (staff keep `/login?local=1`) |
| `VOO_WIDGET` | `1` adds VooSquare's chat widget to the public pages |
| `VOO_REFERRALS` | `local` (Joinvoo's own referral program, default) or `voosquare` (no new local commissions) |

**VooSquare Admin → Products → Joinvoo:** URL `https://joinvoo.com` · Launch path `/app` (the page VooSquare's launcher opens after login; empty means `/dashboard`, which Joinvoo also maps to `/app`) · SSO on · Redirect URI `https://joinvoo.com/auth/voosquare/callback`
(VooSquare also accepts logout back to any page on joinvoo.com, so the home page no longer needs its own entry; adding
`https://joinvoo.com/` does no harm) · Summary URL `https://joinvoo.com/api/voosquare/summary` · Support webhook
`https://joinvoo.com/hooks/voosquare/support`.

**Check it:** Admin → VooSquare card → **Test connection** runs the kit's checks, or from a shell:

```
node voo-connect/check.js --base $VOO_BASE --client-id $VOO_CLIENT_ID --client-secret $VOO_CLIENT_SECRET --api-key $VOO_API_KEY \
  --redirect-uri https://joinvoo.com/auth/voosquare/callback --logout-uri https://joinvoo.com/ \
  --summary-url https://joinvoo.com/api/voosquare/summary --voo-id <your Voo ID>
```

Every line must say PASS.

## 2. Login ("Continue with VooSquare")

- `GET /auth/voosquare?return_to=/app` → the kit's `startLogin` (state cookie `voo_state`, 10 minutes). The sign-up page adds
  `signup=1`, which becomes `prompt=signup` (VooSquare opens its sign-up view).
- `GET /auth/voosquare/callback` → the kit's `handleCallback`, then Joinvoo:
  1. finds the account by `voo_id` (never by email);
  2. if someone is logged in to Joinvoo ("Connect your VooSquare account" on Help → Account), saves the Voo ID on **that** account;
  3. else, an existing account with the same email is linked **once**, only if the email is confirmed on both sides;
  4. else creates a new account (email confirmed, country, `voo_ref` kept as `referred_by_voo`).
  Existing password logins keep working (mode `both`).
- VooSquare's launcher addresses work: `/dashboard` → `/app`, `/settings` → `/app#help`.
- **Logout everywhere:** a session that started with VooSquare logs out to `VOO_BASE/oauth/logout?redirect_uri=https://joinvoo.com/`.
  A password session just logs out of Joinvoo.
- Start and callback are limited to 120 requests per address per 10 minutes.

## 3. Affiliate hand-off

Affiliate links (`voosquare.com/a/<code>?p=joinvoo…`) land on `joinvoo.com/?ref=…&vclick=…`. Joinvoo keeps `ref`, `vclick` and
`coupon` in the kit's `voo_attr` cookie (that response is never cached) and every public page loads `/voo-connect-browser.js`.
"Continue with VooSquare" hands them to VooSquare, which attributes the **new** Voo ID to the affiliate. Joinvoo's older links
(`?aff=CODE`, `/a/CODE`) are passed on as `ref` when there is no VooSquare click.

## 4. Events (`POST VOO_BASE/api/v1/events`, sent by the kit)

Only for customers linked to a Voo ID. Stored in the database (`voo_kit_outbox`) first, so they survive restarts and deploys;
sent every 5 s (`VOO_OUTBOX_MS`), 100 per call, retried with backoff. Every `event_id` is stable and at most 80 characters.
Events VooSquare refuses (its `rejected` list) are counted as "refused" on the Admin → VooSquare card and logged with the reason;
Admin → Health shows waiting, sent in 24 h and the last error.

| When | Event | Commission |
|---|---|---|
| A top-up is paid | `wallet_topup` `jv_topup_<deposit id>` (+ hashed payment fingerprint) | no |
| A plan is charged from the wallet (upgrade or monthly fee) | `spend` `jv_pay_<ledger id>` for the **real money** in it, plus `plan_started` `jv_plan_<id>` (first) or `plan_renewed` `jv_renew_<id>` with the plan's **list** price | spend: yes |
| Credits used on extra joins, FTD fees and Joe | one `spend` per customer per finished UTC day, `jv_use_<YYYY-MM-DD>_<voo id>` | yes |
| Unused top-up money is refunded (Admin → Deposits → Refund) | `refund` `jv_rf_<deposit>_<n>`, `original_event_id` = the top-up | no clawback |
| A top-up is charged back (Admin → Deposits → Chargeback) | `chargeback` `jv_cb_<deposit>_<n>` against each `spend` it paid for, newest first | clawback |
| Activity in the customer's funnels | `join`, `lead`, `signup`, `ftd`, `deposit`, `bot_blocked`; labels name the source, never the person | no |
| Pro cancelled | `plan_cancelled` | no |

"Real money" = paid top-ups minus refunds and chargebacks. Welcome, bonus, promo and admin credits never create a `spend`.
Money used before an account was linked is never reported. No end customer's Telegram ID, name, phone or email is ever sent.

## 5. Summary

`GET /api/voosquare/summary?voo_id=…&period=1d|7d|30d`, `Authorization: Bearer <VOO_API_KEY>` (checked by the kit): `joins`, `ftds`,
`revenue_usd`, `cost_per_ftd_usd`, `bots_blocked`. Unknown Voo ID → `{"linked": false}`.

## 6. Support

- **Joinvoo → VooSquare** (Support bridge on): each customer chat message goes through the kit's `support.send`
  (`external_ref: joinvoo-<ticket id>`).
- **VooSquare → Joinvoo:** replies arrive on `POST /hooks/voosquare/support` (Bearer API key, checked by the kit). The older address
  `/api/voosquare/support/webhook` still works.
- **HQ reading Joinvoo's desk** (Bearer API key): `GET /api/voosquare/support/boxes`, `GET /api/voosquare/support/tickets`,
  `GET /api/voosquare/support/tickets/jv-<id>`, `POST …/jv-<id>/reply`, `POST …/jv-<id>/update`.
- Optional: `VOO_WIDGET=1` adds `VOO_BASE/widget.js` (`data-product="joinvoo"`) to public pages.

## 7. No interference with VooSquare

Joinvoo's cookies are `jp_session`, `jv_*`, and the kit's `voo_attr` / `voo_state`, all host-only (no `Domain`), so they never
reach voosquare.com. VooSquare's are `vs_*`. Joinvoo sets no site-wide CSP, so the widget script loads. Redirects after login only
go to paths on joinvoo.com.

## 8. Tests

- `tests/e2e-vooconnect.js` (in `bash tests/runall.sh`): the kit against a fake VooSquare (`tests/oidcmock.js`, :4410): login,
  linking, hand-off, every money event, refunds, chargebacks, summary, support, logout, admin card, widget.
- End-to-end against a real VooSquare and a real browser: see `/tmp/claude-0/findings/joinvoo-report.md` (the proof script starts
  VooSquare on :4831 and Joinvoo on :4832, runs `check.js` and a Playwright walk-through).
