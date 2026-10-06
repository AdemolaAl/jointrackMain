// Round 17 (part 2): daily Telegram report (linking through the customer's own tracking bot, content, once per day, a media buyer's own
// scope), channel ban protection (kicked bot → lost + auto-failover to the backup channel, one alert per incident, "back" offers to switch
// back without doing it; refused invite links N times → lost; a transient refusal is re-checked and fixed; pick a backup in one tap),
// the dead-link warning (synthetic hourly clicks: quiet now, busy the same hours on previous days; night-time lulls ignored; once per
// episode; Meta spend still running required when spend is synced; one-tap switch to a backup link domain), Meta spend sync through
// OAuth against a fake Graph API on :4900 (encrypted token, accounts, paging, NGN, unsupported currency, campaign → channel mapping,
// manual rows never overwritten, token revoked → reconnect needed), and the depositor audience guide (FTD = Purchase with value).
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const mset = (o) => fetch('http://localhost:4000/__set', { method: 'POST', body: JSON.stringify(o) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);
let ipn = 40;
const click = (slug, camp) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.11.' + (ipn++) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwR' + ipn + '&utm_campaign=' + camp }) }).then((x) => x.json());
const day = (k) => new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
const d = day(0);

// ---------- fake Meta Graph API ----------
const G = { revoked: false, today: false, campA: '12.34', calls: [], proofOk: true };
const SECRET = 'meta_test_secret';
const graph = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), J = (s, o) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  G.calls.push(u.pathname + u.search);
  const tok = u.searchParams.get('access_token');
  if (u.pathname === '/v21.0/oauth/access_token') {
    if (u.searchParams.get('client_secret') !== SECRET || u.searchParams.get('client_id') !== '1234567890') return J(400, { error: { code: 1, message: 'bad app' } });
    if (u.searchParams.get('grant_type') === 'fb_exchange_token') return J(200, { access_token: 'LONG_' + u.searchParams.get('fb_exchange_token'), token_type: 'bearer', expires_in: 5184000 });
    if (u.searchParams.get('code') !== 'good-code' || !/\/auth\/meta\/callback$/.test(u.searchParams.get('redirect_uri') || '')) return J(400, { error: { code: 100, message: 'bad code' } });
    return J(200, { access_token: 'SHORT1', token_type: 'bearer', expires_in: 3600 });
  }
  if (!tok) return J(400, { error: { code: 104, message: 'An access token is required' } });
  if (u.searchParams.get('appsecret_proof') !== crypto.createHmac('sha256', SECRET).update(tok).digest('hex')) G.proofOk = false;
  if (G.revoked) return J(400, { error: { code: 190, type: 'OAuthException', message: 'Error validating access token: The user has not authorized application 1234567890.' } });
  if (u.pathname === '/v21.0/me') return J(200, { id: 'fb77', name: 'Ola FB' });
  if (u.pathname === '/v21.0/me/adaccounts') return J(200, { data: [{ account_id: '111', id: 'act_111', name: 'Main USD', currency: 'USD', account_status: 1 }, { account_id: '222', id: 'act_222', name: 'Naira', currency: 'NGN', account_status: 1 }, { account_id: '333', id: 'act_333', name: 'Euro', currency: 'EUR', account_status: 1 }] });
  if (u.pathname === '/v21.0/act_111/insights') {
    if (!u.searchParams.get('after')) return J(200, { data: [{ campaign_id: 'c1', campaign_name: 'CampA', spend: G.campA, date_start: day(1), date_stop: day(1) }, { campaign_id: 'c1', campaign_name: 'CampA', spend: '10.00', date_start: day(2), date_stop: day(2) }],
      paging: { cursors: { after: 'P2' }, next: `http://localhost:4900/v21.0/act_111/insights?level=campaign&after=P2&access_token=${tok}&appsecret_proof=x` } });
    const data = [{ campaign_id: 'c2', campaign_name: 'Unmatched Camp', spend: '5.00', date_start: day(1), date_stop: day(1) }];
    if (G.today) data.push({ campaign_id: 'c4', campaign_name: 'TodayCamp', spend: '3.00', date_start: d, date_stop: d });
    return J(200, { data, paging: { cursors: { before: 'P1' } } });
  }
  if (u.pathname === '/v21.0/act_222/insights') return J(200, { data: [{ campaign_id: 'c3', campaign_name: 'NairaCamp', spend: '16000', date_start: day(1), date_stop: day(1) }] });
  return J(404, { error: { code: 803, message: 'unknown path ' + u.pathname } });
});

(async () => {
  await new Promise((r) => graph.listen(4900, r));
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    await put(ADM, '/api/admin/settings', { links: { domain: 'gojoinly.com', backups: ['go2link.com'] } });
    const uid = async (email) => (await ADM('/api/admin/users?q=' + encodeURIComponent(email))).j.users.find((x) => x.email === email).id;
    const O = client();
    await post(O, '/api/signup', { country: 'NG', email: 'own17b@x.com', password: 'password1', name: 'Ola' });
    const oid = await uid('own17b@x.com');
    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'pro' });
    const BOT = 7717000022;
    await post(O, '/api/bots', { token: BOT + ':AAHk3vZq_r17bbotxxxxxxxxxxxxxxxxxxxW' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    const tgPost = (u) => O(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    let upd = 1;
    const member = (id, title, status, extra = {}) => tgPost({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'administrator', user: { id: BOT } }, new_chat_member: { status, user: { id: BOT }, ...extra } } });
    const addCh = (id, title) => member(id, title, 'administrator', { can_invite_users: true });
    for (const [id, t] of [[-1801, 'Main'], [-1802, 'Backup'], [-1803, 'Solo'], [-1804, 'Flaky'], [-1805, 'Busy'], [-1806, 'Night'], [-1807, 'Busy2']]) await addCh(id, t);
    const chs = async () => Object.fromEntries((await O('/api/channels')).j.channels.map((c) => [c.title, c]));
    let C = await chs();
    for (let i = 0; i < 40 && Object.values(await chs()).some((c) => c.pool < 5); i++) await sleep(250);
    C = await chs();
    const slug = (c) => new URL(c.tracking_url).pathname;
    const msgsTo = async (chat) => ((await ms()).msgs || []).filter((x) => x.chat_id === chat);
    const inbox = async () => (await O('/api/inbox')).j.items;

    // ======================= daily report =======================
    let r = await O('/api/report-settings');
    const opt = r.j.link_options.find((x) => x.via === 'tracking_bot');
    assert(r.s === 200 && r.j.enabled === false && r.j.linked === false && r.j.hour === 8 && opt && /^https:\/\/t\.me\/test_track_bot\?start=report-[0-9a-z]+-[0-9a-z]+-[0-9a-f]{16}$/.test(opt.url), 'report settings: off, not linked, link through their own bot');
    const code = opt.url.split('start=')[1];
    await tgPost({ update_id: upd++, message: { message_id: 1, chat: { id: 777001, type: 'private' }, from: { id: 777001, first_name: 'Ola' }, date: 1, text: '/start report-0-000000000000' } });
    assert((await msgsTo(777001)).some((x) => /expired/.test(x.text)), 'a forged code is refused');
    await tgPost({ update_id: upd++, message: { message_id: 2, chat: { id: 777001, type: 'private' }, from: { id: 777001, first_name: 'Ola' }, date: 1, text: '/start ' + code } });
    assert((await msgsTo(777001)).some((x) => /Connected/.test(x.text)), 'Start with the link → “Connected” in Telegram');
    r = await O('/api/report-settings'); assert(r.j.linked && r.j.via === 'tracking_bot' && r.j.enabled === true, 'linked through the tracking bot and switched on');
    r = await O('/api/joins'); assert(r.s === 200 && !r.j.rows.some((x) => x.tg_user_id === 777001), 'the /start report message is not tracked as a subscriber');
    // yesterday vs the day before (UTC: no time zone saved)
    const hY = Math.floor((Date.UTC(...day(1).split('-').map((x, i) => (i === 1 ? +x - 1 : +x)))) / 3600000), hP = hY - 24;
    const hourly = db.prepare(`INSERT INTO hourly(channel_id,hour,owner_id,clicks,joins) VALUES(?,?,?,?,?) ON CONFLICT(channel_id,hour) DO UPDATE SET clicks=clicks+excluded.clicks, joins=joins+excluded.joins`);
    hourly.run(C.Main.id, hY + 10, oid, 100, 40); hourly.run(C.Main.id, hP + 10, oid, 50, 20); hourly.run(C.Backup.id, hY + 11, oid, 20, 10);
    const conv = db.prepare(`INSERT INTO conversions(owner_id,channel_id,event,value_cents,currency,source,matched,created_at,meta_status) VALUES(?,?,?,?,?,?,1,?,?)`);
    for (let i = 0; i < 3; i++) conv.run(oid, C.Main.id, 'ftd', 4000, 'USD', 'postback', (hY + 12) * 3600000, 'sent');
    conv.run(oid, C.Main.id, 'ftd', 4000, 'USD', 'postback', (hP + 12) * 3600000, 'sent');
    await post(O, '/api/spend', { date: day(1), platform: 'meta', campaign: 'Manual', amount: 30, channel_id: C.Main.id });
    await post(O, '/api/spend', { date: day(2), platform: 'meta', campaign: 'Manual', amount: 20 });
    r = await post(O, '/api/report-settings/test');
    const T = r.j.text || '';
    assert(r.s === 200 && r.j.sent && /Clicks: 120 \(↑140%\)/.test(T) && /Joins: 50 \(↑150%\)/.test(T) && /Deposits \(FTDs\): 3 \(↑200%\)/.test(T) && /Revenue: \$120\.00/.test(T), 'report: clicks, joins, FTDs, revenue with ↑ vs the day before');
    assert(/Spend: \$30\.00 \(↑50%\)/.test(T) && /Cost per join: \$0\.60/.test(T) && /Cost per deposit: \$10\.00/.test(T) && /Best channel: Main \(3 FTDs\)/.test(T), 'report: spend, cost per join, cost per deposit, best channel');
    assert((await msgsTo(777001)).some((x) => /daily report/.test(x.text) && /Best channel/.test(x.text)), 'test report delivered to their Telegram');
    r = await patch(O, '/api/report-settings', { hour: 25 }); assert(r.s === 400, 'hour must be 0–23');
    r = await patch(O, '/api/report-settings', { enabled: true, hour: 0 }); assert(r.s === 200 && r.j.hour === 0 && r.j.enabled, 'report at 00:00 UTC (so it is due now)');
    const before = (await msgsTo(777001)).length;
    await post(ADM, '/api/admin/jobs/run', { job: 'daily_report' }); await post(ADM, '/api/admin/jobs/run', { job: 'daily_report' });
    const after = await msgsTo(777001);
    assert(after.length === before + 1 && /daily report/.test(after[after.length - 1].text), 'the job sends it once a day (second run sends nothing)');
    assert(db.prepare(`SELECT COUNT(*) n FROM report_log WHERE user_id=? AND day=?`).get(oid, d).n === 1, 'one row in the sent log');
    r = await O('/api/report-settings'); assert(r.j.last_sent && r.j.last_sent.day === d && r.j.last_sent.ok, 'settings show the last report');
    // a media buyer gets their own channels only
    const BU = client(); await post(BU, '/api/signup', { country: 'NG', email: 'buy17b@x.com', password: 'password1' });
    const inv = await post(O, '/api/team/invite', { email: 'buy17b@x.com', role: 'buyer', channel_ids: [C.Backup.id] });
    await post(BU, '/api/team/accept', { token: inv.j.invite_url.split('/join-team/')[1] });
    r = await patch(BU, '/api/report-settings', { enabled: true, hour: 0 }); assert(r.s === 200 && r.j.scope === 'team' && r.j.enabled && !r.j.linked, 'buyer opts in for the team scope');
    r = await post(BU, '/api/report-settings/test'); assert(r.s === 400 && r.j.not_linked && /Clicks: 20/.test(r.j.text) && !/Main/.test(r.j.text), 'not linked yet → the preview shows only Backup’s numbers');
    const bcode = (await BU('/api/report-settings')).j.link_options.find((x) => x.via === 'tracking_bot').url.split('start=')[1];
    await tgPost({ update_id: upd++, message: { message_id: 3, chat: { id: 777002, type: 'private' }, from: { id: 777002 }, date: 1, text: '/start ' + bcode } });
    await post(ADM, '/api/admin/jobs/run', { job: 'daily_report' });
    const bm = await msgsTo(777002);
    assert(bm.some((x) => /daily report · .*’s team/.test(x.text) && /Clicks: 20 \(new\)/.test(x.text) && !/Main/.test(x.text)), 'the buyer’s morning report covers only their channel');

    // ======================= ban protection =======================
    r = await patch(O, '/api/channels/' + C.Main.id, { backup_channel_id: C.Main.id }); assert(r.s === 400, 'a channel can’t back itself up');
    r = await patch(O, '/api/channels/' + C.Main.id, { backup_channel_id: C.Backup.id });
    assert(r.s === 200 && r.j.backup_channel_id === C.Backup.id && r.j.auto_failover === true, 'backup channel set; auto-failover defaults ON when a backup exists');
    C = await chs(); assert(C.Main.backup_title === 'Backup' && C.Main.auto_failover === true, 'channelsView shows the backup');
    const inbox0 = (await inbox()).length;
    await member(-1801, 'Main', 'kicked');
    C = await chs();
    assert(C.Main.lost_at && C.Main.lost_reason === 'bot_kicked' && C.Main.redirect_to === C.Backup.id && C.Main.failed_over_to === C.Backup.id && C.Main.failed_over_title === 'Backup', 'bot kicked → channel lost, link now points at the backup');
    let ib = await inbox(); const lostNote = ib.find((x) => /“Main” was lost: ads now go to “Backup”/.test(x.title));
    assert(lostNote && lostNote.kind === 'alert' && lostNote.important && lostNote.cta_url === `#tab:channels/${C.Main.id}`, 'in-app alert');
    await sleep(200); assert((await msgsTo(777001)).some((x) => /was lost/.test(x.text) && /Backup/.test(x.text)), 'Telegram alert to the linked chat');
    const bStats0 = (await O(`/api/stats?from=${d}&to=${d}&tz=0`)).j.channels.find((c) => c.id === C.Backup.id);
    const go = await click(slug(C.Main), 'CampA');
    const bStats1 = (await O(`/api/stats?from=${d}&to=${d}&tz=0`)).j.channels.find((c) => c.id === C.Backup.id);
    assert(/t\.me\/\+L/.test(go.url) && (bStats1.clicks || 0) === ((bStats0 && bStats0.clicks) || 0) + 1, 'running ads keep working: the click gets a Backup invite link');
    await member(-1801, 'Main', 'left'); await member(-1801, 'Main', 'kicked');
    ib = await inbox(); assert(ib.filter((x) => /was lost/.test(x.title)).length === 1 && db.prepare(`SELECT COUNT(*) n FROM ch_alerts WHERE kind='channel_lost' AND channel_id=?`).get(C.Main.id).n === 1, 'no alert storm: one alert per incident');
    r = await post(O, `/api/channels/${C.Main.id}/switch-back`); assert(r.s === 400 && /still lost/.test(r.j.error), 'can’t switch back while lost');
    await addCh(-1801, 'Main'); await sleep(150);
    C = await chs();
    assert(!C.Main.lost_at && C.Main.recovered_at && C.Main.redirect_to === C.Backup.id && C.Main.can_switch_back === true, 'bot is admin again → back, but the link stays on the backup (never automatic)');
    ib = await inbox(); const backNote = ib.find((x) => x.title === '“Main” is back');
    assert(backNote && backNote.cta_label === 'Switch back' && backNote.cta_url === `#tab:channels/switch-back/${C.Main.id}`, '“is back” offers to switch back');
    r = await post(O, `/api/channels/${C.Main.id}/switch-back`); assert(r.s === 200, 'switch back');
    C = await chs(); assert(!C.Main.redirect_to && !C.Main.failed_over_to && !C.Main.can_switch_back, 'link goes to Main again');
    r = await post(O, `/api/channels/${C.Main.id}/switch-back`); assert(r.s === 400, 'nothing to switch back now');
    // second incident gets its own alert
    await member(-1801, 'Main', 'left');
    C = await chs(); ib = await inbox();
    assert(C.Main.lost_reason === 'bot_left' && ib.filter((x) => /“Main” was lost/.test(x.title)).length === 2, 'a new incident alerts again');
    await addCh(-1801, 'Main'); await sleep(150); await post(O, `/api/channels/${C.Main.id}/switch-back`);
    // auto-failover off → alert only
    await patch(O, '/api/channels/' + C.Backup.id, { backup_channel_id: C.Busy.id, auto_failover: false });
    await member(-1802, 'Backup', 'kicked');
    C = await chs(); assert(C.Backup.lost_at && !C.Backup.redirect_to && C.Backup.auto_failover === false, 'auto-failover switched off: no switch, only the alert');
    await addCh(-1802, 'Backup'); await sleep(150);
    // invite links refused N times (no backup) → lost with a one-tap "Pick a backup channel"
    await mset({ inviteFail: { '-1803': { ok: false, error_code: 400, description: 'Bad Request: chat not found' } }, gcm: { '-1803': { ok: false, error_code: 400, description: 'Bad Request: chat not found' } } });
    await click(slug(C.Solo), 'SoloCamp');
    for (let i = 0; i < 40 && !(await chs()).Solo.lost_at; i++) await sleep(150);
    C = await chs();
    assert(C.Solo.lost_at && C.Solo.lost_reason === 'chat_not_found' && C.Solo.status !== 'active' && !C.Solo.redirect_to, 'refused 3 times in a row → lost (chat not found)');
    ib = await inbox(); const pick = ib.find((x) => /“Solo” was lost: pick a backup channel/.test(x.title));
    assert(pick && pick.cta_label === 'Pick a backup channel' && pick.cta_url === `#tab:channels/backup/${C.Solo.id}`, 'no backup → alert with the one-tap “Pick a backup channel” deep link');
    r = await patch(O, '/api/channels/' + C.Solo.id, { backup_channel_id: C.Backup.id });
    assert(r.s === 200 && r.j.switched === true && r.j.redirect_to === C.Backup.id, 'picking a backup for a lost channel switches its link at once');
    await mset({ inviteFail: null, gcm: null });
    // a one-off refusal is re-checked: still an admin → fixed, never "lost"
    await mset({ inviteFail: { '-1804': { ok: false, error_code: 400, description: 'Bad Request: not enough rights to manage chat invite links' } } });
    await click(slug(C.Flaky), 'F');
    for (let i = 0; i < 30 && (await chs()).Flaky.status === 'active'; i++) await sleep(100);
    assert((await chs()).Flaky.status === 'no_rights', 'one refused link: the channel stops making links (as before)');
    await mset({ inviteFail: null, gcm: { '-1804': { ok: true, result: { status: 'administrator', can_invite_users: true, user: { id: BOT } } } } });
    for (let i = 0; i < 30 && (await chs()).Flaky.status !== 'active'; i++) await sleep(150);
    C = await chs(); assert(C.Flaky.status === 'active' && !C.Flaky.lost_at && !(await inbox()).some((x) => /Flaky/.test(x.title)), 'the re-check finds the bot is still an admin → tracking resumes, no alert');
    await mset({ gcm: null });

    // ======================= dead-link warning =======================
    const hNow = Math.floor(Date.now() / 3600000);
    const busy = (ch, days, perHour) => { for (const k of days) for (let h = hNow - 2 - 24 * k; h < hNow - 24 * k; h++) hourly.run(ch, h, oid, perHour, 1); };
    busy(C.Busy.id, [1, 2, 3], 30);                   // steady at these hours, quiet now
    busy(C.Night.id, [1], 30);                        // busy on one day only: not steady → no warning
    r = await post(ADM, '/api/admin/jobs/run', { job: 'dead_links' }); assert(r.s === 200, 'dead-link job runs');
    C = await chs(); ib = await inbox();
    const dl = ib.filter((x) => x.title === 'Your ad link may be blocked or paused');
    assert(C.Busy.deadlink_at && !C.Night.deadlink_at && !C.Main.deadlink_at, 'quiet now but steady at these hours on the previous 3 days → flagged; other channels not');
    assert(dl.length === 1 && /“Busy”/.test(dl[0].body) && /about 30 an hour/.test(dl[0].body) && /gojoinly\.com/.test(dl[0].body) && dl[0].cta_url === `#tab:channels/link-domain/${C.Busy.id}`, 'warning names the channel, usual clicks and link domain, with a one-tap switch');
    assert((await msgsTo(777001)).some((x) => /may be blocked or paused/.test(x.text)), 'Telegram warning too');
    await post(ADM, '/api/admin/jobs/run', { job: 'dead_links' });
    assert((await inbox()).filter((x) => x.title === 'Your ad link may be blocked or paused').length === 1, 'once per episode');
    r = await O('/api/deadlink/options?channel_id=' + C.Busy.id);
    assert(r.s === 200 && r.j.current_host === 'gojoinly.com' && r.j.options.some((x) => x.host === 'go2link.com' && x.patch.link_host === 'go2link.com' && !x.current), 'switch options: Joinvoo’s backup link domain');
    r = await patch(O, '/api/channels/' + C.Busy.id, { link_host: 'evil.com' }); assert(r.s === 400, 'only Joinvoo’s own link domains');
    r = await patch(O, '/api/channels/' + C.Busy.id, { link_host: 'go2link.com' });
    assert(r.s === 200 && r.j.tracking_url === `https://go2link.com/c/${C.Busy.tracking_url.split('/c/')[1]}` && r.j.domain_id === 0, 'one tap: new links use the backup domain');
    C = await chs(); assert(C.Busy.link_host === 'go2link.com' && !C.Busy.deadlink_at && /^https:\/\/go2link\.com\//.test(C.Busy.tracking_url), 'channel shows the new link (warning cleared)');
    r = await fetch(B + slug(C.Busy)); assert(r.status === 200, 'the old link path still opens');
    hourly.run(C.Busy.id, hNow - 1, oid, 25, 0);
    db.prepare(`UPDATE channels SET deadlink_at=? WHERE id=?`).run(Date.now(), C.Busy.id);
    await post(ADM, '/api/admin/jobs/run', { job: 'dead_links' });
    assert(!(await chs()).Busy.deadlink_at, 'clicks came back → the episode ends');
    await patch(O, '/api/channels/' + C.Busy.id, { link_host: null });

    // ======================= Meta spend sync =======================
    r = await O('/api/meta'); assert(r.s === 200 && r.j.available === true && r.j.status === 'not_connected' && r.j.connect_url === '/auth/meta/start', 'Meta available (app id set), not connected');
    r = await O('/auth/meta/start');
    const loc = new URL(r.h.get('location'));
    assert(r.s === 302 && loc.origin + loc.pathname === 'http://localhost:4900/dialog/oauth' && loc.searchParams.get('scope') === 'ads_read' && loc.searchParams.get('client_id') === '1234567890' && /\/auth\/meta\/callback$/.test(loc.searchParams.get('redirect_uri')) && O.jar.jv_meta,
      '/auth/meta/start → Facebook dialog (ads_read) with a state bound to a cookie');
    const state = loc.searchParams.get('state');
    r = await O('/auth/meta/callback?code=good-code&state=' + encodeURIComponent(state.replace(/.$/, 'x'))); assert(r.s === 302 && /meta_error=state/.test(r.h.get('location')), 'tampered state refused');
    r = await client()('/auth/meta/callback?code=good-code&state=' + encodeURIComponent(state)); assert(/meta_error=login/.test(r.h.get('location')), 'callback without the session refused');
    r = await O('/auth/meta/start'); const stateD = new URL(r.h.get('location')).searchParams.get('state');
    r = await O('/auth/meta/callback?error=access_denied&state=' + encodeURIComponent(stateD)); assert(/meta_error=denied/.test(r.h.get('location')), 'customer cancels → back with meta_error=denied');
    r = await O('/auth/meta/start'); const state2 = new URL(r.h.get('location')).searchParams.get('state');
    r = await O('/auth/meta/callback?code=good-code&state=' + encodeURIComponent(state2));
    assert(r.s === 302 && /meta=connected/.test(r.h.get('location')), 'callback exchanges the code → connected');
    const conn = db.prepare(`SELECT * FROM meta_conns WHERE owner_id=?`).get(oid);
    assert(conn && /^v1:/.test(conn.token_enc) && !conn.token_enc.includes('LONG_SHORT1') && conn.expires_at > Date.now() + 50 * 864e5, 'long-lived token stored encrypted, with its expiry');
    r = await O('/api/meta');
    assert(r.j.connected && r.j.fb_name === 'Ola FB' && r.j.accounts.length === 3 && r.j.accounts.every((a) => !a.selected) && r.j.accounts.find((a) => a.account_id === '333').supported === false, 'ad accounts listed for the customer to pick');
    // something synced by hand for the same campaign and day must never be touched
    await post(O, '/api/spend', { date: day(1), platform: 'meta', campaign: 'CampA', amount: 7 });
    await click(slug(C.Main), 'CampA'); await click(slug(C.Main), 'CampA'); // CampA's clicks land on Main → campaign matched to Main
    r = await patch(O, '/api/meta/accounts', { selected: ['act_111', '222', 'act_333'] }); assert(r.s === 200 && r.j.accounts.filter((a) => a.selected).length === 3, 'pick accounts');
    r = await post(O, '/api/meta/sync');
    assert(r.s === 200 && r.j.sync.rows === 4 && r.j.accounts.find((a) => a.account_id === '333').last_error.includes('EUR') && G.proofOk, 'sync: 4 rows (with paging), EUR account explained, appsecret_proof sent');
    const metaRows = async () => (await O(`/api/spend?from=${day(7)}&to=${d}`)).j.rows;
    let sp = await metaRows();
    const a1 = sp.find((x) => x.source === 'meta' && x.campaign === 'CampA' && x.date === day(1)), man = sp.find((x) => x.source === 'manual' && x.campaign === 'CampA');
    assert(a1 && a1.amount_cents === 1234 && a1.channel_id === C.Main.id && man && man.amount_cents === 700, 'Meta row per campaign/day (matched to Main by utm_campaign); the manual row stays');
    assert(sp.find((x) => x.campaign === 'NairaCamp').amount_cents === 1000 && sp.find((x) => x.campaign === 'Unmatched Camp').channel_id === null, 'NGN converted to USD; unmatched campaigns are stored unassigned');
    G.campA = '15.00';
    await post(O, '/api/meta/sync'); sp = await metaRows();
    assert(sp.filter((x) => x.source === 'meta').length === 4 && sp.find((x) => x.source === 'meta' && x.campaign === 'CampA' && x.date === day(1)).amount_cents === 1500 && sp.find((x) => x.source === 'manual' && x.campaign === 'CampA').amount_cents === 700,
      'second sync updates Meta rows in place (no duplicates); manual entry never overwritten');
    r = await O('/api/meta/campaigns');
    const cmap = Object.fromEntries(r.j.campaigns.map((x) => [x.campaign_id, x]));
    assert(cmap.c1.channel_id === C.Main.id && cmap.c1.mapped_by === 'auto' && cmap.c2.channel_id === null && cmap.c1.spend_7d_cents === 2500, 'campaign list with the automatic mapping');
    r = await patch(O, '/api/meta/campaigns/c2', { channel_id: C.Backup.id }); assert(r.s === 200 && r.j.spend_rows_updated === 1, 'map an unmatched campaign to a channel (its spend rows follow)');
    await post(O, '/api/meta/sync');
    assert((await O('/api/meta/campaigns')).j.campaigns.find((x) => x.campaign_id === 'c2').channel_id === C.Backup.id && (await metaRows()).find((x) => x.campaign === 'Unmatched Camp').channel_id === C.Backup.id, 'the mapping survives the next sync');
    r = await O(`/api/stats?from=${day(1)}&to=${day(1)}&tz=0`); assert(r.j.totals.spend_cents === 1500 + 500 + 1000 + 700 + 3000, 'synced spend counts in the dashboard totals');
    r = await patch(O, '/api/meta/campaigns/nope', { channel_id: C.Main.id }); assert(r.s === 404, 'unknown campaign → 404');
    // dead-link + "spend still running today": with synced Meta spend, a quiet channel is only flagged while spend runs today
    busy(C.Busy2.id, [1, 2, 3], 30);
    await post(ADM, '/api/admin/jobs/run', { job: 'dead_links' });
    assert(!(await chs()).Busy2.deadlink_at, 'Meta spend synced but nothing spent today (ads paused) → no warning');
    G.today = true; await post(O, '/api/meta/sync');
    await post(ADM, '/api/admin/jobs/run', { job: 'dead_links' });
    assert((await chs()).Busy2.deadlink_at && (await inbox()).some((x) => x.title === 'Your ad link may be blocked or paused' && /Busy2/.test(x.body) && /still spending today/.test(x.body)), 'spend running today → warning');
    // token revoked → reconnect needed (one alert)
    G.revoked = true;
    r = await post(O, '/api/meta/sync'); assert(r.j.status === 'reconnect_needed' && r.j.sync.reconnect, 'revoked token → status reconnect needed');
    await post(O, '/api/meta/sync'); await post(ADM, '/api/admin/jobs/run', { job: 'meta_sync' });
    assert((await inbox()).filter((x) => x.title === 'Reconnect your Meta ad account').length === 1, 'one “Reconnect” alert');
    G.revoked = false;
    r = await O('/auth/meta/start'); const state3 = new URL(r.h.get('location')).searchParams.get('state');
    await O('/auth/meta/callback?code=good-code&state=' + encodeURIComponent(state3));
    r = await O('/api/meta'); assert(r.j.status === 'connected' && r.j.accounts.filter((a) => a.selected).length === 3, 'reconnect keeps the picked accounts');
    db.prepare(`UPDATE meta_conns SET expires_at=? WHERE owner_id=?`).run(Date.now() - 1000, oid);
    await sleep(300); r = await post(O, '/api/meta/sync'); assert(r.j.status === 'reconnect_needed', 'expired token → reconnect needed (without calling Meta)');
    // manager may look and map, not connect
    const MG = client(); await post(MG, '/api/signup', { country: 'NG', email: 'mgr17b@x.com', password: 'password1' });
    const mi = await post(O, '/api/team/invite', { email: 'mgr17b@x.com', role: 'manager' }); await post(MG, '/api/team/accept', { token: mi.j.invite_url.split('/join-team/')[1] });
    assert((await MG('/api/meta')).s === 200 && (await MG('/api/meta/campaigns')).s === 200 && (await post(MG, '/api/meta/sync')).s === 403 && (await del(MG, '/api/meta')).s === 403, 'manager: sees Meta and campaigns; can’t sync, connect or disconnect');
    r = await MG('/auth/meta/start'); assert(/owner_only/.test(r.h.get('location')), 'manager can’t start the Meta connection');
    r = await del(O, '/api/meta'); assert(r.s === 200 && r.j.connected === false && (await metaRows()).filter((x) => x.source === 'meta').length >= 4, 'disconnect keeps the synced history');
    r = await del(O, '/api/meta?purge=1'); sp = await metaRows();
    assert(!sp.some((x) => x.source === 'meta') && sp.some((x) => x.source === 'manual' && x.campaign === 'CampA'), 'disconnect with purge removes Meta rows only');

    // ======================= depositor audience guide =======================
    await patch(O, '/api/channels/' + C.Main.id, { pixel_id: '884210395527140', capi_token: 'EAAtest17' });
    const g1 = await click(slug(C.Main), 'AudCamp');
    await tgPost({ update_id: upd++, chat_member: { chat: { id: -1801, type: 'channel' }, from: { id: 6001 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 6001 } },
      new_chat_member: { status: 'member', user: { id: 6001, first_name: 'Dee', is_bot: false } }, invite_link: { invite_link: g1.url, creator: { id: BOT } } } });
    const jr = (await O(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows.find((x) => x.tg_user_id === 6001);
    const ev0 = (await ms()).events.length; // the fake's event list is shared by every suite: only look at what this conversion sends
    await post(O, `/api/joins/${jr.id}/convert`, { event: 'ftd', value: 50, currency: 'USD' });
    const mine = async () => (await ms()).events.slice(ev0).filter((e) => e.event_name === 'Purchase');
    let ev = null; for (let i = 0; i < 30 && !ev; i++) { await sleep(200); ev = (await mine()).find((e) => e.custom_data && e.custom_data.value === 50); }
    await sleep(2500); // one more sender round: nothing is sent twice
    assert(ev && ev.custom_data.currency === 'USD' && /^jvconv_\d+$/.test(ev.event_id) && (await mine()).filter((e) => e.event_id === ev.event_id).length === 1, 'an FTD goes to Meta once as Purchase with value + currency');
    for (let i = 0; i < 20 && !(await O('/api/audience-guide')).j.channels.find((c) => c.channel_id === C.Main.id).ftd_sent_30d; i++) await sleep(200);
    r = await O('/api/audience-guide');
    const ag = r.j.channels.find((c) => c.channel_id === C.Main.id);
    assert(r.s === 200 && r.j.event_name === 'Purchase' && r.j.value_sent === true && r.j.has_ftd_events_last_30d && r.j.count >= 1 && ag.pixel_id === '884210395527140' && ag.ftd_sent_30d >= 1 && r.j.steps.length === 5 && r.j.pixels.includes('884210395527140'),
      'audience guide: pixel per channel, event Purchase, FTDs sent in the last 30 days, the steps');
  } catch (e) { console.log('FAIL: exception', e.stack); process.exitCode = 1; }
  finally { try { db.close(); } catch { /* */ } await mset({ inviteFail: null, gcm: null }).catch(() => {}); graph.close(); }
})();
