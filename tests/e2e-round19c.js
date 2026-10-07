// Round 19c: admin switches per account: "Don't count as revenue" and "No referral commissions".
const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() { let ck = ''; return async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t }; } }; }
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
let tok = 7712045600, txn = 1;
(async () => {
  const ADM = client(), A = client();
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1' }); await sleep(100);
  const vlink = [...require('fs').readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop(); await fetch(B + vlink[1], { redirect: 'manual' });
  await post(A, '/api/signup', { country: 'GB', email: 'ref@x.com', password: 'password1', name: 'Ref' });
  const refCode = (await A('/api/referrals')).j.code;
  const uidOf = async (email) => (await ADM('/api/admin/users?q=' + encodeURIComponent(email))).j.users.find((u) => u.email === email).id;
  /** A referred customer who pays $40 in crypto (admin approves) and then uses it: the first click charges the $30 plan. */
  const payingCustomer = async (email, before) => {
    const C = client(); await post(C, '/api/signup', { country: 'GB', email, password: 'password1', ref: refCode });
    if (before) await before(await uidOf(email));
    let r = await post(C, '/api/billing/deposit', { provider: 'crypto', amount: 40 });
    await post(C, '/api/billing/deposit', { provider: 'crypto', reference: r.j.reference, tx: String(txn++).padStart(64, 'f') });
    const dep = (await ADM('/api/admin/deposits')).j.deposits.find((d) => d.email === email);
    await post(ADM, `/api/admin/deposits/${dep.id}/approve`, { amount: 40 });
    r = await post(C, '/api/bots', { token: (tok++) + ':AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
    await post(C, '/api/bot-targets', { bot_id: r.j.bot.id });
    const ch = (await C('/api/channels')).j.channels[0];
    const go = await fetch(B + new URL(ch.tracking_url).pathname + '/go', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"https://x.com/?fbclid=1"}' }).then((x) => x.json());
    return { C, go, bal: (await C('/api/billing')).j.balance_cents };
  };
  const aId = await uidOf('ref@x.com');

  // ---- switches: only admins
  let r = await post(A, `/api/admin/users/${aId}/flags`, { no_commission: true }); assert(r.s === 403, 'a normal user cannot use the switches');
  r = await post(ADM, `/api/admin/users/999999/flags`, { no_commission: true }); assert(r.s === 404, 'unknown user → 404');
  r = await post(ADM, `/api/admin/users/${aId}/flags`, { no_commission: true }); assert(r.j.ok && r.j.no_commission === true && r.j.exclude_revenue === false, 'admin turns referral commissions off for the referrer');
  let d = (await ADM('/api/admin/users/' + aId)).j.user; assert(d.no_commission === 1 && d.exclude_revenue === 0, 'user details show the switches');
  let lst = (await ADM('/api/admin/users?q=ref@x.com')).j.users[0]; assert(lst.no_commission === 1, 'users list shows the switch');

  // ---- referrer with commissions off earns nothing
  let x = await payingCustomer('one@x.com'); assert(/start=/.test(x.go.url) && x.bal === 1000, 'customer 1 paid $40 and the plan was charged');
  let ref = (await A('/api/referrals')).j; assert(ref.earned_cents === 0, 'commissions off: referrer earns nothing (earned ' + ref.earned_cents + ')');
  // back on: the next payment earns again
  await post(ADM, `/api/admin/users/${aId}/flags`, { no_commission: false });
  x = await payingCustomer('two@x.com'); ref = (await A('/api/referrals')).j;
  assert(ref.earned_cents === 300, 'commissions back on: 10% of the next paid plan ($3.00), earned ' + ref.earned_cents);

  // ---- "Don't count as revenue"
  let ov = (await ADM('/api/admin/overview')).j; const rev0 = ov.revenue_month_cents;
  assert(rev0 === 8000 && ov.excluded_month_cents === 0, 'overview revenue: 2 × $40 = $80');
  x = await payingCustomer('gift@x.com', async (id) => { const rr = await post(ADM, `/api/admin/users/${id}/flags`, { exclude_revenue: true }); assert(rr.j.exclude_revenue === true, 'admin marks the gifted account “Don’t count as revenue”'); });
  assert(/start=/.test(x.go.url), 'the excluded account still works normally (tracking on)');
  ov = (await ADM('/api/admin/overview')).j;
  assert(ov.revenue_month_cents === rev0 && ov.excluded_month_cents === 4000 && ov.excluded_users === 1 && ov.revenue_all_cents === rev0, 'its $40 is left out of revenue and shown as “not counted”');
  assert(ov.days.reduce((a, y) => a + y.revenue_cents, 0) === rev0, 'daily revenue chart leaves it out too');
  assert((ov.paid_by_method || []).reduce((a, y) => a + y.cents, 0) === rev0, 'revenue by payment method leaves it out too');
  ref = (await A('/api/referrals')).j; assert(ref.earned_cents === 300, 'nobody earns commission on an excluded account (still ' + ref.earned_cents + ')');
  const dep = (await ADM('/api/admin/deposits?status=paid')).j.deposits.find((y) => y.email === 'gift@x.com'); assert(dep && dep.exclude_revenue === 1, 'deposits list marks it');
  // gifts from admin were never revenue
  const gId = await uidOf('gift@x.com');
  await post(ADM, `/api/admin/users/${gId}/credits`, { credits: 50000, reason: 'Gift' });
  ov = (await ADM('/api/admin/overview')).j; assert(ov.revenue_month_cents === rev0, 'admin credit gifts never count as revenue');
  // switch it back: counted again
  await post(ADM, `/api/admin/users/${gId}/flags`, { exclude_revenue: false });
  ov = (await ADM('/api/admin/overview')).j; assert(ov.revenue_month_cents === rev0 + 4000 && ov.excluded_month_cents === 0, 'switched back: counted again');
  console.log('done');
})().catch((e) => { console.log('FAIL: crashed', e); process.exitCode = 1; });
