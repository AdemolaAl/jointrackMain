// Round 18 QA regressions (independent review of the Setup helper, "access ends on" and GET /api/managed).
//  - a helper is denied exactly where a manager is (every /api route), and never reaches money, keys, team or admin
//  - free-helper accounting can't be turned into free paid seats (role switches, paused members, concurrent invites)
//  - "access ends on": garbage and impossible dates are refused (never a 500), a date-only value is a calendar date
//  - GET /api/managed: no other workspace's data, removed/paused/expired memberships handled, many workspaces answer fast
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ipn = 10;
function client() {
  const jar = {}, ip = '102.89.28.' + (ipn++);
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
    async function owner(email, name, botId, chats) {
      const f = client();
      await post(f, '/api/signup', { country: 'NG', email, password: 'password1', name });
      if (botId) {
        await post(f, '/api/bots', { token: botId + ':AAHk3vZq_r18qabotxxxxxxxxxxxxxxxxxxxW' + String(botId).slice(-2) });
        const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
        for (const [id, title] of chats) await f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 },
          date: 1, old_chat_member: { status: 'left', user: { id: botId } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: botId } } } }) });
      }
      f.id = await uid(email);
      f.chans = botId ? (await f('/api/channels')).j.channels : [];
      return f;
    }
    async function join(email, url) { const f = client(); const r = await post(f, '/api/signup', { country: 'NG', email, password: 'password1', team_token: tokenOf(url) }); f.ok = r.s === 200; f.id = await uid(email); return f; }
    const liveNonFree = (ownerId) => { // members holding a seat right now (active), minus the free helper(s)
      const free = new Set(db.prepare(`SELECT id FROM team_members WHERE owner_id=? AND role='helper' AND (status IN ('active','paused') OR (status='invited' AND invited_at>?)) ORDER BY id LIMIT 1`).all(ownerId, Date.now() - 7 * 864e5).map((r) => r.id));
      return db.prepare(`SELECT id FROM team_members WHERE owner_id=? AND status='active'`).all(ownerId).filter((r) => !free.has(r.id)).length;
    };

    // ---------- 1. a helper is denied exactly where a manager is ----------
    const A = await owner('qa18a@x.com', 'Ann QA', 8828000011, [[-2801, 'Ann One']]);
    await post(ADM, `/api/admin/users/${A.id}/plan`, { plan: 'pro' });
    const iH = await post(A, '/api/team/invite', { email: 'qa18h@x.com', role: 'helper' });
    const iM = await post(A, '/api/team/invite', { email: 'qa18m@x.com', role: 'manager' });
    assert(iH.s === 200 && iH.j.member.free && iM.s === 200, 'Pro owner: a free helper and a manager');
    const H = await join('qa18h@x.com', iH.j.invite_url), M = await join('qa18m@x.com', iM.j.invite_url);
    assert((await H('/api/channels')).j.team_role === 'helper' && (await M('/api/channels')).j.team_role === 'manager', 'both work in the owner’s workspace');
    const routes = [['GET', '/api/billing'], ['GET', '/api/billing/methods'], ['POST', '/api/billing/topup'], ['POST', '/api/billing/deposit'], ['POST', '/api/billing/plan'], ['POST', '/api/billing/promo'], ['POST', '/api/billing/verify'],
      ['GET', '/api/referrals'], ['POST', '/api/referrals/withdraw'], ['POST', '/api/referrals/credit'], ['GET', '/api/alerts'], ['GET', '/api/integrations'], ['POST', '/api/integrations/x'],
      ['GET', '/api/team'], ['POST', '/api/team/invite'], ['PATCH', '/api/team/999999'], ['DELETE', '/api/team/999999'], ['POST', '/api/team/999999/resend'],
      ['POST', '/api/conversions/rotate'], ['POST', '/api/domains'], ['DELETE', '/api/domains/999999'], ['DELETE', '/api/meta'], ['POST', '/api/meta/sync'], ['GET', '/api/meta/accounts'], ['PATCH', '/api/meta/accounts'], ['GET', '/api/meta/connect'],
      ['DELETE', '/api/bots/999999'], ['PATCH', '/api/bots/999999'], ['DELETE', '/api/account'], ['POST', '/api/account/delete'], ['GET', '/api/joe/insights'], ['POST', '/api/joe/chat'], ['GET', '/api/voosquare/status'],
      ['GET', '/api/stats'], ['GET', '/api/channels'], ['GET', '/api/conversions'], ['GET', '/api/spend'], ['GET', '/api/domains'], ['GET', '/api/meta'], ['GET', '/api/team/leaderboard'], ['GET', '/api/joins'], ['GET', '/api/audience-guide'],
      ['PATCH', '/api/channels/999999'], ['DELETE', '/api/channels/999999'], ['DELETE', '/api/spend/999999'], ['POST', '/api/joins/999999/convert'], ['GET', '/api/report-settings']];
    let mismatch = [], leaks = [];
    for (const [m, p] of routes) {
      const o = { method: m, body: m === 'GET' ? undefined : '{}' };
      const [rh, rm] = [await H(p, o), await M(p, o)];
      if ((rh.s === 403) !== (rm.s === 403)) mismatch.push(`${m} ${p} helper ${rh.s} manager ${rm.s}`);
      if (/billing|referrals|alerts|integrations|\/team(?!\/leaderboard)|rotate|account|joe|meta\/(sync|accounts|connect)|bots\/|voosquare|^DELETE \/api\/(meta|domains)|^POST \/api\/domains/.test(m + ' ' + p) && rh.s !== 403 && rh.s !== 404) leaks.push(`${m} ${p} → ${rh.s}`);
    }
    assert(!mismatch.length, 'helper and manager are denied on exactly the same routes' + (mismatch.length ? ': ' + mismatch.join('; ') : ''));
    assert(!leaks.length, 'helper never reaches billing, referrals, team, keys, Joe, Meta connect, bot or account routes' + (leaks.length ? ': ' + leaks.join('; ') : ''));
    let r = await H('/api/admin/overview'); assert(r.s === 403 || r.s === 401, 'admin routes stay closed to a helper');
    r = await post(H, '/api/bot-targets', { bot_id: 1, forward_url: 'https://evil.example.com/x' }); assert(r.s === 403 || r.s === 400 || r.s === 404, 'helper can’t set a forward_url');
    r = await A('/api/channels'); assert(!r.j.channels.some((c) => c.forward_url), 'no forward_url was set on the owner’s channels');
    r = await patch(H, '/api/me', { name: 'Hacked Name' }); assert(r.s === 200 && (await A('/api/me')).j.name !== 'Hacked Name', 'PATCH /api/me inside the workspace changes the helper’s own profile, never the owner’s');

    // ---------- 2. free-helper accounting can't mint free seats ----------
    // Basic owner with two paused managers (from a downgrade) + the free helper
    const Bo = await owner('qa18b@x.com', 'Bea QA', 8828000022, [[-2811, 'Bea One']]);
    await post(ADM, `/api/admin/users/${Bo.id}/plan`, { plan: 'pro' });
    const bH = await post(Bo, '/api/team/invite', { email: 'qa18bh@x.com', role: 'helper' });
    const bM1 = await post(Bo, '/api/team/invite', { email: 'qa18bm1@x.com', role: 'manager' });
    const bM2 = await post(Bo, '/api/team/invite', { email: 'qa18bm2@x.com', role: 'manager' });
    await join('qa18bh@x.com', bH.j.invite_url); const BM1 = await join('qa18bm1@x.com', bM1.j.invite_url); await join('qa18bm2@x.com', bM2.j.invite_url);
    await post(ADM, `/api/admin/users/${Bo.id}/trial`, { action: 'end' });
    await post(ADM, `/api/admin/users/${Bo.id}/plan`, { plan: 'basic' });
    r = await Bo('/api/team'); let st = Object.fromEntries(r.j.members.map((x) => [x.email, x.status]));
    assert(st['qa18bh@x.com'] === 'active' && st['qa18bm1@x.com'] === 'paused' && st['qa18bm2@x.com'] === 'paused' && liveNonFree(Bo.id) === 0, 'Basic after downgrade: helper active, both managers paused');
    r = await patch(Bo, `/api/team/${bM1.j.member.id}`, { role: 'helper' });
    assert(r.s === 200 && liveNonFree(Bo.id) === 0, 'a paused manager turned helper stays paused (the free slot is taken)');
    r = await patch(Bo, `/api/team/${bH.j.member.id}`, { role: 'manager' });
    assert(liveNonFree(Bo.id) === 0, 'turning the free helper into a manager never leaves an active paid seat on Basic (status ' + r.s + ')');
    r = await patch(Bo, `/api/team/${bM2.j.member.id}`, { role: 'buyer' });
    r = await patch(Bo, `/api/team/${bM1.j.member.id}`, { role: 'buyer' });
    assert(liveNonFree(Bo.id) === 0, 'more role switches: still no active paid member on Basic (status ' + r.s + ')');
    r = await Bo('/api/team'); assert(r.j.seats.used === 0 && r.j.seats.helpers_free_used <= 1, 'seat counter agrees: 0 seats used on Basic');
    r = await BM1('/api/channels'); assert(r.j.team_role !== 'manager' && r.j.team_role !== 'buyer' || liveNonFree(Bo.id) === 0, 'the switched member has no paid access');

    // concurrent helper invites on Basic: exactly one is free, the other 402
    const Co = await owner('qa18c@x.com', 'Cal QA', 0, []);
    const both = await Promise.all([post(Co, '/api/team/invite', { email: 'qa18c1@x.com', role: 'helper' }), post(Co, '/api/team/invite', { email: 'qa18c2@x.com', role: 'helper' }), post(Co, '/api/team/invite', { email: 'qa18c3@x.com', role: 'helper' })]);
    assert(both.filter((x) => x.s === 200).length === 1 && both.filter((x) => x.s === 402).length === 2, 'three helper invites at once on Basic: one free, two 402');
    // the same email twice at once
    const Do = await owner('qa18d@x.com', 'Dee QA', 0, []);
    const dup = await Promise.all([post(Do, '/api/team/invite', { email: 'qa18dd@x.com', role: 'helper' }), post(Do, '/api/team/invite', { email: 'qa18dd@x.com', role: 'helper' })]);
    assert(dup.filter((x) => x.s === 200).length === 1, 'the same person invited twice at once: one invite');
    // remove + re-add the helper: still one free, nothing charged
    const dId = dup.find((x) => x.s === 200).j.member.id;
    await del(Do, '/api/team/' + dId);
    r = await post(Do, '/api/team/invite', { email: 'qa18dd@x.com', role: 'helper' }); assert(r.s === 200 && r.j.member.free && r.j.charged_cents === 0, 'remove and re-invite the helper: free again');
    r = await post(Do, '/api/team/invite', { email: 'qa18de@x.com', role: 'helper' }); assert(r.s === 402, 'and still only one');
    // an expired free-helper invite + a new helper: the old invite can't be revived for free
    db.prepare(`UPDATE team_members SET invited_at=? WHERE id=?`).run(Date.now() - 8 * 864e5, r.s === 402 ? db.prepare(`SELECT id FROM team_members WHERE owner_id=? AND email='qa18dd@x.com' AND status='invited'`).get(Do.id).id : 0);
    r = await post(Do, '/api/team/invite', { email: 'qa18df@x.com', role: 'helper' }); assert(r.s === 200 && r.j.member.free, 'an expired helper invite frees the slot for a new helper');
    const old = db.prepare(`SELECT id FROM team_members WHERE owner_id=? AND email='qa18dd@x.com' AND status='invited'`).get(Do.id);
    r = await post(Do, `/api/team/${old.id}/resend`); assert(r.s === 402, 'resending the expired one needs a seat (402 on Basic)');
    r = await patch(Do, `/api/team/${old.id}`, { role: 'manager' }); r = await post(Do, `/api/team/${old.id}/resend`); assert(r.s === 402, 'and turning it into a manager first doesn’t help');

    // ---------- 3. "access ends on" input ----------
    const E = await owner('qa18e@x.com', 'Eli QA', 0, []);
    const iE = await post(E, '/api/team/invite', { email: 'qa18eh@x.com', role: 'helper' });
    const bad = [{}, [], true, 'abc', -5, 1e20, '2027-02-30', '2027-13-01', '2027-00-10', 'Infinity', [Date.now() + 864e5]];
    const codes = [];
    for (const v of bad) { const x = await patch(E, `/api/team/${iE.j.member.id}`, { expires_at: v }); codes.push(x.s); }
    assert(codes.every((c) => c === 400), 'garbage / impossible “access ends on” values → 400 (got ' + codes.join(',') + ')');
    r = await E('/api/team'); assert(r.j.members[0].expires_at === null, 'and nothing was stored');
    r = await patch(E, `/api/team/${iE.j.member.id}`, { expires_at: '2027-03-01' }); assert(r.s === 200 && r.j.member.expires_at === Date.parse('2027-03-01T23:59:59Z'), 'a valid date is the end of that day (UTC)');
    const tLocal = Date.now() + 5 * 864e5;
    r = await patch(E, `/api/team/${iE.j.member.id}`, { expires_at: tLocal }); assert(r.s === 200 && r.j.member.expires_at === tLocal, 'a timestamp (what the dashboard sends: end of the chosen day in the user’s time zone) is kept as is');
    r = await patch(E, `/api/team/${iE.j.member.id}`, { expires_at: new Date(tLocal).toISOString() }); assert(r.s === 200 && r.j.member.expires_at === tLocal, 'an ISO date-time is accepted');
    r = await post(E, '/api/team/invite', { email: 'qa18ex@x.com', role: 'manager', expires_at: '2027-02-30' }); assert(r.s === 400, 'an impossible date on invite → 400 (no seat used either)');
    // the owner can't be given an end date, a member can't set their own
    const EH = await join('qa18eh@x.com', iE.j.invite_url);
    r = await patch(EH, `/api/team/${iE.j.member.id}`, { expires_at: null }); assert(r.s === 403, 'a member can’t change their own end date');
    // expired between two requests: the very next request is in their own account, and accept/invite-info refuse the ended invite
    db.prepare(`UPDATE team_members SET expires_at=? WHERE id=?`).run(Date.now() - 1, iE.j.member.id);
    r = await EH('/api/stats'); assert(r.s === 200 && (await EH('/api/channels')).j.team_role === 'owner', 'access ended mid-session → own workspace on the next request');
    r = await EH('/api/managed'); assert(!r.j.accounts.some((x) => x.owner_id === E.id), 'and gone from Accounts I manage');
    const iE2 = await post(E, '/api/team/invite', { email: 'qa18ey@x.com', role: 'helper', expires_at: Date.now() + 60000 });
    db.prepare(`UPDATE team_members SET expires_at=? WHERE id=?`).run(Date.now() - 1, iE2.j.member.id);
    r = await fetch(B + '/api/team/invite-info?token=' + tokenOf(iE2.j.invite_url)).then((x) => x.json());
    assert(r.valid === false, 'invite-info: an invite whose access already ended is not valid');

    // ---------- 4. GET /api/managed ----------
    // the helper of A also manages many accounts (synthetic, straight into the database)
    const now = Date.now(), hour = Math.floor(now / 3600000);
    const ins = db.prepare(`INSERT INTO users(email,pass,created_at,status,name,balance_cents,free_joins) VALUES(?,?,?,?,?,?,?)`);
    const insM = db.prepare(`INSERT INTO team_members(owner_id,user_id,email,role,status,invited_at,joined_at,expires_at,pause_reason) VALUES(?,?,?,?,?,?,?,?,?)`);
    const insC = db.prepare(`INSERT INTO channels(owner_id,chat_id,title,type,slug,status,created_at) VALUES(?,?,?,?,?,?,?)`);
    const insH = db.prepare(`INSERT INTO hourly(channel_id,hour,owner_id,clicks,joins) VALUES(?,?,?,?,?)`);
    const many = [];
    db.exec('BEGIN');
    for (let i = 0; i < 150; i++) {
      const id = Number(ins.run(`qa18many${i}@x.com`, 'x', now, 'active', 'Many ' + i, 123456, 0).lastInsertRowid);
      const role = i % 3 === 0 ? 'buyer' : i % 3 === 1 ? 'manager' : 'helper';
      const mid = Number(insM.run(id, H.id, 'qa18h@x.com', role, 'active', now, now, null, null).lastInsertRowid);
      const c1 = Number(insC.run(id, -900000 - i * 2, 'M' + i + 'a', 'channel', 'qa18m' + i + 'a', 'active', now).lastInsertRowid);
      const c2 = Number(insC.run(id, -900001 - i * 2, 'M' + i + 'b', 'channel', 'qa18m' + i + 'b', 'active', now).lastInsertRowid);
      insH.run(c1, hour, id, 2, 1); insH.run(c2, hour, id, 20, 10);
      if (role === 'buyer') db.prepare(`INSERT INTO team_channel_access(member_id,channel_id) VALUES(?,?)`).run(mid, c1);
      many.push({ id, role, c1, c2, mid });
    }
    // memberships that must never be listed: removed, expired, of a suspended owner
    const gone = [];
    for (const [st2, exp, ust] of [['removed', null, 'active'], ['active', now - 1000, 'active'], ['active', null, 'suspended'], ['invited', null, 'active']]) {
      const id = Number(ins.run(`qa18gone${gone.length}@x.com`, 'x', now, ust, 'Gone', 0, 0).lastInsertRowid);
      insM.run(id, H.id, 'qa18h@x.com', 'helper', st2, now, now, exp, null); gone.push(id);
    }
    db.exec('COMMIT');
    const t0 = Date.now(); r = await H('/api/managed?tz=0'); const took = Date.now() - t0;
    const byId = new Map((r.j.accounts || []).map((x) => [x.owner_id, x]));
    assert(r.s === 200 && r.j.count === 152 && r.j.accounts.length === 152 && !r.j.capped, '152 accounts listed (own + A + 150), not capped');
    assert(gone.every((id) => !byId.has(id)), 'removed, expired, suspended-owner and never-accepted memberships are left out');
    const okNums = many.every((w) => { const x = byId.get(w.id); return x && (w.role === 'buyer' ? x.channels === 1 && x.joins_today === 1 : x.channels === 2 && x.joins_today === 11); });
    assert(okNums, 'every account’s numbers follow its role (buyers: only their channel)');
    assert(took < 1500, `150 workspaces answer quickly (${took} ms)`);
    const blob = JSON.stringify(r.j);
    assert(!/123456|balance|credits|wallet|"plan"|seat_cents|price/.test(blob), 'no wallet/plan/price anywhere');
    // a reversed (rejected) deposit isn't a deposit, like everywhere else in the dashboard
    const w0 = many.find((w) => w.role !== 'buyer');
    db.prepare(`INSERT INTO conversions(owner_id,channel_id,event,value_cents,matched,source,created_at) VALUES(?,?,'ftd',5000,1,'postback',?)`).run(w0.id, w0.c1, now - 3600e3);
    db.prepare(`INSERT INTO conversions(owner_id,channel_id,event,value_cents,matched,source,created_at,rejected) VALUES(?,?,'ftd',7000,1,'postback',?,1)`).run(w0.id, w0.c2, now - 3600e3);
    r = await H('/api/managed?tz=0'); const x0 = r.j.accounts.find((x) => x.owner_id === w0.id);
    assert(x0.deposits_7d === 1 && x0.revenue_7d_cents === 5000, 'a rejected (reversed) deposit is not counted in deposits · 7d');
    // over the cap
    db.exec('BEGIN');
    for (let i = 0; i < 60; i++) { const id = Number(ins.run(`qa18cap${i}@x.com`, 'x', now, 'active', 'Cap ' + i, 0, 0).lastInsertRowid); insM.run(id, H.id, 'qa18h@x.com', 'helper', 'active', now, now, null, null); }
    db.exec('COMMIT');
    r = await H('/api/managed?tz=0'); assert(r.s === 200 && r.j.capped === true && r.j.accounts.length === 200 && r.j.accounts[0].own, 'more than 200: capped at 200, own account first');
    // garbage tz never breaks it
    for (const tz of ['abc', '99999', '-99999', '1e9']) { r = await H('/api/managed?tz=' + tz); if (r.s !== 200) break; }
    assert(r.s === 200, 'garbage tz → still 200');
    // another person's view is theirs only
    r = await M('/api/managed?tz=0'); assert(r.j.accounts.length === 2 && r.j.accounts.every((x) => x.owner_id === M.id || x.owner_id === A.id), 'the manager sees only their own account and A');
    r = await A('/api/managed?tz=0'); assert(r.j.accounts.length === 1 && r.j.accounts[0].own, 'the owner sees only their own account');
    r = await fetch(B + '/api/managed').then((x) => x.status); assert(r === 401, 'logged out → 401');

    // ---------- 5. regression: owner / manager / buyer and seats unchanged ----------
    const G = await owner('qa18g@x.com', 'Gil QA', 8828000033, [[-2821, 'Gil One'], [-2822, 'Gil Two']]);
    await post(ADM, `/api/admin/users/${G.id}/plan`, { plan: 'pro' });
    for (const e of ['qa18g1@x.com', 'qa18g2@x.com', 'qa18g3@x.com']) await post(G, '/api/team/invite', { email: e, role: 'manager' });
    r = await post(G, '/api/team/invite', { email: 'qa18g4@x.com', role: 'buyer', channel_ids: [G.chans[0].id] });
    assert(r.s === 402 && r.j.topup, '4th seat on Pro with an empty wallet → 402 top-up (unchanged)');
    await post(ADM, `/api/admin/users/${G.id}/credits`, { credits: 500, reason: 'test' });
    r = await post(G, '/api/team/invite', { email: 'qa18g4@x.com', role: 'buyer', channel_ids: [G.chans[0].id] });
    assert(r.s === 200 && r.j.charged_cents === 500 && r.j.seats.used === 4 && r.j.seats.extra === 1, 'extra seat charged $5 (unchanged)');
    r = await post(G, '/api/team/invite', { email: 'qa18gh@x.com', role: 'helper' });
    assert(r.s === 200 && r.j.member.free && r.j.charged_cents === 0 && r.j.seats.used === 4, 'the free helper on a full Pro team: no seat, no charge');
    await post(ADM, `/api/admin/users/${G.id}/trial`, { action: 'end' });
    await post(ADM, `/api/admin/users/${G.id}/plan`, { plan: 'basic' });
    r = await G('/api/team'); st = r.j.members.map((x) => x.role + ':' + x.status);
    assert(st.filter((x) => x === 'helper:invited').length === 1 && st.filter((x) => x.endsWith(':paused')).length === 4, 'downgrade pauses the 4 paid seats, keeps the helper invite (unchanged)');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  db.close();
})();
