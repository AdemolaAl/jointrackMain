# Round 18 API: Setup helper + Accounts I manage (6 October 2026)

Additions to the Round 17 team API (`docs/round17-api.md`). Same session cookie, JSON, `{ "error": "..." }` on 4xx. Times are ms since 1970 (UTC).
Nothing changes for existing owners, managers and media buyers: every field below is new, and every existing field keeps its meaning.

## 1. The `helper` role ("Setup helper")

| Role | Can | Can't |
|---|---|---|
| `helper` | exactly what a `manager` can (the manager allow-list is reused, not copied): every channel and every result; add/edit/remove channels, connect bots, ad platforms, request-to-join, own-website snippets, backup channels, link domain per channel, spend | billing, wallet, top-ups, plan, withdrawals, referrals/affiliate payouts, credits, team management, postback key / API keys, a bot's `forward_url`, link domains (add/remove), Meta connect/sync/disconnect, Joe, integrations, account deletion |

Inside the owner's workspace a helper's calls answer **403** `{ "error": "...", "team_role": "helper", "team_denied": true }` outside that list, like a manager's.
`GET /api/channels` → `"team_role": "helper"`. `GET /api/workspace` → `current.role: "helper"`, `channel_ids: null` (all channels).

### Free on every plan
- The setting `team.helper_free` (default **1**, env `TEAM_HELPER_FREE`, Admin → Settings → Plans & trial → *Free Setup helpers (every plan)*) is how many helpers each account gets free, on Basic, Pro and the trial.
- A free helper holds **no seat**: it is never counted in `seats.used`, never charged, and never paused by a downgrade or an unpaid month.
  Which helpers are free: the oldest helpers (active, paused, or with an open invite), up to `team.helper_free`. When the free helper is removed, the next helper takes over the free slot.
- Any further helper is a normal seat (counted and charged like a manager seat): on Basic that's **402**, on Pro it uses an included seat, then a paid extra seat (`$5/month`, or **402** `topup` with an empty wallet).

### `POST /api/team/invite` (owner)
`{ "email": "sam@freelance.io", "role": "helper" }` (`channel_ids` is ignored for helpers: they see every channel). Optional `"expires_at"` (see 3).
Response as before; `member` has `"role": "helper", "role_name": "Setup helper", "all_channels": true, "free": true`, `charged_cents: 0`.
A second helper on a plan without seats → **402**
```json
{ "error": "Your free Setup helper is already invited. Remove them first to invite someone else, or upgrade to Pro to add more helpers as team seats (3 included, then $5 a month each).",
  "upgrade": true, "helper_limit": true, "limit": { "kind": "seats", "used": 0, "max": 0, "plan": "basic", "helper_free": 1 } }
```
The invite link, email, `/join-team/<token>`, `GET /api/team/invite-info` (`role: "helper"`, `role_name: "Setup helper"`), sign-up/login with `team_token` and `POST /api/team/accept` work exactly as for other roles.

### `GET /api/team` (owner) — new fields
- `seats.helper_free` (setting) and `seats.helpers_free_used` (0/1…).
- `members[].expires_at` (`null` or ms) and, for helpers only, `members[].free` (`true` = the free one).
- `roles` gets a third entry `{ "id": "helper", "name": "Setup helper", "free": true, "can": "..." }` (manager and buyer stay first).
- `log[].action` may be `team.expire`; `team.invite` summaries of a free helper carry `"free": true`.

### `PATCH /api/team/:id` (owner)
`{ "role": "helper" }` is allowed. Turning the free helper into a manager or buyer needs a seat like an invite (402 on a plan without one, a paid seat on Pro when the included ones are used) unless another helper takes over the free slot.

### `DELETE /api/team/:id` (owner)
Unchanged: the helper loses access at once (their sessions leave the workspace, the next request is in their own account).

## 2. `GET /api/managed` — "Accounts I manage"

Always about the logged-in person (works from inside any workspace). Optional `?tz=<minutes>` (like `getTimezoneOffset()`) for "today".
```json
{ "eligible": true, "count": 3, "capped": false, "max": 200, "current_owner_id": 7, "from_day_start": 1791...,
  "accounts": [
    { "owner_id": 44, "own": true, "role": "owner", "role_name": "Owner", "status": "active", "pause_reason": null, "name": "Sam", "email": "sam@freelance.io", "current": false,
      "paused": false, "channels": 0, "joins_today": 0, "joins_7d": 0, "deposits_7d": 0, "revenue_7d_cents": 0,
      "alerts": [ { "kind": "setup", "missing": ["bot", "channel"], "label": "Setup not finished: no bot" } ] },
    { "owner_id": 7, "own": false, "role": "helper", "role_name": "Setup helper", "status": "active", "name": "Ada", "email": "ada@x.com", "current": true, "expires_at": 1792...,
      "paused": false, "channels": 3, "joins_today": 7, "joins_7d": 15, "deposits_7d": 1, "revenue_7d_cents": 4000,
      "alerts": [ { "kind": "dead_link", "n": 1, "label": "Ad link may be blocked" } ] },
    { "owner_id": 9, "own": false, "role": "buyer", "status": "paused", "pause_reason": "plan", "paused": true,
      "channels": null, "joins_today": null, "joins_7d": null, "deposits_7d": null, "revenue_7d_cents": null, "alerts": [] } ] }
```
- One entry per workspace the person can open: their own first, then each team (active or paused; ended access and suspended owners are left out), **at most 200**.
- `eligible`: the person is on **2+ teams** or a **Setup helper** on at least one → show the page and its entry points.
- Numbers are what that role may see: owners, managers and helpers every channel; a **media buyer only the channels given to them** (and only conversions on those channels). `revenue_7d_cents` is `null` on a locked (Basic after the trial) account. A paused membership shows no numbers.
- `alerts[].kind`: `lost_channel` (`n`), `dead_link` (`n`), `setup` (`missing`: `bot` — not for buyers —, `channel`, `ads` = no Meta/TikTok/Snapchat pixel + token on any channel), `tracking_paused` (the account can't track for billing reasons). **No billing amounts** (wallet, credits, plan, prices) are ever returned.
- Efficient: a fixed number of grouped queries over all accounts (channels, hourly joins, conversions, bots, buyer channel access), not one per channel; the billing state (tracking paused, locked revenue) is still read per account (a few small indexed lookups each; about 60 ms for 150 accounts in the tests). Rejected (reversed) deposits are not counted.
- Open an account: `POST /api/workspace { "owner_id": 7 }` (own account: your id or 0), then reload channels/stats.

## 3. "Access ends on" (`expires_at`) — any member

- `POST /api/team/invite` and `PATCH /api/team/:id` accept `"expires_at"`: ms since 1970, an ISO date-time, or `"YYYY-MM-DD"` (end of that day, UTC; impossible dates like 2027-02-30 → 400. The dashboard sends ms: the end of the picked day in the user's own time zone); `null` / `""` = no end. Must be in the future and at most 3 years away (400 otherwise).
- When it passes the member is removed (like Remove): status `removed`, channel access deleted, their sessions leave the workspace, an inbox note to both sides, audit `team.expire`.
  Checked on **every request** of that person (`teamCtx`), on workspace switches and invite accepts, by the team job and by a 1-minute expiry job
  (`TEAM_EXPIRE_MS`, default 60 000; admin job runner: `POST /api/admin/jobs/run {"job":"team_expire"}`).
- `GET /api/workspace` / `/api/me` `workspace.workspaces[]` carry `expires_at` when set.

## 4. Admin
`GET/PUT /api/admin/settings` → `round17.helper_free` (0–100). The setting is in the same card as the seat settings.
