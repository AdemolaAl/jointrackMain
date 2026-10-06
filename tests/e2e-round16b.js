// Round 16 review fixes: a never-verified claim can't block a domain's real owner forever; an admin-disabled domain can't be
// removed and re-added by the customer; a Cloudflare hostname created while its domain was being removed isn't lost (and the
// check answers 404, not a server error); automatic links only move to a domain that really serves (CNAME pointing, HTTPS issued
// with Cloudflare), and the checker re-checks those quickly; a smart link (backup channel) works on a domain made for one channel;
// a Pro → Basic downgrade keeps existing domains working but blocks adding more; a second start on the same database works.
// Runs a fake Cloudflare API on :4800; DNS answers come from tests/.run/dns.json (DOMAIN_DNS_MOCK).
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
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
function hreq(host, p, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const rq = http.request({ host: '127.0.0.1', port: 3999, path: p, method, headers: { host, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) [FBAN/FBIOS]', ...headers } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* text */ } resolve({ s: res.statusCode, h: res.headers, t, j }); });
    });
    rq.on('error', reject); if (body) rq.write(typeof body === 'string' ? body : JSON.stringify(body)); rq.end();
  });
}
const CF = { hosts: {}, delay: 0, deleted: [] }; let cfn = 0;
const cf = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
    const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'application/json');
    const J = (s, o) => { res.statusCode = s; res.end(JSON.stringify(o)); };
    const m = /^\/client\/v4\/zones\/([a-f0-9]{32})\/custom_hostnames(?:\/([\w-]+))?$/.exec(u.pathname);
    if (!m) return J(404, { success: false, errors: [{ message: 'no route' }] });
    if (req.method === 'POST') { await sleep(CF.delay); const j = JSON.parse(b), id = 'cfh_' + (++cfn); CF.hosts[id] = { id, hostname: j.hostname, ssl: { status: 'pending_validation' } }; return J(200, { success: true, result: CF.hosts[id] }); }
    if (req.method === 'GET' && m[2]) return CF.hosts[m[2]] ? J(200, { success: true, result: CF.hosts[m[2]] }) : J(404, { success: false });
    if (req.method === 'GET') return J(200, { success: true, result: Object.values(CF.hosts).filter((h) => h.hostname === u.searchParams.get('hostname')) });
    if (req.method === 'DELETE') { CF.deleted.push(m[2]); const had = !!CF.hosts[m[2]]; delete CF.hosts[m[2]]; return had ? J(200, { success: true }) : J(404, { success: false }); }
    J(405, {});
  });
});
const slugOf = (c) => new URL(c.tracking_url).pathname.split('/').pop();

(async () => {
  await new Promise((r) => cf.listen(4800, r));
  saveDns();
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    await put(ADM, '/api/admin/settings', { domains: { cname_target: 'customers.gojoinly.com' }, links: { domain: 'gojoinly.com' } });
    const U = client(), P = client();
    await post(U, '/api/signup', { country: 'NG', email: 'u16b@x.com', password: 'password1', name: 'Ugo' });
    await post(P, '/api/signup', { country: 'KE', email: 'p16b@x.com', password: 'password1', name: 'Pam' });
    const pid = (await ADM('/api/admin/users?q=p16b')).j.users.find((x) => x.email === 'p16b@x.com').id;
    await post(ADM, `/api/admin/users/${pid}/plan`, { plan: 'pro' });

    // ---------- a never-verified claim stops blocking the real owner (DOMAIN_CLAIM_HOLD_MS=1500 here, 24 h by default) ----------
    let r = await post(U, '/api/domains', { host: 'go.squat16b.com' }); assert(r.s === 200 && r.j.domain.status === 'pending', 'U claims a host it can’t verify');
    r = await post(P, '/api/domains', { host: 'go.squat16b.com' }); assert(r.s === 400 && /another Joinvoo account/.test(r.j.error), 'fresh unverified claim still blocks others');
    await sleep(1600);
    r = await post(P, '/api/domains', { host: 'go.squat16b.com' });
    const sq = r.j.domain;
    assert(r.s === 200 && sq.host === 'go.squat16b.com' && (await U('/api/domains')).j.domains.length === 0, 'after the hold an unverified claim is taken over by the next account');
    dns.TXT['_joinvoo.go.squat16b.com'] = [[sq.dns.txt.value]]; saveDns();
    r = await post(P, `/api/domains/${sq.id}/check`); assert(r.j.domain.status === 'active', 'new owner verifies it');
    await sleep(1600);
    r = await post(U, '/api/domains', { host: 'go.squat16b.com' }); assert(r.s === 400 && /another Joinvoo account/.test(r.j.error), 'a verified domain is never taken over');

    // ---------- automatic links only move to a domain that serves ----------
    const ext = await post(P, '/api/bot-targets/external', { username: 'pamshop16b_bot' });
    let pch = (await P('/api/channels')).j.channels.find((c) => c.id === ext.j.channel);
    const pslug = slugOf(pch);
    assert(pch.tracking_url === `https://gojoinly.com/c/${pslug}`, 'verified but CNAME not pointing → links stay on the Joinvoo link domain');
    r = await P('/api/domains'); assert(r.j.domains[0].status === 'active' && r.j.domains[0].live === false, 'domain view: active, live=false');
    let h = await hreq('go.squat16b.com', '/c/' + pslug); assert(h.s === 200, '…but the host already answers (so it can be tested)');
    r = await patch(P, '/api/channels/' + pch.id, { domain_id: sq.id }); assert(r.s === 200 && r.j.tracking_url === `https://go.squat16b.com/c/${pslug}`, 'picked by hand: used once verified');
    await patch(P, '/api/channels/' + pch.id, { domain_id: null });
    dns.CNAME['go.squat16b.com'] = ['customers.gojoinly.com']; saveDns();
    r = await post(P, `/api/domains/${sq.id}/check`); assert(r.j.domain.live === true, 'CNAME pointing → live');
    pch = (await P('/api/channels')).j.channels.find((c) => c.id === pch.id);
    assert(pch.tracking_url === `https://go.squat16b.com/c/${pslug}` && pch.snippet_src === `https://go.squat16b.com/r/${pslug}.js`, 'automatic links now use it');

    // ---------- smart link on a domain made for one channel ----------
    await post(P, '/api/bots', { token: '7716000022:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxxR16b' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    const tgPost = (u) => P(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    let uid = 1;
    for (const [id, title] of [[-1717, 'Main 16b'], [-1718, 'Backup 16b']])
      await tgPost({ update_id: uid++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: 7716000022 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: 7716000022 } } } });
    let chs = (await P('/api/channels')).j.channels; const main = chs.find((c) => c.title === 'Main 16b'), bak = chs.find((c) => c.title === 'Backup 16b');
    for (let i = 0; i < 40 && !((await P('/api/channels')).j.channels.find((c) => c.id === bak.id).pool); i++) await sleep(250);
    r = await post(P, '/api/domains', { host: 'go.smart16b.com', channel_id: main.id }); const sm = r.j.domain;
    dns.TXT['_joinvoo.go.smart16b.com'] = [[sm.dns.txt.value]]; dns.CNAME['go.smart16b.com'] = ['customers.gojoinly.com']; saveDns();
    r = await post(P, `/api/domains/${sm.id}/check`); assert(r.j.domain.status === 'active' && r.j.domain.channel_id === main.id, 'domain just for the main channel is active');
    r = await patch(P, '/api/channels/' + main.id, { redirect_to: bak.id }); assert(r.s === 200, 'main channel sends its traffic to the backup channel');
    h = await hreq('go.smart16b.com', '/c/' + slugOf(main));
    assert(h.s === 200 && h.t.includes(`/c/${slugOf(bak)}/go`), 'click page on the domain asks the backup channel’s /go');
    h = await hreq('go.smart16b.com', `/c/${slugOf(bak)}/go`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'x-forwarded-for': '102.89.17.1' }, body: { url: `https://go.smart16b.com/c/${slugOf(main)}?fbclid=SMART16B` } });
    assert(h.s === 200 && h.j && /t\.me\/\+/.test(h.j.url), '…and gets a tracked invite link there (was a 404 on the customer domain)');
    h = await hreq('go.smart16b.com', '/c/' + pslug); assert(h.s === 404, 'other channels still aren’t served on a domain made for one channel');

    // ---------- an admin-disabled domain can't be removed + re-added by the customer ----------
    await post(ADM, `/api/admin/domains/${sm.id}`, { action: 'disable' });
    r = await del(P, `/api/domains/${sm.id}`); assert(r.s === 400 && /switched off/.test(r.j.error), 'customer can’t delete a disabled domain');
    await del(P, '/api/channels/' + main.id);
    assert((await P('/api/domains')).j.domains.some((x) => x.id === sm.id && x.status === 'disabled'), 'removing its channel doesn’t remove a disabled domain either');
    r = await post(P, '/api/domains', { host: 'go.smart16b.com' }); assert(r.s === 400, 'so it can’t be added again');
    r = await del(ADM, `/api/admin/domains/${sm.id}`); assert(r.s === 200 && !r.j.domains.some((x) => x.id === sm.id), 'admin can delete it');

    // ---------- Cloudflare: removal during a check, HTTPS gating, quick re-checks ----------
    await put(ADM, '/api/admin/settings', { domains: { cf_zone_id: '0123456789abcdef0123456789abcdef', cf_token: 'cf_tok_16b' } });
    r = await post(P, '/api/domains', { host: 'go.leak16b.com' }); const lk = r.j.domain;
    dns.TXT['_joinvoo.go.leak16b.com'] = [[lk.dns.txt.value]]; saveDns(); CF.delay = 1200;
    const pc = post(P, `/api/domains/${lk.id}/check`); await sleep(300);
    r = await del(P, `/api/domains/${lk.id}`); assert(r.s === 200, 'domain removed while Cloudflare is still answering');
    r = await pc; CF.delay = 0; assert(r.s === 404, 'the check answers 404 (not a server error)');
    let left = 1; for (let i = 0; i < 25 && left; i++) { await sleep(300); left = Object.values(CF.hosts).filter((x) => x.hostname === 'go.leak16b.com').length; }
    assert(left === 0, 'the Cloudflare hostname created during that check is removed too');

    r = await post(P, '/api/domains', { host: 'go.cf16b.com' }); const cd = r.j.domain;
    dns.TXT['_joinvoo.go.cf16b.com'] = [[cd.dns.txt.value]]; dns.CNAME['go.cf16b.com'] = ['customers.gojoinly.com']; saveDns();
    r = await post(P, `/api/domains/${cd.id}/check`);
    assert(r.j.domain.status === 'active' && r.j.domain.https === 'issuing' && r.j.domain.live === false, 'with Cloudflare: active but not live until HTTPS is issued');
    pch = (await P('/api/channels')).j.channels.find((c) => c.id === pch.id);
    assert(pch.tracking_url === `https://gojoinly.com/c/${pslug}`, 'automatic links wait on the Joinvoo link domain meanwhile (no broken https link for new ads)');
    for (const x of Object.values(CF.hosts)) x.ssl.status = 'active';
    let live = false; for (let i = 0; i < 30 && !live; i++) { await sleep(300); live = (await P('/api/domains')).j.domains.find((x) => x.id === cd.id).live; }
    assert(live, 'the background check sees the certificate without “Check now” (not 6 hours later)');
    pch = (await P('/api/channels')).j.channels.find((c) => c.id === pch.id);
    assert(/^https:\/\/go\.(squat16b|cf16b)\.com\/c\//.test(pch.tracking_url), 'automatic links move to a live domain');

    // ---------- edge Worker (Cloudflare → Railway): real host + visitor IP in signed headers ----------
    const EH = (sec, host, ip) => ({ 'x-jv-edge-secret': sec, 'x-jv-orig-host': host, 'x-jv-client-ip': ip });
    h = await hreq('fallback.gojoinly.com', '/c/' + pslug, { headers: EH('edge-secret-16b', 'go.cf16b.com', '41.58.1.9') });
    assert(h.s === 200 && /\/c\//.test(h.t), 'edge: signed original host → served as the customer domain');
    h = await hreq('fallback.gojoinly.com', '/c/doesnotexist16b', { headers: EH('edge-secret-16b', 'go.cf16b.com', '41.58.1.9') });
    assert(h.s === 404, 'edge: unknown link on the customer domain is a plain 404');
    h = await hreq('localhost:3999', '/robots.txt', { headers: EH('wrong-secret', 'go.cf16b.com', '41.58.1.9') });
    assert(!/Disallow: \/\s*$/.test(h.t) || /Sitemap/.test(h.t), 'edge: a wrong secret is ignored (host not rewritten)');
    h = await hreq('fallback.gojoinly.com', `/c/${pslug}/go`, { method: 'POST', headers: { ...EH('edge-secret-16b', 'go.cf16b.com', '41.58.1.77'), 'content-type': 'application/json', cookie: 'jv_h=1' }, body: { url: `https://go.cf16b.com/c/${pslug}?fbclid=EDGE16B` } });
    assert(h.s === 200 && h.j && h.j.url, 'edge: click through the Worker gets an invite link');
    { const { DatabaseSync } = require('node:sqlite'); const dir = path.join(RUN, 'data'); const f = fs.readdirSync(dir).find((x) => /\.(db|sqlite)$/.test(x));
      const db = new DatabaseSync(path.join(dir, f), { readOnly: true }); const c = db.prepare(`SELECT ip FROM clicks WHERE fbclid='EDGE16B' ORDER BY id DESC LIMIT 1`).get(); db.close();
      assert(c && c.ip === '41.58.1.77', 'edge: the visitor’s real IP is recorded (sent to Meta), not the Worker’s'); }

    // ---------- Pro → Basic with several domains ----------
    const n0 = (await P('/api/domains')).j.domains.length;
    await post(ADM, `/api/admin/users/${pid}/plan`, { plan: 'basic' });
    r = await P('/api/domains'); assert(r.j.domains.length === n0 && n0 >= 2 && r.j.limit.max === 1, 'downgrade keeps every domain');
    h = await hreq('go.cf16b.com', '/c/' + pslug); assert(h.s === 200, 'their links keep working');
    r = await post(P, '/api/domains', { host: 'go.more16b.com' }); assert(r.s === 402 && r.j.limit.kind === 'domains', 'adding another is blocked with the upgrade prompt');

    // ---------- a second start on the same database (migrations, trigger) ----------
    const out = [];
    const s2 = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: '3998', DATA_DIR: path.join(RUN, 'data'), TG_API: 'http://localhost:4000', GRAPH_API: 'http://localhost:4000', RESEND_API_KEY: '', DOMAIN_CHECK_MS: '600000' } });
    s2.stdout.on('data', (c) => out.push(String(c))); s2.stderr.on('data', (c) => out.push(String(c)));
    let up = false; for (let i = 0; i < 40 && !up; i++) { await sleep(150); up = await fetch('http://localhost:3998/health').then((x) => x.ok, () => false); }
    s2.kill(); await new Promise((res) => s2.on('exit', res));
    assert(up && !/error/i.test(out.join('').replace(/ExperimentalWarning[^\n]*/g, '')), 'server starts again on the same database without errors');
  } catch (e) { console.log('FAIL: exception', e.stack); process.exitCode = 1; }
  cf.close();
})();
