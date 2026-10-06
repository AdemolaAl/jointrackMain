// Round 16: customer link domains (go.theirbrand.com: add, validate, plan limit, TXT/CNAME check, Cloudflare for SaaS, host routing,
// per-channel domain, removal with the account/channel), the redirect script for customers' own landing pages (/r/<slug>.js, CORS,
// signed human token, allowed sites, source=snippet, Meta event_source_url) and bot /start pings (match, duplicates, blocked, stats).
// Runs a fake Cloudflare API on :4800; DNS answers come from tests/.run/dns.json (DOMAIN_DNS_MOCK).
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'user-agent': 'Mozilla/5.0 (iPhone) Test', ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG), DNS = path.join(RUN, 'dns.json');
const dns = { TXT: {}, CNAME: {}, A: {}, AAAA: {} };
const saveDns = () => fs.writeFileSync(DNS, JSON.stringify(dns));
const d = new Date().toISOString().slice(0, 10);
/** A request with any Host header (fetch can't set Host). */
function hreq(host, p, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const rq = http.request({ host: '127.0.0.1', port: 3999, path: p, method, headers: { host, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) [FBAN/FBIOS]', ...headers } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* text */ } resolve({ s: res.statusCode, h: res.headers, t, j }); });
    });
    rq.on('error', reject); if (body) rq.write(typeof body === 'string' ? body : JSON.stringify(body)); rq.end();
  });
}

// ---------- fake Cloudflare for SaaS ----------
const CF = { hosts: {}, created: [], deleted: [], fail: false, auth: [] }; let cfn = 0;
const cf = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'application/json'); CF.auth.push(req.headers.authorization);
    const J = (s, o) => { res.statusCode = s; res.end(JSON.stringify(o)); };
    const m = /^\/client\/v4\/zones\/([a-f0-9]{32})\/custom_hostnames(?:\/([\w-]+))?$/.exec(u.pathname);
    if (!m) return J(404, { success: false, errors: [{ message: 'no route' }] });
    if (req.method === 'POST') {
      if (CF.fail) return J(400, { success: false, errors: [{ code: 1406, message: 'Zone not set up for SaaS' }] });
      const j = JSON.parse(b), id = 'cfh_' + (++cfn); CF.created.push(j); CF.hosts[id] = { id, hostname: j.hostname, ssl: { status: 'pending_validation', method: j.ssl.method, type: j.ssl.type }, status: 'pending' };
      return J(200, { success: true, result: CF.hosts[id] });
    }
    if (req.method === 'GET' && m[2]) return CF.hosts[m[2]] ? J(200, { success: true, result: CF.hosts[m[2]] }) : J(404, { success: false, errors: [{ message: 'not found' }] });
    if (req.method === 'GET') return J(200, { success: true, result: Object.values(CF.hosts).filter((h) => h.hostname === u.searchParams.get('hostname')) });
    if (req.method === 'DELETE') { CF.deleted.push(m[2]); const had = !!CF.hosts[m[2]]; delete CF.hosts[m[2]]; return had ? J(200, { success: true, result: { id: m[2] } }) : J(404, { success: false }); }
    J(405, {});
  });
});

(async () => {
  await new Promise((r) => cf.listen(4800, r));
  saveDns();
  try {
    // ---------- accounts ----------
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    let r = await put(ADM, '/api/admin/settings', { domains: { cname_target: 'Customers.GoJoinly.com' } });
    assert(r.s === 200 && r.j.settings.domains.cname_target === 'customers.gojoinly.com' && r.j.settings.domains.cf_on === false, 'admin sets the CNAME target (normalised), Cloudflare off');
    r = await put(ADM, '/api/admin/settings', { domains: { cname_target: 'not a host!' } }); assert(r.s === 400, 'bad CNAME target refused');
    r = await put(ADM, '/api/admin/settings', { domains: { cf_zone_id: 'xyz' } }); assert(r.s === 400, 'bad Cloudflare zone id refused');

    const U = client(), P = client();
    await post(U, '/api/signup', { country: 'NG', email: 'u16@x.com', password: 'password1', name: 'Ugo' });
    await post(P, '/api/signup', { country: 'KE', email: 'p16@x.com', password: 'password1', name: 'Pam' });
    const pid = (await ADM('/api/admin/users?q=p16')).j.users.find((x) => x.email === 'p16@x.com').id;
    r = await post(ADM, `/api/admin/users/${pid}/plan`, { plan: 'pro' }); assert(r.s === 200, 'P moved to Pro');

    // ---------- add + validate + limits ----------
    r = await U('/api/domains');
    assert(r.s === 200 && r.j.domains.length === 0 && r.j.limit.max === 1 && r.j.plan === 'basic' && r.j.target === 'customers.gojoinly.com', 'GET /api/domains: Basic allows 1, CNAME target shown');
    for (const [h, why] of [['', 'empty'], ['1.2.3.4', 'IP'], ['localhost', 'localhost'], ['brand.com', 'apex domain'], ['go.joinvoo.com', '*.joinvoo.com'], ['gojoinly.com', 'gojoinly.com'],
      ['x.customers.gojoinly.com', 'under the CNAME target'], ['bad_host!.com', 'invalid characters'], ['go.brand.local', '.local']]) {
      r = await post(U, '/api/domains', { host: h }); assert(r.s === 400 && r.j.error, `refused: ${why}`);
    }
    r = await post(U, '/api/domains', { host: 'https://GO.Brand-One.com:443/c/abc' });
    const ud = r.j.domain;
    assert(r.s === 200 && ud.host === 'go.brand-one.com' && ud.status === 'pending' && ud.dns.txt.name === '_joinvoo.go.brand-one.com' && /^joinvoo-verify=[a-f0-9]{24}$/.test(ud.dns.txt.value)
      && ud.dns.cname.value === 'customers.gojoinly.com' && ud.dns.cname.short === 'go' && ud.dns.txt.short === '_joinvoo.go', 'domain added (URL cleaned up), pending, with CNAME + TXT instructions');
    assert(/No TXT record/.test(ud.last_error || ''), 'first check: no TXT record yet (friendly message)');
    r = await post(U, '/api/domains', { host: 'go.brand-one.com' }); assert(r.s === 400 && /already added/.test(r.j.error), 'same domain twice refused');
    r = await post(U, '/api/domains', { host: 'links.brand-one.com' });
    assert(r.s === 402 && r.j.limit && r.j.limit.kind === 'domains' && r.j.limit.used === 1 && r.j.limit.max === 1 && /Upgrade to Pro/.test(r.j.error), 'Basic: 2nd domain → 402 with the upgrade prompt');
    r = await post(P, '/api/domains', { host: 'go.brand-one.com' }); assert(r.s === 400 && /another Joinvoo account/.test(r.j.error), 'a host claimed by another customer is refused');
    for (const h of ['lp.pro-two.com', 'go.pro-two.com', 't.pro-three.co.uk']) { r = await post(P, '/api/domains', { host: h }); assert(r.s === 200, `Pro: ${h} added (unlimited)`); }
    assert(r.j.limit.max === null && r.j.domains.length === 3 && r.j.domains.find((x) => x.host === 't.pro-three.co.uk').dns.cname.short === 't', 'Pro shows unlimited; co.uk short name is the subdomain');

    // ---------- verification (TXT = ownership, CNAME/A = pointing) ----------
    dns.TXT['_joinvoo.go.brand-one.com'] = [['joinvoo-verify=wrong']]; saveDns();
    r = await post(U, `/api/domains/${ud.id}/check`);
    assert(r.s === 200 && r.j.domain.status === 'failed' && /different value/.test(r.j.domain.last_error), 'wrong TXT value → failed with a clear reason');
    dns.TXT['_joinvoo.go.brand-one.com'] = [[ud.dns.txt.value]]; saveDns();
    r = await post(U, `/api/domains/${ud.id}/check`);
    assert(r.j.domain.status === 'active' && r.j.domain.pointing === false && r.j.domain.verified_at && r.j.domain.https === 'manual', 'TXT matches → active (ownership); CNAME reported separately: not pointing yet');
    dns.CNAME['go.brand-one.com'] = ['customers.gojoinly.com.']; saveDns();
    r = await post(U, `/api/domains/${ud.id}/check`); assert(r.j.domain.status === 'active' && r.j.domain.pointing === true, 'CNAME → target: pointing');
    r = await P(`/api/domains/${ud.id}/check`, { method: 'POST' }); assert(r.s === 404, 'another customer can’t check (or see) this domain');

    // admin list without Cloudflare: hosts needing manual setup
    r = await ADM('/api/admin/domains');
    let ad = r.j.domains.find((x) => x.host === 'go.brand-one.com');
    assert(r.s === 200 && ad && ad.email === 'u16@x.com' && ad.needs_setup === true && r.j.cf_on === false && r.j.domains.length === 4, 'admin sees customer domains with owner email; active + no provider = needs manual setup');

    // ---------- routing on the customer's host ----------
    await post(U, '/api/bots', { token: '7716000011:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxxR16' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    const tgPost = (u) => U(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    await tgPost({ update_id: 1, my_chat_member: { chat: { id: -1616, title: 'Brand Club', type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: 7716000011 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: 7716000011 } } } });
    let ch = (await U('/api/channels')).j.channels.find((c) => c.title === 'Brand Club');
    await patch(U, '/api/channels/' + ch.id, { pixel_id: '884210395527140', capi_token: 'EAAtest16' });
    for (let i = 0; i < 40 && !(await U('/api/channels')).j.channels.find((c) => c.id === ch.id).pool; i++) await sleep(250);
    let cv = await U('/api/channels'); ch = cv.j.channels.find((c) => c.id === ch.id);
    const slug = new URL(ch.tracking_url).pathname.split('/').pop();
    assert(ch.tracking_url === `https://go.brand-one.com/c/${slug}` && ch.snippet_src === `https://go.brand-one.com/r/${slug}.js` && ch.domain_id === null, 'tracking_url + script use the active custom domain by default');
    assert(cv.j.domains.length === 1 && cv.j.domains[0].host === 'go.brand-one.com' && cv.j.domain_target === 'customers.gojoinly.com', '/api/channels includes the customer’s domains');

    let h = await hreq('go.brand-one.com', '/c/' + slug);
    const jvh = [].concat(h.h['set-cookie'] || []).find((c) => /^jv_h=/.test(c)) || '';
    assert(h.s === 200 && /Opening Telegram|Join/.test(h.t) && jvh && !/domain=/i.test(jvh), 'own link opens on the custom host; jv_h cookie is host-only');
    h = await hreq('go.brand-one.com', '/');
    assert(h.s === 404 && /Not found/.test(h.t) && !/joinvoo/i.test(h.t), 'custom host root: neutral 404, no Joinvoo brand');
    for (const p of ['/app', '/login', '/api/me', '/admin', '/blog', '/c/nope123', '/hook/x/start', '/r/nope123.js']) { h = await hreq('go.brand-one.com', p); assert(h.s === 404 && !/joinvoo/i.test(h.t), `custom host ${p} → neutral 404`); }
    h = await hreq('go.brand-one.com', '/robots.txt'); assert(h.s === 200 && /Disallow: \//.test(h.t), 'custom host robots.txt disallows everything');
    h = await hreq('go.brand-one.com', '/health'); assert(h.s === 200 && h.j && h.j.ok, 'custom host /health works');
    // another customer's link through this domain
    const ext = await post(P, '/api/bot-targets/external', { username: 'pamshop16_bot' });
    const pch = (await P('/api/channels')).j.channels.find((c) => c.id === ext.j.channel);
    const pslug = new URL(pch.tracking_url).pathname.split('/').pop();
    h = await hreq('go.brand-one.com', '/c/' + pslug); assert(h.s === 404, 'another customer’s slug on this domain → 404 (no cross-customer use)');
    h = await hreq('go.brand-one.com', '/c/' + pslug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1' }, body: { url: 'x' } }); assert(h.s === 404, '…also for /go');
    h = await hreq('lp.pro-two.com', '/c/' + pslug); assert(h.s === 404, 'a pending (unverified) domain serves nothing');
    // old links keep working on Joinvoo's own domains
    r = await U('/c/' + slug); assert(r.s === 200, 'old link on the main domain still works');
    await put(ADM, '/api/admin/settings', { links: { domain: 'gojoinly.com' } });
    h = await hreq('gojoinly.com', '/c/' + slug); assert(h.s === 200, 'old link on the gojoinly.com link domain still works');
    h = await hreq('gojoinly.com', `/r/${slug}.js`); assert(h.s === 200 && /joinvoo/i.test(h.t), 'the landing-page script also works on the link domain');
    assert((await P('/api/channels')).j.channels[0].tracking_url.startsWith('https://gojoinly.com/c/'), 'customers without a domain keep the Joinvoo link domain');

    // click on the custom host → join → Meta (event_source_url = the host the click came on)
    h = await hreq('go.brand-one.com', `/c/${slug}/go`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'x-forwarded-for': '102.89.16.1' }, body: { url: `https://go.brand-one.com/c/${slug}?fbclid=DOMCLICK1&utm_campaign=Dom`, fbp: 'fb.1.1700000000000.111' } });
    assert(h.s === 200 && /t\.me\/\+L/.test(h.j.url), 'click on the custom host gets its own invite link');
    await tgPost({ update_id: 2, chat_member: { chat: { id: -1616, type: 'channel' }, from: { id: 1 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 16001 } }, new_chat_member: { status: 'member', user: { id: 16001, first_name: 'Ada' } }, invite_link: { invite_link: h.j.url, creator: { id: 7716000011 } } } });
    let rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows; let jr = rows.find((x) => x.tg_user_id === 16001);
    assert(jr && jr.click_id && jr.page_url.startsWith('https://go.brand-one.com/c/') && jr.params.utm_campaign === 'Dom', 'join matched to the click; page_url is the custom host');
    await sleep(2600);
    let ev = (await ms()).events.find((e) => (e.user_data.fbc || '').endsWith('.DOMCLICK1'));
    assert(ev && ev.event_source_url.startsWith('https://go.brand-one.com/c/' + slug), 'Meta event_source_url is the custom-domain link');

    // per-channel domain choice
    r = await patch(U, '/api/channels/' + ch.id, { domain_id: 0 });
    assert(r.s === 200 && r.j.domain_id === 0 && r.j.tracking_url === `https://gojoinly.com/c/${slug}`, 'channel set to “Joinvoo default” → link domain');
    const pdom = (await P('/api/domains')).j.domains[0];
    r = await patch(U, '/api/channels/' + ch.id, { domain_id: pdom.id }); assert(r.s === 400, 'can’t pick another customer’s domain');
    r = await patch(U, '/api/channels/' + ch.id, { domain_id: ud.id }); assert(r.s === 200 && r.j.tracking_url === `https://go.brand-one.com/c/${slug}`, 'channel set to its custom domain');
    r = await patch(U, '/api/channels/' + ch.id, { domain_id: null }); assert(r.s === 200 && r.j.domain_id === null && r.j.tracking_url.startsWith('https://go.brand-one.com/'), 'back to automatic');

    // ---------- landing-page script ----------
    h = await hreq('go.brand-one.com', `/r/${slug}.js?mode=button&sel=.join-btn`);
    const js = h.t, stTok = (/ST="([^"]+)"/.exec(js) || [])[1];
    assert(h.s === 200 && /javascript/.test(h.h['content-type']) && h.h['access-control-allow-origin'] === '*' && /max-age=60/.test(h.h['cache-control'] || ''), 'script served: JS content-type, CORS *, short cache');
    assert(js.includes(`"http://go.brand-one.com/c/${slug}/go"`) && stTok && /MODE="button"/.test(js) && /SEL="\.join-btn"/.test(js) && /FB="https:\/\/t\.me\//.test(js), 'script calls this host’s /go with a signed token, mode + selector from the URL, fallback inside');
    const ORI = 'https://lander.shop16.com';
    h = await hreq('go.brand-one.com', `/c/${slug}/go`, { method: 'OPTIONS', headers: { origin: ORI, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    assert(h.s === 204 && h.h['access-control-allow-origin'] === ORI && /POST/.test(h.h['access-control-allow-methods']) && /content-type/.test(h.h['access-control-allow-headers']), 'CORS preflight answered (origin reflected)');
    const stats0 = (await U(`/api/stats?from=${d}&to=${d}&tz=0`)).j.totals.suspect_clicks;
    const snip = (body, extra = {}) => hreq('go.brand-one.com', `/c/${slug}/go`, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8', origin: ORI, 'x-forwarded-for': '102.89.16.' + (10 + Math.floor(Math.random() * 200)), ...extra }, body });
    h = await snip({ fbp: 'fb.1.1700000000000.222', fbc: '', ttp: '', scid: '', url: `${ORI}/offer?fbclid=SNIP16A&utm_source=fb&utm_campaign=Snip&sub1=abc&gclid=G1`, ref: 'https://m.facebook.com/', src: 'snippet', st: stTok });
    assert(h.s === 200 && /t\.me\/\+L/.test(h.j.url) && h.h['access-control-allow-origin'] === ORI, 'cross-origin /go from the customer’s page → invite link, CORS header set');
    await tgPost({ update_id: 3, chat_member: { chat: { id: -1616, type: 'channel' }, from: { id: 1 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 16002 } }, new_chat_member: { status: 'member', user: { id: 16002, first_name: 'Bo' } }, invite_link: { invite_link: h.j.url, creator: { id: 7716000011 } } } });
    rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows; jr = rows.find((x) => x.tg_user_id === 16002);
    assert(jr && jr.click_id && jr.click_source === 'snippet' && jr.page_url.startsWith(ORI + '/offer') && jr.params.utm_campaign === 'Snip' && jr.params.sub1 === 'abc' && jr.params.gclid === 'G1' && /^fb\.1\.\d+\.SNIP16A$/.test(jr.fbc) && !jr.suspect,
      'snippet click recorded: source=snippet, page_url = their page, utm/sub/gclid kept, fbc built from fbclid, counted as a real visitor');
    let stats1 = (await U(`/api/stats?from=${d}&to=${d}&tz=0`)).j.totals.suspect_clicks;
    assert(stats1 === stats0, 'valid token: not flagged (same as a visitor on our own page)');
    await sleep(2600);
    ev = (await ms()).events.find((e) => (e.user_data.fbc || '').endsWith('.SNIP16A'));
    assert(ev && ev.event_source_url.startsWith(ORI + '/offer') && ev.user_data.fbp === 'fb.1.1700000000000.222', 'join sent to Meta with event_source_url = the customer’s landing page');
    h = await snip({ url: `${ORI}/?fbclid=SNIPBAD`, src: 'snippet', st: '1a2b.badbadbadbadbadb' });
    stats1 = (await U(`/api/stats?from=${d}&to=${d}&tz=0`)).j.totals.suspect_clicks;
    assert(h.s === 200 && h.j.url && stats1 === stats0 + 1, 'bad token: visitor still gets in, click flagged like a script on our own page (no_js)');
    h = await snip({ url: `${ORI}/?fbclid=SNIPNONE`, src: 'snippet' });
    assert(h.s === 200 && (await U(`/api/stats?from=${d}&to=${d}&tz=0`)).j.totals.suspect_clicks === stats0 + 2, 'missing token: flagged the same way');
    h = await snip({ url: `${ORI}/?fbclid=SNIPBOT`, src: 'snippet', st: stTok }, { 'user-agent': 'python-requests/2.31' });
    await tgPost({ update_id: 4, chat_member: { chat: { id: -1616, type: 'channel' }, from: { id: 1 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 16003 } }, new_chat_member: { status: 'member', user: { id: 16003, first_name: 'Cy' } }, invite_link: { invite_link: h.j.url, creator: { id: 7716000011 } } } });
    jr = (await U(`/api/joins?from=${d}&to=${d}&tz=0&type=filtered`)).j.rows.find((x) => x.tg_user_id === 16003);
    assert(jr && jr.suspect && jr.suspect_reason === 'fake_click', 'a bot with a valid token is still filtered (bot user agent)');
    // non-snippet cross-site posts are untouched (no CORS headers, as before)
    h = await hreq('go.brand-one.com', `/c/${slug}/go`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example.org' }, body: { url: 'x' } });
    assert(h.s === 200 && !h.h['access-control-allow-origin'], 'a cross-site POST without the script marker gets no CORS headers');
    // allowed sites
    r = await patch(U, '/api/channels/' + ch.id, { snip_origins: 'shop16.com\nhttps://www.other16.com/page' });
    assert(r.s === 200 && JSON.stringify(r.j.snip_origins) === '["shop16.com","www.other16.com"]', 'allowed websites saved (cleaned up)');
    r = await patch(U, '/api/channels/' + ch.id, { snip_origins: 'not a site' }); assert(r.s === 400, 'bad allowed website refused');
    h = await snip({ url: 'https://evil16.com/?fbclid=E', src: 'snippet', st: stTok }, { origin: 'https://evil16.com' });
    assert(h.s === 403 && h.h['access-control-allow-origin'] === 'https://evil16.com' && !h.j.url, 'a site not on the list → 403 (the script then uses the fallback link)');
    h = await hreq('go.brand-one.com', `/c/${slug}/go`, { method: 'OPTIONS', headers: { origin: 'https://evil16.com' } }); assert(h.s === 403 && !h.h['access-control-allow-origin'], 'preflight from a site not on the list → 403');
    h = await snip({ url: `${ORI}/?fbclid=OK2`, src: 'snippet', st: stTok }); assert(h.s === 200 && h.j.url, 'a subdomain of an allowed site works');
    await patch(U, '/api/channels/' + ch.id, { snip_origins: '' });
    assert((await U('/api/channels')).j.channels.find((c) => c.id === ch.id).snip_origins.length === 0, 'allowed websites cleared (any site again)');

    // the script itself in a fake browser: fires once, opens the link, falls back after 3 s
    const runJs = (code, fetchImpl, href = 'https://lander.shop16.com/?fbclid=VMX1&utm_source=fb') => {
      const listeners = []; const loc = { href, search: new URL(href).search };
      const win = { fetch: fetchImpl, location: loc, setTimeout, clearTimeout, document: { cookie: '_fbp=fb.1.1.99', referrer: '', addEventListener: (t, f) => listeners.push(f) } };
      win.window = win; vm.createContext(win); vm.runInContext(code, win); vm.runInContext(code, win); return { win, loc, listeners };
    };
    const calls = [];
    const fake = runJs(js.replace('MODE="button"', 'MODE="instant"'), (u, o) => { calls.push([u, o]); return Promise.resolve({ json: () => Promise.resolve({ url: 'https://t.me/+VMLINK' }) }); });
    await sleep(30);
    const sent = calls[0] && JSON.parse(calls[0][1].body);
    assert(calls.length === 1 && fake.loc.href === 'https://t.me/+VMLINK', 'script (loaded twice) calls /go once and opens the invite link');
    assert(sent && sent.src === 'snippet' && sent.st === stTok && /^fb\.1\.\d+\.VMX1$/.test(sent.fbc) && sent.fbp === 'fb.1.1.99' && sent.url.includes('utm_source=fb') && calls[0][1].mode === 'cors' && calls[0][1].credentials === 'omit',
      'same payload as our click page (fbp, fbc made from fbclid, url) + marker and token, CORS without cookies');
    assert(/_fbc=fb\.1\.\d+\.VMX1/.test(fake.win.document.cookie), 'creates the _fbc cookie on their page when missing');
    const btn = runJs(js, () => Promise.resolve({ json: () => Promise.resolve({ url: 'https://t.me/+BTN' }) }));
    await sleep(20); assert(btn.loc.href.startsWith('https://lander'), 'button mode waits for a tap');
    const el = { nodeType: 1, matches: (s) => s === '.join-btn', parentNode: null }; let prevented = false;
    btn.listeners[0]({ target: el, preventDefault: () => { prevented = true; } }); await sleep(20);
    assert(prevented && btn.loc.href === 'https://t.me/+BTN', 'tapping the selected button opens the invite link');
    const slow = runJs(js.replace('MODE="button"', 'MODE="instant"'), () => new Promise(() => {}));
    await sleep(3200);
    assert(/^https:\/\/t\.me\//.test(slow.loc.href) || slow.loc.href === (/FB="([^"]*)"/.exec(js) || [])[1], 'API silent for 3 s → goes to the fallback link');

    // ---------- bot /start ping ----------
    const xb = await post(U, '/api/bot-targets/external', { username: 'ugoshop16_bot' });
    let xch = (await U('/api/channels')).j.channels.find((c) => c.id === xb.j.channel);
    await patch(U, '/api/channels/' + xch.id, { pixel_id: '884210395527140', capi_token: 'EAAtest16b' });
    const xslug = new URL(xch.tracking_url).pathname.split('/').pop();
    const gx = await fetch(B + `/c/${xslug}/go`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.16.77' }, body: JSON.stringify({ url: `https://go.brand-one.com/c/${xslug}?fbclid=PING16&utm_campaign=Ping` }) }).then((x) => x.json());
    const code = new URL(gx.url).searchParams.get('start');
    assert(/^https:\/\/t\.me\/ugoshop16_bot\?start=/.test(gx.url) && code, 'bot link → deep link with the click code');
    const hk = new URL(xch.hook_start).pathname;
    r = await U(`${hk}?bot=ugoshop16_bot&tg_id=1000000001&start=test`); assert(r.j.ok && r.j.test, '“Send a test” ping works');
    xch = (await U('/api/channels')).j.channels.find((c) => c.id === xch.id);
    assert(xch.last_ping_at && xch.last_ping_test === true && xch.pings_today === 0, 'last ping shown (test), not counted in today’s pings');
    r = await U(`${hk}?bot=ugoshop16_bot&tg_id=16101&start=${code}&first_name=Pia`);
    assert(r.j.ok && r.j.from_ad === true && r.j.duplicate === false, 'ping with the payload from our link → matched to the exact click');
    r = await U(hk, { method: 'POST', body: JSON.stringify({ bot: 'ugoshop16_bot', message: { text: '/start ' + code }, from: { id: 16101, first_name: 'Pia' } }) });
    assert(r.j.ok && r.j.duplicate === true, 'same person pinged again (POST, /start text) → duplicate, not counted twice');
    rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows.filter((x) => x.tg_user_id === 16101);
    assert(rows.length === 1 && rows[0].click_id && rows[0].params.utm_campaign === 'Ping', 'one lead, with the ad click');
    await sleep(2600);
    assert((await ms()).events.filter((e) => (e.user_data.fbc || '').endsWith('.PING16')).length === 1, 'sent to Meta exactly once');
    r = await U(`${hk}?bot=ugoshop16_bot&tg_id=16102&start=${code}`);
    assert(r.j.ok && r.j.from_ad === false, 'someone else reusing the same code is not credited to that click again');
    xch = (await U('/api/channels')).j.channels.find((c) => c.id === xch.id);
    assert(xch.pings_today === 3 && xch.last_ping_test === false, 'pings today counted (3 real pings)');
    r = await U(`/hook/${hk.split('/')[2]}/blocked?bot=ugoshop16_bot&tg_id=16101`); assert(r.j.ok && r.j.left === true, 'blocked ping marks the lead as left');
    r = await U(`${hk}?bot=nobody16_bot&tg_id=1&start=x`); assert(r.s === 404, 'unknown bot → 404');

    // ---------- Cloudflare for SaaS ----------
    r = await put(ADM, '/api/admin/settings', { domains: { cf_zone_id: '0123456789abcdef0123456789abcdef', cf_token: 'cf_tok_16' } });
    assert(r.s === 200 && r.j.settings.domains.cf_on === true && !String(JSON.stringify(r.j.settings.domains)).includes('cf_tok_16'), 'Cloudflare set in admin (token masked)');
    const lp = (await P('/api/domains')).j.domains.find((x) => x.host === 'lp.pro-two.com');
    dns.TXT['_joinvoo.lp.pro-two.com'] = [[lp.dns.txt.value]]; dns.A['lp.pro-two.com'] = ['203.0.113.7']; dns.A['customers.gojoinly.com'] = ['203.0.113.7']; saveDns();
    CF.fail = true;
    r = await post(P, `/api/domains/${lp.id}/check`);
    assert(r.j.domain.status === 'pending' && /HTTPS setup/.test(r.j.domain.last_error) && r.j.domain.pointing === true, 'Cloudflare refuses → stays pending with the reason (A record match counts as pointing)');
    CF.fail = false;
    r = await post(P, `/api/domains/${lp.id}/check`);
    assert(r.j.domain.status === 'active' && r.j.domain.https === 'issuing' && CF.created.some((x) => x.hostname === 'lp.pro-two.com' && x.ssl.method === 'http' && x.ssl.type === 'dv') && CF.auth.includes('Bearer cf_tok_16'),
      'verified → custom hostname created on Cloudflare (http DV), HTTPS issuing');
    const cfid = Object.values(CF.hosts).find((x) => x.hostname === 'lp.pro-two.com').id; CF.hosts[cfid].ssl.status = 'active';
    r = await post(P, `/api/domains/${lp.id}/check`); assert(r.j.domain.https === 'ready', 'HTTPS ready once Cloudflare issued the certificate');
    r = await ADM('/api/admin/domains'); assert(r.j.cf_on && !r.j.domains.find((x) => x.host === 'lp.pro-two.com').needs_setup, 'admin: no manual setup needed with Cloudflare');
    r = await del(P, `/api/domains/${lp.id}`);
    assert(r.s === 200 && CF.deleted.includes(cfid) && !r.j.domains.some((x) => x.host === 'lp.pro-two.com'), 'customer removes a domain → deleted on Cloudflare too');
    // the background check verifies pending domains on its own (every DOMAIN_CHECK_MS)
    const gp = (await P('/api/domains')).j.domains.find((x) => x.host === 'go.pro-two.com');
    dns.TXT['_joinvoo.go.pro-two.com'] = [[gp.dns.txt.value]]; saveDns();
    let auto = null; for (let i = 0; i < 30 && !(auto && auto.status === 'active'); i++) { await sleep(300); auto = (await P('/api/domains')).j.domains.find((x) => x.host === 'go.pro-two.com'); }
    assert(auto && auto.status === 'active' && CF.created.some((x) => x.hostname === 'go.pro-two.com'), 'background checker verified a pending domain without “Check now”');
    // U's domain gets its Cloudflare hostname on the next check too
    r = await post(U, `/api/domains/${ud.id}/check`); assert(r.j.domain.status === 'active' && r.j.domain.https === 'issuing', 'an already-active domain gets HTTPS on Cloudflare when it is switched on');

    // ---------- admin actions ----------
    r = await post(ADM, `/api/admin/domains/${ud.id}`, { action: 'disable' });
    assert(r.s === 200 && r.j.domains.find((x) => x.id === ud.id).status === 'disabled', 'admin disables a domain');
    h = await hreq('go.brand-one.com', '/c/' + slug); assert(h.s === 404, 'disabled domain serves nothing');
    assert((await U('/api/channels')).j.channels.find((c) => c.id === ch.id).tracking_url.startsWith('https://gojoinly.com/'), 'links fall back to the Joinvoo link domain while disabled');
    r = await post(U, `/api/domains/${ud.id}/check`); assert(r.s === 400, 'customer can’t re-check a disabled domain');
    r = await post(ADM, `/api/admin/domains/${ud.id}`, { action: 'enable' });
    assert(r.j.domains.find((x) => x.id === ud.id).status === 'active', 'admin enables it again (active)');
    h = await hreq('go.brand-one.com', '/c/' + slug); assert(h.s === 200, 'link works again');
    r = await post(ADM, `/api/admin/domains/${ud.id}`, { action: 'recheck' }); assert(r.s === 200, 'admin recheck');
    r = await post(ADM, `/api/admin/domains/${ud.id}`, { action: 'nuke' }); assert(r.s === 400, 'unknown admin action refused');
    r = await U('/api/admin/domains'); assert(r.s === 403 || r.s === 401, 'customers can’t open the admin domain list');

    // ---------- plan limit is editable; limits saved before round 16 still work ----------
    r = await put(ADM, '/api/admin/settings', { limits: { basic: { domains: 2 } } });
    assert(r.s === 200 && r.j.settings.limits.basic.domains === 2 && r.j.settings.limits.basic.channels === 3 && r.j.settings.limits.pro.domains === 0, 'admin sets Basic to 2 domains (rest kept)');
    r = await post(U, '/api/domains', { host: 'links.brand-one.com' }); assert(r.s === 200 && r.j.limit.max === 2, 'Basic can now add a 2nd domain');
    await put(ADM, '/api/admin/settings', { limits: { basic: { domains: 1 } } });
    assert((await U('/api/domains')).j.domains.length === 2, 'lowering the limit never removes domains a customer has');

    // ---------- channel removed → its own domain goes; account deleted → all its domains go ----------
    r = await post(P, '/api/domains', { host: 'bot.pro-four.com', channel_id: pch.id });
    assert(r.s === 200 && r.j.domain.channel_id === pch.id, 'domain just for one channel');
    r = await del(P, '/api/channels/' + pch.id);
    assert(r.s === 200 && !(await P('/api/domains')).j.domains.some((x) => x.host === 'bot.pro-four.com'), 'removing the channel removes the domain made for it');
    const ucfid = Object.values(CF.hosts).find((x) => x.hostname === 'go.brand-one.com').id;
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
    db.prepare(`DELETE FROM users WHERE email='u16@x.com'`).run(); db.close();
    r = await ADM('/api/admin/domains');
    assert(!r.j.domains.some((x) => /brand-one\.com$/.test(x.host)), 'user deleted → their domains are gone');
    await sleep(100); h = await hreq('go.brand-one.com', '/robots.txt'); assert(/Sitemap/.test(h.t), 'their host is no longer treated as a customer domain');
    let gone = false; for (let i = 0; i < 20 && !gone; i++) { await sleep(300); gone = CF.deleted.includes(ucfid); }
    assert(gone, '…and its Cloudflare hostname is removed by the domain job');
    r = await post(P, '/api/domains', { host: 'go.brand-one.com' }); assert(r.s === 200, 'the freed host can be claimed again');
  } catch (e) { console.log('FAIL: exception', e.stack); process.exitCode = 1; }
  cf.close();
})();
