// Voo Connect (the VooSquare kit in ./voo-connect): the whole connection as docs/VOO_CONNECT.md (VooSquare repo) asks for it,
// against a fake VooSquare on :4410 (tests/oidcmock.js): affiliate click (ref / vclick / coupon) kept on the landing page and
// handed to /oauth/authorize with prompt=signup, Voo ID sign-up, "Connect your VooSquare account" for a logged-in member,
// money events (wallet_topup, spend + plan_started, one daily spend for credits used, refund, chargeback with
// original_event_id), gift credits never reported as money, the summary card, the kit's support webhook, logout everywhere.
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
process.removeAllListeners('warning'); // node:sqlite is still marked experimental
const { DatabaseSync } = require('node:sqlite');
const { start } = require('./oidcmock');
const assert = (c, m, extra) => { if (!c) { console.log('FAIL:', m, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); process.exitCode = 1; } else console.log('ok  ', m); };
function client(initial = {}) {
  const jar = { ...initial }, raw = {};
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(p.startsWith('http') ? p : B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); raw[k] = sc; if (v === '' || /Max-Age=0/.test(sc)) delete jar[k]; else jar[k] = v; }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t, h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; f.raw = raw; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
async function verify(email) { await sleep(120); const m = [...logTxt().matchAll(new RegExp(`to ${email.replace(/[.@]/g, '\\$&')} .*?(/verify\\?t=[\\w.-]+)`, 'g'))].pop(); await fetch(B + m[1], { redirect: 'manual' }); }
const API_KEY = 'vsk_kit_test_key', MOCK = start(4410, { clientId: 'vsc_joinvoo', clientSecret: 'vss_kit_secret', apiKeys: [API_KEY] });
const evs = () => MOCK.M.events.flatMap((e) => JSON.parse(e.raw).events);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(80); } return fn(); };
/** Browser-style: /auth/voosquare → VooSquare (fake) → callback. */
async function login(f, claims, q = 'return_to=/dashboard') {
  MOCK.M.next = claims;
  const r1 = await f('/auth/voosquare?' + q);
  const az = new URL(r1.h.get('location'));
  const r2 = await fetch(az, { redirect: 'manual' });
  const r3 = await f(r2.headers.get('location').replace(B, ''));
  return { az, loc: r3.h.get('location') || '', s: r3.s };
}

(async () => {
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Ada' });
    await verify('admin@x.com');

    // ---------- landing page: the affiliate click is kept (server cookie + browser snippet), never cached ----------
    const V = client();
    let r = await V('/?ref=AMA01&vclick=Click000001&sub1=fb_ng');
    const attr = V.raw.voo_attr || '';
    assert(r.s === 200 && /voo_attr=/.test(attr) && /ref%3DAMA01/.test(attr) && /vclick%3DClick000001/.test(attr) && /Max-Age=5184000/.test(attr) && /SameSite=Lax/.test(attr), 'landing ?ref=&vclick= → first-party voo_attr cookie (60 days, SameSite=Lax)', attr);
    assert(r.h.get('cache-control') === 'no-store', 'a landing response that sets the click cookie is never cached (no CDN can hand it to someone else)');
    assert(r.t.includes('<script src="/voo-connect-browser.js" defer></script>'), 'public pages load the Voo Connect browser snippet');
    assert(!r.t.includes('/widget.js'), 'VooSquare chat widget stays off until the admin switches it on');
    r = await V('/voo-connect-browser.js');
    assert(r.s === 200 && /javascript/.test(r.h.get('content-type')) && r.t.includes('w.VooConnect = {'), 'GET /voo-connect-browser.js serves the kit snippet');
    r = await V('/signup?coupon=SAVE10');
    assert(/coupon%3DSAVE10/.test(V.raw.voo_attr) && /ref%3DAMA01/.test(V.raw.voo_attr), 'a later ?coupon= is added to the kept click (ref stays)');
    r = await V('/auth/voosquare?signup=1&return_to=/dashboard');
    const az = new URL(r.h.get('location'));
    assert(r.s === 302 && az.origin === MOCK.base && az.pathname === '/oauth/authorize' && az.searchParams.get('client_id') === 'vsc_joinvoo' && az.searchParams.get('prompt') === 'signup'
      && az.searchParams.get('ref') === 'AMA01' && az.searchParams.get('vclick') === 'Click000001' && az.searchParams.get('coupon') === 'SAVE10' && az.searchParams.get('redirect_uri') === B + '/auth/voosquare/callback', 'Start free → /oauth/authorize with prompt=signup, ref, vclick, coupon', r.h.get('location'));

    // ---------- Voo ID sign-up ----------
    MOCK.M.next = { sub: 'vs_kit_1', email: 'kim@x.com', name: 'Kim', country: 'NG', voo_ref: 'AMA01' };
    const r2 = await fetch(az, { redirect: 'manual' });
    r = await V(r2.headers.get('location').replace(B, ''));
    assert(r.s === 302 && r.h.get('location') === '/app' && V.jar.jp_session && !V.jar.voo_state && !V.jar.voo_attr, 'callback: signed in, return_to=/dashboard → /app, state and click cookies cleared');
    let me = (await V('/api/me')).j;
    assert(me.email === 'kim@x.com' && me.country === 'NG' && me.voo && me.voo.linked, 'new Joinvoo account from the Voo ID (email, country NG, linked)');
    const kimId = (await ADM('/api/admin/users?q=kim@x.com')).j.users[0].id;
    const ud = (await ADM('/api/admin/users/' + kimId)).j.user;
    assert(ud.voo_id === 'vs_kit_1' && ud.referred_by_voo === 'AMA01', 'voo_id and voo_ref saved');
    r = await login(client(), { sub: 'vs_kit_1', email: 'kim@x.com' });
    assert(r.loc === '/app' && (await ADM('/api/admin/users?q=kim@x.com')).j.users.length === 1, 'second login finds the account by voo_id');

    // ---------- Connect your VooSquare account (logged in with a password; the Voo ID has ANOTHER email) ----------
    const P = client();
    await post(P, '/api/signup', { country: 'GB', email: 'pat@x.com', password: 'password1', name: 'Pat' });
    const pId = (await ADM('/api/admin/users?q=pat@x.com')).j.users[0].id;
    r = await login(P, { sub: 'vs_pat', email: 'pat.other@x.com' }, 'return_to=%2Fapp%23help');
    me = (await P('/api/me')).j;
    assert(r.loc === '/app#help' && me.email === 'pat@x.com' && me.voo.linked && (await ADM('/api/admin/users/' + pId)).j.user.voo_id === 'vs_pat' && !(await ADM('/api/admin/users?q=pat.other')).j.users.length,
      'logged-in member connects their Voo ID: saved on THAT account (no new account, emails may differ)', { loc: r.loc, me });
    r = await login(P, { sub: 'vs_pat_second', email: 'p2@x.com' });
    assert(/voo_error=link/.test(r.loc) && (await ADM('/api/admin/users/' + pId)).j.user.voo_id === 'vs_pat', 'an account already linked is never re-linked to another Voo ID');
    assert((await post(client(), '/api/login', { email: 'pat@x.com', password: 'password1' })).s === 200, 'the old password login keeps working (mode both)');

    // ---------- money: top-up = wallet_topup (no commission) ----------
    r = await post(V, '/api/billing/deposit', { provider: 'crypto', amount: 100 });
    await post(V, '/api/billing/deposit', { provider: 'crypto', reference: r.j.reference, tx: 'b'.repeat(64) });
    let dep = (await ADM('/api/admin/deposits')).j.deposits.find((d) => d.email === 'kim@x.com');
    await post(ADM, `/api/admin/deposits/${dep.id}/approve`, { amount: 100 });
    const tu = await until(() => evs().find((e) => e.type === 'wallet_topup'));
    assert(tu && tu.event_id === 'jv_topup_' + dep.id && tu.voo_id === 'vs_kit_1' && tu.value_usd === 100 && !evs().some((e) => e.type === 'spend'), 'paid top-up → wallet_topup jv_topup_<id>, $100, no spend', tu);
    assert(tu.signals && /^[a-f0-9]{64}$/.test(tu.signals.payment_fingerprint) && !JSON.stringify(tu).includes('b'.repeat(64)), 'payment fingerprint is our own hash, never the raw transaction');
    assert(MOCK.M.events.every((e) => e.auth === 'Bearer ' + API_KEY), 'events go to /api/v1/events with Authorization: Bearer <VOO_API_KEY>');

    // ---------- plan purchase (paid from the wallet) = spend + plan_started ----------
    r = await post(V, '/api/billing/plan', { plan: 'pro' });
    const cost = r.j.charged_cents;
    const sp = await until(() => evs().find((e) => e.type === 'spend'));
    const ps = evs().find((e) => e.type === 'plan_started');
    assert(r.s === 200 && cost > 0 && sp && /^jv_pay_\d+$/.test(sp.event_id) && sp.value_usd === cost / 100 && sp.plan === 'Pro' && sp.country === 'NG', `Pro upgrade → spend jv_pay_<ledger id> $${cost / 100} (plan Pro, country NG)`, sp);
    assert(ps && ps.plan === 'Pro' && ps.value_usd === 99 && /^jv_plan_\d+$/.test(ps.event_id), 'and plan_started (Pro, $99) for the Offers page', ps);

    // ---------- credits used = ONE spend per customer per finished day; gift credits never count ----------
    const db = new DatabaseSync(path.join(__dirname, '.run', 'data', 'joinvoo.db'));
    db.exec('PRAGMA busy_timeout=5000');
    const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const at = (n, h) => Date.parse(day(n) + `T${String(h).padStart(2, '0')}:00:00Z`);
    db.prepare(`UPDATE users SET voo_linked_at=? WHERE id IN (?,?)`).run(at(4, 0), kimId, pId); // as if both linked a few days ago
    db.prepare(`UPDATE ledger SET created_at=? WHERE ref=?`).run(at(3, 9), 'dep:' + dep.id);
    db.prepare(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,?,?,?,?,?)`).run(kimId, 'joins', -240, `joins:${kimId}:${day(2)}`, 'Extra joins', at(2, 10));
    db.prepare(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,?,?,?,?,?)`).run(kimId, 'joe', -60, 'joe:t1', 'Joe answer', at(2, 11));
    db.prepare(`UPDATE users SET balance_cents=balance_cents-300 WHERE id=?`).run(kimId);
    r = await post(ADM, '/api/admin/jobs/run', { job: 'voo_use' });
    await post(ADM, '/api/admin/jobs/run', { job: 'voo_use' }); // the daily job runs twice
    const useId = `jv_use_${day(2)}_vs_kit_1`;
    const use = await until(() => evs().find((e) => e.event_id === useId));
    assert(r.s === 200 && use && use.type === 'spend' && use.value_usd === 3 && evs().filter((e) => e.event_id === useId).length === 1, `credits used on ${day(2)} → one spend ${useId} ($3.00), re-running the job adds nothing`, use);
    // Pat has only the welcome / gift credits: what Pat uses is not money
    await post(ADM, `/api/admin/users/${pId}/credits`, { credits: 5000, reason: 'gift' });
    db.prepare(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,?,?,?,?,?)`).run(pId, 'joins', -400, `joins:${pId}:${day(1)}`, 'Extra joins', at(1, 10));
    await post(ADM, '/api/admin/jobs/run', { job: 'voo_use' }); await sleep(600);
    assert(!evs().some((e) => e.voo_id === 'vs_pat' && e.type === 'spend'), 'credits paid with gift / welcome money never send a spend');

    // ---------- refund (unused money only) → refund event, no clawback ----------
    r = await post(ADM, `/api/admin/deposits/${dep.id}/refund`, { amount: 100 });
    assert(r.s === 400 && r.j.max_cents === 10000 - cost - 300, `refund is capped at the unused money paid in ($${(10000 - cost - 300) / 100})`, r.j);
    const balBefore = (await V('/api/billing')).j.balance_cents;
    r = await post(ADM, `/api/admin/deposits/${dep.id}/refund`, { amount: 10 });
    const rf = await until(() => evs().find((e) => e.type === 'refund'));
    const bill = (await V('/api/billing')).j;
    assert(r.s === 200 && rf && rf.event_id === `jv_rf_${dep.id}_1` && rf.original_event_id === 'jv_topup_' + dep.id && rf.value_usd === 10, 'refund $10 → refund event pointing at the top-up', rf);
    assert(bill.balance_cents === balBefore - 1000, 'wallet goes down by the refund', [balBefore, bill.balance_cents]);

    // ---------- chargeback → chargeback events against the spends that money paid for ----------
    r = await post(V, '/api/billing/deposit', { provider: 'crypto', amount: 20 });
    await post(V, '/api/billing/deposit', { provider: 'crypto', reference: r.j.reference, tx: 'c'.repeat(64) });
    const dep2 = (await ADM('/api/admin/deposits')).j.deposits.find((d) => d.email === 'kim@x.com');
    await post(ADM, `/api/admin/deposits/${dep2.id}/approve`, { amount: 20 });
    r = await post(ADM, `/api/admin/deposits/${dep.id}/chargeback`, {});
    const cbs = await until(() => { const l = evs().filter((e) => e.type === 'chargeback'); return l.length ? l : null; });
    const reported = (sp ? sp.value_usd : 0) + 3;
    const keep = 100 - 10 - 90 + 20; // after the chargeback only the $20 top-up is real money still paid in
    const back = Math.round((reported - Math.min(reported, keep)) * 100) / 100;
    const sum = cbs ? Math.round(cbs.reduce((a, e) => a + e.value_usd, 0) * 100) / 100 : 0;
    assert(r.s === 200 && cbs && sum === back && cbs.every((e) => /^jv_(pay|use)_/.test(e.original_event_id) && /^jv_cb_\d+_\d+$/.test(e.event_id)), `chargeback of the $100 top-up → chargebacks worth $${back} against the spends it paid for (original_event_id)`, { cbs, back, reported });
    assert((await post(ADM, `/api/admin/deposits/${dep.id}/chargeback`, {})).s === 400 && (await post(ADM, `/api/admin/deposits/${dep.id}/refund`, { amount: 1 })).s === 400, 'a charged-back top-up cannot be charged back or refunded again');
    const fin = (await ADM('/api/admin/deposits?status=paid')).j.deposits.find((d) => d.id === dep.id);
    assert(fin && fin.charged_back_at && fin.refunded_cents === 1000, 'admin deposits list shows refunded and charged back');

    // ---------- summary card (the kit checks the key) ----------
    const S = (q, key = API_KEY) => fetch(`${B}/api/voosquare/summary${q}`, { headers: key ? { authorization: 'Bearer ' + key } : {} }).then(async (x) => ({ s: x.status, j: await x.json() }));
    r = await S('?voo_id=vs_kit_1&period=30d');
    assert(r.s === 200 && r.j.linked === true && r.j.metrics.some((m) => m.key === 'joins') && r.j.metrics.some((m) => m.key === 'cost_per_ftd_usd'), 'summary: linked member with joins … cost_per_ftd_usd');
    assert((await S('?voo_id=nobody')).j.linked === false && (await S('?voo_id=vs_kit_1', 'wrong')).s === 401, 'summary: unknown Voo ID → {linked:false}; wrong key → 401');

    // ---------- AU-7: a customer on a custom deal: the plan event still carries the LIST price (VooSquare keeps it as the plan's catalogue price) ----------
    { await post(ADM, `/api/admin/users/${pId}/pricing`, { base_cents: 1000, note: 'Agency deal' });
      const ext = await post(P, '/api/bot-targets/external', { username: 'patshop_bot' });
      const pch = (await P('/api/channels')).j.channels.find((c) => /patshop_bot/.test(c.title || c.username || '')) || (await P('/api/channels')).j.channels[0];
      const g = await fetch(B + new URL(pch.tracking_url).pathname + '/go', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS]', 'x-forwarded-for': '102.89.7.7' }, body: JSON.stringify({ url: 'https://x.com/?fbclid=IwAR1' }) }).then((x) => x.json());
      await fetch(B + new URL(ext.j.hook_start).pathname + `?bot=patshop_bot&tg_id=777001&start=${new URL(g.url).searchParams.get('start')}`);
      const pe = await until(() => evs().find((e) => e.voo_id === 'vs_pat' && (e.type === 'plan_started' || e.type === 'plan_renewed')));
      const fee = (await P('/api/billing')).j.history.find((h) => h.kind === 'plan');
      assert(fee && fee.amount_cents === -1000 && pe && pe.value_usd !== 10 && pe.value_usd > 0, 'AU-7: custom $10 deal charged, but the plan event carries the list price, not the deal', { fee, pe }); }

    // ---------- privacy: never personal data in events ----------
    const all = MOCK.M.events.map((e) => e.raw).join('');
    assert(!/kim@x\.com|pat@x\.com|"email"|"name"|telegram/.test(all), 'events carry no emails, names or Telegram ids');

    // ---------- logout everywhere ----------
    r = await V('/logout');
    assert(r.s === 302 && r.h.get('location') === `${MOCK.base}/oauth/logout?redirect_uri=${encodeURIComponent(B + '/')}` && !V.jar.jp_session, 'logout → VooSquare /oauth/logout?redirect_uri=<home page>, Joinvoo session gone');
    assert((await V('/api/me')).s === 401, 'logged out');
    r = await client()('/dashboard'); assert(r.s === 302 && r.h.get('location') === '/app', '/dashboard (VooSquare launcher address) → /app');

    // ---------- admin card + widget switch ----------
    let as = (await ADM('/api/admin/settings')).j.voo;
    assert(as.issuer === MOCK.base && as.callback_url === B + '/auth/voosquare/callback' && as.logout_return_url === B + '/' && as.support_webhook_url === B + '/hooks/voosquare/support' && as.outbox.pending === 0 && as.outbox.failed === 0, 'admin VooSquare card: both redirect URIs, kit support webhook, empty outbox, nothing refused', as.outbox);
    { const h = (await ADM('/api/admin/health')).j.voo_outbox;
      assert(h && h.sent_24h > 0 && Number.isInteger(h.sent_24h) && h.pending === 0, 'Admin → Health: VooSquare events sent in the last 24 h is a real number (was undefined)', h); }
    await ADM('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ voo: { widget: true } }) });
    r = await client()('/guide');
    assert(r.t.includes(`<script src="${MOCK.base}/widget.js" data-product="joinvoo" defer></script>`), 'widget switch on → VooSquare widget.js (data-product joinvoo) on public pages');
    await ADM('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ voo: { widget: false } }) });
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  MOCK.close();
})();
