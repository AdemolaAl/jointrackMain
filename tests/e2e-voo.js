// Round 11: VooSquare login (OIDC + PKCE against tests/oidcmock.js on :4400), one-time account linking, token checks,
// safe return_to, login modes, logout via end_session, the summary API, the signed events outbox, referrals mode,
// the Zedapex apps catalog (+ clicks, admin edits, sister compatibility) and the admin VooSquare card.
// The runner turns VooSquare on for this suite only (VOO_* env); by default everything here is off.
const B = 'http://localhost:3999';
const fs = require('fs'), crypto = require('crypto');
const { start } = require('./oidcmock');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(p.startsWith('http') ? p : B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v === '') delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = v; }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t, h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
async function verify(email) { await sleep(120); const m = [...logTxt().matchAll(new RegExp(`to ${email.replace(/[.@]/g, '\\$&')} .*?(/verify\\?t=[\\w.-]+)`, 'g'))].pop(); await fetch(B + m[1], { redirect: 'manual' }); }
const MOCK = start(4400), SK = 'svc_test_key_123', WH = 'whsec_voo_test_456';

/** Full browser-style login: Joinvoo → mock authorize → callback. Returns the client, the final redirect and the error code. */
async function vooLogin(claims, { returnTo = '/app#credits', f = client(), breakState = false, dropCookie = false } = {}) {
  MOCK.M.next = claims;
  let r = await f('/auth/voosquare?return_to=' + encodeURIComponent(returnTo));
  if (r.s !== 302) return { f, s: r.s, loc: r.h.get('location') };
  const auth = r.h.get('location');
  r = await fetch(auth, { redirect: 'manual' });
  let cb = r.headers.get('location'); if (breakState) cb = cb.replace(/state=[^&]+/, 'state=wrong');
  if (dropCookie) delete f.jar.jv_oidc;
  r = await f(cb.replace('http://localhost:3999', ''));
  const loc = r.h.get('location') || '';
  return { f, s: r.s, loc, auth, err: (/voo_error=(\w+)/.exec(loc) || [])[1] || null, session: !!f.jar.jp_session };
}

(async () => {
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
    await verify('admin@x.com');

    // ---------- config: no secrets, login mode ----------
    let c = (await client()('/api/config')).j;
    assert(c.voo && c.voo.login === 'both' && c.voo.home === 'https://voosquare.test' && c.voo.hub.name === 'VooSquare' && c.voo.hub.logo_url === '/media/applogos/voosquare.svg', '/api/config: voo {login, home, hub}');
    const cj = JSON.stringify(c);
    assert(![SK, WH, 'cs_test_secret'].some((x) => cj.includes(x)), '/api/config has no VooSquare secrets');

    // ---------- start: PKCE + state/nonce cookie ----------
    let f = client(), r = await f('/auth/voosquare?return_to=/app');
    const au = new URL(r.h.get('location'));
    assert(r.s === 302 && au.origin === MOCK.base && au.pathname === '/authorize' && au.searchParams.get('code_challenge_method') === 'S256' && au.searchParams.get('code_challenge').length === 43
      && au.searchParams.get('scope') === 'openid email profile' && au.searchParams.get('state') && au.searchParams.get('nonce') && au.searchParams.get('redirect_uri') === B + '/auth/voosquare/callback', 'GET /auth/voosquare → authorize with PKCE S256, state, nonce, scope');
    const ck = r.h.getSetCookie().find((x) => x.startsWith('jv_oidc='));
    assert(ck && /HttpOnly/.test(ck) && /Max-Age=600/.test(ck) && /Path=\/auth\/voosquare/.test(ck) && !ck.includes(au.searchParams.get('nonce')), 'state/nonce/verifier in a short-lived signed HttpOnly cookie');

    // ---------- new user from claims ----------
    let L = await vooLogin({ sub: 'voo_u_1', email: 'New@X.com', name: 'Lina', country: 'br', voo_ref: 'vref_abc' });
    assert(L.s === 302 && L.loc === '/app#credits' && L.session && !L.err, 'callback: code exchanged, token verified, session set, back to return_to');
    const tc = MOCK.M.tokenCalls.at(-1);
    assert(tc.client_secret === 'cs_test_secret' && tc.code_verifier && tc.grant_type === 'authorization_code', 'token request: client_secret_post + PKCE verifier');
    let me = (await L.f('/api/me')).j;
    assert(me.email === 'new@x.com' && me.country === 'BR' && me.verified && me.voo.linked === true, 'new user created from claims (email, country, verified)');
    const linaId = (await ADM('/api/admin/users?q=new@x.com')).j.users[0].id;
    let ud = (await ADM('/api/admin/users/' + linaId)).j.user;
    assert(ud.voo_id === 'voo_u_1' && ud.referred_by_voo === 'vref_abc', 'voo_id and voo_ref (referred_by_voo) stored');
    L = await vooLogin({ sub: 'voo_u_1', email: 'new@x.com' });
    assert(L.session && (await ADM('/api/admin/users?q=new@x.com')).j.users.length === 1, 'second login finds the same user by voo_id');

    // ---------- one-time link of an existing verified account ----------
    const OLD = client(); await post(OLD, '/api/signup', { country: 'GB', email: 'old@x.com', password: 'password1', name: 'Olu' }); await verify('old@x.com');
    L = await vooLogin({ sub: 'voo_u_2', email: 'old@x.com', email_verified: false });
    assert(L.err === 'link' && !L.session, 'no link when VooSquare hasn’t verified the email');
    const UNV = client(); await post(UNV, '/api/signup', { country: 'GB', email: 'unv@x.com', password: 'password1' });
    L = await vooLogin({ sub: 'voo_u_3', email: 'unv@x.com' }); assert(L.err === 'link', 'no link when the local account never confirmed its email');
    L = await vooLogin({ sub: 'voo_u_2', email: 'old@x.com' });
    me = (await L.f('/api/me')).j;
    assert(L.session && me.email === 'old@x.com' && me.voo.linked, 'existing verified account linked once (same account, same data)');
    const ib = (await L.f('/api/inbox')).j.items;
    assert(ib.some((x) => /VooSquare/.test(x.title)), 'inbox note: “Your account is now linked to VooSquare”');
    L = await vooLogin({ sub: 'voo_u_9', email: 'old@x.com' }); assert(L.err === 'link', 'an already-linked account can’t be linked to a second VooSquare id');
    assert((await post(client(), '/api/login', { email: 'old@x.com', password: 'password1' })).s === 200, 'linked users can still use their password (mode both)');

    // ---------- token checks ----------
    for (const [t, name] of [[{ nonce: 'other' }, 'nonce'], [{ aud: 'someone-else' }, 'aud'], [{ iss: 'https://evil.example' }, 'iss'], [{ sig: true }, 'signature'], [{ expired: true }, 'expiry']]) {
      L = await vooLogin({ sub: 'voo_bad_' + name, email: `bad_${name}@x.com`, tamper: t });
      assert(L.err === 'token' && !L.session, `bad ${name} → refused`);
    }
    L = await vooLogin({ sub: 'voo_s', email: 's@x.com' }, { breakState: true }); assert(L.err === 'state' && !L.session, 'state mismatch → refused');
    L = await vooLogin({ sub: 'voo_s', email: 's@x.com' }, { dropCookie: true }); assert(L.err === 'expired' && !L.session, 'missing state cookie → refused');
    assert((await ADM('/api/admin/users?q=bad_')).j.users.length === 0, 'no account created from a rejected token');

    // ---------- return_to ----------
    for (const bad of ['//evil.com/x', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/app:evil']) {
      L = await vooLogin({ sub: 'voo_u_1', email: 'new@x.com' }, { returnTo: bad });
      assert(L.session && L.loc === '/app', `unsafe return_to ${JSON.stringify(bad)} → /app`);
    }

    // ---------- logout → end_session ----------
    L = await vooLogin({ sub: 'voo_u_1', email: 'new@x.com' });
    r = await post(L.f, '/api/logout', {});
    assert(r.s === 200 && r.j.logout_url && r.j.logout_url.startsWith(MOCK.base + '/logout?') && r.j.logout_url.includes('post_logout_redirect_uri=' + encodeURIComponent(B)) && /id_token_hint=/.test(r.j.logout_url), 'POST /api/logout of a VooSquare session → logout_url at end_session (with id_token_hint)');
    assert((await L.f('/api/me')).s === 401, 'session is gone');
    L = await vooLogin({ sub: 'voo_u_1', email: 'new@x.com' });
    r = await L.f('/logout'); assert(r.s === 302 && r.h.get('location').startsWith(MOCK.base + '/logout'), 'GET /logout → redirect to end_session');
    r = await post(OLD, '/api/logout', {}); assert(r.j.logout_url === null, 'a password session just logs out locally');

    // ---------- mode only ----------
    r = await put(ADM, '/api/admin/settings', { voo: { login_mode: 'only' } }); assert(r.s === 200, 'admin switches to VooSquare-only');
    assert((await client()('/api/config')).j.voo.login === 'only', '/api/config: login only');
    r = await post(client(), '/api/login', { email: 'old@x.com', password: 'password1' }); assert(r.s === 403 && r.j.voo_only && r.j.url === '/auth/voosquare', 'customer password login → 403 voo_only');
    r = await post(client(), '/api/signup', { country: 'GB', email: 'fresh@x.com', password: 'password1' }); assert(r.s === 403 && r.j.voo_only, 'password sign-up closed in only mode');
    r = await post(client(), '/api/login', { email: 'admin@x.com', password: 'password1' }); assert(r.s === 200, 'staff can still log in with a password (break-glass /login?local=1)');
    assert((await client()('/login?local=1')).s === 200, '/login?local=1 page loads');
    L = await vooLogin({ sub: 'voo_u_2', email: 'old@x.com' }); assert(L.session, 'VooSquare login works in only mode');
    await put(ADM, '/api/admin/settings', { voo: { login_mode: 'both' } });

    // ---------- summary API ----------
    const S = (q, key = SK) => fetch(`${B}/api/voosquare/summary${q}`, { headers: key ? { authorization: 'Bearer ' + key } : {} }).then(async (x) => ({ s: x.status, j: await x.json() }));
    assert((await S('?voo_id=voo_u_2', null)).s === 401 && (await S('?voo_id=voo_u_2', 'wrong')).s === 401, 'summary: 401 without the service key');
    r = await S('?voo_id=nobody'); assert(r.s === 200 && r.j.linked === false && r.j.tool === 'joinvoo', 'summary: unknown voo_id → 200 {linked:false}');
    // data for old@x.com: FTD + registration postbacks, ad spend
    await post(OLD, '/api/login', { email: 'old@x.com', password: 'password1' });
    const pbUrl = (await OLD('/api/conversions')).j.postback_url;
    await fetch(`${pbUrl}?sub1=777000111&status=reg&first_name=Customer`);
    await fetch(`${pbUrl}?sub1=777000111&status=ftd&payout=120&txid=t1`);
    await fetch(`${pbUrl}?sub1=777000222&status=ftd&payout=80&txid=t2`);
    await fetch(`${pbUrl}?sub1=777000222&status=ftd&payout=80&txid=t2`); // duplicate
    await post(OLD, '/api/spend', { date: new Date().toISOString().slice(0, 10), platform: 'meta', amount: 50 });
    const t0 = Date.now(); r = await S('?voo_id=voo_u_2&period=7d'); const ms = Date.now() - t0;
    const mt = Object.fromEntries((r.j.metrics || []).map((x) => [x.key, x]));
    assert(r.s === 200 && r.j.tool === 'joinvoo' && r.j.linked && r.j.period === '7d' && r.j.open_url === B + '/app' && ['active', 'trial', 'paused', 'none'].includes(r.j.status), 'summary: tool, linked, status, period, open_url');
    assert(['joins', 'ftds', 'revenue_usd', 'cost_per_ftd_usd', 'bots_blocked'].every((k) => mt[k] && 'change_pct' in mt[k] && mt[k].label && mt[k].unit), 'summary: the five metrics with label, unit, change_pct');
    assert(mt.ftds.value === 2 && mt.revenue_usd.value === 200 && mt.revenue_usd.unit === 'usd' && mt.cost_per_ftd_usd.value === 25 && mt.ftds.change_pct === null, 'summary: values (2 FTDs, $200, $25 per FTD; change_pct null when the previous period was 0)');
    assert(ms < 800, `summary answers in ${ms} ms`);
    r = await S('?voo_id=voo_u_1&period=30d'); assert(r.j.metrics.find((x) => x.key === 'cost_per_ftd_usd').value === null && r.j.status === 'none', 'no spend → cost per FTD null; no channels → status none');

    // ---------- events outbox ----------
    await post(ADM, `/api/admin/users/${(await ADM('/api/admin/users?q=old@x.com')).j.users[0].id}/credits`, { credits: 20000, reason: 'test' });
    await post(OLD, '/api/billing/plan', { plan: 'pro' });
    for (let i = 0; i < 30 && !MOCK.M.events.length; i++) await sleep(200);
    await sleep(800);
    const evs = MOCK.M.events.flatMap((e) => JSON.parse(e.raw).events);
    const firstRaw = MOCK.M.events[0];
    assert(firstRaw && firstRaw.sig === crypto.createHmac('sha256', WH).update(firstRaw.raw).digest('hex'), 'events POST signed: X-Voo-Signature = HMAC-SHA256(raw body)');
    assert(MOCK.M.events.every((e) => Array.isArray(JSON.parse(e.raw).events) && JSON.parse(e.raw).events.length <= 100), 'events sent in batches {"events":[…]} of up to 100');
    const types = new Set(evs.map((e) => e.type));
    assert(['registration', 'ftd', 'plan_started', 'spend'].every((t) => types.has(t)), `event types sent: ${[...types].join(', ')}`);
    const ftdE = evs.filter((e) => e.type === 'ftd');
    assert(ftdE.length === 2 && new Set(evs.map((e) => e.event_id)).size === evs.length && evs.filter((e) => e.type !== 'signup').every((e) => /^jv_/.test(e.event_id) && e.voo_id === 'voo_u_2' && e.tool === 'joinvoo' && e.occurred_at) && evs.every((e) => e.voo_id && e.tool === 'joinvoo'), 'stable unique event_ids (duplicate postback → no second event)');
    assert(ftdE.some((e) => e.value === 120 && e.currency === 'USD'), 'deposit events carry the amount');
    const allRaw = MOCK.M.events.map((e) => e.raw).join('');
    assert(!/777000111|777000222|Customer|old@x\.com|new@x\.com/.test(allRaw), 'no end-customer personal data (Telegram ids, names, emails) in events');
    assert(!evs.some((e) => e.voo_id === 'voo_u_1' && e.type === 'ftd'), 'only events of the linked user');
    // retry with backoff
    MOCK.M.fail = true; const before = MOCK.M.events.length;
    await fetch(`${pbUrl}?sub1=777000333&status=ftd&payout=10&txid=t3`);
    for (let i = 0; i < 20 && MOCK.M.events.length === before; i++) await sleep(150);
    let hh = (await ADM('/api/admin/health')).j.voo_outbox;
    assert(hh.pending >= 1 && /HTTP 500/.test(hh.last_error) && hh.enabled, 'receiver down → event stays in the outbox, Health shows backlog + last error');
    MOCK.M.fail = false;
    for (let i = 0; i < 40 && (await ADM('/api/admin/health')).j.voo_outbox.pending; i++) await sleep(200);
    hh = (await ADM('/api/admin/health')).j.voo_outbox;
    const t3 = MOCK.M.events.flatMap((e) => JSON.parse(e.raw).events).filter((e) => e.type === 'ftd' && e.value === 10);
    assert(hh.pending === 0 && t3.length >= 2, 'retried with backoff and delivered when the receiver is back (same event_id each time)');
    assert(new Set(t3.map((e) => e.event_id)).size === 1, 'retries reuse the same event_id');

    // ---------- referrals mode ----------
    assert((await OLD('/api/referrals')).j.mode === 'local', 'referrals: local by default');
    await put(ADM, '/api/admin/settings', { voo: { referrals: 'voosquare' } });
    r = (await OLD('/api/referrals')).j;
    assert(r.mode === 'voosquare' && r.voo_home === 'https://voosquare.test' && 'balance_cents' in r, 'referrals mode voosquare: Earn shows VooSquare, balances stay');
    assert((await client()('/api/config')).j.voo.referrals === 'voosquare' && (await OLD('/api/me')).j.voo.referrals === 'voosquare', 'mode on /api/config and /api/me');
    await put(ADM, '/api/admin/settings', { voo: { referrals: 'local' } });

    // ---------- admin VooSquare card ----------
    let as = (await ADM('/api/admin/settings')).j.voo;
    assert(as.issuer === MOCK.base && as.client_secret.includes('••••') && !JSON.stringify(as).includes('cs_test_secret') && !JSON.stringify(as).includes(SK) && as.callback_url === B + '/auth/voosquare/callback', 'admin settings: VooSquare card data, secrets masked, callback URL');
    r = await post(ADM, '/api/admin/voo/test', {}); assert(r.j.ok && /1 signing key/.test(r.j.message) && r.j.endpoints.end_session, 'Test discovery: discovery + JWKS OK');
    await post(ADM, '/api/admin/staff', { email: 'mk@x.com', role: 'marketing' }); await sleep(120);
    const tok = [...logTxt().matchAll(/to mk@x\.com .*?\/app\?reset=([\w-]+)/g)].pop()[1]; const MK = client(); await post(MK, '/api/reset', { token: tok, password: 'password1' });
    assert((await post(MK, '/api/admin/voo/test', {})).s === 403 && (await put(MK, '/api/admin/settings', { voo: { login_mode: 'off' } })).s === 403, 'Test discovery and VooSquare settings need keys.manage');
    r = await put(ADM, '/api/admin/settings', { voo: { issuer: 'http://localhost:4499' } });
    r = await post(ADM, '/api/admin/voo/test', {}); assert(r.j.ok === false && r.j.error, 'Test discovery reports an unreachable issuer');
    await put(ADM, '/api/admin/settings', { voo: { issuer: MOCK.base } });
    r = await put(ADM, '/api/admin/settings', { voo: { login_mode: 'sometimes' } }); assert(r.s === 400, 'bad login mode refused');

    // ---------- Zedapex apps ----------
    c = (await client()('/api/config')).j;
    assert(c.apps.map((a) => a.id).join() === 'replyvoo,castvoo,spyvoo,advoo,affleego,landvoo,gatevoo', 'apps: seeded catalog in order, without Joinvoo and the VooSquare hub');
    const rv = c.apps[0], lv = c.apps.find((a) => a.id === 'landvoo');
    assert(rv.url === 'https://replyvoo.com?utm_source=joinvoo&utm_medium=dashboard&utm_campaign=apps&utm_content=dashboard' && rv.color === '#ffc21a' && rv.ink === 'dark' && rv.offer === '30 free chats a month' && rv.logo_url === '/media/applogos/replyvoo.svg' && rv.headline && rv.tagline, 'apps: brand colours, offer, logo, UTM link');
    assert(lv.status === 'soon' && lv.badge === 'Coming soon' && lv.url === 'https://voosquare.test', 'coming-soon app links to the VooSquare waitlist');
    assert(!c.apps.some((a) => 'enabled' in a || 'utm' in a), 'no internal fields in the public list');
    assert(c.sister && c.sister.name === 'Replyvoo' && c.sister.enabled, 'sister still returned for older dashboards');
    for (const id of ['replyvoo', 'castvoo', 'advoo', 'affleego', 'landvoo', 'voosquare']) { const x = await fetch(`${B}/media/applogos/${id}.svg`); assert(x.status === 200 && /svg/.test(x.headers.get('content-type')), `built-in logo ${id}.svg`); }
    r = await post(client(), '/api/apps/click', { id: 'castvoo', where: 'overview' });
    assert(r.s === 200 && r.j.url.endsWith('utm_content=overview'), 'POST /api/apps/click → link with utm_content=<where>');
    assert((await post(client(), '/api/apps/click', { id: 'nope' })).s === 404, 'unknown app click → 404');
    for (let i = 0; i < 35; i++) await post(client(), '/api/apps/click', { id: 'advoo' });
    as = (await ADM('/api/admin/settings')).j;
    assert(as.apps.find((a) => a.id === 'castvoo').clicks === 1 && as.apps.find((a) => a.id === 'advoo').clicks === 30, 'admin sees clicks per app (rate-limited)');
    const edit = as.apps.map(({ logo_url, url_out, clicks, ...a }) => a);
    const ai = edit.findIndex((a) => a.id === 'advoo'); const ed2 = [edit[ai], edit[0], ...edit.filter((_, i) => i !== 0 && i !== ai)].map((a) => (a.id === 'affleego' ? { ...a, enabled: false } : a.id === 'advoo' ? { ...a, offer: '3 ads free', color: 'red' } : a));
    r = await put(ADM, '/api/admin/settings', { apps: ed2 });
    c = (await client()('/api/config')).j;
    assert(r.s === 200 && c.apps[0].id === 'advoo' && c.apps[0].offer === '3 ads free' && c.apps[0].color === '#5b3df5' && !c.apps.some((a) => a.id === 'affleego'), 'admin reorders, edits, disables (bad colour falls back)');
    r = await put(ADM, '/api/admin/settings', { apps: [...ed2, { name: 'Nolink', status: 'live' }] }); assert(r.s === 400 && /link/.test(r.j.error), 'a live app needs a link');
    r = await put(ADM, '/api/admin/settings', { apps: [...ed2, { name: 'Pagevoo', url: 'https://pagevoo.example', color: '#112233', status: 'live' }] });
    assert(r.s === 200 && (await client()('/api/config')).j.apps.some((a) => a.id === 'pagevoo'), 'add a new app');
    r = await put(MK, '/api/admin/settings', { apps: ed2 }); assert(r.s === 200, 'Marketing can edit the apps');
    r = await post(MK, '/api/admin/apps/logo', { id: 'pagevoo', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' });
    assert(r.s === 200 && /^\/media\/applogos\/pagevoo\.png\?v=\d+$/.test(r.j.logo) && (await fetch(B + r.j.logo)).status === 200, 'upload an app logo');
    const rvOff = ed2.map((a) => (a.id === 'replyvoo' ? { ...a, enabled: false } : a));
    await put(ADM, '/api/admin/settings', { apps: rvOff });
    assert((await client()('/api/config')).j.sister.enabled === false, 'switching Replyvoo off in the catalog also hides the old sister card');
    await put(ADM, '/api/admin/settings', { features: { sister_promo: false } });
    c = (await client()('/api/config')).j; assert(c.apps.length === 0 && (await post(client(), '/api/apps/click', { id: 'castvoo' })).s === 404, 'features.sister_promo off → no apps anywhere');
    await put(ADM, '/api/admin/settings', { features: { sister_promo: true }, apps: null });
    assert((await client()('/api/config')).j.apps.length === 7, 'apps:null → back to the seeded catalog');

    const html = await (await fetch(B + '/admin')).text();
    assert(html.includes('Zedapex apps') && html.includes('Test discovery') && html.includes('VooSquare'), 'admin page: Zedapex apps editor + VooSquare card');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  MOCK.close();
})();
