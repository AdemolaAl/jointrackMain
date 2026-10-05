// Audit fixes (5 October 2026): bot forwarding never reaches private addresses; refunds and chargebacks of top-ups (admin)
// work without VooSquare and keep the wallet, the deposit and the referrer's commission right; VooSquare stays fully off.
const B = 'http://localhost:3999';
const fs = require('fs');
const assert = (c, m, extra) => { if (!c) { console.log('FAIL:', m, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); process.exitCode = 1; } else console.log('ok  ', m); };
let nClients = 0;
function client(base = B) {
  const jar = {}, ip = `198.51.100.${++nClients}`; // every test person has their own address (sign-ups are limited per address)
  const f = async (p, o = {}) => {
    const r = await fetch(base + p, { ...o, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '), ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v === '') delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = v; }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t, h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
/** Two (or more) POSTs whose bodies arrive only after the server has started on all of them: the requests really overlap. */
function overlapping(f, list) {
  const http = require('http'), u = new URL(B);
  const reqs = list.map(([p, b]) => { const body = JSON.stringify(b || {});
    let done; const pr = new Promise((ok) => (done = ok));
    const rq = http.request({ host: u.hostname, port: u.port, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-forwarded-for': '198.51.100.250', cookie: Object.entries(f.jar).map(([k, v]) => k + '=' + v).join('; ') } },
      (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch {} done({ s: res.statusCode, j }); }); });
    rq.flushHeaders(); return { rq, body, pr }; });
  return new Promise((ok) => setTimeout(() => { for (const x of reqs) x.rq.end(x.body); ok(Promise.all(reqs.map((x) => x.pr))); }, 300));
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
async function verify(email) { await sleep(120); const m = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(new RegExp(`to ${email.replace(/[.@]/g, '\\$&')} .*?(/verify\\?t=[\\w.-]+)`, 'g'))].pop(); await fetch(B + m[1], { redirect: 'manual' }); }

(async () => {
  try {
    const ADM = client(); await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1' }); await verify('admin@x.com');

    // ---------- VooSquare not configured: nothing of it shows or runs ----------
    let r = await client()('/?ref=AMA01&vclick=Click000001');
    assert(r.s === 200 && !r.t.includes('voo-connect-browser.js') && !r.h.getSetCookie().some((c) => c.startsWith('voo_attr=')), 'VooSquare off: no browser snippet, no click cookie');
    r = await client()('/auth/voosquare?signup=1');
    assert(r.s === 302 && r.h.get('location') === '/login?voo_error=off', 'VooSquare off: /auth/voosquare goes back to the normal login');
    assert((await client()('/api/config')).j.voo.login === 'off' && (await fetch(B + '/hooks/voosquare/support', { method: 'POST', body: '{}' })).status === 404, 'VooSquare off: login off, support webhook not there');

    // ---------- bot forwarding: only public https addresses ----------
    const U = client(); await post(U, '/api/signup', { country: 'GB', email: 'bot@x.com', password: 'password1' });
    r = await post(U, '/api/bots', { token: '7712045511:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
    const botId = r.j.bot && r.j.bot.id;
    for (const bad of ['https://bot.localhost/hook', 'https://100.64.0.7/hook', 'https://[::1]/hook', 'https://[fd00::1]/hook', 'https://0x7f000001/hook', 'https://169.254.169.254/latest', 'http://example.com/hook']) {
      r = await post(U, '/api/bot-targets', { bot_id: botId, forward_url: bad });
      assert(r.s === 400 && /public https/.test(r.j.error), `forwarding to ${bad} is refused`, r.j);
    }
    r = await post(U, '/api/bot-targets', { bot_id: botId, forward_url: 'https://bots.example.com/hook' });
    assert(botId && r.s === 200, 'a public https forwarding address is accepted', r.j);

    // ---------- refund and chargeback of a top-up (VooSquare off) + the referrer's commission ----------
    const R = client(); await post(R, '/api/signup', { country: 'GB', email: 'ref@x.com', password: 'password1', name: 'Ref' });
    const code = (await R('/api/referrals')).j.code;
    const C = client(); await post(C, '/api/signup', { country: 'GB', email: 'buyer@x.com', password: 'password1', ref: code });
    const cid = (await ADM('/api/admin/users?q=buyer@x.com')).j.users[0].id;
    const dep = async (usd, tx) => { const d = await post(C, '/api/billing/deposit', { provider: 'crypto', amount: usd }); await post(C, '/api/billing/deposit', { provider: 'crypto', reference: d.j.reference, tx }); const x = (await ADM('/api/admin/deposits')).j.deposits[0]; await post(ADM, `/api/admin/deposits/${x.id}/approve`, { amount: usd }); return x.id; };
    const d1 = await dep(40, 'e'.repeat(64));
    const bal0 = (await C('/api/billing')).j.balance_cents;
    r = await post(ADM, `/api/admin/deposits/${d1}/refund`, { amount: 50 });
    assert(r.s === 400 && r.j.max_cents === 4000, 'refund: more than was paid in is refused (max $40)', r.j);
    r = await post(ADM, `/api/admin/deposits/${d1}/refund`, { amount: 15 });
    assert(r.s === 200 && (await C('/api/billing')).j.balance_cents === bal0 - 1500, 'refund $15 of a $40 top-up: wallet −$15');
    const nonAdmin = await post(C, `/api/admin/deposits/${d1}/chargeback`, {});
    assert(nonAdmin.s === 401 || nonAdmin.s === 403, 'customers cannot record refunds or chargebacks');
    r = await post(ADM, `/api/admin/deposits/${d1}/chargeback`, {});
    const billAfter = (await C('/api/billing')).j;
    assert(r.s === 200 && r.j.charged_back_cents === 2500 && billAfter.balance_cents === bal0 - 4000, 'chargeback takes the rest of that top-up ($25) back out of the wallet', { r: r.j, bal: billAfter.balance_cents });
    // now only gift credits are left: spending them earns the referrer nothing (before the fix the charged-back $40 still counted as paid)
    await post(ADM, `/api/admin/users/${cid}/credits`, { credits: 20000, reason: 'goodwill' });
    const before = (await R('/api/referrals')).j;
    r = await post(C, '/api/billing/plan', { plan: 'pro' });
    const after = (await R('/api/referrals')).j;
    assert(r.s === 200 && r.j.charged_cents > 0 && after.earned_cents === before.earned_cents, 'after a chargeback, spending gift credits earns the referrer no commission', { before: before.earned_cents, after: after.earned_cents, plan: r.j });
    const paid = (await ADM('/api/admin/deposits?status=paid')).j.deposits.find((x) => x.id === d1);
    assert(paid && paid.refunded_cents === 1500 && paid.charged_back_at, 'deposit shows the refund and the chargeback');

    // ---------- AU-1: a refund and a chargeback clicked at the same time (or two chargebacks) never take more than the top-up ----------
    const C4 = client(); await post(C4, '/api/signup', { country: 'GB', email: 'race@x.com', password: 'password1' });
    const depOf = async (F, usd, tx) => { const d = await post(F, '/api/billing/deposit', { provider: 'crypto', amount: usd }); await post(F, '/api/billing/deposit', { provider: 'crypto', reference: d.j.reference, tx }); const x = (await ADM('/api/admin/deposits')).j.deposits[0]; await post(ADM, `/api/admin/deposits/${x.id}/approve`, { amount: usd }); return x.id; };
    const d4 = await depOf(C4, 40, 'a'.repeat(64)), b4 = (await C4('/api/billing')).j.balance_cents;
    const [rf4, cb4] = await overlapping(ADM, [[`/api/admin/deposits/${d4}/refund`, { amount: 15 }], [`/api/admin/deposits/${d4}/chargeback`, {}]]);
    const after4 = (await C4('/api/billing')).j.balance_cents, row4 = (await ADM('/api/admin/deposits?status=paid')).j.deposits.find((x) => x.id === d4);
    assert(cb4.s === 200 && b4 - after4 === 4000 && (rf4.s === 200 ? row4.refunded_cents === 1500 && cb4.j.charged_back_cents === 2500 : cb4.j.charged_back_cents === 4000),
      'AU-1: refund $15 + chargeback at the same moment on a $40 top-up → exactly $40 leaves the wallet', { rf: rf4.s, cb: cb4.j, taken: b4 - after4 });
    const d5 = await depOf(C4, 30, 'b'.repeat(64));
    const two = await overlapping(ADM, [[`/api/admin/deposits/${d5}/chargeback`, {}], [`/api/admin/deposits/${d5}/chargeback`, {}]]);
    assert(two.map((x) => x.s).sort().join() === '200,400', 'AU-1: two chargebacks of one top-up at the same moment → one recorded, one refused', two.map((x) => x.s));

    // ---------- AU-2: a chargeback takes back the referral commission earned on what that money paid for (referral terms §6) ----------
    const R2 = client(); await post(R2, '/api/signup', { country: 'GB', email: 'ref2@x.com', password: 'password1', name: 'Ref2' });
    const code2 = (await R2('/api/referrals')).j.code;
    const C5 = client(); await post(C5, '/api/signup', { country: 'GB', email: 'buyer5@x.com', password: 'password1', ref: code2 });
    const c5 = (await ADM('/api/admin/users?q=buyer5@x.com')).j.users[0].id;
    const d6 = await depOf(C5, 50, 'c'.repeat(64));
    await post(ADM, `/api/admin/users/${c5}/credits`, { credits: 5000, reason: 'goodwill' });
    r = await post(C5, '/api/billing/plan', { plan: 'pro' });
    const e1 = (await R2('/api/referrals')).j;
    assert(r.s === 200 && r.j.charged_cents > 5000 && e1.month_spend_cents === 5000 && e1.earned_cents > 0, 'referrer earns on the $50 of real money in the plan charge (not on the gift credits)', { plan: r.j, e1: { b: e1.month_spend_cents, e: e1.earned_cents } });
    r = await post(ADM, `/api/admin/deposits/${d6}/chargeback`, {});
    const e2 = (await R2('/api/referrals')).j;
    assert(r.s === 200 && r.j.referral_commission_reversed_cents === e1.earned_cents && e2.earned_cents === 0 && e2.balance_cents === 0, 'AU-2: chargeback of that $50 → the referrer\'s commission on it is reversed', { r: r.j, earned: e2.earned_cents });
    r = await post(ADM, `/api/admin/deposits/${d6}/chargeback`, {});
    assert(r.s === 400 && (await R2('/api/referrals')).j.earned_cents === 0, 'AU-2: nothing is reversed twice');

    // ---------- AU-3: money already used on Joe answers cannot also pay for a plan (referral base) ----------
    const R3 = client(); await post(R3, '/api/signup', { country: 'GB', email: 'ref3@x.com', password: 'password1', name: 'Ref3' });
    const code3 = (await R3('/api/referrals')).j.code;
    const C6 = client(); await post(C6, '/api/signup', { country: 'GB', email: 'buyer6@x.com', password: 'password1', ref: code3 });
    const c6 = (await ADM('/api/admin/users?q=buyer6@x.com')).j.users[0].id;
    await depOf(C6, 100, 'd'.repeat(64));
    { // a paid Joe answer of 9,000 credits, written like Joe writes it (ledger row kind joe + the cached balance)
      const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(require('path').join(require('path').dirname(process.env.SRV_LOG), 'data', 'joinvoo.db'));
      db.exec('PRAGMA busy_timeout=3000');
      db.prepare(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,'joe',-9000,'joe:test-au3','Joe answer',?)`).run(c6, Date.now());
      db.prepare('UPDATE users SET balance_cents=balance_cents-9000 WHERE id=?').run(c6); db.close();
    }
    await post(ADM, `/api/admin/users/${c6}/credits`, { credits: 10000, reason: 'goodwill' });
    r = await post(C6, '/api/billing/plan', { plan: 'pro' });
    const e3 = (await R3('/api/referrals')).j;
    assert(r.s === 200 && e3.month_spend_cents === 1000, 'AU-3: $100 paid in, $90 used on Joe, then a plan → the referrer earns on $10, not on the whole plan', { base: e3.month_spend_cents, plan: r.j.charged_cents });

    // ---------- AU-6: VooSquare login start and callback are rate limited per address (120 per 10 minutes: a whole office or mobile network can share one address) ----------
    { const V = client(); const locs = [];
      for (let i = 0; i < 122; i++) locs.push((await V(i % 2 ? '/auth/voosquare/callback?code=x&state=y' : '/auth/voosquare')).h.get('location'));
      assert(locs.slice(0, 120).every((l) => l === '/login?voo_error=off') && locs.slice(120).every((l) => l === '/login?voo_error=unavailable'), 'AU-6: the 121st VooSquare login request from one address in 10 minutes is turned away', locs.slice(118));
      assert((await client()('/auth/voosquare')).h.get('location') === '/login?voo_error=off', 'AU-6: other addresses are not affected'); }

    // ---------- AU-4: the visitor's address for rate limits cannot be picked with X-Forwarded-For when no proxy is trusted ----------
    { const { spawn } = require('child_process'), os = require('os'), path = require('path');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-au4-'));
      const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: '3998', DATA_DIR: dir, TRUST_PROXY: '0', BASE_URL: 'http://localhost:3998', TG_API: 'http://localhost:4000', RESEND_API_KEY: '', ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
      try {
        for (let i = 0; i < 50; i++) { try { await fetch('http://localhost:3998/health'); break; } catch { await sleep(100); } }
        const codes = [];
        for (let i = 0; i < 10; i++) codes.push((await fetch('http://localhost:3998/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${i + 1}` }, body: JSON.stringify({ country: 'GB', email: `spam${i}@x.com`, password: 'password1' }) })).status);
        assert(codes.slice(0, 8).every((c) => c === 200) && codes.slice(8).every((c) => c === 429), 'AU-4: TRUST_PROXY=0 → a new X-Forwarded-For per request does not get past the sign-up limit (8 per hour)', codes);
      } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
})();
