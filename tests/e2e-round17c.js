// Round 17 (QA pass): regressions for what the independent review found, plus extra isolation / billing / tracking probes.
//  - the simplified sign-up and log-in pages carry the team invite token (/join-team/<token> → /signup|/login?team=…)
//  - removing a member, changing their role or their channels takes effect on their EXISTING session at once
//  - media buyers: method/verb tricks, search and funnel filters don't reach other channels
//  - a removed member's daily report / alerts stop going through the team owner's tracking bot
//  - ban failover when another link already points at the lost channel (X → lost → backup): X's ads keep working
//  - extra seats: parallel invites never double-charge or overdraw; a failed (402) invite charges nothing; expired-invite resend without credits
//  - /media/tutorials/*.mp3: only plain files under public/media (no traversal, encoded or not)
//  - Meta OAuth: the access token never shows up in responses or the server log
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
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);
let ipn = 20;
const click = (slug, camp) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.17.' + (ipn++) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwQ' + ipn + '&utm_campaign=' + camp }) }).then((x) => x.json());
const d = new Date().toISOString().slice(0, 10), q = `from=${d}&to=${d}&tz=0`;
const tokenOf = (url) => url.split('/join-team/')[1];
/** A raw request, so the path reaches the server exactly as written (fetch would normalise ../ and backslashes). */
const raw = (p) => new Promise((res) => { const r = http.request({ host: 'localhost', port: 3999, path: p, method: 'GET' }, (x) => { let b = ''; x.on('data', (c) => { b += c; }); x.on('end', () => res({ s: x.statusCode, t: b, h: x.headers })); }); r.on('error', () => res({ s: 0, t: '' })); r.end(); });

// fake Meta Graph (token exchange + accounts only)
const graph = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), J = (s, o) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v21.0/oauth/access_token') return u.searchParams.get('grant_type') === 'fb_exchange_token' ? J(200, { access_token: 'LONGSECRETTOKEN17c', expires_in: 5184000 }) : J(200, { access_token: 'SHORTSECRETTOKEN17c', expires_in: 3600 });
  if (u.pathname === '/v21.0/me') return J(200, { id: 'fb1', name: 'QA FB' });
  if (u.pathname === '/v21.0/me/adaccounts') return J(200, { data: [{ account_id: '901', name: 'QA', currency: 'USD', account_status: 1 }] });
  if (/\/insights$/.test(u.pathname)) return J(200, { data: [] });
  return J(404, { error: { code: 803, message: 'unknown' } });
});

(async () => {
  await new Promise((r) => graph.listen(4900, r));
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  const tmpMp3 = path.join(__dirname, '..', 'public', 'media', 'tutorials', 'zz-qa-test.mp3');
  try {
    // ---------- 1. sign-up / log-in pages keep the team invite ----------
    let r = await fetch(B + '/signup').then((x) => x.text());
    assert(/team_token:TEAM/.test(r) && /get\('team'\)/.test(r), '/signup sends the invite token from ?team= with the new account');
    r = await fetch(B + '/login').then((x) => x.text());
    assert(/team_token:TEAM/.test(r) && /'\?team='\+encodeURIComponent\(TEAM\)/.test(r), '/login sends the invite token (and a logged-in visitor is sent to the dashboard with it)');

    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    const uid = async (email) => (await ADM('/api/admin/users?q=' + encodeURIComponent(email))).j.users.find((x) => x.email === email).id;

    const O = client();
    await post(O, '/api/signup', { country: 'NG', email: 'own17c@x.com', password: 'password1', name: 'Ola' });
    const oid = await uid('own17c@x.com');
    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'pro' });
    const BOT = 7717000033;
    await post(O, '/api/bots', { token: BOT + ':AAHk3vZq_r17cbotxxxxxxxxxxxxxxxxxxxW' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    const tgPost = (u) => O(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    let upd = 1;
    const member = (id, title, status, extra = {}) => tgPost({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'administrator', user: { id: BOT } }, new_chat_member: { status, user: { id: BOT }, ...extra } } });
    for (const [id, t] of [[-1901, 'Alpha'], [-1902, 'Bravo'], [-1903, 'Charlie'], [-1904, 'Delta']]) await member(id, t, 'administrator', { can_invite_users: true });
    const chs = async () => Object.fromEntries((await O('/api/channels')).j.channels.map((c) => [c.title, c]));
    for (let i = 0; i < 40 && Object.values(await chs()).some((c) => c.pool < 5); i++) await sleep(250);
    let C = await chs();
    const slug = (c) => new URL(c.tracking_url).pathname;
    const join = async (go, chat, tgid, name) => tgPost({ update_id: upd++, chat_member: { chat: { id: chat, type: 'channel' }, from: { id: tgid }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: tgid } },
      new_chat_member: { status: 'member', user: { id: tgid, first_name: name, username: name.toLowerCase(), is_bot: false } }, invite_link: { invite_link: go.url, creator: { id: BOT } } } });
    await join(await click(slug(C.Alpha), 'CampA'), -1901, 6001, 'Alfie');
    await join(await click(slug(C.Bravo), 'CampB'), -1902, 6002, 'Bravosecret');

    // ---------- 2. team members on existing sessions ----------
    const inv = async (email, role, ids) => (await post(O, '/api/team/invite', { email, role, channel_ids: ids })).j;
    const iB = await inv('buy17c@x.com', 'buyer', [C.Alpha.id]), iM = await inv('mgr17c@x.com', 'manager');
    const Bu = client(); r = await post(Bu, '/api/signup', { country: 'NG', email: 'buy17c@x.com', password: 'password1', team_token: tokenOf(iB.invite_url) });
    assert(r.s === 200 && r.j.team && r.j.team.ok, 'buyer signs up with the invite');
    const Mg = client(); await post(Mg, '/api/signup', { country: 'NG', email: 'mgr17c@x.com', password: 'password1', team_token: tokenOf(iM.invite_url) });
    const buid = await uid('buy17c@x.com');

    r = await Bu('/api/billing', { method: 'HEAD' }); assert(r.s === 403, 'buyer HEAD /api/billing → 403 (HEAD is checked like GET)');
    r = await Bu('/api/channels/' + C.Alpha.id, { method: 'PUT', body: '{}' }); assert(r.s === 403, 'buyer PUT on a channel → 403 (allow-list per method)');
    r = await Bu('/api/channels/' + C.Alpha.id); assert(r.s === 403, 'buyer GET a single channel route → 403');
    r = await Bu(`/api/joins?${q}&q=bravosecret`); assert(r.s === 200 && r.j.total === 0, 'buyer search can’t find a Bravo person');
    r = await Bu(`/api/funnel?${q}&dim=channel&a=Bravo`); assert(r.s === 200 && r.j.a.counts.clicks === 0, 'buyer funnel filtered on Bravo is empty');
    r = await Bu(`/api/breakdown?${q}&dim=channel`); assert(r.j.rows.every((x) => x.key !== 'Bravo'), 'buyer breakdown never names Bravo');
    r = await Bu(`/api/compare/periods?a_from=${d}&a_to=${d}&b_from=${d}&b_to=${d}&tz=0&channel=${C.Bravo.id}`); assert(r.s === 403, 'buyer compare with ?channel=Bravo → 403');
    r = await Bu(`/api/stats?${q}&channel=${C.Bravo.id}abc`); assert(r.s === 403, 'buyer ?channel=<Bravo>abc (parseInt trick) → 403');
    r = await post(Bu, '/api/workspace', { owner_id: String(oid) + 'x' }); assert(r.s === 200 && r.j.current.own, 'a garbage workspace id goes to their own workspace, never someone else’s');
    await post(Bu, '/api/workspace', { owner_id: oid });

    // daily report linked through the owner's bot while on the team (a buyer gets one deep link, not the owner's bot list)
    const bot2 = Number(db.prepare(`INSERT INTO bots(owner_id,tg_id,username,token,secret,created_at,status) VALUES(?,?,?,NULL,'x',?,'active')`).run(oid, 7717000099, 'second_qa_bot', Date.now()).lastInsertRowid);
    r = await O('/api/report-settings'); assert(r.j.link_options.filter((x) => x.via === 'tracking_bot').length === 2, 'the owner sees all their bots as report options');
    const rs = (await Bu('/api/report-settings')).j, ownBotOpt = rs.link_options.find((x) => x.via === 'tracking_bot');
    assert(rs.scope === 'team' && ownBotOpt && rs.link_options.length === 1 && !('bot_id' in ownBotOpt) && !JSON.stringify(rs).includes('second_qa_bot'), 'buyer gets exactly one report deep link (no list of the owner’s bots)');
    db.prepare(`DELETE FROM bots WHERE id=?`).run(bot2);
    // report codes: signed with the issue time, 24 h, single use; the old format is refused
    const secret = fs.readFileSync(path.join(RUN, 'data', '.secret'), 'utf8'), mkCode = (uid, ts, nonce) => uid.toString(36) + '-' + ts.toString(36) + '-' + crypto.createHmac('sha256', secret).update(`report2:${uid}:${ts.toString(36)}:${nonce || ''}`).digest('hex').slice(0, 16);
    const startMsg = (chat, code) => tgPost({ update_id: upd++, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'X' }, date: 1, text: '/start report-' + code } }).then(() => sleep(300)); // the bot's reply is sent without waiting
    const lastTo = async (chat) => (((await ms()).msgs || []).filter((x) => x.chat_id === chat).pop() || {}).text || '';
    assert(/^report-[0-9a-z]+-[0-9a-z]+-[0-9a-f]{16}$/.test(ownBotOpt.url.split('start=')[1]), 'report link: <account>-<issued at>-<signature>');
    const oldFmt = buid.toString(36) + '-' + crypto.createHmac('sha256', secret).update('report:' + buid).digest('hex').slice(0, 12);
    await startMsg(880009, oldFmt); assert(/expired/.test(await lastTo(880009)), 'an old-format link (no expiry) is refused: “link expired, get a new one”');
    const nonceB = (db.prepare(`SELECT report_nonce FROM users WHERE id=?`).get(buid) || {}).report_nonce;
    await startMsg(880008, mkCode(buid, Math.floor(Date.now() / 1000) - 25 * 3600, nonceB)); assert(/expired/.test(await lastTo(880008)), 'a correctly signed link older than 24 h is refused');
    await startMsg(880007, ownBotOpt.url.split('start=')[1].replace(/.$/, (c) => (c === '0' ? '1' : '0'))); assert(/expired/.test(await lastTo(880007)), 'a tampered link is refused');
    await tgPost({ update_id: upd++, message: { message_id: 1, chat: { id: 880001, type: 'private' }, from: { id: 880001, first_name: 'Ben' }, date: 1, text: '/start ' + ownBotOpt.url.split('start=')[1] } });
    r = await Bu('/api/report-settings'); assert(r.j.linked === true && r.j.via === 'tracking_bot', 'buyer linked the report through the owner’s bot');
    await startMsg(880006, ownBotOpt.url.split('start=')[1]); assert(/expired/.test(await lastTo(880006)) && db.prepare(`SELECT report_chat_id FROM users WHERE id=?`).get(buid).report_chat_id === 880001, 'a link works once: the same link from another chat is refused');
    r = await Bu('/api/report-settings'); assert(r.j.link_options[0].url !== ownBotOpt.url, 'the dashboard gets a fresh link after the old one was used');
    // backup channel outside the buyer's channels: never named
    await patch(O, '/api/channels/' + C.Alpha.id, { backup_channel_id: C.Bravo.id });
    r = await Bu('/api/channels'); assert(r.j.channels[0].backup_title === 'your backup channel' && !JSON.stringify(r.j).includes('Bravo'), 'buyer: the backup channel is “your backup channel”, its name stays hidden');
    r = await O('/api/channels'); assert(r.j.channels.find((c) => c.id === C.Alpha.id).backup_title === 'Bravo', 'the owner still sees the backup’s name');
    await patch(O, '/api/channels/' + C.Alpha.id, { backup_channel_id: null });

    // manager → buyer applies at once
    r = await Mg('/api/domains'); assert(r.s === 200, 'manager can read domains');
    // a bot's forwarding address and secret are the owner's call
    const botId = (await O('/api/channels')).j.bots[0].id;
    r = await post(O, '/api/bot-targets', { bot_id: botId, welcome: 'Hi', forward_url: 'https://owner.example.com/hook', forward_secret: 'ownersecret' });
    assert(r.s === 200, 'owner sets the bot’s forwarding address and secret');
    r = await post(Mg, '/api/bot-targets', { bot_id: botId, welcome: 'Hello', forward_url: 'https://evil.example.com/steal' }); assert(r.s === 403 && r.j.team_denied, 'manager can’t change the forwarding address → 403');
    r = await post(Mg, '/api/bot-targets', { bot_id: botId, welcome: 'Hello', forward_url: '' }); assert(r.s === 403, 'manager can’t clear it either');
    r = await post(Mg, '/api/bot-targets', { bot_id: botId, welcome: 'Hello', forward_url: 'https://owner.example.com/hook', forward_secret: 'mine' }); assert(r.s === 403, 'manager can’t set the secret');
    r = await post(Mg, '/api/bot-targets', { bot_id: botId, welcome: 'Hello', forward_url: 'https://owner.example.com/hook' }); assert(r.s === 200, 'manager can still edit the welcome message (forwarding sent back unchanged)');
    r = await post(Mg, '/api/bot-targets', { bot_id: botId, welcome: 'Hello again' }); assert(r.s === 200, 'manager edit without the forwarding fields keeps them');
    const fwRow = db.prepare(`SELECT welcome, forward_url, forward_secret FROM channels WHERE owner_id=? AND type='bot' AND ext IS NOT 1`).get(oid);
    assert(fwRow.welcome === 'Hello again' && fwRow.forward_url === 'https://owner.example.com/hook' && fwRow.forward_secret === 'ownersecret', 'the owner’s forwarding address and secret are untouched');
    db.prepare(`UPDATE channels SET forward_url=NULL, forward_secret=NULL WHERE owner_id=? AND type='bot'`).run(oid);
    await patch(O, `/api/team/${iM.member.id}`, { role: 'buyer', channel_ids: [] });
    r = await Mg('/api/domains'); assert(r.s === 403, 'role changed to buyer: the same session loses manager rights at once');
    r = await Mg('/api/channels'); assert(r.s === 200 && r.j.team_role === 'buyer' && r.j.channels.length === 0, '… and sees no channels (none given)');
    r = await Mg(`/api/stats?${q}`); assert(r.j.totals.clicks === 0 && r.j.totals.joins === 0, '… and no results');

    // remove the buyer: their open session leaves the workspace immediately
    r = await Bu(`/api/stats?${q}`); assert(r.j.totals.clicks === 1, 'buyer sees Alpha before removal');
    await del(O, `/api/team/${iB.member.id}`);
    r = await Bu('/api/channels'); assert(r.s === 200 && r.j.team_role === 'owner' && r.j.channels.length === 0, 'removed: the existing session is back in their own (empty) workspace');
    r = await Bu(`/api/joins?${q}`); assert(r.j.total === 0, 'removed: no Alpha people');
    r = await post(Bu, '/api/workspace', { owner_id: oid }); assert(r.s === 403, 'removed: can’t switch back in');
    r = await post(Bu, '/api/team/accept', { token: tokenOf(iB.invite_url) }); assert(r.s === 404, 'removed: the old invite token can’t be reused');
    r = await Bu('/api/report-settings'); assert(r.j.linked === false, 'removed: their report/alerts no longer go through the owner’s bot');
    assert(db.prepare(`SELECT COUNT(*) n FROM sessions WHERE user_id=? AND workspace_owner=?`).get(buid, oid).n === 0, 'no session of theirs points at the workspace');

    // ---------- 3. ban failover with a link already pointing at the lost channel ----------
    r = await patch(O, '/api/channels/' + C.Delta.id, { redirect_to: C.Charlie.id }); assert(r.s === 200 && r.j.redirect_to === C.Charlie.id, 'Delta’s link sends visitors to Charlie (smart link)');
    r = await patch(O, '/api/channels/' + C.Charlie.id, { backup_channel_id: C.Bravo.id }); assert(r.s === 200 && r.j.auto_failover, 'Charlie’s backup is Bravo');
    await member(-1903, 'Charlie', 'kicked');
    C = await chs(); assert(C.Charlie.lost_at && C.Charlie.redirect_to === C.Bravo.id, 'Charlie lost → failed over to Bravo');
    const bc = async (t) => ((await O(`/api/stats?${q}`)).j.channels.find((c) => c.title === t) || { clicks: 0 }).clicks;
    let b0 = await bc('Bravo'), c0 = await bc('Charlie');
    let go = await click(slug(C.Delta), 'CampD');
    assert(/t\.me\/\+/.test(go.url) && await bc('Bravo') === b0 + 1 && await bc('Charlie') === c0, 'Delta’s ads keep working: the click lands in Bravo, not the lost Charlie');
    await join(go, -1902, 6003, 'Dave');
    r = await O(`/api/joins?${q}`); assert(r.j.rows.some((x) => x.tg_user_id === 6003 && x.channel_id === C.Bravo.id && x.click_id), 'the join is tracked on Bravo with its click');
    r = await fetch(B + slug(C.Delta)).then((x) => x.text()); assert(r.includes(`/c/${slug(C.Bravo).split('/').pop()}/go`), 'Delta’s click page posts to Bravo');
    await member(-1903, 'Charlie', 'administrator', { can_invite_users: true });
    r = await post(O, `/api/channels/${C.Charlie.id}/switch-back`); assert(r.s === 200, 'Charlie is back: switch back');
    for (let i = 0; i < 20 && (await chs()).Charlie.pool < 1; i++) await sleep(200);
    C = await chs(); b0 = await bc('Bravo'); c0 = await bc('Charlie');
    go = await click(slug(C.Delta), 'CampD');
    assert(await bc('Charlie') === c0 + 1 && await bc('Bravo') === b0, 'after switch-back Delta’s visitors go to Charlie again (one hop, as before)');
    db.prepare(`UPDATE channels SET redirect_to=? WHERE id=?`).run(C.Delta.id, C.Charlie.id); // a circle made by hand must not hang or 500
    r = await fetch(B + slug(C.Delta)); assert(r.status === 200, 'a redirect circle still answers');
    db.prepare(`UPDATE channels SET redirect_to=NULL WHERE id IN (?,?)`).run(C.Delta.id, C.Charlie.id);

    // ---------- 4. seats: parallel invites, failures, resend ----------
    const bal = async () => (await O('/api/billing')).j.balance_cents;
    const seatRows = () => db.prepare(`SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='seats'`).get(oid).n;
    await inv('s1@x.com', 'buyer'); await inv('s2@x.com', 'buyer'); // mgr + s1 + s2 = 3 included
    r = await O('/api/team'); assert(r.j.seats.used === 3 && r.j.seats.extra === 0, 'three included seats used (an open invite holds a seat)');
    db.prepare(`UPDATE users SET balance_cents=500 WHERE id=?`).run(oid);
    const par = await Promise.all(['p1@x.com', 'p2@x.com', 'p3@x.com'].map((e) => post(O, '/api/team/invite', { email: e, role: 'buyer' })));
    assert(par.filter((x) => x.s === 200).length === 1 && par.filter((x) => x.s === 402 && x.j.topup).length === 2, 'three invites at once with credit for one seat: one added, two get 402');
    assert(await bal() === 0 && seatRows() === 1, 'charged exactly once, the wallet never goes below zero');
    const failed = par.find((x) => x.s === 402), failedEmail = ['p1@x.com', 'p2@x.com', 'p3@x.com'][par.indexOf(failed)];
    assert(!db.prepare(`SELECT 1 FROM team_members WHERE owner_id=? AND email=?`).get(oid, failedEmail), 'a refused (402) invite leaves no member row');
    const dup = await Promise.all([1, 2].map(() => post(O, '/api/team/invite', { email: 'dup@x.com', role: 'buyer' })));
    assert(dup.filter((x) => x.s === 200).length === 0 && seatRows() === 1, 'no credit: the same invite twice adds nothing and charges nothing');
    db.prepare(`UPDATE users SET balance_cents=1000 WHERE id=?`).run(oid);
    const dup2 = await Promise.all([1, 2].map(() => post(O, '/api/team/invite', { email: 'dup@x.com', role: 'buyer' })));
    assert(dup2.filter((x) => x.s === 200).length === 1 && dup2.filter((x) => x.s === 400).length === 1 && await bal() === 500 && seatRows() === 2, 'double-click on the same invite: one member, one charge');
    // an expired invite needs a seat again: it reuses a seat already paid this month, else it needs credit
    const memb = (await O('/api/team')).j.members, s1 = memb.find((x) => x.email === 's1@x.com'), s2 = memb.find((x) => x.email === 's2@x.com');
    db.prepare(`UPDATE users SET balance_cents=0 WHERE id=?`).run(oid);
    db.prepare(`UPDATE team_members SET invited_at=? WHERE id=?`).run(Date.now() - 8 * 864e5, s1.id);
    r = await post(O, `/api/team/${s1.id}/resend`);
    assert(r.s === 200 && r.j.charged_cents === 0 && seatRows() === 2, 'resend of an expired invite reuses a seat already paid this month (no second charge)');
    db.prepare(`UPDATE team_members SET invited_at=? WHERE id=?`).run(Date.now() - 8 * 864e5, s2.id);
    r = await post(O, `/api/team/${s2.id}/resend`); assert(r.s === 200 && r.j.charged_cents === 0 && seatRows() === 2, 'any expired invite frees a paid seat for the next resend');
    db.prepare(`DELETE FROM ledger WHERE user_id=? AND kind='seats'`).run(oid); // as if the month just turned and the seat job hasn't run yet
    db.prepare(`UPDATE team_members SET invited_at=? WHERE id=?`).run(Date.now() - 8 * 864e5, s2.id);
    const tokBefore = db.prepare(`SELECT invite_token FROM team_members WHERE id=?`).get(s2.id).invite_token;
    r = await post(O, `/api/team/${s2.id}/resend`);
    assert(r.s === 402 && r.j.topup && seatRows() === 0 && await bal() === 0 && db.prepare(`SELECT invite_token FROM team_members WHERE id=?`).get(s2.id).invite_token === tokBefore, 'resend that needs an unpaid seat, without credit → 402, no charge, link unchanged');
    r = await O('/api/team'); assert(r.j.members.find((x) => x.id === s2.id).status === 'expired' && r.j.seats.used === 4, 'the expired invite doesn’t hold a seat');

    // ---------- 5. tutorial voice-overs: plain files under public/media only ----------
    fs.writeFileSync(tmpMp3, Buffer.from('ID3qa-test-audio'));
    r = await raw('/media/tutorials/zz-qa-test.mp3'); assert(r.s === 200 && r.h['content-type'] === 'audio/mpeg' && r.t === 'ID3qa-test-audio', 'a voice-over mp3 is served as audio/mpeg');
    r = await raw('/media/tutorials/missing.mp3'); assert(r.s === 404, 'missing voice-over → 404');
    for (const p of ['/media/tutorials/../../server.js', '/media/tutorials/..%2f..%2fserver.js', '/media/tutorials/%2e%2e/%2e%2e/server.js', '/media/tutorials/..%5c..%5cserver.mp3', '/media/tutorials\\..\\..\\server.js',
      '/media/tutorials/%2e%2e%2f%2e%2e%2fpackage.mp3', '/media/../server.js', '/media/tutorials/.env.mp3', '/media/tutorials/README.md', '/media/tutorials/x/../../../server.js', '/media/%2e%2e/server.js', '/media/tutorials/..mp3']) {
      r = await raw(p); assert(r.s !== 200 || !/require\(|"name"|const /.test(r.t), `no file outside public/media via ${p} (status ${r.s})`);
    }
    r = await raw('/media/tutorials/zz-qa-test.mp3'); assert(r.s === 200, 'still serves the real file');
    const rr = await new Promise((res) => http.get({ host: 'localhost', port: 3999, path: '/media/tutorials/zz-qa-test.mp3', headers: { range: 'bytes=3-6' } }, (x) => { let b = ''; x.on('data', (c) => { b += c; }); x.on('end', () => res({ s: x.statusCode, t: b })); }));
    assert(rr.s === 206 && rr.t === 'qa-t', 'range requests work for seeking');
    const rget = (range) => new Promise((res) => http.get({ host: 'localhost', port: 3999, path: '/media/tutorials/zz-qa-test.mp3', headers: { range } }, (x) => { let b = ''; x.on('data', (c) => { b += c; }); x.on('end', () => res({ s: x.statusCode, t: b, cr: x.headers['content-range'] })); }));
    r = await rget('bytes=-4'); assert(r.s === 206 && r.t === 'udio' && r.cr === 'bytes 12-15/16', 'bytes=-4 serves the LAST 4 bytes');
    r = await rget('bytes=-100'); assert(r.s === 206 && r.t === 'ID3qa-test-audio', 'a suffix longer than the file serves the whole file');
    r = await rget('bytes=11-'); assert(r.s === 206 && r.t === 'audio', 'open-ended ranges unchanged');

    // ---------- 6. Meta OAuth: the token never leaks ----------
    let m = await O('/auth/meta/start'); const loc = new URL(m.h.get('location')), state = loc.searchParams.get('state');
    assert(m.s === 302 && state, 'Meta start → Facebook with a signed state');
    m = await Bu('/auth/meta/callback?code=x&state=' + encodeURIComponent(state)); assert(m.s === 302 && /meta_error=(state|login)/.test(m.h.get('location')), 'someone else’s browser can’t finish the owner’s Meta login (state bound to the account + cookie)');
    m = await O('/auth/meta/callback?code=good&state=' + encodeURIComponent(state)); assert(m.s === 302 && /meta=connected/.test(m.h.get('location')), 'owner finishes the Meta login');
    m = await O('/auth/meta/callback?code=good&state=' + encodeURIComponent(state)); assert(/meta_error=state/.test(m.h.get('location')), 'the same callback can’t be replayed (cookie nonce cleared)');
    await sleep(300);
    const metaOut = JSON.stringify([(await O('/api/meta')).j, (await Mg('/api/meta')).j, (await post(O, '/api/meta/sync')).j]);
    assert(!/SECRETTOKEN17c/.test(metaOut) && !/token_enc|access_token/.test(metaOut), 'no Meta token in API responses');
    assert(!/SECRETTOKEN17c/.test(logTxt()), 'no Meta token in the server log');
    const row = db.prepare(`SELECT token_enc FROM meta_conns WHERE owner_id=?`).get(oid); assert(row && /^v1:/.test(row.token_enc) && !row.token_enc.includes('SECRETTOKEN'), 'token stored encrypted');
    m = await Bu('/auth/meta/start'); assert(m.s === 302, 'a non-owner start only starts their OWN connection');

    // ---------- 7. Basic → Pro from the dashboard (changePlan) brings paused members back at once ----------
    const O2 = client(); await post(O2, '/api/signup', { country: 'NG', email: 'own17c2@x.com', password: 'password1' });
    const o2 = await uid('own17c2@x.com'); await post(ADM, `/api/admin/users/${o2}/plan`, { plan: 'pro' });
    const i2 = (await post(O2, '/api/team/invite', { email: 'mem17c2@x.com', role: 'manager' })).j;
    const M2 = client(); await post(M2, '/api/signup', { country: 'NG', email: 'mem17c2@x.com', password: 'password1', team_token: tokenOf(i2.invite_url) });
    await post(ADM, `/api/admin/users/${o2}/trial`, { action: 'end' }); await post(ADM, `/api/admin/users/${o2}/plan`, { plan: 'basic' });
    const st2 = () => db.prepare(`SELECT status FROM team_members WHERE id=?`).get(i2.member.id).status;
    assert(st2() === 'paused', 'downgrade pauses the member');
    db.prepare(`UPDATE users SET balance_cents=1000000 WHERE id=?`).run(o2);
    r = await post(O2, '/api/billing/plan', { plan: 'pro' });
    assert(r.s === 200 && r.j.plan === 'pro' && st2() === 'active', 'the owner upgrades in the dashboard → the member is active again right away (no wait for the seat job)');
    r = await post(M2, '/api/workspace', { owner_id: o2 }); assert(r.s === 200 && r.j.current.role === 'manager', 'and can enter the workspace at once');
  } catch (e) { console.log('FAIL: exception', e.stack); process.exitCode = 1; }
  finally { try { fs.unlinkSync(tmpMp3); } catch { /* */ } try { db.close(); } catch { /* */ } graph.close(); }
})();
