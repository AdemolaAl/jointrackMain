// Round 18: the free "Setup helper" role and "Accounts I manage".
//  - helper = a manager's rights (the manager allow-list is reused): billing, wallet, withdrawals, team, keys, forward_url, account deletion → 403
//  - one helper free on EVERY plan (Basic and trial too): no seat, no charge; a 2nd helper on Basic → 402; on Pro the 2nd helper takes a normal seat
//  - a downgrade never pauses the free helper (paid seats pause as before); removing the helper revokes at once
//  - "access ends on" (expires_at) for any member: checked on every request and by the job; shown in the Team list; audit log
//  - GET /api/managed: every workspace the person can open, numbers limited to what the role may see, never another account's data, no billing amounts
//  - switching workspace from the list works; owners, managers and media buyers behave exactly as before
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ipn = 10;
function client() {
  const jar = {}, ip = '102.89.18.' + (ipn++); // one address per person (sign-ups are rate-limited per network)
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': ip, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);
const tokenOf = (url) => url.split('/join-team/')[1];
let upd = 1;

(async () => {
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    const uid = async (email) => (await ADM('/api/admin/users?q=' + encodeURIComponent(email))).j.users.find((x) => x.email === email).id;
    /** a customer with a tracking bot and some channels (added through the fake Telegram) */
    async function owner(email, name, botId, chats) {
      const f = client();
      await post(f, '/api/signup', { country: 'NG', email, password: 'password1', name });
      if (botId) {
        await post(f, '/api/bots', { token: botId + ':AAHk3vZq_r18botxxxxxxxxxxxxxxxxxxxxW' + String(botId).slice(-2) });
        const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
        for (const [id, title] of chats) await f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 },
          date: 1, old_chat_member: { status: 'left', user: { id: botId } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: botId } } } }) });
      }
      f.id = await uid(email);
      f.chans = botId ? (await f('/api/channels')).j.channels : [];
      return f;
    }
    const hour = Math.floor(Date.now() / 3600000);
    const addJoins = (ownerId, chId, today, older) => {
      db.prepare(`INSERT OR REPLACE INTO hourly(channel_id,hour,owner_id,clicks,joins) VALUES(?,?,?,?,?)`).run(chId, hour, ownerId, today * 2, today);
      db.prepare(`INSERT OR REPLACE INTO hourly(channel_id,hour,owner_id,clicks,joins) VALUES(?,?,?,?,?)`).run(chId, hour - 72, ownerId, older * 2, older);
      db.prepare(`INSERT OR REPLACE INTO hourly(channel_id,hour,owner_id,clicks,joins) VALUES(?,?,?,?,?)`).run(chId, hour - 24 * 20, ownerId, 999, 999); // older than 7 days: never counted
    };
    const addDep = (ownerId, chId, cents) => db.prepare(`INSERT INTO conversions(owner_id,channel_id,event,value_cents,matched,source,created_at) VALUES(?,?,'ftd',?,1,'postback',?)`).run(ownerId, chId, cents, Date.now() - 3600e3);

    // ---------- the client (Basic, no trial yet) and the freelancer who helps them ----------
    const A = await owner('client18a@x.com', 'Ada Client', 8818000011, [[-1801, 'Ada One'], [-1802, 'Ada Two']]);
    assert(A.chans.length === 2, 'client A has two channels');
    const H = await owner('helper18@x.com', 'Hal Helper'); // a freelancer: no channels of their own
    const hid = H.id;
    let r = await A('/api/team'); assert(r.s === 200 && r.j.seats.plan === 'basic' && r.j.seats.included === 0 && r.j.seats.helper_free === 1 && r.j.roles.some((x) => x.id === 'helper' && x.free), 'Team on Basic: 0 seats, 1 free Setup helper, the role is listed');
    const bal0 = (await A('/api/billing')).j.balance_cents;
    r = await post(A, '/api/team/invite', { email: 'helper18@x.com', role: 'helper' });
    const invH = r;
    assert(r.s === 200 && r.j.charged_cents === 0 && r.j.member.role === 'helper' && r.j.member.role_name === 'Setup helper' && r.j.member.free === true && r.j.member.all_channels === true && r.j.seats.used === 0 && r.j.seats.helpers_free_used === 1,
      'Basic: inviting a Setup helper is free (no seat used, nothing charged)');
    const billA = (await A('/api/billing')).j;
    assert(billA.balance_cents === bal0 && !(billA.history || []).some((h) => h.kind === 'seats') && !db.prepare(`SELECT 1 FROM ledger WHERE user_id=? AND kind='seats'`).get(A.id), 'no charge, no seat row in the ledger');
    r = await post(A, '/api/team/invite', { email: 'helper18b@x.com', role: 'helper' });
    assert(r.s === 402 && r.j.upgrade && r.j.helper_limit && r.j.limit.kind === 'seats' && /free Setup helper/.test(r.j.error), 'a 2nd helper on Basic → 402 with a clear message');
    r = await post(A, '/api/team/invite', { email: 'mgr18@x.com', role: 'manager' });
    assert(r.s === 402 && r.j.limit.kind === 'seats' && !r.j.helper_limit, 'a manager on Basic still → 402 (unchanged)');
    r = await fetch(B + '/api/team/invite-info?token=' + tokenOf(invH.j.invite_url)).then((x) => x.json());
    assert(r.valid && r.role === 'helper' && r.role_name === 'Setup helper', 'invite info names the role “Setup helper”');
    assert(db.prepare(`SELECT 1 FROM email_log WHERE to_addr='helper18@x.com' AND kind='r17:team_invite'`).get(), 'the invite email goes out (same email as other roles)');
    r = await post(H, '/api/team/accept', { token: tokenOf(invH.j.invite_url) });
    assert(r.s === 200 && r.j.role === 'helper' && r.j.status === 'active' && r.j.owner_id === A.id, 'the helper accepts the invite');
    let me = (await H('/api/me')).j;
    assert(me.email === 'helper18@x.com' && me.workspace.current.owner_id === A.id && me.workspace.current.role === 'helper' && me.workspace.current.channel_ids === null, 'the helper lands in the client’s workspace; /api/me stays theirs');

    // ---------- helper = manager rights ----------
    r = await H('/api/channels'); assert(r.s === 200 && r.j.team_role === 'helper' && r.j.channels.length === 2 && r.j.channels.every((c) => !c.hook_start), 'helper sees every channel (no postback key in hook URLs)');
    r = await H('/api/stats?from=2026-01-01&to=2030-01-01'); assert(r.s === 200, 'helper sees results');
    r = await patch(H, '/api/channels/' + A.chans[0].id, { pixel_id: '884210395527140', capi_token: 'EAAhelper' }); assert(r.s === 200, 'helper connects Meta on a channel');
    r = await patch(H, '/api/channels/' + A.chans[1].id, { backup_channel_id: A.chans[0].id }); assert(r.s === 200 && r.j.backup_channel_id === A.chans[0].id, 'helper sets a backup channel');
    r = await post(H, '/api/bot-targets/external', { username: 'ada18shop_bot' }); assert(r.s === 200 && r.j.channel && r.j.hook_start === '', 'helper adds a bot without token (hook URLs withheld)');
    r = await post(H, '/api/bots', { token: '8818000099:AAHk3vZq_r18helperbotxxxxxxxxxxxxxxW' }); assert(r.s === 200 || r.s === 400, 'helper may connect a bot (manager allow-list)');
    r = await H('/api/domains'); assert(r.s === 200, 'helper sees the link domains');
    r = await post(H, '/api/spend', { date: new Date().toISOString().slice(0, 10), platform: 'meta', campaign: 'X', amount: 1 }); assert(r.s === 200, 'helper adds spend');
    r = await H('/api/conversions'); assert(r.s === 200 && r.j.postback_url === null, 'helper: no postback key');
    const botRow = db.prepare(`SELECT id FROM bots WHERE owner_id=? ORDER BY id LIMIT 1`).get(A.id);
    for (const [m, p2, b] of [['GET', '/api/billing'], ['POST', '/api/billing/topup'], ['POST', '/api/billing/deposit'], ['POST', '/api/billing/plan'], ['GET', '/api/billing/methods'],
      ['GET', '/api/referrals'], ['POST', '/api/referrals/withdraw'], ['POST', '/api/referrals/credit'],
      ['GET', '/api/team'], ['POST', '/api/team/invite'], ['PATCH', `/api/team/${invH.j.member.id}`], ['DELETE', `/api/team/${invH.j.member.id}`],
      ['POST', '/api/conversions/rotate'], ['GET', '/api/integrations'], ['GET', '/api/alerts'], ['POST', '/api/domains'], ['POST', '/api/meta/sync'], ['DELETE', '/api/meta'],
      ['DELETE', '/api/bots/' + (botRow ? botRow.id : 1)], ['DELETE', '/api/account'], ['POST', '/api/account/delete'], ['GET', '/api/joe/insights'], ['POST', '/api/joe/chat']]) {
      r = await H(p2, { method: m, body: m === 'GET' ? undefined : JSON.stringify(b || {}) });
      assert(r.s === 403 && r.j.team_denied, `helper ${m} ${p2}${b ? ' (forward_url)' : ''} → 403`);
    }
    r = await post(client(), '/api/login', { email: 'client18a@x.com', password: 'password1' }); assert(r.s === 200, 'the client’s account is untouched (still logs in)');
    r = await H('/api/inbox'); assert(r.s === 200, 'the helper’s own inbox still works inside the workspace');

    // ---------- Pro: the 2nd helper takes a normal seat ----------
    await post(ADM, `/api/admin/users/${A.id}/plan`, { plan: 'pro' });
    r = await A('/api/team'); assert(r.j.seats.plan === 'pro' && r.j.seats.used === 0 && r.j.seats.included === 3, 'Pro: the free helper still holds no seat');
    r = await post(H, '/api/bot-targets', { bot_id: botRow.id, welcome: 'Hi', forward_url: 'https://evil.example.com/steal' }); assert(r.s === 403 && r.j.team_denied, 'helper can’t set a bot’s forward_url → 403');
    const invH2 = await post(A, '/api/team/invite', { email: 'helper18b@x.com', role: 'helper' });
    assert(invH2.s === 200 && invH2.j.member.free === false && invH2.j.seats.used === 1 && invH2.j.charged_cents === 0, 'Pro: a 2nd helper takes a normal (included) seat');
    const invB1 = await post(A, '/api/team/invite', { email: 'b18a@x.com', role: 'buyer', channel_ids: [A.chans[0].id] });
    const invB2 = await post(A, '/api/team/invite', { email: 'b18b@x.com', role: 'buyer' });
    assert(invB1.s === 200 && invB2.s === 200 && invB2.j.seats.used === 3 && invB2.j.seats.extra === 0, 'buyers fill the included seats as before');
    r = await post(A, '/api/team/invite', { email: 'helper18c@x.com', role: 'helper' });
    assert(r.s === 402 && r.j.topup && r.j.need_cents === 500, 'a 3rd helper beyond the included seats needs a paid seat (empty wallet → 402 top-up)');
    await post(ADM, `/api/admin/users/${A.id}/credits`, { credits: 600, reason: 'test' });
    const bal1 = (await A('/api/billing')).j.balance_cents;
    const invH3 = await post(A, '/api/team/invite', { email: 'helper18c@x.com', role: 'helper' });
    assert(invH3.s === 200 && invH3.j.charged_cents === 500 && invH3.j.member.free === false && (await A('/api/billing')).j.balance_cents === bal1 - 500, 'the extra helper is charged like a seat ($5)');
    r = await A('/api/team'); const hm = r.j.members.find((x) => x.email === 'helper18@x.com');
    assert(hm && hm.free === true && hm.status === 'active' && r.j.seats.used === 4 && r.j.seats.extra === 1, 'Team list: the first helper is the free one; seat counts include every other member');

    // ---------- downgrade: paid seats pause, the free helper stays ----------
    const H2 = client(); await post(H2, '/api/signup', { country: 'NG', email: 'helper18b@x.com', password: 'password1', team_token: tokenOf(invH2.j.invite_url) });
    await post(ADM, `/api/admin/users/${A.id}/trial`, { action: 'end' });
    await post(ADM, `/api/admin/users/${A.id}/plan`, { plan: 'basic' });
    r = await A('/api/team'); const st = Object.fromEntries(r.j.members.map((x) => [x.email, x.status]));
    assert(st['helper18@x.com'] === 'active' && st['helper18b@x.com'] === 'paused' && st['helper18c@x.com'] === 'paused' && st['b18a@x.com'] === 'paused', 'downgrade to Basic: the free helper stays active, paid seats pause');
    r = await H('/api/channels'); assert(r.s === 200 && r.j.team_role === 'helper' && r.j.channels.length >= 2, 'the free helper keeps working after the downgrade');
    r = await H2('/api/channels'); assert(r.s === 200 && r.j.team_role === 'owner', 'the paid helper’s session drops back to their own workspace');
    r = await post(A, '/api/team/invite', { email: 'helper18d@x.com', role: 'helper' }); assert(r.s === 402, 'still only one free helper on Basic');
    await post(ADM, `/api/admin/users/${A.id}/plan`, { plan: 'pro' });
    r = await A('/api/team'); assert(r.j.members.filter((x) => x.user_id).every((x) => x.status === 'active'), 'upgrade: the paused members come back');

    // ---------- admin setting team.helper_free ----------
    r = await ADM('/api/admin/settings'); assert(r.j.round17 && r.j.round17.helper_free === 1, 'admin settings show the free helpers per account (default 1)');
    const C = await owner('client18c@x.com', 'Cleo Client', 8818000022, [[-1811, 'Cleo One'], [-1812, 'Cleo Two']]);
    r = await put(ADM, '/api/admin/settings', { round17: { helper_free: 0 } }); assert(r.s === 200 && r.j.settings.round17.helper_free === 0, 'admin can change it');
    r = await post(C, '/api/team/invite', { email: 'helper18@x.com', role: 'helper' }); assert(r.s === 402, 'with 0 free helpers a helper on Basic needs a seat → 402');
    await put(ADM, '/api/admin/settings', { round17: { helper_free: 1 } });

    // ---------- client C: Pro, the helper as a media buyer with one channel (buyer scoping in Accounts I manage) ----------
    await post(ADM, `/api/admin/users/${C.id}/plan`, { plan: 'pro' });
    const [C1, C2] = C.chans;
    const invHC = await post(C, '/api/team/invite', { email: 'helper18@x.com', role: 'buyer', channel_ids: [C1.id] });
    r = await post(H, '/api/team/accept', { token: tokenOf(invHC.j.invite_url) }); assert(r.s === 200 && r.j.role === 'buyer', 'the same person is a media buyer for client C');
    // a stranger with lots of data the helper must never see
    const D = await owner('stranger18@x.com', 'Dan Stranger', 8818000033, [[-1821, 'Dan One']]);
    addJoins(A.id, A.chans[0].id, 5, 7); addJoins(A.id, A.chans[1].id, 2, 1); addDep(A.id, A.chans[0].id, 4000);
    addJoins(C.id, C1.id, 3, 4); addJoins(C.id, C2.id, 50, 60); addDep(C.id, C1.id, 1500); addDep(C.id, C2.id, 90000); addDep(C.id, C2.id, 90000);
    addJoins(D.id, D.chans[0].id, 400, 500); addDep(D.id, D.chans[0].id, 777700);
    db.prepare(`UPDATE channels SET lost_at=?, lost_reason='bot_kicked' WHERE id=?`).run(Date.now(), C2.id); // C2 lost: only C (and managers) should see it
    db.prepare(`UPDATE channels SET deadlink_at=? WHERE id=?`).run(Date.now(), A.chans[1].id);
    // client C's tracking is paused for billing (no free joins, empty wallet, plan not paid)
    db.prepare(`UPDATE users SET free_joins=0, balance_cents=0 WHERE id=?`).run(C.id);

    r = await H('/api/managed?tz=0');
    const M = r.j, byId = Object.fromEntries((M.accounts || []).map((x) => [x.owner_id, x]));
    assert(r.s === 200 && M.eligible === true && M.accounts.length === 3 && byId[hid] && byId[hid].own && byId[A.id] && byId[C.id] && !byId[D.id], 'GET /api/managed: own + the two clients, never a stranger');
    const a = byId[A.id], c = byId[C.id];
    assert(a.role === 'helper' && a.role_name === 'Setup helper' && /Ada/.test(a.name) && a.email === 'client18a@x.com' && a.status === 'active', 'client A: owner name/email and the helper role');
    assert(a.channels === 3 && a.joins_today === 7 && a.joins_7d === 15 && a.deposits_7d === 1, 'client A (helper): every channel’s numbers (joins today, 7 days, deposits)');
    assert(a.alerts.some((x) => x.kind === 'dead_link') && !a.alerts.some((x) => x.kind === 'tracking_paused'), 'client A alerts: dead link');
    assert(c.role === 'buyer' && c.channels === 1 && c.joins_today === 3 && c.joins_7d === 7 && c.deposits_7d === 1 && c.revenue_7d_cents === 1500, 'client C (media buyer): only the given channel’s numbers');
    assert(!c.alerts.some((x) => x.kind === 'lost_channel'), 'a buyer doesn’t see the lost channel they weren’t given');
    assert(c.alerts.some((x) => x.kind === 'tracking_paused'), 'client C: “tracking paused (billing)” alert');
    const blob = JSON.stringify(M);
    assert(!/balance|credits|wallet|price|plan_|seat_cents|charged|need_cents|777700|"plan"/.test(blob), 'no billing amounts (and none of the stranger’s numbers) anywhere in the answer');
    assert(byId[hid].channels === 0 && byId[hid].alerts.some((x) => x.kind === 'setup' && x.missing.includes('bot')), 'own workspace: no channels → setup not finished');
    // the client (owner) sees all of C2 in their own list
    r = await C('/api/managed?tz=0');
    assert(r.s === 200 && r.j.eligible === false && r.j.accounts.length === 1 && r.j.accounts[0].own && r.j.accounts[0].channels === 2 && r.j.accounts[0].joins_today === 53 && r.j.accounts[0].alerts.some((x) => x.kind === 'lost_channel'),
      'an owner with no teams: only their own account (all channels, the lost channel alert); not eligible for the page');
    r = await D('/api/managed?tz=0'); assert(r.j.accounts.length === 1 && r.j.accounts[0].owner_id === D.id, 'the stranger sees only their own account');
    // switch from the list
    r = await post(H, '/api/workspace', { owner_id: C.id });
    assert(r.s === 200 && r.j.current.owner_id === C.id && r.j.current.role === 'buyer', 'switching workspace from Accounts I manage works');
    r = await H('/api/channels'); assert(r.j.channels.length === 1 && r.j.channels[0].id === C1.id && r.j.team_role === 'buyer', 'now inside client C with only the given channel');
    r = await H('/api/managed?tz=0'); assert(r.j.current_owner_id === C.id && r.j.accounts.find((x) => x.owner_id === C.id).current === true, 'the list marks the current account');
    r = await H('/api/stats?from=2026-01-01&to=2030-01-01&channel=' + C2.id); assert(r.s === 403, 'and still can’t read the other channel');
    r = await post(H, '/api/workspace', { owner_id: D.id }); assert(r.s === 403, 'can’t switch into a stranger’s account');
    r = await post(H, '/api/workspace', { owner_id: A.id }); assert(r.s === 200 && (await H('/api/channels')).j.channels.length === 3, 'switch to client A again');
    r = await H('/api/managed?tz=0'); assert(r.s === 200, '/api/managed works from inside any workspace (it is about the logged-in person)');
    // paused membership: no numbers
    db.prepare(`UPDATE team_members SET status='paused', pause_reason='plan' WHERE owner_id=? AND user_id=?`).run(C.id, hid);
    r = await H('/api/managed?tz=0'); const c2 = r.j.accounts.find((x) => x.owner_id === C.id);
    assert(c2 && c2.paused === true && c2.channels === null && c2.joins_7d === null && c2.alerts.length === 0, 'a paused membership shows no numbers');
    db.prepare(`UPDATE team_members SET status='active', pause_reason=NULL WHERE owner_id=? AND user_id=?`).run(C.id, hid);

    // ---------- "access ends on" ----------
    const E = await owner('client18e@x.com', 'Eve Client', 8818000044, [[-1831, 'Eve One']]);
    r = await post(E, '/api/team/invite', { email: 'helper18@x.com', role: 'helper', expires_at: Date.now() - 1000 }); assert(r.s === 400, 'access end in the past → 400');
    const exp1 = Date.now() + 3600e3;
    const invHE = await post(E, '/api/team/invite', { email: 'helper18@x.com', role: 'helper', expires_at: exp1 });
    assert(invHE.s === 200 && invHE.j.member.expires_at === exp1, 'invite with “access ends on”');
    r = await post(H, '/api/team/accept', { token: tokenOf(invHE.j.invite_url) }); assert(r.s === 200, 'the helper joins client E');
    r = await E('/api/team'); assert(r.j.members[0].expires_at === exp1, 'the Team list shows when access ends');
    r = await patch(E, `/api/team/${invHE.j.member.id}`, { expires_at: '2099-01-01' }); assert(r.s === 400, 'more than 3 years away → 400');
    const exp2 = Date.now() + 7200e3;
    r = await patch(E, `/api/team/${invHE.j.member.id}`, { expires_at: exp2 }); assert(r.s === 200 && r.j.member.expires_at === exp2, 'owner changes the end date');
    r = await H('/api/channels'); assert(r.j.channels.length === 1 && r.j.channels[0].title === 'Eve One', 'inside client E');
    db.prepare(`UPDATE team_members SET expires_at=? WHERE id=?`).run(Date.now() - 1000, invHE.j.member.id); // the date passes
    r = await H('/api/channels'); assert(r.s === 200 && r.j.team_role === 'owner' && !r.j.channels.some((x) => x.title === 'Eve One'), 'access ended: the very next request is back in their own workspace');
    r = await post(H, '/api/workspace', { owner_id: E.id }); assert(r.s === 403, 'and can’t switch back in');
    r = await E('/api/team'); assert(!r.j.members.some((x) => x.email === 'helper18@x.com') && r.j.log.some((x) => x.action === 'team.expire'), 'the member is gone from the Team list; audit log “team.expire”');
    r = await H('/api/inbox'); assert(JSON.stringify(r.j).includes('Your access ended'), 'the helper is told');
    // the job: someone who is not online
    r = await patch(A, `/api/team/${invB1.j.member.id}`, { expires_at: Date.now() + 60000 }); assert(r.s === 200 && r.j.member.expires_at, '“access ends on” works for any role (a media buyer)');
    db.prepare(`UPDATE team_members SET expires_at=? WHERE id=?`).run(Date.now() - 1000, invB1.j.member.id);
    r = await post(ADM, '/api/admin/jobs/run', { job: 'team_expire' }); assert(r.s === 200, 'the expiry job runs from admin');
    assert(db.prepare(`SELECT status FROM team_members WHERE id=?`).get(invB1.j.member.id).status === 'removed', 'the job revoked the member whose access ended');
    r = await patch(A, `/api/team/${invB2.j.member.id}`, { expires_at: null }); assert(r.s === 200 && r.j.member.expires_at === null, '“access ends on” can be cleared');

    // ---------- the owner removes the helper: immediate revocation ----------
    r = await post(H, '/api/workspace', { owner_id: A.id }); assert(r.s === 200, 'helper back in client A');
    r = await del(A, `/api/team/${invH.j.member.id}`); assert(r.s === 200, 'the owner removes the helper');
    r = await H('/api/channels'); assert(r.j.team_role === 'owner' && r.j.channels.length === 0, 'removed: the helper’s next request is in their own (empty) workspace');
    r = await post(H, '/api/workspace', { owner_id: A.id }); assert(r.s === 403, 'and they can’t go back');
    r = await A('/api/team'); const acts = r.j.log.map((x) => x.action + ':' + (x.summary.role || ''));
    assert(r.j.log.some((x) => x.action === 'team.invite' && x.summary.role === 'helper' && x.summary.free === true) && acts.some((x) => x.startsWith('team.accept')) && acts.some((x) => x === 'team.remove:helper'), 'audit log: helper invite (free), accept, remove');
    r = await A('/api/team'); assert(r.j.members.find((x) => x.email === 'helper18b@x.com').free === true, 'the next helper takes over the free slot');
    r = await H('/api/managed?tz=0'); assert(!r.j.accounts.some((x) => x.owner_id === A.id) && !r.j.accounts.some((x) => x.owner_id === E.id), 'Accounts I manage drops removed and ended accounts');

    // ---------- role changes ----------
    const F = await owner('client18f@x.com', 'Fay Client', 8818000055, [[-1841, 'Fay One']]);
    const invF = await post(F, '/api/team/invite', { email: 'helper18@x.com', role: 'helper' });
    r = await patch(F, `/api/team/${invF.j.member.id}`, { role: 'manager' }); assert(r.s === 402 && r.j.upgrade, 'Basic: turning the free helper into a manager needs a seat → 402');
    r = await patch(F, `/api/team/${invF.j.member.id}`, { role: 'helper', expires_at: Date.now() + 864e5 }); assert(r.s === 200 && r.j.member.role === 'helper', 'PATCH role helper stays allowed');

    // ---------- nothing changes for existing roles ----------
    const G = await owner('client18g@x.com', 'Gus Owner', 8818000066, [[-1851, 'Gus One'], [-1852, 'Gus Two']]);
    await post(ADM, `/api/admin/users/${G.id}/plan`, { plan: 'pro' });
    const iM = await post(G, '/api/team/invite', { email: 'gm18@x.com', role: 'manager' });
    const iB = await post(G, '/api/team/invite', { email: 'gb18@x.com', role: 'buyer', channel_ids: [G.chans[0].id] });
    assert(iM.s === 200 && iB.s === 200 && iB.j.seats.used === 2 && iB.j.seats.helpers_free_used === 0 && iM.j.member.all_channels === true && iB.j.member.all_channels === false && iM.j.member.expires_at === null && iM.j.member.free === undefined,
      'owner on Pro: managers and buyers use seats exactly as before');
    const GM = client(); await post(GM, '/api/signup', { country: 'NG', email: 'gm18@x.com', password: 'password1', team_token: tokenOf(iM.j.invite_url) });
    const GB = client(); await post(GB, '/api/signup', { country: 'NG', email: 'gb18@x.com', password: 'password1', team_token: tokenOf(iB.j.invite_url) });
    r = await GM('/api/channels'); assert(r.j.team_role === 'manager' && r.j.channels.length === 2, 'manager: all channels');
    r = await GM('/api/billing'); assert(r.s === 403, 'manager: billing still 403');
    r = await GB('/api/channels'); assert(r.j.team_role === 'buyer' && r.j.channels.length === 1, 'buyer: only their channel');
    r = await GB('/api/team'); assert(r.s === 403, 'buyer: team still 403');
    r = await GB('/api/managed?tz=0'); assert(r.s === 200 && r.j.eligible === false && r.j.accounts.length === 2 && r.j.accounts[1].role === 'buyer' && r.j.accounts[1].channels === 1, 'a buyer on one team: listed (own + team), not eligible for the page');
    r = await G('/api/team'); assert(r.j.roles[0].id === 'manager' && r.j.roles[1].id === 'buyer' && r.j.seats.included === 3, 'role list keeps manager and buyer first');
    r = await G('/api/channels'); assert(r.j.team_role === 'owner', 'owner unchanged');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  db.close();
})();
