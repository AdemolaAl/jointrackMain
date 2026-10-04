const B = 'http://localhost:3999', P = 'http://localhost:4100', crypto = require('crypto');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ck = ''; const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) } }); const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t }; } };
const post = (p, b) => f(p, { method: 'POST', body: JSON.stringify(b) });
(async () => {
  await post('/api/signup', { country: 'GB', email: 'pay@x.com', password: 'password1' });
  let r = await post('/api/billing/deposit', { provider: 'paystack', amount: 20 });
  assert(r.s === 200 && /checkout\.paystack/.test(r.j.url), 'Paystack checkout started');
  const ref = r.j.reference;
  const kobo = (await (await fetch(P + '/__amount/' + ref)).json()).amount;
  assert(kobo === 20 * 1600 * 100, 'charged in the local currency at the set rate (' + kobo + ' minor units)');
  r = await f('/api/billing/verify?ref=' + ref);
  assert(r.j.status === 'pending', 'unpaid checkout stays pending');
  // forged webhook
  const ev = JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: kobo, id: 1 } });
  r = await fetch(B + '/webhooks/paystack', { method: 'POST', headers: { 'x-paystack-signature': 'bad' }, body: ev });
  assert(r.status === 401, 'webhook with a bad signature is refused');
  // underpaid webhook (valid signature)
  const sign = (b) => crypto.createHmac('sha512', 'sk_test_x').update(b).digest('hex');
  const low = JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: kobo - 100, id: 1 } });
  await fetch(B + '/webhooks/paystack', { method: 'POST', headers: { 'x-paystack-signature': sign(low) }, body: low });
  assert((await f('/api/billing')).j.balance_cents === 3000, 'underpaid charge is not credited');
  r = await fetch(B + '/webhooks/paystack', { method: 'POST', headers: { 'x-paystack-signature': sign(ev) }, body: ev });
  assert(r.status === 200 && (await f('/api/billing')).j.balance_cents === 5000, 'signed webhook credits $20');
  await fetch(B + '/webhooks/paystack', { method: 'POST', headers: { 'x-paystack-signature': sign(ev) }, body: ev });
  await fetch(P + '/__paid/' + ref + '/' + kobo); await f('/api/billing/verify?ref=' + ref);
  assert((await f('/api/billing')).j.balance_cents === 5000, 'repeat webhook + verify do not double-credit');
  // Flutterwave via return-page verify
  r = await post('/api/billing/deposit', { provider: 'flutterwave', amount: 15 });
  assert(r.s === 200 && /checkout\.flw/.test(r.j.url), 'Flutterwave checkout started');
  const fref = r.j.reference;
  await fetch(P + '/__paid/' + fref + '/15');
  r = await fetch(B + '/webhooks/flutterwave', { method: 'POST', headers: { 'verif-hash': 'wrong' }, body: JSON.stringify({ data: { tx_ref: fref } }) });
  assert(r.status === 401, 'Flutterwave webhook with wrong hash refused');
  r = await fetch(B + '/webhooks/flutterwave', { method: 'POST', headers: { 'verif-hash': 'flwhash' }, body: JSON.stringify({ data: { tx_ref: fref } }) });
  assert((await f('/api/billing')).j.balance_cents === 6500, 'Flutterwave webhook verified with Flutterwave and credited $15');
  r = await post('/api/billing/deposit', { provider: 'flutterwave', amount: 10 });
  await fetch(P + '/__paid/' + r.j.reference + '/5');
  await f('/api/billing/verify?ref=' + r.j.reference);
  assert((await f('/api/billing')).j.balance_cents === 6500, 'Flutterwave underpayment not credited');
  r = await post('/api/billing/deposit', { provider: 'paystack', amount: 5 });
  assert(r.s === 400, 'minimum top-up enforced');
})();
