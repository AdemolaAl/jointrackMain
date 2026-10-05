// Round 11: plan limits for channels + bots (402, locked channels, unlock, remove), named invite links (click IDs in Telegram),
// joins rows (click_code, link_name, match keys), Left split (new vs older members), showcase config, Gatevoo + custom gateway payments,
// VooSquare native OAuth login, affiliate capture (?aff= → account → events), support bridge both ways + HQ endpoints, /affiliates, forgot password.
// Runs its own fake Gatevoo / custom gateway / VooSquare on :4700.
const B = 'http://localhost:3999';
const fs = require('fs'), http = require('http'), crypto = require('crypto');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client(extra = {}) {
  const jar = { ...extra };
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'user-agent': 'Mozilla/5.0 (iPhone) Test', ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b, h) => f(p, { method: 'POST', body: JSON.stringify(b || {}), headers: h || {} });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const CS = 'cs_native_secret', API_KEY = 'voo_api_key_r11';

// ---------- fake Gatevoo + VooSquare (native OAuth, events, support) ----------
const M = { invoices: {}, events: [], eventAuth: [], support: [], tokenBody: null, authorizeQ: null, badSig: false };
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'application/json');
    const J = (s, o) => { res.statusCode = s; res.end(JSON.stringify(o)); };
    // Gatevoo
    if (u.pathname === '/api/v1/invoices' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer gv_live_testkey') return J(401, { error: { message: 'bad key' } });
      const j = JSON.parse(b); const id = 'inv_' + (Object.keys(M.invoices).length + 1);
      M.invoices[id] = { id, status: 'pending', amount_usd: j.amount_usd, order_id: j.order_id, metadata: j.metadata, idem: req.headers['idempotency-key'] };
      return J(201, { id, status: 'pending', checkout_url: 'https://gatevoo.test/pay/' + id });
    }
    let m;
    if ((m = /^\/api\/v1\/invoices\/(inv_\d+)$/.exec(u.pathname))) { const inv = M.invoices[m[1]]; return inv ? J(200, { ...inv, txid: 'TX' + m[1] }) : J(404, { error: { message: 'nope' } }); }
    // VooSquare native OAuth
    if (u.pathname === '/.well-known/openid-configuration') return J(404, {});
    if (u.pathname === '/oauth/authorize') { M.authorizeQ = Object.fromEntries(u.searchParams); return J(200, {}); }
    if (u.pathname === '/oauth/token' && req.method === 'POST') {
      const f = new URLSearchParams(b); M.tokenBody = Object.fromEntries(f);
      if (f.get('client_secret') !== CS || f.get('code') !== 'good-code') return J(400, { error: 'invalid_grant' });
      const user = { voo_id: 'vs_native_1', email: 'native@x.com', name: 'Nat Ive', country: 'KE', voo_ref: 'REFX' };
      const h = b64u({ alg: 'HS256', typ: 'JWT' }), p = b64u({ sub: user.voo_id, aud: 'joinvoo-native', iss: 'http://localhost:4700', exp: Math.floor(Date.now() / 1000) + 300, email: user.email });
      const sig = crypto.createHmac('sha256', M.badSig ? 'wrong' : CS).update(h + '.' + p).digest('base64url');
      return J(200, { access_token: 'at_1', token_type: 'Bearer', id_token: `${h}.${p}.${sig}`, user });
    }
    if (u.pathname === '/oauth/userinfo') return J(200, { voo_id: 'vs_native_1', email: 'native@x.com' });
    if (u.pathname === '/api/v1/events') { M.eventAuth.push(req.headers.authorization); M.events.push(...(JSON.parse(b).events || [])); return J(200, { ok: true }); }
    if (u.pathname === '/api/v1/support/messages') { M.support.push({ auth: req.headers.authorization, ...JSON.parse(b) }); return J(200, { ok: true, ticket_id: 77 }); }
    J(404, {});
  });
});

(async () => {
  await new Promise((r) => srv.listen(4700, r));
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });

    // ---------- affiliate capture ----------
    const U = client();
    let r = await U('/?aff=AFF123&sub1=s9');
    assert(r.s === 302 && r.h.get('location') === '/' && U.jar.jv_aff && /AFF123/.test(decodeURIComponent(U.jar.jv_aff)) && r.h.get('cache-control') === 'no-store', 'affiliate link: cookie set, clean address, never cached');
    r = await U('/?aff=OTHER');
    assert(/AFF123/.test(decodeURIComponent(U.jar.jv_aff)), 'first affiliate keeps the visitor');
    const A2 = client(); r = await A2('/a/SHORT1');
    assert(r.s === 302 && /SHORT1/.test(decodeURIComponent(A2.jar.jv_aff || '')), 'short affiliate link /a/CODE');
    r = await U('/affiliates');
    assert(r.s === 200 && /affiliate\.voosquare\.com/.test(r.t) && /50%/.test(r.t), '/affiliates page is served');
    await post(U, '/api/signup', { country: 'NG', email: 'cust@x.com', password: 'password1', name: 'Mia' });

    // ---------- limits: bots ----------
    const tok = (n) => `70000000${n}0:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx${n}`;
    const bots = [];
    for (let i = 1; i <= 3; i++) { r = await post(U, '/api/bots', { token: tok(i) }); bots.push(r.j.bot); }
    assert(bots.every((b) => b && b.id), 'three bots connect on Basic');
    r = await post(U, '/api/bots', { token: tok(4) });
    assert(r.s === 402 && r.j.limit && r.j.limit.kind === 'bots' && r.j.limit.used === 3 && r.j.limit.max === 3 && /3 of 3 bots/.test(r.j.error), '4th bot → 402 with the limit');
    r = await post(U, '/api/bots', { token: tok(1) });
    assert(r.s === 200, 'reconnecting a bot you already have is never blocked');
    let st = await ms();
    const hook1 = `/tg/${bots[0].id}`;
    // the mock keeps the last webhook secret; read each bot's secret from setWebhook calls instead
    const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token };
    assert(new URL(st.webhook.url).pathname === hook1, 'last webhook is bot 1 (re-connected)');
    const BOT1 = 7000000010;
    const addCh = (id, title) => post(U, hook1, { update_id: Math.abs(id), my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT1 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT1 } } } }, H);
    for (const [id, t] of [[-1001, 'One'], [-1002, 'Two'], [-1003, 'Three'], [-1004, 'Four']]) await addCh(id, t);
    let ch = (await U('/api/channels')).j;
    const four = ch.channels.find((c) => c.title === 'Four');
    assert(ch.limits && ch.limits.plan === 'basic' && ch.limits.channels.used === 3 && ch.limits.channels.max === 3 && ch.limits.bots.used === 3, 'GET /api/channels has limits (3 of 3)');
    assert(four && four.locked === true && ch.channels.filter((c) => c.locked).length === 1, '4th channel added in Telegram arrives locked');
    assert(ch.bots.find((b) => b.id === bots[0].id).channels === 4, 'bots show how many channels use them');
    r = await post(U, '/api/bot-targets', { bot_id: bots[1].id });
    assert(r.s === 402 && r.j.limit.kind === 'channels', 'bot-subscriber tracking over the limit → 402');
    r = await post(U, '/api/bot-targets/external', { username: 'my_store_bot' });
    assert(r.s === 402 && r.j.limit.kind === 'channels', 'token-free bot tracking over the limit → 402');
    r = await U('/c/' + new URL(four.tracking_url).pathname.split('/').pop() + '/go', { method: 'POST', body: JSON.stringify({ url: 'https://x.com/?fbclid=AA' }), headers: { cookie: 'jv_h=1' } });
    assert(r.s === 200 && !/t\.me\/\+L/.test(r.j.url || ''), 'locked channel does not hand out tracked links');
    const one = ch.channels.find((c) => c.title === 'One');
    r = await U('/api/channels/' + one.id, { method: 'DELETE' });
    ch = (await U('/api/channels')).j;
    assert(r.s === 200 && !ch.channels.some((c) => c.id === one.id), 'removed channel disappears from the list');
    assert(ch.channels.find((c) => c.title === 'Four').locked === false && ch.limits.channels.used === 3, 'locked channel unlocks by itself once there is room');
    await put(ADM, '/api/admin/settings', { limits: { basic: { channels: 0 } } });
    r = await post(U, '/api/bot-targets', { bot_id: bots[1].id });
    assert(r.s === 200, 'admin sets Basic channels to 0 (unlimited) → allowed');
    let as = (await ADM('/api/admin/settings')).j;
    assert(as.limits.basic.channels === 0 && as.limits.basic.bots === 3 && as.limits.pro.channels === 0, 'admin reads limits back (partial update keeps the rest)');
    r = await put(ADM, '/api/admin/settings', { limits: { basic: { bots: -1 } } }); assert(r.s === 400, 'bad limit refused');
    await put(ADM, '/api/admin/settings', { limits: { basic: { channels: 3 } } });

    // ---------- named invite links + joins detail ----------
    await sleep(1500);
    const two = (await U('/api/channels')).j.channels.find((c) => c.title === 'Two');
    assert(two.pool > 0, 'pool filled for an active channel (' + two.pool + ')');
    const slug = new URL(two.tracking_url).pathname;
    const go = await fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'cf-ipcountry': 'NG' }, body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwAR1&utm_campaign=c1', fbp: 'fb.1.1700000000000.123' }) }).then((x) => x.json());
    assert(/t\.me\/\+L/.test(go.url), 'ad click gets a single-use invite link');
    await sleep(1600);
    st = await ms();
    const ed = (st.edits || []).find((e) => e.invite_link === go.url);
    assert(ed && /^Meta · c-[0-9a-z]{5,}/.test(ed.name) && ed.member_limit === 1 && ed.name.length <= 32, 'invite link renamed in Telegram: ' + (ed && ed.name));
    await post(U, hook1, { update_id: 900, chat_member: { chat: { id: -1002, title: 'Two', type: 'channel' }, from: { id: 555 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 555 } }, new_chat_member: { status: 'member', user: { id: 555, first_name: 'Noah' } }, invite_link: { invite_link: go.url, creator: { id: BOT1 }, member_limit: 1 } } }, H);
    const d = new Date().toISOString().slice(0, 10);
    let rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows;
    const jr = rows.find((x) => x.tg_user_id === 555);
    assert(jr && /^c-[0-9a-z]{5,}$/.test(jr.click_code) && jr.link_name === ed.name && jr.match && jr.match.fbc && jr.match.fbp && jr.match.ip && jr.match.ua, 'join row: click_code, link_name, match keys sent to Meta');
    r = (await U(`/api/joins?from=${d}&to=${d}&tz=0&q=${jr.click_code}`)).j;
    assert(r.rows.length === 1 && r.rows[0].tg_user_id === 555, 'People search finds someone by click ID');
    // Left: one tracked person leaves + one older member leaves
    await post(U, hook1, { update_id: 901, chat_member: { chat: { id: -1002, type: 'channel' }, from: { id: 555 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'member', user: { id: 555 } }, new_chat_member: { status: 'left', user: { id: 555, first_name: 'Noah' } } } }, H);
    await post(U, hook1, { update_id: 902, chat_member: { chat: { id: -1002, type: 'channel' }, from: { id: 777 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'member', user: { id: 777 } }, new_chat_member: { status: 'left', user: { id: 777, first_name: 'Old' } } } }, H);
    const T = (await U(`/api/stats?from=${d}&to=${d}&tz=0`)).j.totals;
    assert(T.leaves === 2 && T.leaves_new === 1 && T.leaves_old === 1, `Left split: ${T.leaves_new} new + ${T.leaves_old} older`);

    // ---------- showcase ----------
    const cfg = await fetch(B + '/api/config').then((x) => x.json());
    const ids = cfg.showcase.cards.map((c) => c.id);
    assert(cfg.showcase.enabled && ids[0] === 'affiliate' && ids[1] === 'spyvoo' && ids.includes('gatevoo') && cfg.showcase.affiliate.url === 'https://affiliate.voosquare.com', 'showcase: affiliate first, then Spyvoo… ' + ids.join(','));
    const gv = cfg.showcase.cards.find((c) => c.id === 'gatevoo'), sp = cfg.showcase.cards.find((c) => c.id === 'spyvoo');
    assert(gv.status === 'soon' && gv.cta === 'Join the waitlist' && /^https:\/\/gatevoo\.com/.test(gv.url) && /^https:\/\/spyvoo\.com/.test(sp.url) && sp.logo_url === '/media/applogos/spyvoo.svg', 'Gatevoo = waitlist, Spyvoo live with its logo');
    assert(cfg.apps.find((a) => a.id === 'advoo').name === 'Vooads', 'Advoo shows as Vooads');

    // ---------- Gatevoo ----------
    let pm = (await ADM('/api/admin/pay-methods')).j;
    const gm = pm.methods.find((x) => x.type === 'gatevoo');
    assert(gm && !gm.live && gm.logo_url === '/media/paylogos/gatevoo.svg' && gm.webhook_url === B + '/webhooks/gatevoo/gatevoo' && gm.label === 'USDT or Bitcoin', 'Gatevoo method seeded, switched off until keys are added');
    r = await ADM('/api/admin/pay-methods/gatevoo', { method: 'PATCH', body: JSON.stringify({ enabled: true, config: { base_url: 'http://localhost:4700', secret_key: 'gv_live_testkey', webhook_secret: 'gvwh_secret' } }) });
    assert(r.s === 200, 'admin adds Gatevoo keys');
    pm = (await ADM('/api/admin/pay-methods')).j;
    assert(pm.methods.find((x) => x.id === 'gatevoo').config.secret_key.startsWith('••••') && pm.methods.find((x) => x.id === 'gatevoo').live, 'keys masked, method live');
    let bill = (await U('/api/billing')).j;
    const gpub = bill.pay_methods.find((x) => x.id === 'gatevoo');
    assert(gpub && gpub.brand === 'gatevoo' && gpub.hosted && gpub.description === 'Secure crypto checkout by Gatevoo', 'customer sees Gatevoo (brand, hosted)');
    const bal0 = bill.balance_cents;
    r = await post(U, '/api/billing/topup', { method_id: 'gatevoo', usd: 20 });
    assert(r.s === 200 && r.j.url === 'https://gatevoo.test/pay/inv_1' && r.j.reference, 'top-up opens the Gatevoo checkout');
    const gref = r.j.reference;
    assert(M.invoices.inv_1.amount_usd === 20 && M.invoices.inv_1.order_id === gref && M.invoices.inv_1.idem === gref, 'invoice created with amount, order_id and idempotency key');
    const gsend = async (body, { secret = 'gvwh_secret', ts = Math.floor(Date.now() / 1000), style = 'split' } = {}) => {
      const raw = JSON.stringify(body), sig = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
      const h = style === 'split' ? { 'x-gatevoo-timestamp': String(ts), 'x-gatevoo-signature': sig, 'x-gatevoo-event': body.type } : { 'x-gatevoo-signature': `t=${ts},v1=${sig}` };
      return fetch(B + '/webhooks/gatevoo/gatevoo', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: raw }).then((x) => x.status);
    };
    const ev = { id: 'evt_1', type: 'invoice.paid', data: { id: 'inv_1', status: 'paid', amount_usd: 20, order_id: gref } };
    assert(await gsend(ev, { secret: 'wrong' }) === 401 && await gsend(ev, { ts: Math.floor(Date.now() / 1000) - 900 }) === 401, 'bad or old Gatevoo signature → 401');
    assert(await gsend(ev) === 200 && (await U('/api/billing')).j.balance_cents === bal0, 'webhook says paid but Gatevoo says pending → not credited (re-checked with Gatevoo)');
    M.invoices.inv_1.status = 'paid';
    assert(await gsend(ev, { style: 'v1' }) === 200, 'webhook with t=,v1= signature accepted');
    bill = (await U('/api/billing')).j;
    assert(bill.balance_cents === bal0 + 2000, 'Gatevoo payment credited once confirmed (' + (bill.balance_cents - bal0) + ')');
    await gsend(ev); await gsend(ev);
    assert((await U('/api/billing')).j.balance_cents === bal0 + 2000, 'repeated webhooks never credit twice');
    r = await post(U, '/api/billing/topup', { method_id: 'gatevoo', usd: 30 });
    M.invoices.inv_2.status = 'paid'; M.invoices.inv_2.amount_usd = 10; // underpaid
    await gsend({ type: 'invoice.paid', data: { id: 'inv_2', status: 'paid', order_id: r.j.reference } });
    assert((await U('/api/billing')).j.balance_cents === bal0 + 2000, 'underpaid invoice is not credited');

    // ---------- custom gateway ----------
    r = await post(ADM, '/api/admin/pay-methods', { type: 'custom', label: 'MyPay', note: 'Cards and wallets via MyPay', currency: 'USD', enabled: true, config: { checkout_url: 'https://pay.example.com/c?amount={amount}&ref={reference}&email={email}&back={return_url}' } });
    assert(r.s === 400 && /webhook secret/i.test(r.j.error), 'custom gateway needs a webhook secret');
    r = await post(ADM, '/api/admin/pay-methods', { type: 'custom', label: 'MyPay', note: 'Cards and wallets via MyPay', currency: 'USD', enabled: true, config: { checkout_url: 'http://pay.example.com/c', webhook_secret: 'cw' } });
    assert(r.s === 400, 'custom checkout link must be https');
    r = await post(ADM, '/api/admin/pay-methods', { type: 'custom', label: 'MyPay', note: 'Cards and wallets via MyPay', currency: 'USD', enabled: true, config: { checkout_url: 'https://pay.example.com/c?amount={amount}&ref={reference}&email={email}&back={return_url}', webhook_secret: 'cust_wh' } });
    assert(r.s === 200 && r.j.id, 'admin adds a custom gateway');
    const cid = r.j.id;
    const cm = (await ADM('/api/admin/pay-methods')).j.methods.find((x) => x.id === cid);
    assert(cm.live && cm.webhook_url === `${B}/webhooks/custom/${cid}` && cm.config.webhook_secret.startsWith('••••'), 'custom gateway live, webhook URL shown, secret masked');
    r = await post(U, '/api/billing/topup', { method_id: cid, usd: 15 }); if (!r.j.url) console.log('topup custom', r.s, JSON.stringify(r.j));
    const cu = new URL(r.j.url);
    assert(cu.host === 'pay.example.com' && cu.searchParams.get('amount') === '15.00' && cu.searchParams.get('ref') === r.j.reference && cu.searchParams.get('email') === 'cust@x.com', 'checkout link filled in: ' + r.j.url.slice(0, 80));
    const cref = r.j.reference, bal1 = (await U('/api/billing')).j.balance_cents;
    const csend = (body, secret = 'cust_wh') => { const raw = JSON.stringify(body); return fetch(`${B}/webhooks/custom/${cid}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': crypto.createHmac('sha256', secret).update(raw).digest('hex') }, body: raw }).then((x) => x.status); };
    assert(await csend({ reference: cref, amount: '15.00', currency: 'USD', status: 'paid', txid: 'c1' }, 'nope') === 401, 'custom webhook with a bad signature → 401');
    await csend({ reference: cref, amount: '5.00', currency: 'USD', status: 'paid', txid: 'c1' });
    assert((await U('/api/billing')).j.balance_cents === bal1, 'custom: smaller amount not credited');
    await csend({ reference: cref, amount: '15.00', currency: 'USD', status: 'pending' });
    assert((await U('/api/billing')).j.balance_cents === bal1, 'custom: pending not credited');
    await csend({ reference: cref, amount: '15.00', currency: 'USD', status: 'paid', txid: 'c1' });
    await csend({ reference: cref, amount: '15.00', currency: 'USD', status: 'paid', txid: 'c1' });
    assert((await U('/api/billing')).j.balance_cents === bal1 + 1500, 'custom: paid credited once');

    // ---------- VooSquare: accounts without a Voo ID send no events (VooSquare can only credit a Voo ID) ----------
    await sleep(900);
    assert(!M.events.some((e) => !e.voo_id), 'no events for accounts that are not linked to VooSquare (the affiliate customer signed up with a password)');

    // ---------- VooSquare native OAuth login ----------
    const N = client({ jv_aff: encodeURIComponent('AFF123|s9') });
    r = await N('/auth/voosquare?return_to=/app&signup=1');
    const loc = new URL(r.h.get('location') || 'http://x');
    assert(r.s === 302 && loc.origin === 'http://localhost:4700' && loc.pathname === '/oauth/authorize' && loc.searchParams.get('client_id') === 'joinvoo-native' && loc.searchParams.get('prompt') === 'signup' && loc.searchParams.get('ref') === 'AFF123', 'VooSquare login (no discovery doc) → /oauth/authorize with signup + affiliate code');
    const state = loc.searchParams.get('state');
    r = await N(`/auth/voosquare/callback?code=bad-code&state=${state}`);
    assert(r.s === 302 && /voo_error=token/.test(r.h.get('location')), 'bad code → back to login with an error');
    r = await N('/auth/voosquare?return_to=/app'); let st2 = new URL(r.h.get('location')).searchParams.get('state');
    M.badSig = true; r = await N(`/auth/voosquare/callback?code=good-code&state=${st2}`); M.badSig = false;
    assert(/voo_error=token/.test(r.h.get('location') || ''), 'id_token signed with the wrong secret is refused');
    r = await N('/auth/voosquare?return_to=/app'); st2 = new URL(r.h.get('location')).searchParams.get('state');
    r = await N(`/auth/voosquare/callback?code=good-code&state=${st2}`);
    assert(r.s === 302 && r.h.get('location') === '/app' && N.jar.jp_session && M.tokenBody.client_secret === CS && M.tokenBody.grant_type === 'authorization_code', 'native login: code exchanged with the client secret, signed in');
    const me = (await N('/api/me')).j;
    assert(me.email === 'native@x.com' && me.voo && me.voo.linked, 'new account created from the VooSquare user (linked)');
    // events of a linked member: Bearer API key, value_usd, never personal data
    const nid = (await ADM('/api/admin/users?q=native@x.com')).j.users[0].id;
    await post(ADM, `/api/admin/users/${nid}/credits`, { credits: 20000, reason: 'test' });
    await post(N, '/api/billing/plan', { plan: 'pro' });
    for (let i = 0; i < 30 && !M.events.some((e) => e.type === 'plan_started'); i++) await sleep(150);
    const ps = M.events.find((e) => e.type === 'plan_started');
    assert(ps && ps.voo_id === 'vs_native_1' && ps.plan && ps.value_usd > 0 && /^jv_plan_\d+$/.test(ps.event_id) && M.eventAuth.every((a) => a === 'Bearer ' + API_KEY), 'linked member: plan_started (plan, price) sent with Authorization: Bearer <VOO_API_KEY> to <VooSquare>/api/v1/events');
    assert(!M.events.some((e) => e.type === 'spend'), 'a plan paid with gift credits is not money: no spend');
    r = await N('/logout');
    assert(/^http:\/\/localhost:4700\/oauth\/logout\?redirect_uri=/.test(r.h.get('location') || ''), 'logout also signs out of VooSquare');
    // local sign-up still works while VooSquare login is on (mode both)
    r = await post(client(), '/api/signup', { country: 'GB', email: 'plain@x.com', password: 'password1' });
    assert(r.s === 200, 'email + password sign-up still works next to VooSquare');

    // ---------- support bridge ----------
    r = await post(U, '/api/support', { body: 'My pixel is not firing' });
    assert(r.s === 200, 'customer writes to support');
    await sleep(800);
    const sm = M.support.find((x) => x.body === 'My pixel is not firing');
    assert(sm && sm.auth === 'Bearer ' + API_KEY && /^joinvoo-\d+$/.test(sm.external_ref) && sm.email === 'cust@x.com', 'chat copied to the VooSquare HQ inbox (external_ref ' + (sm && sm.external_ref) + ')');
    const whr = (body, key = API_KEY) => fetch(B + '/api/voosquare/support/webhook', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) }).then(async (x) => ({ s: x.status, j: await x.json() }));
    assert((await whr({ type: 'support.reply', external_ref: sm.external_ref, body: 'x' }, 'wrong')).s === 401, 'support webhook needs the API key');
    const reply = { type: 'support.reply', ticket_id: 77, external_ref: sm.external_ref, email: 'cust@x.com', body: 'Hi Mia, check the token', agent: 'Ada', created_at: new Date().toISOString() };
    r = await whr(reply); await whr(reply);
    const sup = (await U('/api/support')).j;
    const hq = sup.messages.filter((x) => x.from_admin && x.body === 'Hi Mia, check the token');
    assert(r.s === 200 && hq.length === 1 && hq[0].agent.name === 'Ada' && hq[0].agent.voosquare, 'reply from VooSquare shows in the customer’s chat once, with the agent');
    { const wk = (body, key = API_KEY) => fetch(B + '/hooks/voosquare/support', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) }).then((x) => x.status);
      assert(await wk({ ...reply, body: 'x' }, 'wrong') === 401, 'kit webhook /hooks/voosquare/support needs the API key');
      assert(await wk({ ...reply, body: 'Second answer from HQ', created_at: new Date(Date.now() + 1000).toISOString() }) === 200 && (await U('/api/support')).j.messages.some((x) => x.body === 'Second answer from HQ'), 'kit webhook /hooks/voosquare/support delivers the reply into the chat'); }
    const vauth = { authorization: 'Bearer ' + API_KEY };
    let tl = await fetch(B + '/api/voosquare/support/tickets', { headers: vauth }).then((x) => x.json());
    const tref = 'jv-' + sm.external_ref.split('-')[1];
    assert(tl.tickets.some((t) => t.ref === tref && t.status === 'open'), 'HQ lists Joinvoo tickets');
    let td = await fetch(B + '/api/voosquare/support/tickets/' + tref, { headers: vauth }).then((x) => x.json());
    assert(td.messages.length === 3 && td.messages[0].from === 'customer' && td.messages[1].agent === 'Ada', 'HQ reads one ticket with its messages');
    await fetch(B + `/api/voosquare/support/tickets/${tref}/reply`, { method: 'POST', headers: { ...vauth, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Fixed on our side', agent: 'Bola' }) });
    await fetch(B + `/api/voosquare/support/tickets/${tref}/update`, { method: 'POST', headers: { ...vauth, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'solved' }) });
    td = await fetch(B + '/api/voosquare/support/tickets/' + tref, { headers: vauth }).then((x) => x.json());
    assert(td.messages.length === 4 && td.ticket.status === 'solved', 'HQ replies and solves the ticket');
    assert((await fetch(B + '/api/voosquare/support/tickets', { headers: { authorization: 'Bearer no' } })).status === 401, 'HQ endpoints need the API key');
    const adm = (await ADM('/api/admin/support?status=closed')).j.tickets.find((t) => t.id === +sm.external_ref.split('-')[1]);
    assert(adm && adm.source === 'voosquare', 'admin support list marks the ticket as answered in VooSquare');
    as = (await ADM('/api/admin/settings')).j;
    if (!as.voo.support_out || !as.voo.api_key) console.log('voo card', JSON.stringify(as.voo));
    assert(as.voo.api_key.includes('•') && !as.voo.api_key.includes('key_r11') && as.voo.support_bridge === true && as.voo.support_webhook_url === B + '/hooks/voosquare/support' && as.voo.affiliate_url === 'https://affiliate.voosquare.com' && as.voo.support_out.sent >= 1, 'admin VooSquare card: API key masked, bridge on, webhook URL, affiliate link, bridge stats');

    // ---------- QA fixes: existing customers over the limit keep their channels; disconnect/reconnect can't bypass the limit ----------
    r = await fetch(B + '/?via=fb', { redirect: 'manual' }); assert(r.status === 200, '?via= is not an affiliate code (no redirect, no cookie)');
    const V = client(); await post(V, '/api/signup', { country: 'GB', email: 'grand@x.com', password: 'password1' });
    await put(ADM, '/api/admin/settings', { limits: { basic: { channels: 0 } } });
    r = await post(V, '/api/bots', { token: '7100000010:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxxV' }); const vb = r.j.bot;
    let vs = await ms(); const VH = { 'x-telegram-bot-api-secret-token': vs.webhook.secret_token }, vhook = '/tg/' + vb.id, VB = 7100000010;
    const vAdd = (id, status = 'administrator') => post(V, vhook, { update_id: 5000 + Math.abs(id) + (status === 'left' ? 50 : 0) + Math.floor(Math.random() * 1e6), my_chat_member: { chat: { id, title: 'G' + Math.abs(id), type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: VB } }, new_chat_member: { status, can_invite_users: true, user: { id: VB } } } }, VH);
    for (const id of [-2001, -2002, -2003, -2004, -2005]) await vAdd(id);
    await put(ADM, '/api/admin/settings', { limits: { basic: { channels: 3 } } });
    let vc = (await V('/api/channels')).j;
    assert(vc.channels.length === 5 && vc.channels.every((c) => !c.locked && c.status === 'active'), 'customer who already had 5 channels keeps all 5 tracking when the limit is 3');
    await vAdd(-2005, 'left'); await vAdd(-2005);
    vc = (await V('/api/channels')).j;
    assert(vc.channels.find((c) => c.title === 'G2005').locked === false && vc.channels.find((c) => c.title === 'G2005').status === 'active', 'bot removed and re-added (fixing rights) → channel keeps its slot, not locked');
    r = await V('/api/bots/' + vb.id, { method: 'DELETE' });
    vc = (await V('/api/channels')).j;
    assert(r.s === 200 && vc.channels.length === 0 && vc.limits.channels.used === 0, 'disconnecting the bot removes its channels from the list');
    r = await post(V, '/api/bots', { token: '7100000010:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxxV' });
    vc = (await V('/api/channels')).j;
    assert(r.s === 200 && vc.limits.channels.used === 3 && vc.channels.filter((c) => c.locked).length === 2, 'reconnecting it brings channels back within the limit (3 tracking, 2 locked) — no bypass');

    // ---------- forgot password ----------
    r = await post(client(), '/api/forgot', { email: 'cust@x.com' });
    assert(r.s === 200 && r.j.no_email && /chat/.test(r.j.message), 'forgot password without an email provider: honest message pointing to the chat (link still created)');
    r = await post(client(), '/api/forgot', { email: 'nobody@x.com' });
    assert(r.s === 200, 'unknown email: same answer (no account leak)');
    await sleep(100);
    const rt = [...logTxt().matchAll(/to cust@x\.com .*?\/app\?reset=([\w-]+)/g)].pop();
    assert(rt, 'reset email contains /app?reset=<token>');
    const R = client();
    r = await post(R, '/api/reset', { token: rt[1], password: 'short' }); assert(r.s === 400, 'too-short new password refused');
    r = await post(R, '/api/reset', { token: rt[1], password: 'brandnew123' });
    assert(r.s === 200 && R.jar.jp_session, 'reset sets the new password and signs in');
    r = await post(R, '/api/reset', { token: rt[1], password: 'again12345' }); assert(r.s === 400, 'reset link works only once');
    r = await post(client(), '/api/login', { email: 'cust@x.com', password: 'brandnew123' }); assert(r.s === 200, 'log in with the new password');
    r = await post(client(), '/api/login', { email: 'cust@x.com', password: 'password1' }); assert(r.s !== 200, 'old password no longer works');
    r = await fetch(B + '/login?reset=abc', { redirect: 'manual' }).then((x) => x.text());
    assert(/reset/.test(r), 'login page forwards ?reset= links to the dashboard reset form');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  srv.close();
})();
