// Round 21: Unique people report (GET /api/unique, GET /api/unique.csv).
//  - one person (Telegram ID) is counted once across every funnel; rejoining the same funnel counts once
//  - fake joins are left out; "repeat_user" joins (left and rejoined the SAME funnel within 7 days) are counted once
//  - round 21 rule: joining a DIFFERENT funnel from its own ad is a normal join (sent, charged); only same-funnel repeats are filtered
//  - per-funnel "only here" vs "also in other funnels", top overlapping pairs, 1/2/3/4/5+ funnels distribution
//  - From ads only (src=ads), date range, CSV of people in 2+ funnels (and "in" one funnel)
//  - a media buyer only sees their own channels; another account sees nothing; the admin switch turns it off (403)
//  - read-only: the joins table is exactly the same before and after
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const http = require('http');
// fake Anthropic API for Joe: asks for one tool (global.TOOL), then answers "ok"; the tool's result is kept in toolResults
let toolResults = [];
const ai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { const b = JSON.parse(raw), last = b.messages[b.messages.length - 1];
  let out;
  if (Array.isArray(last.content) && last.content[0].type === 'tool_result') { toolResults.push(JSON.parse(last.content[0].content)); out = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; }
  else out = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: global.TOOL, input: global.INPUT || {} }] };
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', usage: { input_tokens: 10, output_tokens: 5 }, ...out })); }); }).listen(4963);
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ipn = 10;
function client() {
  const jar = {}, ip = '102.89.21.' + (ipn++);
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
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);
let cip = 40;
const click = (slug, camp) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.7.' + (cip++) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwR' + cip + '&utm_campaign=' + camp }) }).then((x) => x.json());
const d = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const tokenOf = (url) => url.split('/join-team/')[1];

(async () => {
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    const uid = async (email) => (await ADM('/api/admin/users?q=' + encodeURIComponent(email))).j.users.find((x) => x.email === email).id;

    // ---------- owner with three channels ----------
    const O = client();
    await post(O, '/api/signup', { country: 'NG', email: 'own21@x.com', password: 'password1', name: 'Ola Owner' });
    const oid = await uid('own21@x.com');
    const BOT = 7721000011;
    await post(O, '/api/bots', { token: BOT + ':AAHk3vZq_r21ownerbotxxxxxxxxxxxxxxxW' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    let upd = 1;
    const tgPost = (u) => O(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    const addCh = (id, title) => tgPost({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT } } } });
    await addCh(-2101, 'Alpha'); await addCh(-2102, 'Bravo'); await addCh(-2103, 'Charlie');
    const chans = (await O('/api/channels')).j.channels;
    const A = chans.find((c) => c.title === 'Alpha'), Bv = chans.find((c) => c.title === 'Bravo'), Cc = chans.find((c) => c.title === 'Charlie');
    assert(A && Bv && Cc, 'three channels');
    for (let i = 0; i < 40 && (await O('/api/channels')).j.channels.some((c) => !c.pool); i++) await sleep(250);
    const slugA = new URL(A.tracking_url).pathname, slugB = new URL(Bv.tracking_url).pathname;
    const join = (go, chat, tgid) => tgPost({ update_id: upd++, chat_member: { chat: { id: chat, type: 'channel' }, from: { id: tgid }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: tgid } },
      new_chat_member: { status: 'member', user: { id: tgid, first_name: 'U' + tgid, is_bot: false } }, ...(go ? { invite_link: { invite_link: go.url, creator: { id: BOT } } } : {}) } });

    // real traffic: 7001 joins Alpha then Bravo from ads (the Bravo join is a repeat: filtered, not charged); 7002 Alpha from an ad; 7003 Bravo organic
    const g1 = await click(slugA, 'CampA'), g2 = await click(slugA, 'CampA'), g3 = await click(slugB, 'CampB');
    const used = () => db.prepare(`SELECT free_joins f FROM users WHERE id=?`).get(oid).f * -1 + (db.prepare(`SELECT COALESCE(SUM(joins),0) n FROM usage WHERE user_id=?`).get(oid).n);
    const u0 = used();
    await join(g1, -2101, 7001); await join(g2, -2101, 7002); await join(g3, -2102, 7001); await join(null, -2102, 7003);
    await sleep(200);
    const rep = db.prepare(`SELECT suspect, suspect_reason, click_id, capi_status FROM joins WHERE owner_id=? AND tg_user_id=7001 AND channel_id=?`).get(oid, Bv.id);
    assert(rep && rep.suspect === 0 && rep.click_id && rep.capi_status !== 'filtered', 'round 21: 7001 joining a DIFFERENT funnel from its own ad is a normal join (not filtered)');
    assert(used() - u0 === 3, 'round 21: all 3 ad joins are charged like any join, including the other-funnel one (got ' + (used() - u0) + ')');
    // leaving and rejoining the SAME funnel from an ad within 7 days is still a filtered repeat
    await tgPost({ update_id: upd++, chat_member: { chat: { id: -2101, type: 'channel' }, from: { id: 7002 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'member', user: { id: 7002 } }, new_chat_member: { status: 'left', user: { id: 7002, first_name: 'U7002', is_bot: false } } } });
    const g4 = await click(slugA, 'CampA'); await join(g4, -2101, 7002); await sleep(200);
    assert(used() - u0 === 3, 'the same-funnel repeat is not charged');
    const rj = db.prepare(`SELECT suspect, suspect_reason, capi_status FROM joins WHERE owner_id=? AND tg_user_id=7002 AND channel_id=? ORDER BY id DESC LIMIT 1`).get(oid, A.id);
    assert(rj && rj.suspect === 1 && rj.suspect_reason === 'repeat_user', 'rejoining the SAME funnel from an ad within 7 days is still filtered as a repeat (not charged twice)');

    // more people written straight into the database (organic): 8001 in all three, 8002–8010 in Alpha + Charlie,
    // 8002 left and rejoined Alpha (counts once), 9001 a fake join on Charlie (left out), 8003 in Bravo 40 days ago (outside 7 days)
    const ins = db.prepare(`INSERT INTO joins(owner_id,channel_id,click_id,tg_user_id,first_name,username,joined_at,left_at,suspect,suspect_reason) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    const t = Date.now() - 3600000;
    for (let u = 8001; u <= 8010; u++) { ins.run(oid, A.id, null, u, 'P' + u, 'p' + u, t - u, null, 0, null); ins.run(oid, Cc.id, null, u, 'P' + u, 'p' + u, t + 1000 - u, null, 0, null); }
    ins.run(oid, Bv.id, null, 8001, 'P8001', 'p8001new', t + 5000, null, 0, null);
    ins.run(oid, A.id, null, 8002, 'P8002', 'p8002', t - 7200000, t - 7100000, 0, null);
    ins.run(oid, Cc.id, null, 9001, 'Bot', '', t, null, 1, 'fake_click');
    ins.run(oid, Bv.id, null, 8003, 'P8003', 'p8003', Date.now() - 40 * 864e5, null, 0, null);
    const before = JSON.stringify(db.prepare(`SELECT * FROM joins ORDER BY id`).all());

    const q = `from=${daysAgo(6)}&to=${d}&tz=0`;
    let r = await O('/api/unique?' + q); const U = r.j;
    assert(r.s === 200 && U.engine === (process.env.UNIQUE_THREAD === 'off' ? 'main' : 'thread'), 'GET /api/unique answers 200 (worked out in the background thread)');
    assert(U.people === 13 && U.funnel_joins === 25, `13 unique people, 25 funnel joins (got ${U.people}, ${U.funnel_joins})`);
    assert(U.repeat_people === 11 && U.extra_joins === 12 && U.repeat_rate === 84.6 && U.avg_funnels === 1.92, 'repeat people 11, 12 repeat joins, 84.6% repeat, 1.92 funnels per person');
    assert(JSON.stringify(U.dist.map((x) => x.people)) === JSON.stringify([2, 10, 1, 0, 0]) && U.dist[4].plus === true, 'distribution: 2 in one funnel, 10 in two, 1 in three, 5+ marked');
    const fA = U.funnels.find((f) => f.id === A.id), fB = U.funnels.find((f) => f.id === Bv.id), fC = U.funnels.find((f) => f.id === Cc.id);
    assert(fA.people === 12 && fA.only_here === 1 && fA.shared === 11 && fA.title === 'Alpha' && fA.from_ads === 2, 'Alpha: 12 people, 1 only here, 11 shared, 2 from ads');
    assert(fB.people === 3 && fB.only_here === 1 && fB.shared === 2, 'Bravo: 3 people, 1 only here');
    assert(fC.people === 10 && fC.only_here === 0 && fC.shared_pct === 100, 'Charlie: 10 people, all shared (the fake join is left out)');
    assert(U.funnels[0].id === A.id, 'funnels sorted biggest first');
    const pr = (a, b) => U.pairs.find((p) => (p.a.id === a && p.b.id === b) || (p.a.id === b && p.b.id === a));
    assert(U.pairs[0].people === 10 && pr(A.id, Cc.id).people === 10 && pr(A.id, Bv.id).people === 2 && pr(Bv.id, Cc.id).people === 1, 'pairs: Alpha+Charlie 10, Alpha+Bravo 2, Bravo+Charlie 1');
    assert(pr(A.id, Cc.id).pct_of_smaller === 100, 'Alpha+Charlie share 100% of the smaller funnel');
    assert(U.repeat_filtered === 1, 'same-funnel repeat joins Joinvoo didn’t charge for: 1 (7002 rejoining Alpha)');
    r = await O('/api/unique?' + q); assert(r.j.computed_at === U.computed_at, 'second call within a minute comes from the cache');

    // ads only
    r = await O('/api/unique?' + q + '&src=ads');
    assert(r.s === 200 && r.j.people === 2 && r.j.funnel_joins === 3 && r.j.src === 'ads' && r.j.pairs.length === 1 && r.j.pairs[0].people === 1, 'From ads only: 2 people, 3 funnel joins, Alpha+Bravo share 1');
    // longer range picks up the old join
    r = await O(`/api/unique?from=${daysAgo(45)}&to=${d}&tz=0`);
    assert(r.j.people === 13 && r.j.funnels.find((f) => f.id === Bv.id).people === 4 && r.j.dist[2].people === 2, '45 days: Bravo has 4 (8003’s old join counts), still 13 people, 8003 now in 3 funnels');

    // CSV
    r = await O('/api/unique.csv?' + q);
    let lines = r.t.trim().split('\n');
    assert(r.s === 200 && /text\/csv/.test(r.h.get('content-type')) && /joinvoo-unique-people\.csv/.test(r.h.get('content-disposition')), 'CSV download');
    assert(lines[0] === 'tg_user_id,username,first_name,last_name,funnels,funnel_names,first_funnel,first_joined,ad_platforms' && lines.length === 12, 'CSV: header + 11 people in 2+ funnels');
    const c1 = lines[1].split(',');
    assert(c1[0] === '8001' && c1[1] === 'p8001new' && c1[4] === '3' && c1[5] === 'Alpha | Charlie | Bravo' && c1[6] === 'Alpha', 'CSV: the 3-funnel person first, newest username, funnels in the order they joined');
    r = await O('/api/unique.csv?' + q + '&min=1&in=' + Cc.id); lines = r.t.trim().split('\n');
    assert(lines.length === 11, 'CSV: everyone in Charlie (min=1&in=Charlie) = 10 people');

    // read-only
    assert(JSON.stringify(db.prepare(`SELECT * FROM joins ORDER BY id`).all()) === before, 'joins table unchanged after the report and CSV');

    // another account sees nothing of this
    const X = client(); await post(X, '/api/signup', { country: 'KE', email: 'other21@x.com', password: 'password1', name: 'Other' });
    r = await X('/api/unique?' + q); assert(r.s === 200 && r.j.people === 0 && r.j.funnels.length === 0 && r.j.pairs.length === 0, 'another account: 0 people, nothing of the owner’s');
    r = await X('/api/unique.csv?' + q); assert(r.s === 200 && r.t.trim().split('\n').length === 1, 'another account: empty CSV');
    r = await fetch(B + '/api/unique?' + q); assert(r.status === 401, 'logged out → 401');

    // media buyer with Alpha only
    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'pro' });
    const inv = await post(O, '/api/team/invite', { email: 'buy21@x.com', role: 'buyer', channel_ids: [A.id] });
    assert(inv.s === 200, 'invite a media buyer with Alpha only');
    const Bu = client(); await post(Bu, '/api/signup', { country: 'KE', email: 'buy21@x.com', password: 'password1', name: 'Ben Buyer' });
    await Bu('/join-team/' + tokenOf(inv.j.invite_url));
    r = await post(Bu, '/api/team/accept', { token: tokenOf(inv.j.invite_url) }); assert(r.s === 200, 'buyer accepts');
    r = await Bu('/api/unique?' + q);
    assert(r.s === 200 && r.j.people === 12 && r.j.funnels.length === 1 && r.j.funnels[0].id === A.id && r.j.pairs.length === 0 && r.j.repeat_people === 0, 'buyer: Alpha only (12 people, no pairs, no repeats from other channels)');
    r = await Bu('/api/unique.csv?' + q); assert(r.s === 200 && r.t.trim().split('\n').length === 1, 'buyer CSV: nobody in 2+ of their channels');
    r = await Bu('/api/unique.csv?' + q + '&min=1'); assert(r.t.trim().split('\n').length === 13 && !/Bravo|Charlie/.test(r.t), 'buyer CSV (min=1): 12 Alpha people, no other channel names');
    r = await O('/api/unique?' + q); assert(r.j.people === 13, 'owner still sees everything (cache is per role scope)');
    // manager sees everything
    const invM = await post(O, '/api/team/invite', { email: 'mgr21@x.com', role: 'manager' });
    const M = client(); await post(M, '/api/signup', { country: 'GH', email: 'mgr21@x.com', password: 'password1', name: 'Mo Manager' });
    await post(M, '/api/team/accept', { token: tokenOf(invM.j.invite_url) });
    r = await M('/api/unique?' + q); assert(r.s === 200 && r.j.people === 13 && r.j.funnels.length === 3, 'manager: all channels');

    // round 21b: who deposits (people in 1 vs 2 vs 3+ funnels). Real deposits through the normal "mark as deposit" flow.
    { const jid = (u, ch) => db.prepare(`SELECT id FROM joins WHERE owner_id=? AND tg_user_id=? AND channel_id=? ORDER BY id LIMIT 1`).get(oid, u, ch).id;
      let c = await post(O, `/api/joins/${jid(7003, Bv.id)}/convert`, { event: 'ftd', value: 50 }); assert(c.s === 200, 'deposit for 7003 (1 funnel)');
      c = await post(O, `/api/joins/${jid(8001, A.id)}/convert`, { event: 'ftd', value: 100 }); assert(c.s === 200, 'first deposit for 8001 (3 funnels) through Alpha');
      c = await post(O, `/api/joins/${jid(8001, Cc.id)}/convert`, { event: 'dep', value: 20 }); assert(c.s === 200, 'second deposit for 8001 through Charlie (a different funnel)');
      const q5 = `from=${daysAgo(5)}&to=${d}&tz=0`; // a range not cached yet
      r = await O('/api/unique?' + q5); const Q = r.j.quality || {};
      const [b1, b2, b3] = Q.buckets || [];
      assert(Q.has_deposits === true && Q.locked === false && b1 && b1.people === 2 && b1.depositors === 1 && b1.deposit_rate === 50 && b1.value_per_person_cents === 2500, '1 funnel: 2 people, 1 depositor, 50%, $25.00 per person');
      assert(b2.people === 10 && b2.depositors === 0 && b2.deposit_rate === 0 && b2.value_per_person_cents === 0, '2 funnels: 10 people, no deposits');
      assert(b3.funnels === '3+' && b3.people === 1 && b3.depositors === 1 && b3.deposits === 2 && b3.revenue_cents === 12000 && b3.value_per_person_cents === 12000, '3+ funnels: 8001 deposited twice, $120 per person');
      assert(Q.multi_earn === 1 && Q.multi.people === 11 && Q.multi.depositors === 1 && Q.rate_lift === 0.18, 'one person deposited through 2 funnels; 2+ funnel people deposit 0.18× as often here');
      r = await X('/api/unique?' + q5); assert(r.j.quality && r.j.quality.has_deposits === false && r.j.quality.buckets.length === 0, 'an account without deposit tracking gets has_deposits:false (the page shows "Set up deposit tracking")');
      r = await Bu('/api/unique?' + q5); const BQ = r.j.quality;
      assert(BQ.has_deposits === true && BQ.buckets[0].people === 12 && BQ.buckets[0].depositors === 1 && BQ.multi_earn === 0 && BQ.buckets[0].revenue_cents === 10000, 'media buyer (Alpha only): only Alpha deposits count (8001’s Charlie deposit is not theirs)');
    }
    // Joe: the unique_people tool gives the same numbers as the page; billing_summary spells out the balance in credits AND dollars
    await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-joe-123456' } });
    global.TOOL = 'unique_people'; global.INPUT = { from: daysAgo(6), to: d }; toolResults = [];
    r = await post(O, '/api/joe/chat', { message: 'How many unique people do I have across my funnels?' });
    let tr = toolResults[0] || {};
    assert(r.s === 200 && tr.unique_people === 13 && tr.joins_across_funnels === 25 && tr.people_in_2_plus_funnels === 11 && tr.funnels.length === 3 && tr.top_pairs[0].shared_people === 10, 'Joe’s unique_people tool: 13 people, 25 joins, 11 in 2+ funnels, top pair 10 (same as the page)');
    global.TOOL = 'billing_summary'; global.INPUT = {}; toolResults = [];
    db.prepare(`UPDATE users SET balance_cents=5000000 WHERE id=?`).run(oid);
    r = await post(O, '/api/joe/chat', { message: 'What’s my balance?' });
    tr = toolResults[0] || {};
    assert(tr.balance && tr.balance.credits === 5000000 && tr.balance.usd === '$50,000.00' && tr.balance.say_it_like_this === '5,000,000 credits (about $50,000.00)', 'Joe’s balance: "5,000,000 credits (about $50,000.00)", never 50,000 coins');
    ai.close();

    // the designed announcement email: Admin → Inbox / Broadcast with design "unique_people"
    r = await post(ADM, '/api/admin/broadcasts', { title: 'New: see how many people you really have', body: 'Open **Results → Unique people**.', cta_label: 'Open Unique people', cta_url: '#tab:unique',
      also_email: true, design: 'unique_people', audience: { plan: 'all', lang: 'all', level: 'all' } });
    assert(r.s === 200, 'broadcast with the Unique people email design is accepted');
    await sleep(800);
    const mails = db.prepare(`SELECT kind, to_addr, subject FROM email_log WHERE kind='announce_unique'`).all();
    assert(mails.length >= 3 && mails.every((m) => m.subject === 'New: see how many people you really have') && mails.some((m) => m.to_addr === 'own21@x.com'), 'customers get the designed announcement email (' + mails.length + ' sent)');
    const inb = (await O('/api/inbox')).j; assert(inb && JSON.stringify(inb).includes('see how many people you really have'), 'the message also lands in the dashboard inbox');
    r = await ADM('/api/admin/broadcasts'); assert(r.j && JSON.stringify(r.j).includes('"emailed":') && (r.j.rows || r.j.broadcasts || []).some((b) => b.emailed >= 3), 'Sent list counts the designed emails');
    r = await ADM('/api/admin/emails/announce_unique/preview?lang=ru'); assert(r.s === 200 && /Сколько у вас людей/.test(r.t) && /unique_people\.png/.test(r.t), 'admin can preview it (Russian shown, header art included)');

    // admin switch
    r = await put(ADM, '/api/admin/settings', { features: { unique_report: false } }); assert(r.s === 200, 'admin turns the report off');
    r = await O('/api/me'); assert(r.j.features && r.j.features.unique_report === false, '/api/me shows the switch off');
    r = await O('/api/unique?' + q); assert(r.s === 403 && r.j.off, 'switched off → 403');
    r = await O('/api/unique.csv?' + q); assert(r.s === 403, 'switched off → CSV 403 too');
    await put(ADM, '/api/admin/settings', { features: { unique_report: true } });
    r = await O('/api/unique?' + q); assert(r.s === 200 && r.j.people === 13, 'back on → works again');

    // bad input never breaks it
    r = await O('/api/unique?from=nonsense&to=2020-99-99&src=zzz&tz=99999'); assert(r.s === 200 && typeof r.j.people === 'number', 'bad dates/params fall back to the default range');
    r = await O('/api/unique.csv?min=-5&in=abc'); assert(r.s === 200, 'bad CSV params are ignored');
    r = await post(O, '/api/unique', {}); assert(r.s === 405, 'POST → 405');
    for (let i = 0; i < 3; i++) r = await O('/api/unique.csv?' + q);
    assert(r.s === 429 && /10 minutes/.test(r.j.error), '7th CSV download in 10 minutes → 429 (the report itself still works)');
    r = await O('/api/unique?' + q); assert(r.s === 200, 'report still answers after the CSV limit');

    // round 21b: a chargeback removes the deposit; Basic after the trial hides the money (counts stay)
    { const jid = db.prepare(`SELECT id FROM joins WHERE owner_id=? AND tg_user_id=7003 AND channel_id=?`).get(oid, Bv.id).id;
      let c = await post(O, `/api/joins/${jid}/convert`, { event: 'rejected' }); assert(c.s === 200, 'chargeback on 7003’s deposit');
      r = await O(`/api/unique?from=${daysAgo(4)}&to=${d}&tz=0`); let b1 = r.j.quality.buckets[0];
      assert(b1.depositors === 0 && b1.value_per_person_cents === 0 && r.j.quality.buckets[2].value_per_person_cents === 12000, 'a charged-back deposit no longer counts');
      await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'basic' }); db.prepare(`UPDATE users SET plan='basic', trial_blocked=1 WHERE id=?`).run(oid);
      r = await O(`/api/unique?from=${daysAgo(3)}&to=${d}&tz=0`); const Q = r.j.quality;
      assert(Q.locked === true && Q.buckets[2].depositors === 1 && Q.buckets[2].revenue_cents === null && Q.buckets[2].value_per_person_cents === null && r.j.people === 13, 'Basic after the trial: depositor counts stay, money values are hidden');
    }
    // existing reports unchanged
    r = await O('/api/stats?' + q); assert(r.s === 200 && r.j.totals && typeof r.j.totals.joins === 'number', '/api/stats still works');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  finally { db.close(); }
})();
