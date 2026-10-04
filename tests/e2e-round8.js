// Round 8: country on users (signup, /api/geo, /api/countries, 30-day lock, admin override + history), country-aware payment
// methods (only / except / global, logo, fx, min/max, fee, masked secrets), Paystack + Stripe hosted checkout with signed webhooks
// and verify-on-return, crypto_manual, admin country filters/overview/broadcast audience, Integrations & API keys.
// Paystack and Stripe are faked by this file on :4300 (the runner sets PAYSTACK_API_BASE / STRIPE_API_BASE to it).
const B = 'http://localhost:3999';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client(extra = {}) {
  const jar = {};
  return async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...extra, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t, h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---------- fake Paystack + Stripe ----------
const PS_KEY = 'sk_test_paystackgood1234', ST_KEY = 'sk_test_stripegood5678', WHSEC = 'whsec_testsigning12345';
const M = { ps: [], st: [], sessions: {}, paid: {} };
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'), auth = req.headers.authorization || '', j = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/transaction/initialize') {
      if (auth !== 'Bearer ' + PS_KEY) return j(401, { status: false, message: 'Invalid key' });
      const b = JSON.parse(raw); M.ps.push(b);
      return j(200, { status: true, message: 'Authorization URL created', data: { authorization_url: 'https://checkout.paystack.test/' + b.reference, access_code: 'ac_' + b.reference, reference: b.reference } });
    }
    if (u.pathname.startsWith('/transaction/verify/')) {
      const ref = decodeURIComponent(u.pathname.split('/').pop()), b = M.ps.find((x) => x.reference === ref);
      return j(200, { status: true, data: { status: M.paid[ref] ? 'success' : 'abandoned', amount: b ? b.amount : 0, currency: b ? b.currency : 'NGN', id: 7001, reference: ref } });
    }
    if (u.pathname === '/transaction') return auth === 'Bearer ' + PS_KEY ? j(200, { status: true, data: [] }) : j(401, { status: false, message: 'Invalid key' });
    if (u.pathname === '/v1/balance') return auth === 'Bearer ' + ST_KEY ? j(200, { object: 'balance', available: [] }) : j(401, { error: { message: 'Invalid API Key provided' } });
    if (u.pathname === '/v1/checkout/sessions' && req.method === 'POST') {
      if (auth !== 'Bearer ' + ST_KEY) return j(401, { error: { message: 'Invalid API Key provided' } });
      if (!/x-www-form-urlencoded/.test(req.headers['content-type'] || '')) return j(400, { error: { message: 'form encoding expected' } });
      const f = Object.fromEntries(new URLSearchParams(raw)); const id = 'cs_test_' + (M.st.length + 1);
      M.st.push(f); M.sessions[id] = f;
      return j(200, { id, url: 'https://checkout.stripe.test/' + id });
    }
    if (u.pathname.startsWith('/v1/checkout/sessions/')) {
      const id = u.pathname.split('/').pop(), f = M.sessions[id]; if (!f) return j(404, { error: { message: 'No such session' } });
      return j(200, { id, payment_status: M.paid[id] ? 'paid' : 'unpaid', amount_total: +f['line_items[0][price_data][unit_amount]'], currency: f['line_items[0][price_data][currency]'], client_reference_id: f.client_reference_id, metadata: { reference: f['metadata[reference]'] }, payment_intent: 'pi_' + id });
    }
    j(404, { error: 'nope' });
  });
});
const psSign = (raw, key = PS_KEY) => crypto.createHmac('sha512', key).update(raw).digest('hex');
const stSign = (raw, t = Math.floor(Date.now() / 1000), sec = WHSEC) => `t=${t},v1=${crypto.createHmac('sha256', sec).update(`${t}.${raw}`).digest('hex')}`;
const hook = (p, raw, headers) => fetch(B + p, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', ...headers } }).then(async (r) => ({ s: r.status, t: await r.text() }));

(async () => {
  await new Promise((r) => mock.listen(4300, r));
  try {
    const ADM = client(), NG = client(), GB = client(), FR = client();

    // ---------- countries + geo ----------
    let r = await client()('/api/countries');
    const C = r.j;
    assert(r.s === 200 && Array.isArray(C) && C.length >= 245 && C.every((c) => /^[A-Z]{2}$/.test(c.code) && c.name && c.flag) && new Set(C.map((c) => c.code)).size === C.length, `GET /api/countries: ${C.length} countries with code, name and flag`);
    assert(C.find((c) => c.code === 'NG').flag === '🇳🇬' && C.find((c) => c.code === 'BR') && C.find((c) => c.code === 'DE'), 'flags are emoji from the code');
    assert(/max-age/.test(r.h.get('cache-control') || '') && r.h.get('etag'), 'countries list is cacheable (ETag)');
    r = await client({ 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' })('/api/geo'); assert(r.s === 200 && r.j.country === 'BR', 'GET /api/geo: region from Accept-Language');
    r = await client({ 'accept-language': 'en' })('/api/geo'); assert(r.j.country === null, 'GET /api/geo: no region → null');
    r = await client({ 'cf-ipcountry': 'KE', 'accept-language': 'fr-FR' })('/api/geo'); assert(r.j.country === 'FR', 'CF-IPCountry ignored unless TRUST_CLOUDFLARE is on');

    // ---------- signup requires a country ----------
    r = await post(client(), '/api/signup', { email: 'nocountry@x.com', password: 'password1' }); assert(r.s === 400 && r.j.field === 'country', 'signup without a country is refused');
    r = await post(client(), '/api/signup', { country: 'XX', email: 'badcountry@x.com', password: 'password1' }); assert(r.s === 400, 'signup with an unknown country code is refused');
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
    await sleep(100);
    const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    r = await post(NG, '/api/signup', { country: 'ng', email: 'ada@x.com', password: 'password1', name: 'Ada' });
    assert(r.s === 200, 'signup with a lowercase code works');
    await post(GB, '/api/signup', { country: 'GB', email: 'liam@x.com', password: 'password1', name: 'Liam' });
    await post(FR, '/api/signup', { country: 'FR', email: 'lea@x.com', password: 'password1', name: 'Lea' });
    let me = (await NG('/api/me')).j;
    assert(me.country === 'NG' && me.country_name === 'Nigeria' && me.country_flag === '🇳🇬' && me.country_locked_until === null, '/api/me: country, country_name, flag');

    // ---------- change once per 30 days ----------
    r = await patch(FR, '/api/me', { country: 'ZZ' }); assert(r.s === 400, 'PATCH /api/me with an unknown country refused');
    r = await patch(FR, '/api/me', { country: 'BE' }); assert(r.s === 200 && r.j.country === 'BE' && r.j.country_locked_until > Date.now() + 29 * 864e5, 'first change works and starts the 30-day lock');
    r = await patch(FR, '/api/me', { country: 'BE' }); assert(r.s === 200, 'saving the same country again is fine');
    r = await patch(FR, '/api/me', { country: 'NL' }); assert(r.s === 400 && r.j.error === 'country_locked' && r.j.until > Date.now() && typeof r.j.message === 'string', 'second change within 30 days → {error:country_locked, until}');
    const frId = (await ADM('/api/admin/users?q=lea')).j.users[0].id;
    r = await post(ADM, `/api/admin/users/${frId}/country`, { country: 'nl' });
    assert(r.s === 200 && r.j.country === 'NL' && r.j.country_history.length === 3 && r.j.country_history[0].by === 'admin:admin@x.com' && r.j.country_history[2].by === 'signup', 'admin override works despite the lock and is kept in the history');
    r = await post(ADM, `/api/admin/users/${frId}/country`, { country: 'FR', reset_lock: true }); assert(r.j.country_locked_until === null, 'admin can also lift the lock');
    r = await ADM(`/api/admin/users/${frId}`); assert(r.j.user.country === 'FR' && r.j.country_history.length === 4 && r.j.country_history[1].to === 'NL', 'user sheet: country + change history');
    assert((await post(client(), `/api/admin/users/${frId}/country`, { country: 'DE' })).s !== 200, 'country override is admin-only');
    // back to FR for the rest

    // ---------- seeded methods ----------
    let pm = (await ADM('/api/admin/pay-methods')).j;
    const st = pm.methods.find((x) => x.type === 'stripe'), ps = pm.methods.find((x) => x.id === 'm_paystack');
    assert(st && !st.enabled && st.countries.mode === 'global' && st.name === 'Bank card (Stripe)', 'seeded “Bank card (Stripe)”: global, off');
    assert(ps && !ps.enabled && ps.countries.mode === 'only' && ['NG', 'GH', 'KE', 'ZA'].every((c) => ps.countries.list.includes(c)) && ps.currency === 'NGN', 'seeded “Paystack”: only NG/GH/KE/ZA, NGN, off');
    assert(pm.methods.find((x) => x.id === 'm_usdt').countries.mode === 'global', 'existing methods were migrated to global');
    assert(ps.webhook_url.endsWith('/webhooks/paystack/m_paystack') && st.webhook_url.endsWith('/webhooks/stripe/' + st.id), 'admin sees the webhook URL to paste per gateway method');
    assert(pm.builtin_logos.includes('stripe') && pm.types.includes('crypto_manual'), 'admin gets built-in logos and types');

    // ---------- edit + masked secrets ----------
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { config: { secret_key: 'nope' } }); assert(r.s === 400, 'a malformed Paystack key is refused');
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { countries: { mode: 'only', list: [] } }); assert(r.s === 400, '“Only” with no countries is refused');
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { countries: { mode: 'only', list: ['NG', 'QQ'] } }); assert(r.s === 400, 'unknown country codes are refused');
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { fee_pct: 80 }); assert(r.s === 400, 'fee above 50% refused');
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { name: 'Paystack', config: { secret_key: PS_KEY, public_key: 'pk_test_abc' }, fx_rate: 1500, fee_pct: 2, min_usd: 5, max_usd: 500, enabled: true, logo: 'paystack' });
    let mp = r.j.methods.find((x) => x.id === 'm_paystack');
    assert(r.s === 200 && mp.enabled && mp.live && mp.fx_rate === 1500 && mp.fee_pct === 2 && mp.config.secret_key === '••••1234' && !r.t.includes(PS_KEY), 'secret saved, shown masked as ••••last4, never in full');
    assert(mp.logo_url === '/media/paylogos/paystack.svg', 'built-in logo id → logo_url');
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { name: 'Paystack', config: { secret_key: '••••1234', public_key: 'pk_test_abc' }, fee_pct: 2 });
    r = await post(ADM, '/api/admin/pay-methods/m_paystack/test', {});
    assert(r.j.ok === true && /test mode/.test(r.j.message), 'masked placeholder sent back keeps the saved key (Test connection still passes)');
    r = await post(ADM, '/api/admin/pay-methods/m_paystack/test', { secret_key: 'sk_test_wrongwrong99' }); assert(r.j.ok === false && /Invalid key/.test(r.j.error), 'Test connection with a typed (unsaved) wrong key fails with the provider message');
    r = await patch(ADM, `/api/admin/pay-methods/${st.id}`, { config: { secret_key: ST_KEY, webhook_secret: 'bad' } }); assert(r.s === 400, 'a webhook secret must start with whsec_');
    r = await patch(ADM, `/api/admin/pay-methods/${st.id}`, { config: { secret_key: ST_KEY, webhook_secret: WHSEC }, countries: { mode: 'except', list: ['NG'] }, enabled: true });
    const ms = r.j.methods.find((x) => x.id === st.id);
    assert(r.s === 200 && ms.live && ms.config.secret_key === '••••5678' && ms.config.webhook_secret === '••••2345' && !r.t.includes(WHSEC), 'Stripe: both secrets masked');
    r = await post(ADM, `/api/admin/pay-methods/${st.id}/test`, {}); assert(r.j.ok === true, 'Stripe Test connection (GET /v1/balance)');

    // ---------- customers see methods for their country, never secrets ----------
    let mNG = (await NG('/api/billing/methods')).j, mGB = (await GB('/api/billing/methods')).j;
    assert(mNG.country === 'NG' && mNG.methods.some((x) => x.id === 'm_paystack') && !mNG.methods.some((x) => x.id === st.id), 'NG customer: Paystack yes, Stripe (all except NG) no');
    assert(mGB.methods.some((x) => x.id === st.id) && !mGB.methods.some((x) => x.id === 'm_paystack') && mGB.methods.some((x) => x.id === 'm_usdt'), 'GB customer: Stripe and global USDT, no Paystack');
    const allTxt = JSON.stringify(mNG) + JSON.stringify(mGB) + JSON.stringify((await NG('/api/billing')).j);
    assert(!allTxt.includes(PS_KEY) && !allTxt.includes(ST_KEY) && !allTxt.includes(WHSEC) && !allTxt.includes('secret_key') && !allTxt.includes('webhook_secret'), 'no secrets in any customer response');
    const pmNG = mNG.methods.find((x) => x.id === 'm_paystack');
    assert(pmNG.name === 'Paystack' && pmNG.type === 'paystack' && pmNG.currency === 'NGN' && pmNG.fx_rate === 1500 && pmNG.fee_pct === 2 && pmNG.min_usd === 5 && pmNG.max_usd === 500 && pmNG.logo_url, 'method fields: name, type, logo_url, currency, fx_rate, min/max, fee');
    assert((await NG('/api/billing')).j.pay_methods.some((x) => x.id === 'm_paystack') && !(await GB('/api/billing')).j.pay_methods.some((x) => x.id === 'm_paystack'), '/api/billing pay_methods is country-filtered too');

    // ---------- Paystack top-up ----------
    r = await post(NG, '/api/billing/topup', { method_id: st.id, usd: 10 }); assert(r.s === 400, 'a method not offered in your country can’t be used');
    r = await post(NG, '/api/billing/topup', { method_id: 'm_paystack', usd: 2 }); assert(r.s === 400 && /\$5/.test(r.j.error), 'method minimum applies');
    r = await post(NG, '/api/billing/topup', { method_id: 'm_paystack', usd: 900 }); assert(r.s === 400 && /\$500/.test(r.j.error), 'method maximum applies');
    r = await post(NG, '/api/billing/topup', { method_id: 'm_paystack', usd: 10 });
    const ref1 = r.j.reference, init = M.ps.at(-1);
    assert(r.s === 200 && r.j.redirect_url === 'https://checkout.paystack.test/' + ref1, 'POST /api/billing/topup → {redirect_url}');
    assert(init.amount === 1530000 && init.currency === 'NGN' && init.email === 'ada@x.com' && init.callback_url.endsWith('/app#credits?paid=' + ref1),
      'Paystack initialize: amount = usd × fx × 100 (+2% fee) in kobo, callback /app#credits?paid=<ref>');
    const bal0 = (await NG('/api/billing')).j.balance_cents;
    let ev = JSON.stringify({ event: 'charge.success', data: { reference: ref1, amount: 1530000, currency: 'NGN', id: 99001, status: 'success' } });
    r = await hook('/webhooks/paystack/m_paystack', ev, { 'x-paystack-signature': 'deadbeef' }); assert(r.s === 401, 'Paystack webhook: bad signature → 401');
    r = await hook('/webhooks/paystack/m_paystack', ev, { 'x-paystack-signature': psSign(ev, 'sk_test_someoneelse1') }); assert(r.s === 401, 'Paystack webhook: signed with another key → 401');
    r = await hook('/webhooks/paystack/nope', ev, { 'x-paystack-signature': psSign(ev) }); assert(r.s === 404, 'webhook for an unknown method → 404');
    assert((await NG('/api/billing')).j.balance_cents === bal0, 'nothing credited before a valid webhook');
    r = await hook('/webhooks/paystack/m_paystack', ev, { 'x-paystack-signature': psSign(ev) });
    let b1 = (await NG('/api/billing')).j;
    assert(r.s === 200 && b1.balance_cents === bal0 + 1000 && b1.deposits[0].status === 'paid' && b1.deposits[0].label === 'Paystack', 'valid charge.success credits $10 = 1,000 credits');
    await hook('/webhooks/paystack/m_paystack', ev, { 'x-paystack-signature': psSign(ev) });
    assert((await NG('/api/billing')).j.balance_cents === bal0 + 1000, 'webhook replay credits only once');
    r = await NG('/api/inbox'); assert(r.j.items.some((x) => x.kind === 'account' && /1,000/.test(x.title + x.body)), 'payment lands in the inbox like any top-up');
    // short payment
    r = await post(NG, '/api/billing/topup', { method_id: 'm_paystack', usd: 20 }); const ref2 = r.j.reference;
    ev = JSON.stringify({ event: 'charge.success', data: { reference: ref2, amount: 100, currency: 'NGN', id: 99002 } });
    await hook('/webhooks/paystack/m_paystack', ev, { 'x-paystack-signature': psSign(ev) });
    assert((await NG('/api/billing')).j.balance_cents === bal0 + 1000, 'underpaid charge is not credited');
    ev = JSON.stringify({ event: 'charge.success', data: { reference: ref2, amount: 9999999, currency: 'USD', id: 99003 } });
    await hook('/webhooks/paystack/m_paystack', ev, { 'x-paystack-signature': psSign(ev) });
    assert((await NG('/api/billing')).j.balance_cents === bal0 + 1000, 'wrong currency is not credited');
    // verify on return
    M.paid[ref2] = true;
    r = await NG('/api/billing/verify?ref=' + ref2);
    assert(r.j.status === 'paid' && (await NG('/api/billing')).j.balance_cents === bal0 + 3000, 'verify on return (GET /transaction/verify/:ref) credits once');
    r = await NG('/api/billing/verify?ref=' + ref2); assert((await NG('/api/billing')).j.balance_cents === bal0 + 3000, 'verifying again changes nothing');
    assert((await GB('/api/billing/verify?ref=' + ref2)).s === 404, 'you can only verify your own payment');

    // ---------- Stripe top-up ----------
    r = await post(GB, '/api/billing/topup', { method_id: st.id, usd: 25 });
    const ref3 = r.j.reference, sess = M.st.at(-1), sid = 'cs_test_' + M.st.length;
    assert(r.s === 200 && r.j.redirect_url === 'https://checkout.stripe.test/' + sid, 'Stripe: Checkout Session → {redirect_url}');
    assert(sess.mode === 'payment' && sess['line_items[0][price_data][currency]'] === 'usd' && sess['line_items[0][price_data][unit_amount]'] === '2500' && sess.client_reference_id === ref3 && sess['metadata[reference]'] === ref3 && sess.success_url.endsWith('/app#credits?paid=' + ref3) && sess.cancel_url,
      'Stripe session (form-encoded): mode=payment, price_data currency + unit_amount, client_reference_id, metadata, success/cancel URLs');
    const gb0 = (await GB('/api/billing')).j.balance_cents;
    const obj = (o) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: sid, client_reference_id: ref3, amount_total: 2500, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_1', ...o } } });
    ev = obj();
    r = await hook('/webhooks/stripe/' + st.id, ev, { 'stripe-signature': 't=1,v1=abc' }); assert(r.s === 400, 'Stripe webhook: bad signature → 400');
    r = await hook('/webhooks/stripe/' + st.id, ev, { 'stripe-signature': stSign(ev, Math.floor(Date.now() / 1000) - 600) }); assert(r.s === 400, 'Stripe webhook: older than 5 minutes → 400');
    r = await hook('/webhooks/stripe/' + st.id, ev, { 'stripe-signature': stSign(ev, undefined, 'whsec_otherotherother') }); assert(r.s === 400, 'Stripe webhook: wrong signing secret → 400');
    const unpaid = obj({ payment_status: 'unpaid' });
    r = await hook('/webhooks/stripe/' + st.id, unpaid, { 'stripe-signature': stSign(unpaid) });
    assert(r.s === 200 && (await GB('/api/billing')).j.balance_cents === gb0, 'completed but unpaid → not credited');
    r = await hook('/webhooks/stripe/' + st.id, ev, { 'stripe-signature': stSign(ev) + ',v1=00ff,v0=legacy' });
    assert(r.s === 200 && (await GB('/api/billing')).j.balance_cents === gb0 + 2500, 'checkout.session.completed + paid → 2,500 credits (any matching v1 accepted)');
    await hook('/webhooks/stripe/' + st.id, ev, { 'stripe-signature': stSign(ev) });
    assert((await GB('/api/billing')).j.balance_cents === gb0 + 2500, 'Stripe webhook replay credits only once');
    r = await post(GB, '/api/billing/topup', { method_id: st.id, usd: 12 }); const ref4 = r.j.reference, sid4 = 'cs_test_' + M.st.length;
    r = await GB('/api/billing/verify?ref=' + ref4); assert(r.j.status === 'pending', 'verify before paying: still pending');
    M.paid[sid4] = true;
    r = await GB('/api/billing/verify?ref=' + ref4); assert(r.j.status === 'paid' && (await GB('/api/billing')).j.balance_cents === gb0 + 3700, 'Stripe verify on return (session retrieve) credits once');

    // ---------- promo codes still work through /topup ----------
    await post(ADM, '/api/admin/promos', { code: 'EXTRA10', bonus_pct: 10 });
    r = await post(GB, '/api/billing/topup', { method_id: st.id, usd: 10, promo: 'EXTRA10' });
    assert(r.s === 200 && r.j.promo && r.j.promo.code === 'EXTRA10', 'promo code accepted on a gateway top-up');

    // ---------- crypto_manual ----------
    r = await post(ADM, '/api/admin/pay-methods', { type: 'crypto_manual', name: 'USDC (Polygon)', currency: 'USDC', config: { network: 'Polygon', address: '' } });
    assert(r.s === 400 && /wallet address/.test(r.j.error), 'crypto method needs an address when on');
    r = await post(ADM, '/api/admin/pay-methods', { type: 'crypto_manual', name: 'USDC (Polygon)', currency: 'USDC', config: { network: 'Polygon', address: '0x1111222233334444555566667777888899990000' }, explorer: 'https://polygonscan.com/tx/{tx}', countries: { mode: 'except', list: ['NG'] }, logo: 'crypto' });
    const cid = r.j.id;
    assert(r.s === 200 && /^m_/.test(cid) && r.j.methods.find((x) => x.id === cid).type === 'crypto_manual', 'admin adds a crypto_manual method');
    r = await post(GB, '/api/billing/topup', { method_id: cid, usd: 30 });
    assert(r.s === 200 && r.j.manual && r.j.address === '0x1111222233334444555566667777888899990000' && r.j.network === 'Polygon' && r.j.currency === 'USDC' && +r.j.pay_amount > 30 && +r.j.pay_amount < 31, 'crypto_manual top-up: exact amount, address, network');
    r = await post(GB, '/api/billing/deposit', { provider: 'manual', reference: r.j.reference, tx: 'ab'.repeat(32) });
    assert(r.s === 200 && r.j.pending, 'customer submits the TXID → pending for admin approval');
    assert(!(await NG('/api/billing/methods')).j.methods.some((x) => x.id === cid), 'country rules apply to manual methods too');

    // ---------- manual with account fields ----------
    r = await post(ADM, '/api/admin/pay-methods', { type: 'manual', name: 'Bank transfer', currency: 'USD', config: { fields: [{ label: 'Account name', value: 'Zedapex Ltd' }, { label: 'IBAN', value: 'GB00TEST0000000000' }] }, countries: { mode: 'only', list: ['GB'] } });
    const bid = r.j.id; let bm = (await GB('/api/billing/methods')).j.methods.find((x) => x.id === bid);
    assert(r.s === 200 && bm && bm.fields.length === 2 && bm.fields[1].value === 'GB00TEST0000000000', 'manual method: label/value account fields reach the customer');
    assert(!(await FR('/api/billing/methods')).j.methods.some((x) => x.id === bid), '“Only GB” hidden from others');

    // ---------- second gateway of the same type is allowed ----------
    r = await post(ADM, '/api/admin/pay-methods', { type: 'paystack', name: 'Paystack Ghana', currency: 'GHS', fx_rate: 15, countries: { mode: 'only', list: ['GH'] }, config: { secret_key: PS_KEY } });
    assert(r.s === 200 && r.j.id !== 'm_paystack' && r.j.methods.find((x) => x.id === r.j.id).webhook_url.endsWith('/webhooks/paystack/' + r.j.id), 'a second Paystack method (another currency) gets its own webhook URL');

    // ---------- logos ----------
    r = await post(ADM, `/api/admin/pay-methods/${bid}/logo`, { data: PNG });
    assert(r.s === 200 && /^\/media\/paylogos\/m_\w+\.png\?v=\d+$/.test(r.j.logo), 'logo upload → /media/paylogos/<file>');
    let lr = await fetch(B + r.j.logo); assert(lr.status === 200 && lr.headers.get('content-type') === 'image/png', 'uploaded logo is served');
    lr = await fetch(B + '/media/paylogos/stripe.svg'); assert(lr.status === 200 && /svg/.test(lr.headers.get('content-type')), 'built-in logos are served');
    assert((await fetch(B + '/media/paylogos/../server.js')).status === 404, 'no path tricks');
    r = await post(ADM, `/api/admin/pay-methods/${bid}/logo`, { data: 'data:image/png;base64,AAAA' }); assert(r.s === 400, 'non-image upload refused');
    r = await post(ADM, `/api/admin/pay-methods/${bid}/logo`, { builtin: 'bank' }); assert(r.j.methods.find((x) => x.id === bid).logo_url === '/media/paylogos/bank.svg', 'switch back to a built-in logo');

    // ---------- admin: users by country, filters, overview, broadcast ----------
    r = await ADM('/api/admin/users?country=NG');
    assert(r.j.users.length === 1 && r.j.users[0].email === 'ada@x.com' && r.j.users[0].country_flag === '🇳🇬' && r.j.countries.some((c) => c.code === 'GB' && c.n === 2), 'admin users: ?country= filter, flag per row, counts per country');
    r = await ADM('/api/admin/overview');
    assert(r.j.users_by_country[0].code === 'GB' && r.j.users_by_country[0].users === 2 && r.j.users_by_country[0].flag === '🇬🇧' && r.j.users_by_country.length <= 8, 'overview: users by country (top 8, flags)');
    const pbm = r.j.paid_by_method;
    assert(pbm.find((x) => x.id === 'm_paystack').cents === 3000 && pbm.find((x) => x.id === st.id).cents === 3700, 'overview: paid-in by method');
    r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { countries: ['NG', 'FR', 'XX'] } });
    assert(r.j.count === 2, 'broadcast reach: country multi-select');
    r = await post(ADM, '/api/admin/broadcasts', { title: 'Hello Nigeria team', body: 'Only for one country.', audience: { countries: ['NG'] } });
    assert((await NG('/api/inbox')).j.items.some((x) => x.title === 'Hello Nigeria team') && !(await GB('/api/inbox')).j.items.some((x) => x.title === 'Hello Nigeria team'), 'broadcast reaches only the chosen countries');

    // ---------- Integrations & API keys ----------
    r = await ADM('/api/admin/settings'); assert(r.j.keys && r.j.keys.resend_set === false && r.j.keys.anthropic_set === false, 'settings: keys card state');
    r = await put(ADM, '/api/admin/settings', { keys: { anthropic_key: 'sk-ant-test-abcdefghijkl9876' } });
    assert(r.s === 200 && r.j.settings.keys.anthropic_key.endsWith('9876') && r.j.settings.keys.anthropic_key.includes('••••') && !JSON.stringify(r.j).includes('abcdefghijkl9876') && r.j.settings.joe.has_key, 'Anthropic key saved from admin, masked, used by Joe');
    r = await put(ADM, '/api/admin/settings', { keys: { anthropic_key: r.j.settings.keys.anthropic_key } }); assert(r.j.settings.keys.anthropic_set, 'masked value sent back keeps the key');
    r = await put(ADM, '/api/admin/settings', { keys: { resend_key: 're_test_1234567890' } });
    assert(r.j.settings.keys.resend_set && r.j.settings.emails.email_on === true && (await ADM('/api/me')).j.email_on === true, 'Resend key from admin overrides the env (email turns on)');
    r = await put(ADM, '/api/admin/settings', { keys: { resend_key: null, anthropic_key: null } });
    assert(!r.j.settings.keys.resend_set && !r.j.settings.emails.email_on, 'clearing the key falls back to the env');

    // ---------- toggles + delete ----------
    r = await patch(ADM, '/api/admin/pay-methods/m_paystack', { enabled: false });
    assert(!(await NG('/api/billing/methods')).j.methods.some((x) => x.id === 'm_paystack'), 'switched off → hidden from customers');
    r = await del(ADM, `/api/admin/pay-methods/${bid}`); assert(!r.j.methods.some((x) => x.id === bid), 'delete a method');
    assert((await post(GB, '/api/admin/pay-methods', { type: 'manual', name: 'x' })).s === 403, 'customers can’t manage payment methods');

    // ---------- admin page ----------
    const html = await (await fetch(B + '/admin')).text();
    assert(html.includes('Integrations &amp; API keys') || html.includes('Integrations & API keys'), 'admin page has the Integrations & API keys card');
    assert(html.includes('Find a setting'), 'admin page has the settings search');
    assert(html.includes('#5b3df5') && html.includes('#7c5cff'), 'demo bar is violet');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  mock.close();
})();
