// Billing, referrals, admin, password reset — against the mock Telegram/Meta server.
const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  let ck = '';
  return async (p, o = {}) => {
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0];
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const mset = (o) => fetch('http://localhost:4000/__set', { method: 'POST', body: JSON.stringify(o) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));

(async () => {
  const A = client(), Bu = client(), ADM = client();
  await post(A, '/api/signup', { country: 'GB', email: 'ref@x.com', password: 'password1', name: 'Ref' });
  const refCode = (await A('/api/referrals')).j.code;
  let r = await post(Bu, '/api/signup', { country: 'GB', email: 'buyer@x.com', password: 'password1', name: 'Buyer', ref: refCode });
  assert(r.s === 200, 'buyer signs up with referral code');
  let bill = (await Bu('/api/billing')).j;
  assert(bill.balance_cents === 3000 && bill.welcome_cents === 3000, 'welcome credit $30 on signup (got ' + bill.balance_cents + ')');

  // existing foreign webhook gets detected
  await mset({ foreign: 'https://their-server.example/hook' });
  r = await post(Bu, '/api/bots', { token: '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  assert(r.j.previous_webhook === 'https://their-server.example/hook' && r.j.warning, 'connecting a bot that was in use elsewhere warns and keeps old URL');
  await mset({ foreign: '' });
  const botId = r.j.bot.id;
  const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  await post(Bu, '/api/bot-targets', { bot_id: botId });
  const ch = (await Bu('/api/channels')).j.channels[0];
  await Bu('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ pixel_id: '884210395527140', capi_token: 'EAAtest' }) });
  const slug = new URL(ch.tracking_url).pathname;
  const click = () => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwT' }) }).then((x) => x.json());
  let uid = 1000;
  const joinVia = async (go) => { const code = new URL(go.url).searchParams.get('start'); uid++;
    await Bu(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: uid, message: { message_id: 1, date: 1, chat: { id: uid, type: 'private' }, from: { id: uid, first_name: 'U' + uid }, text: '/start ' + (code || '') } }) }); return code; };

  let go = await click();
  assert(/start=/.test(go.url), 'first click is tracked');
  bill = (await Bu('/api/billing')).j;
  assert(bill.balance_cents === 0 && bill.month.plan_paid, 'first click of the month charges the $30 plan (balance ' + bill.balance_cents + ')');
  await joinVia(go);
  for (let i = 0; i < 4; i++) await joinVia(await click()); // 5 tracked joins total, 3 included (test env)
  bill = (await Bu('/api/billing')).j;
  assert(bill.month.joins === 3 && bill.balance_cents === 0, 'with $0 left only the included joins are tracked (joins ' + bill.month.joins + ', balance ' + bill.balance_cents + ')');
  go = await click();
  assert(!/start=/.test(go.url) && /t\.me\//.test(go.url), 'out of balance: visitor still sent to Telegram but untracked -> ' + go.url);
  assert(bill.tracking === false || (await Bu('/api/billing')).j.tracking === false, 'dashboard reports tracking paused');

  // crypto deposit → admin approval → referral commission
  r = await post(Bu, '/api/billing/deposit', { provider: 'crypto', amount: 50 });
  assert(r.j.crypto && /^50\.\d\d$/.test(r.j.pay_amount) && r.j.pay_amount !== '50.00', 'crypto top-up reserves a unique amount (' + r.j.pay_amount + ')');
  const cref = r.j.reference;
  r = await post(Bu, '/api/billing/deposit', { provider: 'crypto', reference: cref, tx: 'A'.repeat(64) });
  assert(r.j.pending, 'crypto deposit submitted for review');
  r = await post(A, '/api/billing/deposit', { provider: 'crypto', amount: 20 });
  r = await post(A, '/api/billing/deposit', { provider: 'crypto', reference: r.j.reference, tx: 'a'.repeat(64) });
  assert(r.s === 400, 'someone else cannot reuse the same transaction hash (any letter case)');
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1' });
  r = await ADM('/api/admin/overview');
  assert(r.s === 403, 'admin email cannot use admin until the inbox is confirmed');
  await sleep(100);
  const vlink = [...require('fs').readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
  r = await fetch(B + vlink[1], { redirect: 'manual' });
  assert(r.status === 302 && /verified=1/.test(r.headers.get('location')), 'email confirmation link works');
  r = await Bu('/api/admin/overview');
  assert(r.s === 403, 'normal user cannot open admin API');
  const ov = (await ADM('/api/admin/overview')).j;
  assert(ov.pending_deposits === 1 && ov.users === 3, 'admin overview counts pending deposit and users');
  const dep = (await ADM('/api/admin/deposits')).j.deposits[0];
  r = await post(ADM, `/api/admin/deposits/${dep.id}/approve`, { amount: 49 });
  bill = (await Bu('/api/billing')).j;
  assert(bill.balance_cents === 4900 && bill.tracking, 'approved for the real amount received ($49): balance ' + bill.balance_cents + ', tracking resumes');
  r = await post(ADM, `/api/admin/deposits/${dep.id}/approve`, {});
  assert(r.s === 400 && (await Bu('/api/billing')).j.balance_cents === 4900, 'approving twice does nothing');
  go = await click();
  assert(/start=/.test(go.url), 'clicks are tracked again after top-up');
  await joinVia(go); bill = (await Bu('/api/billing')).j;
  assert(bill.month.joins === 4 && bill.balance_cents === 4898 && bill.history.some((h) => h.kind === 'joins'), 'join past the allowance charged 2¢ (balance ' + bill.balance_cents + ')');
  let ref = (await A('/api/referrals')).j;
  assert(ref.earned_cents === 0, 'no commission on spend covered by the free welcome credit (earned ' + ref.earned_cents + ')');
  // A second account for the same Gmail-style inbox gets no welcome credit; it pays real money and spends it.
  const C2 = client();
  await post(C2, '/api/signup', { country: 'GB', email: 'buyer+2@x.com', password: 'password1', ref: refCode });
  assert((await C2('/api/billing')).j.balance_cents === 0, 'same inbox with a +alias gets no second welcome credit');
  r = await post(C2, '/api/billing/deposit', { provider: 'crypto', amount: 40 });
  await post(C2, '/api/billing/deposit', { provider: 'crypto', reference: r.j.reference, tx: 'c'.repeat(64) });
  const dep2 = (await ADM('/api/admin/deposits')).j.deposits[0];
  await post(ADM, `/api/admin/deposits/${dep2.id}/approve`, { amount: 40 });
  r = await post(C2, '/api/bots', { token: '8812045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  const st2 = await ms(); await post(C2, '/api/bot-targets', { bot_id: r.j.bot.id });
  const ch2 = (await C2('/api/channels')).j.channels[0];
  const go2 = await fetch(B + new URL(ch2.tracking_url).pathname + '/go', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"https://x.com/?fbclid=1"}' }).then((x) => x.json());
  assert(/start=/.test(go2.url) && (await C2('/api/billing')).j.balance_cents === 1000, 'paid account: plan charged from real money');
  ref = (await A('/api/referrals')).j;
  assert(ref.earned_cents === 300 && ref.balance_cents === 300 && ref.withdrawable_cents === 0, 'referrer earns 10% of the paid plan ($3.00), still settling');
  r = await post(A, '/api/referrals/withdraw', { method: 'usdt', details: 'T' + 'A'.repeat(33) });
  assert(r.s === 400, 'cannot withdraw under $300 / while settling');
  r = await post(A, '/api/referrals/credit');
  const abill = (await A('/api/billing')).j; ref = (await A('/api/referrals')).j;
  assert(abill.balance_cents === 3300 && ref.balance_cents === 0, 'moving earnings to wallet adds to balance and empties referral balance');

  // admin credit, suspend
  const users = (await ADM('/api/admin/users?q=buyer@x.com')).j.users;
  assert(users.length === 1 && users[0].paid_cents === 4900, 'admin user search');
  await post(ADM, `/api/admin/users/${users[0].id}/adjust`, { amount: 5, note: 'Sorry for downtime' });
  assert((await Bu('/api/billing')).j.balance_cents === 5398, 'admin credit adjusts balance');
  await post(ADM, `/api/admin/users/${users[0].id}/status`, { status: 'suspended' });
  assert((await Bu('/api/billing')).s === 401, 'suspended user is logged out');
  go = await click();
  assert(!/start=/.test(go.url), 'suspended account stops tracking');
  await post(ADM, `/api/admin/users/${users[0].id}/status`, { status: 'active' });

  // payouts: give referrer enough via ref earnings
  const C = client();
  await post(ADM, `/api/admin/users/${users[0].id}/adjust`, { amount: 0.01 });
  // password reset
  r = await post(C, '/api/forgot', { email: 'buyer@x.com' });
  assert(r.j.ok, 'forgot password answers the same whether or not the email exists');
  await sleep(200);
  const logTxt = require('fs').readFileSync(process.env.SRV_LOG, 'utf8');
  const link = [...logTxt.matchAll(/reset=([\w-]+)/g)].pop();
  assert(link, 'reset link written to log when email is not configured');
  r = await post(C, '/api/reset', { token: link[1], password: 'newpass123' });
  assert(r.s === 200, 'reset with token sets new password and logs in');
  r = await post(C, '/api/reset', { token: link[1], password: 'another123' });
  assert(r.s === 400, 'reset link works only once');
  r = await post(client(), '/api/login', { email: 'buyer@x.com', password: 'newpass123' });
  assert(r.s === 200, 'login with new password');
  // rate limit
  const L = client(); let last;
  for (let i = 0; i < 11; i++) last = await post(L, '/api/login', { email: 'buyer@x.com', password: 'wrong' });
  assert(last.s === 429, 'repeated wrong passwords get rate limited');
  r = await fetch(B + '/api/login', { method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://evil.example' }, body: '{}' });
  assert(r.status === 403, 'cross-site API post blocked');
  // landing button mode
  await C('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ landing: 'button' }) });
  const html = await fetch(B + slug).then((x) => x.text());
  assert(/AUTO=0/.test(html), 'button landing page served when chosen');
  for (const pg of ['/admin', '/guide', '/terms', '/privacy']) { const s = (await fetch(B + pg)).status; assert(s === 200, pg + ' page served (' + s + ')'); }
  const h = (await ADM('/api/admin/health')).j;
  assert(Array.isArray(h.bots), 'admin health endpoint');
})();
