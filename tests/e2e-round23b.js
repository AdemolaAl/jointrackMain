// Round 23 review fixes (13 October 2026). One check (or more) per numbered fix in the review:
//  1 staff protection on reset-password / suspend / log out · 2 reset of a never-verified account cuts off what someone else set up
//  3 Joe test as another customer needs users.view · 4 password change / reset forget other devices · 5 /api/password rate limit
//  6 bot "forward updates" goes through the pinned request (no redirects, private addresses refused) · 7 inbox bodies can't carry links
//  8 dim=constructor can't break reports · 9 HTML security headers · 10 cross-site GET /logout is ignored
//  11 promo codes re-checked at payment · 12 refunds/chargebacks take back the top-up's bonus · 13 support AI: 30% budget for chats without an account
//  14 $0.05 ≠ $5 in support translation · 15 a translated admin reply stops the AI first · 16 a chat's language = most of its messages
//  17 (e2e-round22) · 18–25 dashboard / website: static checks on the built pages
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), http = require('http');
const { DatabaseSync } = require('node:sqlite');
// fake AI (:4966): support answers, translation (detect → English; English → Russian, changing $0.05 into $5 when asked, slowly for SLOW), Joe
const ai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', async () => {
  const b = JSON.parse(raw), sys = String(typeof b.system === 'string' ? b.system : JSON.stringify(b.system || '')), last = b.messages[b.messages.length - 1];
  const txt = typeof last.content === 'string' ? last.content : (last.content || []).map((x) => x.text || '').join('\n');
  let out = 'AI: happy to help';
  if (/detect its language and translate it into English/.test(sys)) out = JSON.stringify({ items: JSON.parse(txt).map((x) => ({ id: x.id, lang: /[а-я]/i.test(x.text) ? 'ru' : 'en', en: /[а-я]/i.test(x.text) ? 'EN: ' + x.id : null })) });
  else if (/into Russian/.test(sys)) { if (/SLOW/.test(txt)) await new Promise((r) => setTimeout(r, 1500)); out = /\$0\.05/.test(txt) ? txt.replace('$0.05', '$5') : 'RU: ' + txt; }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 20 }, content: [{ type: 'text', text: out }] })); }); }).listen(4966);
// the customer's own server for bot forwarding (:4967): /fw answers with a redirect to /fw2, which must never be followed
const fwHits = []; const fw = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { fwHits.push({ path: req.url, secret: req.headers['x-telegram-bot-api-secret-token'], body: raw });
  if (req.url === '/fw') { res.writeHead(302, { location: 'http://localhost:4967/fw2' }); return res.end(); } res.writeHead(200); res.end('ok'); }); }).listen(4967);
const assert = (c, m, extra) => { if (!c) { console.log('FAIL:', m, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); process.exitCode = 1; } else console.log('ok  ', m); };
let ipn = 10;
function client(ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36') {
  const jar = {}, ip = '102.89.24.' + (ipn++);
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': ip, 'user-agent': ua, 'accept-language': 'en-GB,en;q=0.9', ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v === '') delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = v; }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t, h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG), ROOT = path.join(__dirname, '..');
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const esc = (s) => s.replace(/[.@+]/g, '\\$&');
async function verify(email) { await sleep(120); const m = [...logTxt().matchAll(new RegExp(`to ${esc(email)} .*?(/verify\\?t=[\\w.-]+)`, 'g'))].pop(); await fetch(B + m[1], { redirect: 'manual' }); }
const resetToken = (email) => { const m = [...logTxt().matchAll(new RegExp(`to ${esc(email)} .*?/app\\?reset=([\\w-]+)`, 'g'))].pop(); return m && m[1]; };

(async () => {
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  const uidOf = (email) => db.prepare(`SELECT id FROM users WHERE email=?`).get(email).id;
  const mk = async (email, { verified = true, name = 'Test' } = {}) => { const c = client(); const r = await post(c, '/api/signup', { country: 'NG', email, password: 'password1', name }); if (r.s !== 200) console.log('signup', email, r.s, r.t); if (verified) await verify(email); return c; };
  try {
    const ADM = await mk('admin@x.com', { name: 'Alex Owner' });
    // ================= 1. staff protection =================
    const SUP = await mk('sup@x.com'), ADM2 = await mk('adm2@x.com'), MKT = await mk('mkt@x.com');
    const addStaff = (email, role) => db.prepare(`INSERT INTO staff(user_id,role,status,invited_by,created_at) VALUES(?,?,?,?,?)`).run(uidOf(email), role, 'active', 'test', Date.now());
    addStaff('sup@x.com', 'support'); addStaff('adm2@x.com', 'admin'); addStaff('mkt@x.com', 'marketing');
    const CUS = await mk('cust@x.com'); const cid = uidOf('cust@x.com'), supId = uidOf('sup@x.com'), adm2Id = uidOf('adm2@x.com'), ownerId = uidOf('admin@x.com');
    let r = await post(SUP, `/api/admin/users/${cid}/reset-password`);
    assert(r.s === 200 && r.j.link && /reset=/.test(r.j.link), 'support resets a customer’s password: works as before (link shown when email is off)');
    r = await post(SUP, `/api/admin/users/${adm2Id}/reset-password`); assert(r.s === 403, 'support can’t reset an admin’s password', r.j);
    r = await post(SUP, `/api/admin/users/${ownerId}/reset-password`); assert(r.s === 403, 'support can’t reset the owner’s password');
    r = await post(ADM2, `/api/admin/users/${ownerId}/reset-password`); assert(r.s === 403 && /owner/.test(r.j.error), 'an admin can’t reset an owner’s password');
    r = await post(ADM2, `/api/admin/users/${ownerId}/status`, { status: 'suspended' }); assert(r.s === 403, 'an admin can’t suspend an owner');
    r = await post(ADM2, `/api/admin/users/${ownerId}/logout`); assert(r.s === 403, 'an admin can’t log an owner out');
    assert((await ADM('/api/admin/whoami')).s === 200, '…and the owner is still logged in');
    r = await post(ADM2, `/api/admin/users/${supId}/reset-password`);
    assert(r.s === 200 && r.j.staff && !r.j.link && !JSON.stringify(r.j).includes('reset=') && /Forgot password/.test(r.j.message), 'an admin (staff.manage) resets a support agent: allowed, but the link is never shown', r.j);
    r = await post(ADM, `/api/admin/users/${adm2Id}/reset-password`); assert(r.s === 200 && !r.j.link, 'the owner resets an admin: allowed, no link in the response');
    r = await post(ADM2, `/api/admin/users/${cid}/status`, { status: 'active' }); assert(r.s === 200, 'an admin still changes a customer’s status');
    // ================= 3. Joe test as another customer =================
    await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-joe-123456' } });
    r = await post(MKT, '/api/admin/joe/test', { message: 'How are my ads?', user_id: cid }); assert(r.s === 403 && (r.j.need || []).includes('users.view'), 'marketing (no users.view) can’t test Joe as a customer', r.j);
    r = await post(MKT, '/api/admin/joe/test', { message: 'How are my ads?' }); assert(r.s === 200 && r.j.as === 'mkt@x.com', '…but can test Joe as themselves');
    r = await post(ADM, '/api/admin/joe/test', { message: 'How are my ads?', user_id: cid }); assert(r.s === 200 && r.j.as === 'cust@x.com', 'the owner can test Joe as a customer');

    // ================= 2. reset of a never-verified account =================
    const ATT = await mk('victim@x.com', { verified: false, name: 'Not the owner' }); const vid = uidOf('victim@x.com');
    const SPY = await mk('spy@x.com'); const spyId = uidOf('spy@x.com');
    const t0 = Date.now();
    db.prepare(`INSERT INTO team_members(owner_id,user_id,email,role,status,invite_token,invited_at,joined_at) VALUES(?,?,?,?,?,?,?,?)`).run(vid, spyId, 'spy@x.com', 'buyer', 'active', null, t0, t0);
    db.prepare(`INSERT INTO team_members(owner_id,email,role,status,invite_token,invited_at) VALUES(?,?,?,?,?,?)`).run(vid, 'spy2@x.com', 'buyer', 'invited', 'tok_spy2_xxxxxxxx', t0);
    db.prepare(`UPDATE sessions SET workspace_owner=? WHERE user_id=?`).run(vid, spyId);
    db.prepare(`INSERT INTO webhooks(owner_id,url,secret,events,enabled,created_at) VALUES(?,?,?,?,1,?)`).run(vid, 'https://spy.example.com/h', 'sec', '["join"]', t0);
    db.prepare(`UPDATE users SET alert_chat_id=111, report_chat_id=222, report_bot_id=1, pb_key='attackerpbkey1' WHERE id=?`).run(vid);
    // a verified customer with the same set-up: nothing of theirs changes on a reset
    db.prepare(`INSERT INTO webhooks(owner_id,url,secret,events,enabled,created_at) VALUES(?,?,?,?,1,?)`).run(cid, 'https://cust.example.com/h', 'sec', '["join"]', t0);
    db.prepare(`UPDATE users SET alert_chat_id=333, pb_key='customerpbkey1' WHERE id=?`).run(cid);
    const OWN = client(); await post(OWN, '/api/forgot', { email: 'victim@x.com' }); await sleep(100);
    const vtok = resetToken('victim@x.com');
    // re-review: only when email is really set up (otherwise nobody can ever be "verified") and from a browser this account never used
    await put(ADM, '/api/admin/settings', { keys: { resend_key: 're_test_r23b' } });
    r = await post(OWN, '/api/reset', { token: vtok, password: 'realowner1' }); assert(r.s === 200, 'the real owner resets the password from their inbox');
    await put(ADM, '/api/admin/settings', { keys: { resend_key: null } });
    const v = db.prepare(`SELECT verified_at, alert_chat_id, report_chat_id, pb_key FROM users WHERE id=?`).get(vid);
    assert(v.verified_at && v.alert_chat_id == null && v.report_chat_id == null && v.pb_key !== 'attackerpbkey1', 'never-verified account: Telegram alert + report chats unlinked, postback key rotated (it had no postbacks)', v);
    assert(db.prepare(`SELECT COUNT(*) n FROM team_members WHERE owner_id=? AND status IN ('active','invited')`).get(vid).n === 0 && db.prepare(`SELECT COUNT(*) n FROM team_members WHERE owner_id=? AND status='paused'`).get(vid).n === 2 && db.prepare(`SELECT COUNT(*) n FROM team_members WHERE owner_id=? AND invite_token IS NOT NULL`).get(vid).n === 0, 'team members and invites the other person made are PAUSED (not deleted)');
    assert(db.prepare(`SELECT COUNT(*) n FROM webhooks WHERE owner_id=? AND enabled=0`).get(vid).n === 1, 'their webhooks are switched off (not deleted)');
    assert(db.prepare(`SELECT COUNT(*) n FROM sessions WHERE user_id=? AND workspace_owner=?`).get(spyId, vid).n === 0 && (await SPY('/api/me')).s === 200, 'the team member is out of the workspace (their own account still works)');
    assert(/reset of a never-verified account/.test(logTxt()) && db.prepare(`SELECT 1 FROM inbox WHERE user_id=? AND title LIKE 'We paused%'`).get(vid), 'it is logged, and the owner gets an inbox note saying what was paused');
    // email not set up: a reset of a never-verified account changes nothing
    const NV = await mk('noemail@x.com', { verified: false }); const nvid = uidOf('noemail@x.com');
    db.prepare(`INSERT INTO webhooks(owner_id,url,secret,events,enabled,created_at) VALUES(?,?,?,?,1,?)`).run(nvid, 'https://nv.example.com/h', 'sec', '["join"]', t0);
    db.prepare(`UPDATE users SET alert_chat_id=444, pb_key='nvpbkey1' WHERE id=?`).run(nvid);
    await post(client(), '/api/forgot', { email: 'noemail@x.com' }); await sleep(100);
    r = await post(client(), '/api/reset', { token: resetToken('noemail@x.com'), password: 'password3' });
    const nv = db.prepare(`SELECT alert_chat_id, pb_key FROM users WHERE id=?`).get(nvid);
    assert(r.s === 200 && nv.alert_chat_id === 444 && nv.pb_key === 'nvpbkey1' && db.prepare(`SELECT enabled FROM webhooks WHERE owner_id=?`).get(nvid).enabled === 1, 'email not set up: an unverified customer’s reset keeps everything (nobody could ever verify)');
    await post(CUS, '/api/forgot', { email: 'cust@x.com' }); await sleep(100);
    r = await post(CUS, '/api/reset', { token: resetToken('cust@x.com'), password: 'password2' });
    const c2 = db.prepare(`SELECT alert_chat_id, pb_key FROM users WHERE id=?`).get(cid);
    assert(r.s === 200 && c2.alert_chat_id === 333 && c2.pb_key === 'customerpbkey1' && db.prepare(`SELECT COUNT(*) n FROM webhooks WHERE owner_id=?`).get(cid).n === 1, 'a verified customer’s reset keeps their webhooks, alerts and postback URL');

    // ================= 4 + 5. password change / reset forget other devices; /api/password is rate limited =================
    const D1 = await mk('dev@x.com'); const did = uidOf('dev@x.com');
    const D2 = client('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'); await post(D2, '/api/login', { email: 'dev@x.com', password: 'password1' });
    const devs = () => db.prepare(`SELECT dev FROM devices WHERE user_id=?`).all(did).map((x) => x.dev);
    assert(devs().length === 2, 'two known devices');
    r = await post(D1, '/api/password', { current: 'password1', password: 'password2' });
    assert(r.s === 200 && devs().length === 1 && devs()[0] === D1.jar.jv_dev, 'password change: only this browser stays a known device');
    await post(D2, '/api/login', { email: 'dev@x.com', password: 'password2' }); assert(devs().length === 2, 'logging in again on the other browser: known again (after an alert)');
    const D3 = client(); await post(D3, '/api/forgot', { email: 'dev@x.com' }); await sleep(100);
    r = await post(D3, '/api/reset', { token: resetToken('dev@x.com'), password: 'password3' });
    assert(r.s === 200 && devs().length === 1 && devs()[0] === D3.jar.jv_dev, 'password reset: only the browser that reset it is known');
    // the change above was try 1 of this account's 10 in 15 minutes (counted per account, not per browser)
    let codes = []; for (let i = 0; i < 10; i++) codes.push((await post(D3, '/api/password', { current: 'wrong-' + i, password: 'password9' })).s);
    assert(codes.slice(0, 9).every((c) => c === 400) && codes[9] === 429, '/api/password: 10 tries per account per 15 minutes, then 429', codes);

    // ================= 6. bot forwarding through the pinned request =================
    const BU = await mk('botfw@x.com'); const bid = uidOf('botfw@x.com');
    r = await post(BU, '/api/bots', { token: '7712045599:AAHk3vZq_r23bforwardxxxxxxxxxxxxxxx' }); const botId = r.j.bot && r.j.bot.id;
    const stt = await ms(); const hookPath = new URL(stt.webhook.url).pathname, hookH = { 'x-telegram-bot-api-secret-token': stt.webhook.secret_token };
    r = await post(BU, '/api/bot-targets', { bot_id: botId, welcome: 'Hi' }); assert(r.s === 200, 'bot target set up');
    db.prepare(`UPDATE channels SET forward_url='http://localhost:4967/fw', forward_secret='s3cret' WHERE owner_id=? AND type='bot'`).run(bid);
    const upd = (id) => BU(hookPath, { method: 'POST', headers: hookH, body: JSON.stringify({ update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: 5551, type: 'private' }, from: { id: 5551, first_name: 'Ann' }, text: 'hello' } }) });
    await upd(9001); await sleep(500);
    assert(fwHits.some((h) => h.path === '/fw' && h.secret === 's3cret' && /hello/.test(h.body)), 'the update is passed on to the customer’s server, with their secret', fwHits);
    assert(!fwHits.some((h) => h.path === '/fw2'), 'a redirect from their server is not followed');
    db.prepare(`UPDATE channels SET forward_url='https://10.1.2.3/hook' WHERE owner_id=? AND type='bot'`).run(bid);
    await upd(9002); await sleep(300);
    assert(/bot forward skipped: not a public address/.test(logTxt()) && fwHits.length === 1, 'a private address is refused at send time');

    // ================= 7. inbox bodies: a Telegram chat title can't become a link =================
    const TG = await mk('tgtitle@x.com'); const tid = uidOf('tgtitle@x.com');
    r = await post(TG, '/api/bots', { token: '7712045588:AAHk3vZq_r23btitlexxxxxxxxxxxxxxxxx' });
    const st2 = await ms(); const hp2 = new URL(st2.webhook.url).pathname, hh2 = { 'x-telegram-bot-api-secret-token': st2.webhook.secret_token }, BOT2 = 7712045588;
    const addCh = (id, title) => TG(hp2, { method: 'POST', headers: hh2, body: JSON.stringify({ update_id: 100 + Math.abs(id), my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT2 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT2 } } } }) });
    for (let i = 1; i <= 3; i++) await addCh(-2300 - i, 'Plain ' + i);
    await addCh(-2399, '[Claim bonus](https://evil.example/x) **FREE**');
    const ib = db.prepare(`SELECT body FROM inbox WHERE user_id=? AND tag='limit'`).get(tid);
    assert(ib && !/[\[\]*]/.test(ib.body) && !/\]\(/.test(ib.body) && /Claim bonus/.test(ib.body), 'the over-the-limit note shows the title without link or bold markup', ib);

    // ================= 8. dim=constructor =================
    r = await TG('/api/breakdown?dim=constructor'); assert(r.s === 200 && Array.isArray(r.j.rows), '/api/breakdown?dim=constructor → the campaign report, no error');
    r = await TG('/api/joins?dim=constructor&val=x'); assert(r.s === 200, '/api/joins?dim=constructor&val=x → 200');
    r = await TG('/api/breakdown?dim=__proto__'); assert(r.s === 200, 'dim=__proto__ → 200');

    // ================= 9. HTML security headers =================
    const CSP = "frame-ancestors 'self'; base-uri 'none'; object-src 'none'";
    for (const pth of ['/', '/app', '/login', '/signup', '/guide', '/blog']) {
      const x = await fetch(B + pth, { redirect: 'manual' });
      assert(x.headers.get('content-security-policy') === CSP && !x.headers.get('strict-transport-security'), `${pth}: CSP limits framing/base/plugins only (no HSTS on http)`, [x.status, x.headers.get('content-security-policy')]);
    }
    const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'blog', 'posts.json'), 'utf8'));
    const bp = await fetch(B + '/blog/' + (posts.posts || posts)[0].slug);
    assert(bp.status === 200 && bp.headers.get('content-security-policy') === CSP && bp.headers.get('x-frame-options') === 'SAMEORIGIN', 'blog article: CSP + X-Frame-Options SAMEORIGIN');
    r = await ADM('/api/admin/emails/welcome/preview?lang=en'); assert(/default-src 'none'/.test(r.h.get('content-security-policy') || ''), 'a route with its own CSP keeps it (email preview)');
    const sa = await fetch(B + '/secure-account?u=1&e=1&s=x'); assert(/frame-ancestors 'none'/.test(sa.headers.get('content-security-policy') || ''), '/secure-account (X-Frame-Options DENY) gets frame-ancestors none');
    const api = await fetch(B + '/api/config'); assert(!api.headers.get('content-security-policy'), 'JSON responses are unchanged');
    const srcTxt = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(/if \(SECURE && !h\['strict-transport-security'\]\) h\['strict-transport-security'\] = 'max-age=31536000; includeSubDomains'/.test(srcTxt), 'HSTS is added when BASE_URL is https');

    // ================= 10. GET /logout from another site =================
    const LO = await mk('logout@x.com');
    let x = await LO('/logout', { headers: { 'sec-fetch-site': 'cross-site' } });
    assert(x.s === 302 && x.h.get('location') === '/app' && (await LO('/api/me')).s === 200, 'a cross-site link to /logout does nothing (back to /app, still logged in)');
    x = await LO('/logout', { headers: { 'sec-fetch-site': 'same-origin' } }); assert(x.s === 302 && (await LO('/api/me')).s === 401, 'the logout link inside Joinvoo still works');

    // ================= 11. promo codes re-checked when the money arrives =================
    const PR = await mk('promo@x.com'); const pid = uidOf('promo@x.com');
    await post(ADM, '/api/admin/promos', { code: 'MIN50', bonus_pct: 20, min_cents: 5000 });
    await post(ADM, '/api/admin/promos', { code: 'ONCE10', bonus_pct: 10 });
    await post(ADM, '/api/admin/promos', { code: 'SOON', bonus_pct: 10 });
    const depStart = async (f, usd, promo) => post(f, '/api/billing/deposit', { provider: 'crypto', amount: usd, promo });
    let txn = 0; const submit = async (f, ref) => post(f, '/api/billing/deposit', { provider: 'crypto', reference: ref, tx: (++txn).toString(16).padStart(64, 'a') });
    const depId = (ref) => db.prepare(`SELECT id FROM deposits WHERE reference=?`).get(ref).id;
    const promoRow = (id) => db.prepare(`SELECT amount_cents FROM ledger WHERE ref=?`).get('promo:dep:' + id);
    r = await depStart(PR, 60, 'MIN50'); assert(r.s === 200 && r.j.promo, 'a $60 top-up with MIN50 (min $50) starts');
    const refA = r.j.reference; await submit(PR, refA);
    r = await post(ADM, `/api/admin/deposits/${depId(refA)}/approve`, { amount: 40 }); assert(r.s === 200, 'admin approves it for the $40 that really arrived');
    assert(!promoRow(depId(refA)), 'below the code’s minimum → no promo bonus');
    r = await depStart(PR, 20, 'ONCE10'); const refB = r.j.reference;
    r = await PR('/api/billing/promo?code=ONCE10&amount=20'); assert(r.j.valid === true, 'an unfinished (or abandoned) top-up doesn’t block the code: the bonus is only ever paid once, at payment time', r.j);
    await submit(PR, refB); await post(ADM, `/api/admin/deposits/${depId(refB)}/approve`);
    const amtB = db.prepare(`SELECT amount_cents a FROM deposits WHERE reference=?`).get(refB).a; // crypto top-ups get odd cents (e.g. $20.37)
    assert(promoRow(depId(refB)) && promoRow(depId(refB)).amount_cents === Math.floor(amtB * 10 / 100), 'ONCE10 paid: +10%');
    db.prepare(`INSERT INTO deposits(user_id,provider,reference,amount_cents,currency,status,created_at,promo,tx) VALUES(?,?,?,?,?,?,?,?,?)`).run(pid, 'manual', 'r23b-twice', 3000, 'USD', 'pending', Date.now(), 'ONCE10', 'b'.repeat(64));
    await post(ADM, `/api/admin/deposits/${depId('r23b-twice')}/approve`); assert(!promoRow(depId('r23b-twice')), 'a second top-up carrying the same code (started side by side) gets no second promo bonus');
    r = await depStart(PR, 30, 'SOON'); const refC = r.j.reference; await submit(PR, refC);
    await ADM('/api/admin/promos/SOON', { method: 'PATCH', body: JSON.stringify({ expire: true }) });
    await post(ADM, `/api/admin/deposits/${depId(refC)}/approve`); assert(!promoRow(depId(refC)), 'a code switched off before the money arrived gives no bonus');
    assert(db.prepare(`SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='deposit'`).get(pid).n === 4, 'every top-up itself is still credited in full');

    // ================= 12. refunds and chargebacks take back that top-up's bonus =================
    await post(ADM, '/api/admin/promos', { code: 'BONUS20', bonus_pct: 20 });
    const RF = await mk('refund@x.com'); const rid2 = uidOf('refund@x.com'), bal = () => db.prepare(`SELECT balance_cents b FROM users WHERE id=?`).get(rid2).b;
    r = await depStart(RF, 100, 'BONUS20'); const refD = r.j.reference; await submit(RF, refD); await post(ADM, `/api/admin/deposits/${depId(refD)}/approve`);
    const b0 = bal(), dD = depId(refD), amtD = db.prepare(`SELECT amount_cents a FROM deposits WHERE id=?`).get(dD).a;
    const given = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE ref IN (?,?)`).get('bonus:dep:' + dD, 'promo:dep:' + dD).n; // promo 20% + the loyalty tier bonus
    assert(promoRow(dD).amount_cents === Math.floor(amtD * 0.2) && given > promoRow(dD).amount_cents, '$100 top-up + promo and tier bonus credits', { given, amtD });
    r = await post(ADM, `/api/admin/deposits/${dD}/refund`, { amount: 50 }); const half = Math.round(given * 5000 / amtD);
    assert(r.s === 200 && r.j.bonus_taken_back === half && bal() === b0 - 5000 - half, 'refund of $50 → the same share of the bonus taken back', [r.j, half]);
    r = await post(ADM, `/api/admin/deposits/${dD}/chargeback`);
    assert(r.s === 200 && r.j.bonus_taken_back === given - half && bal() === b0 - amtD - given, 'chargeback of the rest → the rest of the bonus taken back (all of it, in total)', [r.j, given - half]);
    r = await post(ADM, `/api/admin/deposits/${dD}/chargeback`); assert(r.s === 400 && db.prepare(`SELECT COUNT(*) n FROM ledger WHERE ref LIKE 'bonusback:dep:${dD}:%'`).get().n === 2, 'a second chargeback is refused; nothing is taken twice');
    const RF2 = await mk('refund2@x.com'); const r2id = uidOf('refund2@x.com'), bal2 = () => db.prepare(`SELECT balance_cents b FROM users WHERE id=?`).get(r2id).b;
    r = await depStart(RF2, 10, 'BONUS20'); const refE = r.j.reference; await submit(RF2, refE); await post(ADM, `/api/admin/deposits/${depId(refE)}/approve`);
    await post(ADM, `/api/admin/users/${r2id}/adjust`, { amount: -((bal2() - 50) / 100) }); assert(bal2() === 50, 'that customer has spent all but 50 credits');
    r = await post(ADM, `/api/admin/deposits/${depId(refE)}/refund`, { amount: 0.5 });
    assert(r.s === 200 && r.j.bonus_taken_back === 0 && bal2() === 0, 'a refund never takes the wallet below zero to get the bonus back', [r.j, bal2()]);

    // ================= 14 + 16. support translation =================
    const TR = await mk('tr23b@x.com'); const trId = uidOf('tr23b@x.com');
    for (const m of ['Где моё пополнение?', 'Деньги не пришли на баланс', 'ok', 'Thanks']) { await post(TR, '/api/support', { body: m }); await sleep(30); }
    const tk = db.prepare(`SELECT id FROM tickets WHERE user_id=?`).get(trId).id;
    r = await post(ADM, `/api/admin/support/${tk}/translate`);
    assert(r.s === 200 && r.j.lang === 'ru' && db.prepare(`SELECT lang FROM tickets WHERE id=?`).get(tk).lang === 'ru', 'the chat is Russian: most messages are (a last "Thanks" doesn’t switch it, "ok" doesn’t count)', r.j);
    r = await post(ADM, `/api/admin/support/${tk}`, { body: 'Your refund of $0.05 is done', translate: true });
    let msg = db.prepare(`SELECT body, tr_note FROM ticket_msgs WHERE ticket_id=? AND from_admin=1 ORDER BY id DESC LIMIT 1`).get(tk);
    assert(r.j.translated === false && msg.body === 'Your refund of $0.05 is done' && /number or link/.test(msg.tr_note), 'a translation that turns $0.05 into $5 is not sent: the English goes out', msg);
    r = await post(ADM, `/api/admin/support/${tk}`, { body: 'Total 1,000.50 USD, fee 0.05', translate: true });
    assert(r.j.translated === true, 'a faithful translation with thousands and decimals still goes out translated');

    // ================= 13. support AI budget: chats without an account share 30% =================
    r = await put(ADM, '/api/admin/support-ai', { settings: { on: true, speed: 'instant', daily_usd: 10 } }); assert(r.s === 200 && r.j.ready, 'AI support on, $10 a day');
    const day = new Date().toISOString().slice(0, 10), usage = (k) => (db.prepare(`SELECT usd FROM support_ai_usage WHERE day=?`).get(k) || { usd: 0 }).usd;
    const V1 = client(); await post(V1, '/api/support', { body: 'hello, how much is it?', email: 'v1@x.com' }); await sleep(2500);
    r = await V1('/api/support'); assert((r.j.messages || []).some((m) => m.from_admin && /AI: happy to help/.test(m.body)), 'a website visitor gets an AI answer');
    const anon1 = usage(day + ':anon'); assert(anon1 > 0 && usage(day) >= anon1, 'their AI cost counts in the visitors’ counter too');
    db.prepare(`UPDATE support_ai_usage SET usd=3.01 WHERE day=?`).run(day + ':anon'); db.prepare(`UPDATE support_ai_usage SET usd=3.5 WHERE day=?`).run(day);
    const V2 = client(); await post(V2, '/api/support', { body: 'hi, is anyone there?', email: 'v2@x.com' }); await sleep(2500);
    r = await V2('/api/support'); const vm = (r.j.messages || []).filter((m) => m.from_admin);
    assert(vm.length && !vm.some((m) => /AI:/.test(m.body)) && vm.some((m) => /teammate will reply/.test(m.body)), 'visitors over 30% of the budget ($3 of $10): the team takes it', vm);
    const AC = await mk('acct@x.com'); await post(AC, '/api/support', { body: 'help with my account please' }); await sleep(2500);
    r = await AC('/api/support'); assert((r.j.messages || []).some((m) => m.from_admin && /AI:/.test(m.body)), 'a logged-in customer still gets the AI (the full budget is theirs)');
    assert(usage(day + ':anon') === 3.01, '…and that doesn’t count against visitors');

    // ================= 15. a translated admin reply stops the AI before the translation wait =================
    const T15 = await mk('t15@x.com'); const t15 = uidOf('t15@x.com'); await T15('/api/me', { method: 'PATCH', body: JSON.stringify({ lang: 'ru' }) });
    await post(T15, '/api/support', { body: 'Привет, помогите' }); const tk15 = db.prepare(`SELECT id FROM tickets WHERE user_id=?`).get(t15).id;
    const pending = post(ADM, `/api/admin/support/${tk15}`, { body: 'SLOW reply from the team', translate: true }); await sleep(500);
    assert(db.prepare(`SELECT ai_mode FROM tickets WHERE id=?`).get(tk15).ai_mode === 'human', 'while the reply is being translated the chat is already the team’s');
    r = await pending; await sleep(1200);
    const aiMsgs = db.prepare(`SELECT COUNT(*) n FROM ticket_msgs WHERE ticket_id=? AND source='ai'`).get(tk15).n + db.prepare(`SELECT COUNT(*) n FROM support_out WHERE ticket_id=?`).get(tk15).n;
    assert(r.s === 200 && r.j.translated === true && aiMsgs === 0, 'the AI never answered during the wait; the translated reply went out', { aiMsgs, r: r.j });

    // ================= 18–25: built pages =================
    const app = fs.readFileSync(path.join(ROOT, 'public', 'app.html'), 'utf8');
    assert(/closest\('\[translate="no"\]'\)/.test(app) && (app.match(/translate="no"/g) || []).length > 40, '18: the translation layer skips translate="no", and customer data is marked with it');
    assert(/<div class="jbub me" translate="no">/.test(app) && /<div class="msg them" translate="no">/.test(app) && /return ud\(k\)/.test(app), '18: Joe chat (yours), support bubbles and campaign names are never auto-translated');
    assert(!/day\$\{cur\.days_in===1\?'':'s'\}/.test(app) && /tt\('cmp\.dayin'/.test(app) && /tt\('promo\.ends'/.test(app), '19: "days in" / "ends in" are whole translated sentences');
    const L10 = ['ru', 'fr', 'pt', 'es', 'ar', 'hi', 'id', 'tr', 'vi', 'sw'], NEW = ['nav.tutorials', 'nav.unique', 'setup.back', 'sp.allc', 'sp.sample', 'sp.other', 'cmp.dayin', 'cmp.dayin1', 'promo.ends', 'promo.ends1', 'sec.justnow'];
    const miss = []; for (const l of L10) for (const dir of ['public', 'dist']) { const d = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'i18n', `app.${l}.json`), 'utf8')); for (const k of NEW) if (!d[k]) miss.push(dir + '/' + l + ':' + k); }
    assert(!miss.length, '19/22/25: new keys translated in all 10 languages (public and dist)', miss);
    assert(/\[dir=rtl\] \.fab\{right:auto;left:26px\}/.test(app) && /\[dir=rtl\] \.num/.test(app) && /translateX\(102%\)/.test(app) && /class="rtl-flip"/.test(app), '20: right-to-left rules (launcher left, drawer from the right, arrows mirrored, numbers LTR)');
    const shared = fs.readFileSync(path.join(ROOT, 'public', 'signup.html'), 'utf8'); assert(/\[dir=rtl\] \.btn svg:not\(\.pi svg\)\{transform:scaleX\(-1\)\}/.test(shared), '20: the arrow rule is in shared.css, so sign-up gets it');
    assert(/case 'logout':[^\n]*\n[^\n]*\n[^\n]*clearInterval\(JOE\.t\)[^\n]*JOE\.chat=null[^\n]*#joepop/.test(app), '21: logout clears Joe’s timer, cache, chat and pop-up');
    assert(/tt\('setup\.back','Back to dashboard'\)/.test(app) && /toLocaleDateString\(LOC\(\)/.test(app) && /tt\('sp\.sample','sample'\)/.test(app), '22: "Back to dashboard", spend list words and dates in the user’s language');
    const guide = fs.readFileSync(path.join(ROOT, 'public', 'guide.html'), 'utf8');
    assert(/_t\('Copied'\)/.test(guide) && /execCommand\('copy'\)/.test(guide) && /\.catch\(fb\)/.test(guide), '22/23: guide Copy/Copied translated, with a copy fallback');
    assert(/data-i18n="[^"]+">Your offer link/.test(guide), '22: the guide paragraph with {{campaign.name}} is translatable now');
    for (const l of ['ar', 'id', 'tr']) { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'i18n', l + '.json'), 'utf8')); assert(!/\[(Terms|Privacy Policy)\]/.test(d['By creating an account you agree to the [Terms] and [Privacy Policy].']), `22: sign-up terms links translated (${l})`); }
    r = await (await fetch(B + '/api/config')).json(); assert(r.guide_video && r.guide_video.mp4 === false && /GV\(\)\.mp4\?`<video/.test(app), '24: no guide video on the server → no <video> (no 404s)');
    assert(/Date\.now\(\)-x\.signed_in_at<90000\?tt\('sec\.justnow'/.test(app), '25: "signed in just now" instead of "signed in Active now"');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  finally { try { ai.close(); fw.close(); } catch {} process.exit(); }
})();
