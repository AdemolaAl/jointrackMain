# Round 17 API for the dashboard (6 October 2026)

Team seats, daily Telegram report, channel ban protection, Meta spend sync, dead-link warning, depositor audience guide.
Everything is JSON, same session cookie as the rest of `/api/*`. Money is in **cents = credits** (1 credit = $0.01). Times are
milliseconds since 1970 (UTC). Errors are `{ "error": "Text to show" }` with a 4xx status, as everywhere else.

Deep links used in alerts (inbox `cta_url` is `#tab:<path>`, Telegram/email links are `https://<site>/app#<path>`):

| Path | Show |
|---|---|
| `channels/<id>` | that channel |
| `channels/backup/<id>` | "Pick a backup channel" for that (lost) channel → `PATCH /api/channels/<id> {backup_channel_id}` |
| `channels/switch-back/<id>` | "Switch back" → `POST /api/channels/<id>/switch-back` |
| `channels/link-domain/<id>` | "Switch link domain" → `GET /api/deadlink/options?channel_id=<id>` then `PATCH /api/channels/<id>` with the option's `patch` |
| `spend` | Spend page (Meta connection, "Reconnect Meta") |
| `team` | Team page |
| `wallet` | Wallet (top-up / upgrade) |

---

## 1. Team seats and workspaces

### Roles

| Role | Can | Can't |
|---|---|---|
| `owner` (the account) | everything | — |
| `manager` | all channels and all results; add/edit/remove channels, connect bots, spend (add/import/delete), map Meta campaigns, see domains and Meta status | billing, wallet, top-ups, plan, withdrawals, referrals, team management, postback key / API keys, link domains (add/remove), Meta connect/sync/disconnect, Telegram alerts settings, Joe, integrations, account settings of the owner |
| `buyer` (media buyer) | only the channels given to them: stats, joins/people, clicks, deposits, compare, funnel, cohorts, breakdown, CSV export, spend rows of those channels, audience guide, edit those channels' settings (pixel, landing, backup within their channels), record a conversion for their people, own leaderboard row | everything else (403) |

Inside a team workspace every call outside the role's allow-list answers **403** `{ "error": "...", "team_role": "buyer", "team_denied": true }`.
A buyer asking for another channel (`?channel=<id>` on any data endpoint) gets **403**; `/api/channels/<id>…` of a channel they don't have → **404**.
`/api/me`, `/api/me` (PATCH), `/api/password`, `/api/inbox*`, `/api/verify/resend` and `/api/admin/*` always act on the logged-in person.
In a team workspace the postback URL and `hook_start`/`hook_blocked` are returned empty/`null` (they contain the owner's API key).

### Seats

- Basic: `team.basic_included` seats (default **0**) and no extra seats → inviting answers **402** `{ "error": "...", "upgrade": true, "limit": { "kind": "seats", "used": 0, "max": 0, "plan": "basic" } }`.
- Pro (and the Pro trial, admins, BILLING=off): `team.pro_included` seats included (default **3**). Each extra seat is `team.seat_cents` (default **500** = $5) a month,
  charged from the wallet **in full when the seat is added** and again each month (with the plan renewal / the seat job). Not enough credits → **402**
  `{ "error": "...", "topup": true, "need_cents": 500, "cost_cents": 500, "limit": {...} }`.
- A seat is used by an **active** member or an **open invite** (not expired). Removing someone frees the seat (no refund); re-adding someone in the same month reuses the already-paid seat.
- Pro → Basic (or trial ended): members beyond Basic's seats become `paused` (`pause_reason: "plan"`); their sessions drop back to their own workspace. Upgrading brings them back.
  Wallet can't pay a month's extra seats → newest extra members `paused` (`pause_reason: "unpaid"`); they come back after a top-up.

### `GET /api/team` (owner)
```json
{
  "seats": { "plan": "pro", "included": 3, "used": 4, "extra": 1, "extra_paid_this_month": 1, "paused": 0, "seat_cents": 500, "can_buy_extra": true, "pro_included": 3, "month": "2026-10" },
  "email_on": false,
  "invite_days": 7,
  "members": [
    { "id": 12, "email": "mia@x.com", "role": "manager", "role_name": "Manager", "status": "active",
      "pause_reason": null, "user_id": 44, "account_email": "mia@x.com", "name": "Mia", "invited_at": 1791..., "joined_at": 1791...,
      "invite_expires_at": null, "channel_ids": [], "all_channels": true, "daily_report": false }
  ],
  "channels": [ { "id": 3, "title": "Alpha", "type": "channel", "status": "active" } ],
  "roles": [ { "id": "manager", "name": "Manager", "can": "..." }, { "id": "buyer", "name": "Media buyer", "can": "..." } ],
  "log": [ { "at": 1791..., "actor_email": "own@x.com", "action": "team.invite", "summary": { "member": "mia@x.com", "role": "manager", "channels": [], "charged_cents": 0 } } ]
}
```
`status`: `invited` | `expired` (invite older than 7 days) | `active` | `paused`. `log.action`: `team.invite`, `team.accept`, `team.update`, `team.resend`, `team.remove`, `team.pause`, `team.resume`.

### `POST /api/team/invite` (owner)
Request: `{ "email": "ben@x.com", "role": "buyer", "channel_ids": [3, 5] }` (`role`: `manager` | `buyer`; `channel_ids` optional, unknown ids ignored).
Response 200:
```json
{ "ok": true, "member": { ...member }, "invite_url": "https://joinvoo.com/join-team/<token>", "emailed": false, "charged_cents": 500, "seats": { ...seats } }
```
Show `invite_url` with a Copy button (always; when `emailed` is false say "Email isn't set up, share this link"). 400: bad email/role, yourself, already on the team. 402: see Seats. 429: too many invites.

### `PATCH /api/team/:id` (owner)
Request: `{ "role": "manager" }` and/or `{ "channel_ids": [3] }` (replaces the list). Response: `{ "ok": true, "member": {...} }`.

### `DELETE /api/team/:id` (owner)
Response: `{ "ok": true, "seats": {...} }`. The person gets an inbox note; their session leaves the workspace.

### `POST /api/team/:id/resend` (owner, open/expired invites only)
Response: `{ "ok": true, "member": {...}, "invite_url": "...", "emailed": false, "charged_cents": 0 }`. An expired invite needs a seat again (402 rules apply). 400 when they already joined.

### Invite link flow
- `GET /join-team/<token>` (link in the email):
  - logged out, no account for that email → `302 /signup?team=<token>&email=<email>`
  - logged out, account exists → `302 /login?team=<token>&email=<email>`
  - logged in → `302 /app?team=<token>&email=<email>` → the dashboard shows "Join <owner>'s team as <role>?" and calls `POST /api/team/accept`
  - invalid/expired → `302 /app?team_error=invalid|expired` (or `/login?...` when logged out)
- `GET /api/team/invite-info?token=<token>` (no login needed): `{ "ok": true, "valid": true, "expired": false, "email": "ben@x.com", "role": "buyer", "role_name": "Media buyer", "owner_name": "Ola", "owner_email": "own@x.com", "account_exists": true }` (404 invalid, 410 expired).
- `POST /api/signup` and `POST /api/login` accept an extra `"team_token": "<token>"`; the response then has `"team": { "ok": true, "owner_id": 7, "owner_name": "Ola", "role": "buyer", "status": "active", "paused": false }`
  (or `"team": { "error": "...", "code": "expired" }` — the account/login still succeeds) and the session starts **inside the team workspace**.
  Any email may accept (the link is the secret and is bound to whoever accepts it).
- `POST /api/team/accept` `{ "token": "<token>" }` (logged in) → `{ "ok": true, "owner_id": 7, "owner_name": "Ola", "role": "buyer", "status": "active", "paused": false }` and switches the session into that workspace. Errors: 404 `code: invalid`, 410 `code: expired`, 400 `code: own|member`.

### Workspace switcher
`GET /api/workspace`, also included as `workspace` in `GET /api/me`:
```json
{ "current": { "owner_id": 7, "own": false, "role": "buyer", "status": "active", "pause_reason": null, "name": "Ola", "email": "own@x.com", "channel_ids": [3] },
  "workspaces": [
    { "owner_id": 44, "own": true, "role": "owner", "status": "active", "name": "Ben", "email": "ben@x.com" },
    { "owner_id": 7, "own": false, "role": "buyer", "status": "active", "pause_reason": null, "name": "Ola", "email": "own@x.com" } ] }
```
`POST /api/workspace` `{ "owner_id": 7 }` → same shape + `"ok": true`. Own workspace: your own id (or 0/null). 403 not a member, 403 `{ "paused": true }` paused.
After switching, reload everything (channels, stats…). `GET /api/channels` also returns `"team_role": "owner" | "manager" | "buyer"`.

### `GET /api/team/leaderboard?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=<minutes>`
Owner and managers see every row; a buyer only their own.
```json
{ "from": "2026-09-30", "to": "2026-10-06", "locked": false,
  "rows": [ { "member_id": 13, "user_id": 45, "email": "ben@x.com", "name": "Ben", "role": "buyer", "status": "active", "channels": 1, "channel_ids": [3],
              "clicks": 120, "joins": 40, "ftds": 6, "revenue_cents": 30000, "spend_cents": 9000, "cost_per_join_cents": 225, "cost_per_ftd_cents": 1500 } ] }
```
A person's channels = channels they added (`channels.created_by`) + channels given to them. The owner row has channels nobody on the team added.
Spend counts when it's tied to a channel (Meta sync maps campaigns to channels; manual rows can carry `channel_id`). `locked` (Basic after the trial): revenue and cost per FTD are `null`.

### Other additions
- `POST /api/spend` accepts optional `"channel_id"`. `GET /api/spend` rows now include `"source": "manual" | "meta"` and `"channel_id"`.
- `GET /api/channels` channels include `"created_by"` (user id or `null` = the owner / before round 17).
- `GET /api/billing` → `credits.seats` (credits used on extra seats); ledger rows `kind: "seats"`.

---

## 2. Daily report in Telegram

### `GET /api/report-settings`
```json
{ "scope": "own", "enabled": true, "hour": 8, "tz": "Africa/Lagos", "hour_note": null, "linked": true, "via": "tracking_bot",
  "link_options": [ { "via": "alert_bot", "username": "JoinvooAlertsBot", "url": "https://t.me/JoinvooAlertsBot?start=report-1z-3f9a0c1b2d4e" },
                    { "via": "tracking_bot", "bot_id": 4, "username": "mytrack_bot", "url": "https://t.me/mytrack_bot?start=report-1z-3f9a0c1b2d4e" } ],
  "last_sent": { "day": "2026-10-06", "at": 1791..., "ok": true } }
```
- `scope`: `own` (your account) or `team` (inside a team workspace: a report of that team, a buyer's only of their channels; opt-in per member).
- `hour`: local hour (0–23) in the profile time zone; `tz: null` → UTC (`hour_note` says so). Default 8.
- Connect Telegram: show the `link_options` (the alert bot first if present, else "your bot @x"). Opening the link and pressing **Start** links the chat
  (the bot answers "✅ Connected!") and switches the report on. Poll `GET` until `linked` is true. If the customer already linked the Joinvoo alert bot for alerts,
  `linked` is already true (`via: "alert_bot"`).
- Not configured yet (`enabled` false and never saved) the old morning summary of the alert bot keeps working as before; once the customer saves this setting, the new report replaces it.

### `PATCH /api/report-settings`
Request: `{ "enabled": true, "hour": 7 }` (either), `{ "hour": null }` (back to 8), `{ "disconnect": true }` (forget the chat). Response: `{ "ok": true, ...settings }`. 400 bad hour.

### `POST /api/report-settings/test`
Sends yesterday's report now. 200 `{ "ok": true, "sent": true, "via": "tracking_bot", "text": "📊 Joinvoo daily report · Mon 5 Oct\n…", "report": {...} }`.
Not linked: 400 `{ "error": "...", "not_linked": true, "text": "...", "report": {...}, "link_options": [...] }` (show the preview anyway). 502 Telegram refused.
`report`:
```json
{ "day": "2026-10-05",
  "totals": { "clicks": 120, "joins": 50, "ftd": 3, "revenue_cents": 12000, "spend_cents": 3000, "cost_per_join_cents": 60, "cost_per_ftd_cents": 1000 },
  "previous": { "clicks": 50, "joins": 20, "ftd": 1, "revenue_cents": 4000, "spend_cents": 2000 },
  "best_channel": { "id": 3, "title": "Main", "n": 3, "by": "FTDs" }, "best_campaign": { "name": "CampA", "n": 2, "by": "FTDs" } }
```
The message: clicks, joins, deposits (FTDs), revenue, spend, cost per join, cost per deposit (each with ↑/↓ % vs the day before), best channel and best campaign.
Sent once per day per person (sent log), by the 15-minute job.

---

## 3. Channel ban protection

New fields on every channel in `GET /api/channels`:
```json
{ "backup_channel_id": 5, "backup_title": "Backup", "auto_failover": true,
  "lost_at": 1791..., "lost_reason": "bot_kicked", "failed_over_to": 5, "failed_over_title": "Backup", "recovered_at": null, "can_switch_back": false,
  "deadlink_at": null, "link_host": null, "created_by": null }
```
- `lost_reason`: `bot_kicked`, `bot_left`, `admin_rights_removed`, `no_invite_rights`, `chat_not_found` (deleted/banned), `forbidden`, `invite_failed`.
- `auto_failover`: effective value (default ON when a backup is set). `status` keeps its old meaning (`active`, `no_rights`, `removed`); "lost" is `lost_at`.
- When lost with a backup and auto-failover on: the channel's tracking link now sends visitors to the backup (`redirect_to` = `failed_over_to`), so running ads keep working.
- When the bot is admin again: `lost_at` back to `null`, `recovered_at` set, link **stays** on the backup; `can_switch_back` true → show "Switch back".
- Alerts (inbox `kind: "alert"`, Telegram to the report/alert chat, email when an email provider is set), one per incident: "“X” was lost: ads now go to “Y”" / "“X” was lost: pick a backup channel" / "“X” is back".

### `PATCH /api/channels/:id`
- `{ "backup_channel_id": 5 }` (or `null`) — another channel/group of the account (not a bot, not itself; buyers: one of theirs). If the channel is **already lost**, picking a backup switches the link to it at once (`"switched": true`).
- `{ "auto_failover": false }` (`true`, `false`, or `null` = default).
- `{ "link_host": "go2link.com" }` (or `null`) — see dead-link below.
Response (only these keys sent): `{ "ok": true, "switched": true, "backup_channel_id": 5, "auto_failover": true, "link_host": null, "domain_id": null, "tracking_url": "https://gojoinly.com/c/ab12c", "redirect_to": 5, "failed_over_to": 5, "lost_at": 1791... }`.

### `POST /api/channels/:id/switch-back`
→ `{ "ok": true, "redirect_to": null, "failed_over_to": null }`. 400 while still lost or when not switched to a backup.

---

## 4. Meta ad spend sync

All `/api/meta*` answer `{ "available": false, "reason": "Waiting for Meta app approval", "connected": false, "status": "unavailable" }` until the Meta app ID and secret are set → show **Coming soon**.

### `GET /api/meta`
```json
{ "available": true, "connected": true, "status": "connected", "status_label": "Connected", "fb_name": "Ola FB", "connected_at": 1791..., "expires_at": 1796..., "last_sync_at": 1791..., "last_error": null,
  "connect_url": "/auth/meta/start", "redirect_uri": "https://joinvoo.com/auth/meta/callback",
  "accounts": [ { "id": "act_111", "account_id": "111", "name": "Main USD", "currency": "USD", "account_status": 1, "selected": true, "supported": true, "last_sync_at": 1791..., "last_error": null } ] }
```
`status`: `not_connected` | `connected` | `reconnect_needed` (token expired/revoked → button "Reconnect Meta" = `connect_url`). `supported` false: currency other than USD/NGN (not synced, `last_error` explains).

- **Connect**: open `GET /auth/meta/start` as a normal navigation (owner only). It goes to Facebook (scope `ads_read`) and comes back to
  `/app?meta=connected#spend`, or `/app?meta_error=denied|state|exchange|login|owner_only#spend`, or `/app?meta=unavailable#spend`. One ad account is picked automatically; with more, ask the customer to pick.
- `PATCH /api/meta/accounts` `{ "selected": ["act_111", "222"] }` (owner) → `{ "ok": true, ...meta }`.
- `POST /api/meta/sync` (owner) → `{ "ok": true, "sync": { "ok": true, "rows": 14, "errors": [] }, ...meta }`. The hourly job does this by itself (last 7 days, per campaign per day).
- `DELETE /api/meta` (owner) → disconnect, keeps synced spend; `DELETE /api/meta?purge=1` also deletes the Meta spend rows (manual rows stay).
- `GET /api/meta/campaigns` (owner, manager) → `{ "campaigns": [ { "campaign_id": "238...", "name": "CampA", "account_id": "111", "channel_id": 3, "channel_title": "Main", "mapped_by": "auto", "last_seen": "2026-10-05", "spend_7d_cents": 2500 } ] }`.
  `mapped_by`: `auto` (the campaign name or id matches `utm_campaign` / `campaign_id` in that channel's clicks), `user`, or `null` (unassigned).
- `PATCH /api/meta/campaigns/:campaign_id` `{ "channel_id": 3 }` (or `null`) (owner, manager) → `{ "ok": true, "campaign_id": "238...", "channel_id": 3, "spend_rows_updated": 7 }`. A manual mapping is kept by later syncs.

Synced rows appear in `GET /api/spend` with `"source": "meta"`; they count in stats, compare, breakdown and the leaderboard like manual rows.
Rows typed by hand (`source: "manual"`) are never changed by the sync.

---

## 5. Dead-link warning

- Every 15 minutes. A channel is flagged when its clicks in the last 2 full hours are ≤ 5% of usual, while the same hours on **each** of the previous 3 days had
  clicks (average ≥ 10 an hour, every day at least half of that), and — if Meta spend is synced — Meta spend is still running today. All thresholds are admin settings.
- One warning per episode (inbox + Telegram + email), grouped per link domain: "Your ad link may be blocked or paused" with a "Switch link domain" deep link
  (`channels/link-domain/<id>`). `deadlink_at` on the channel is set while the episode lasts. Nothing is switched automatically.

### `GET /api/deadlink/options?channel_id=<id>`
```json
{ "channel_id": 7, "current_host": "gojoinly.com", "deadlink_at": 1791...,
  "options": [ { "type": "joinvoo", "host": "gojoinly.com", "current": true, "patch": { "link_host": "gojoinly.com" } },
               { "type": "joinvoo", "host": "go2link.com", "current": false, "patch": { "link_host": "go2link.com" } },
               { "type": "custom", "domain_id": 4, "host": "go.mybrand.com", "live": true, "current": false, "patch": { "domain_id": 4 } } ],
  "note": "Links already running in your ads keep working on every domain; new links use the one you pick." }
```
One tap = `PATCH /api/channels/<id>` with the option's `patch`. The response has the new `tracking_url` (the customer must update the link in their ads).
`GET /api/channels` also returns `"link_domains": ["gojoinly.com", "go2link.com"]`.

---

## 6. Depositor audience guide

### `GET /api/audience-guide`
```json
{ "event_name": "Purchase", "repeat_deposit_event": "Deposit", "registration_event": "CompleteRegistration", "value_sent": true,
  "value_note": "Deposits are sent as Purchase with value and currency whenever your postback includes the amount...",
  "has_ftd_events_last_30d": true, "count": 37, "ftd_30d": 40, "lookalike_min": 100, "ready_for_lookalike": false, "pixels": ["884210395527140"],
  "channels": [ { "channel_id": 3, "title": "Main", "pixel_id": "884210395527140", "has_token": true, "join_event": "Subscribe", "ftd_30d": 40, "ftd_sent_30d": 37, "ftd_with_value_30d": 35 } ],
  "steps": [ "Open Meta Ads Manager → Audiences → Create audience → Custom audience.", "Source: Website. Pick your pixel (884210395527140).", "Events: choose “Purchase” …", "Then Create audience → Lookalike …", "Use the lookalike …" ] }
```
`count` = first deposits sent to Meta in the last 30 days (Meta needs ~100 people for a lookalike → `ready_for_lookalike`).
