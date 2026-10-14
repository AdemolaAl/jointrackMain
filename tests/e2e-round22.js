// Round 22: Unique people → By ad platform (part of GET /api/unique, "platforms").
//  - each paid person counted once across Facebook (fbclid), TikTok (ttclid), Snapchat (ScCid) and other tracked clicks
//  - people who clicked on 2 platforms are "both"; "claimed" = platforms added up
//  - fake joins left out; organic joins not in it
//  - spend per platform → cost per person and cost per NEW person; deposits per platform; 2+ platforms vs one
//  - media buyer sees only their channels (joins AND spend); CSV gets an ad_platforms column; Joe gets by_ad_platform
//  - read-only
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const http = require('http');
let toolResults = [];
const ai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { const b = JSON.parse(raw), last = b.messages[b.messages.length - 1];
  let out;
  if (Array.isArray(last.content) && last.content[0].type === 'tool_result') { toolResults.push(JSON.parse(last.content[0].content)); out = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; }
  else out = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: global.TOOL, input: global.INPUT || {} }] };
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', usage: { input_tokens: 10, output_tokens: 5 }, ...out })); }); }).listen(4964);
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ipn = 10;
function client() {
  const jar = {}, ip = '102.89.22.' + (ipn++);
  return async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': ip, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);
let cip = 40;
// a click from an ad: kind = fb | tt | sc | none (a tracked link with only a utm tag)
const click = (slug, kind) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone)', 'x-forwarded-for': '102.89.8.' + (cip++) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?' + ({ fb: 'fbclid=IwR', tt: 'ttclid=E.C.P.', sc: 'ScCid=sc-' }[kind] || 'x=') + cip + '&utm_campaign=C' + kind }) }).then((x) => x.json());
const d = new Date().toISOString().slice(0, 10);
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

    const O = client();
    await post(O, '/api/signup', { country: 'NG', email: 'own22@x.com', password: 'password1', name: 'Ola Owner' });
    const oid = await uid('own22@x.com');
    const BOT = 7722000011;
    await post(O, '/api/bots', { token: BOT + ':AAHk3vZq_r22ownerbotxxxxxxxxxxxxxxxW' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    let upd = 1;
    const tgPost = (u) => O(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    const addCh = (id, title) => tgPost({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT } } } });
    await addCh(-2201, 'Alpha'); await addCh(-2202, 'Bravo');
    const chans = (await O('/api/channels')).j.channels;
    const A = chans.find((c) => c.title === 'Alpha'), Bv = chans.find((c) => c.title === 'Bravo');
    assert(A && Bv, 'two channels');
    for (let i = 0; i < 40 && (await O('/api/channels')).j.channels.some((c) => !c.pool); i++) await sleep(250);
    const sA = new URL(A.tracking_url).pathname, sB = new URL(Bv.tracking_url).pathname;
    const join = (go, chat, tgid) => tgPost({ update_id: upd++, chat_member: { chat: { id: chat, type: 'channel' }, from: { id: tgid }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: tgid } },
      new_chat_member: { status: 'member', user: { id: tgid, first_name: 'U' + tgid, username: 'u' + tgid, is_bot: false } }, ...(go ? { invite_link: { invite_link: go.url, creator: { id: BOT } } } : {}) } });

    // 9001: Facebook ad → Alpha, then TikTok ad → Bravo  (both)
    // 9002: Facebook → Alpha (Facebook only) · 9003: TikTok → Alpha · 9004: TikTok → Bravo (made fake below) · 9005: Snapchat → Bravo
    // 9006: organic → Alpha (not paid) · 9007: tracked link without a platform ID → Bravo (other) · 9008: Facebook → Bravo
    await join(await click(sA, 'fb'), -2201, 9001); await join(await click(sB, 'tt'), -2202, 9001);
    await join(await click(sA, 'fb'), -2201, 9002); await join(await click(sA, 'tt'), -2201, 9003); await join(await click(sB, 'tt'), -2202, 9004);
    await join(await click(sB, 'sc'), -2202, 9005); await join(null, -2201, 9006); await join(await click(sB, 'none'), -2202, 9007); await join(await click(sB, 'fb'), -2202, 9008);
    await sleep(250);
    const nj = db.prepare(`SELECT COUNT(*) n FROM joins WHERE owner_id=?`).get(oid).n;
    assert(nj === 9, 'nine joins recorded (' + nj + ')');
    db.prepare(`UPDATE joins SET suspect=1, suspect_reason='burst' WHERE owner_id=? AND tg_user_id=9004`).run(oid); // a fake join

    // spend: Facebook $30 (Alpha), TikTok $10 (Bravo), Snapchat $5 (no channel)
    let r = await post(O, '/api/spend', { date: d, platform: 'facebook', campaign: 'Cfb', amount: 30, channel_id: A.id }); assert(r.s === 200, 'spend: Facebook $30');
    r = await post(O, '/api/spend', { date: d, platform: 'tiktok', campaign: 'Ctt', amount: 10, channel_id: Bv.id }); assert(r.s === 200, 'spend: TikTok $10');
    r = await post(O, '/api/spend', { date: d, platform: 'snapchat', campaign: 'Csc', amount: 5 }); assert(r.s === 200, 'spend: Snapchat $5');

    const before = JSON.stringify(db.prepare(`SELECT * FROM joins ORDER BY id`).all());
    const q = `from=${d}&to=${d}&tz=0`;
    r = await O('/api/unique?' + q + '&src=ads');
    const P = r.j.platforms, by = (k) => P.list.find((x) => x.key === k);
    assert(r.s === 200 && r.j.people === 6 && P.people === 6, 'From ads: 6 paid people (9004 fake, 9006 organic left out)');
    // round 23 review: platforms are compared among Facebook/TikTok/Snapchat only. "Other" (9007) keeps its own row but isn't added up:
    // added up = Facebook 3 + TikTok 2 + Snapchat 1 = 6, compared with the 5 people from those three; 1 of those 5 (20%) came from 2
    assert(P.claimed === 6 && P.known_people === 5 && P.people === 6 && P.multi === 1 && P.multi_pct === 20 && P.known === 3, 'platforms added up = 6 (Other not added), 5 people from them, 1 (20%) on 2 platforms, 3 known platforms');
    assert(by('meta').people === 3 && by('meta').only_here === 2 && by('meta').shared === 1, 'Facebook: 3 people, 2 new, 1 also elsewhere');
    assert(by('tiktok').people === 2 && by('tiktok').only_here === 1, 'TikTok: 2 people (9001, 9003), 1 new');
    assert(by('snapchat').people === 1 && by('other').people === 1, 'Snapchat 1, other 1');
    assert(P.list[P.list.length - 1].key === 'other', '"Other" is listed last');
    assert(P.combos.length === 1 && P.combos[0].people === 1 && P.combos[0].keys.join() === 'meta,tiktok', 'one combo: Facebook + TikTok (1 person)');
    assert(P.has_spend && P.spend_cents === 4500 && by('meta').spend_cents === 3000 && by('meta').cost_per_person_cents === 1000 && by('meta').cost_per_new_cents === 1500, 'Facebook: $30 → $10 per person, $15 per new person');
    assert(by('tiktok').cost_per_person_cents === 500 && by('tiktok').cost_per_new_cents === 1000 && by('snapchat').cost_per_new_cents === 500, 'TikTok $5/person, $10/new; Snapchat $5/new');
    // round 23 review: costs use only platforms with spend (all three here, not Other): $45 ÷ 5 people = $9.00; ÷ 6 added up = $7.50
    assert(P.cost_per_person_cents === 900 && P.cost_if_added_cents === 750, 'real cost per paid person $9.00 vs $7.50 if platforms are added up (Other has no spend, so it is left out)');
    assert(P.has_deposits === false && P.quality === null && by('meta').deposit_rate === null, 'no deposit tracking yet: no deposit numbers');
    const all = await O('/api/unique?' + q);
    assert(all.j.people === 7 && all.j.platforms.people === 6 && all.j.platforms.claimed === 6, /* round 23 review: Other not added up */ 'Everyone view: 7 people, platform numbers still paid-only (for the "See by ad platform" line)');

    // deposits: 9001 (both) and 9002 (Facebook only)
    const jid = (u) => db.prepare(`SELECT id FROM joins WHERE owner_id=? AND tg_user_id=? ORDER BY id LIMIT 1`).get(oid, u).id;
    r = await post(O, `/api/joins/${jid(9001)}/convert`, { event: 'ftd', value: 100 }); assert(r.s === 200, 'deposit 9001');
    r = await post(O, `/api/joins/${jid(9002)}/convert`, { event: 'ftd', value: 40 }); assert(r.s === 200, 'deposit 9002');
    const q2 = `from=${new Date(Date.now() - 864e5).toISOString().slice(0, 10)}&to=${d}&tz=0&src=ads`; // new range: not cached
    r = await O('/api/unique?' + q2); const P2 = r.j.platforms, b2 = (k) => P2.list.find((x) => x.key === k);
    assert(P2.has_deposits && b2('meta').depositors === 2 && b2('meta').deposit_rate === 66.7 && b2('meta').revenue_cents === 14000, 'Facebook: 2 of 3 deposited ($140)');
    assert(b2('tiktok').depositors === 1 && b2('tiktok').deposit_rate === 50 && b2('snapchat').deposit_rate === 0, 'TikTok: 1 of 2 · Snapchat 0%');
    assert(P2.quality.one.people === 5 && P2.quality.one.depositors === 1 && P2.quality.one.deposit_rate === 20 && P2.quality.multi.deposit_rate === 100 && P2.quality.rate_lift === 5, '2+ platforms deposit 5× as often (100% vs 20%)');

    // CSV: ad_platforms column
    r = await O('/api/unique.csv?' + q + '&min=1');
    const lines = r.t.trim().split('\n'), row = (u) => lines.find((l) => l.startsWith(u + ','));
    assert(lines[0].endsWith(',ad_platforms') && row(9001).endsWith(',Facebook | TikTok') && row(9005).endsWith(',Snapchat') && row(9007).endsWith(',Other') && row(9006).endsWith(','), 'CSV: ad_platforms per person (organic = empty)');

    // Joe without an AI key: the guide answers and points to the new card
    r = await post(O, '/api/joe/chat', { message: 'Am I paying Facebook and TikTok for the same people?' });
    assert(r.s === 200 && /By ad platform/.test(r.j.reply || ''), 'Joe (no AI key) answers from the guide: By ad platform');
    // Joe with AI: the unique_people tool carries by_ad_platform
    await ADM('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ joe: { api_key: 'sk-ant-test-joe-123456' } }) });
    global.TOOL = 'unique_people'; global.INPUT = { from: d, to: d, src: 'ads' }; toolResults = [];
    r = await post(O, '/api/joe/chat', { message: 'Am I paying Facebook and TikTok for the same people?' });
    const J = (toolResults[0] || {}).by_ad_platform || {};;
    assert(r.s === 200 && J.paid_people_counted_once === 6 && J.platforms_added_up === 6 && J.paid_people_from_facebook_tiktok_snapchat === 5 && /* round 23 review */ J.people_from_2_plus_platforms === 1 && J.platforms.find((x) => x.platform === 'Facebook').only_from_this_platform === 2, 'Joe gets by_ad_platform');

    // media buyer with Bravo only: Bravo's joins and Bravo's spend only
    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'pro' });
    const inv = await post(O, '/api/team/invite', { email: 'buy22@x.com', role: 'buyer', channel_ids: [Bv.id] });
    const Bu = client(); await post(Bu, '/api/signup', { country: 'KE', email: 'buy22@x.com', password: 'password1', name: 'Ben Buyer' });
    await post(Bu, '/api/team/accept', { token: tokenOf(inv.j.invite_url) });
    r = await Bu('/api/unique?' + q + '&src=ads'); const PB = r.j.platforms, bb = (k) => PB.list.find((x) => x.key === k);
    assert(r.s === 200 && PB.people === 4 && PB.multi === 0 && bb('tiktok').people === 1 && bb('meta').people === 1, 'buyer (Bravo): 4 paid people, nobody "both" (9001’s Alpha click is not theirs)');
    assert(PB.spend_cents === 1000 && !bb('snapchat').spend_cents && bb('tiktok').spend_cents === 1000, 'buyer: only Bravo’s TikTok spend ($10), not Alpha’s or unassigned spend');

    // account with one platform: known = 1 (the card stays hidden)
    const S1 = client(); await post(S1, '/api/signup', { country: 'GH', email: 'one22@x.com', password: 'password1', name: 'Solo' });
    r = await S1('/api/unique?' + q + '&src=ads'); assert(r.s === 200 && r.j.platforms.people === 0 && r.j.platforms.known === 0, 'empty account: platforms empty');

    assert(JSON.stringify(db.prepare(`SELECT * FROM joins ORDER BY id`).all()) === before, 'joins table unchanged (read-only)');
    const tmp = (await fetch(B + '/api/unique?' + q)).status; assert(tmp === 401, 'logged out → 401');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  finally { ai.close(); process.exit(); }
})();
