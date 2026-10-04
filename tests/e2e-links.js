// Link domains: ad tracking links (/c/…) run on a separate domain (settings link.domain + link.backups),
// which serves only /c/*, /health and robots.txt and sends everything else to the main site.
const B = 'http://localhost:3999';
const fs = require('fs');
const http = require('http');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  return async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t }; } catch { return { s: r.status, t }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const viaHost = (host, p) => new Promise((ok, no) => {
  const u = new URL(B + p);
  http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { host } }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ s: res.statusCode, loc: res.headers.location || '', t: d }));
  }).on('error', no);
});

(async () => {
  try {
    const ADM = client(), anon = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
    await sleep(100);
    const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });

    let r = await ADM('/api/admin/settings');
    assert(r.s === 200 && r.j.links && r.j.links.domain === '' && r.j.links.active === r.j.links.main, 'no link domain by default: links use the main site');

    r = await put(ADM, '/api/admin/settings', { links: { domain: 'not a domain' } });
    assert(r.s === 400, 'an invalid domain is refused');
    r = await put(ADM, '/api/admin/settings', { links: { domain: 'GoJoinly.com', backups: ['joinroute.com', 'https://tapvia.com/'] } });
    assert(r.s === 200 && r.j.settings.links.domain === 'https://gojoinly.com', 'domain saved and normalised to https://gojoinly.com');
    assert(JSON.stringify(r.j.settings.links.backups) === JSON.stringify(['https://joinroute.com', 'https://tapvia.com']), 'backup domains saved and normalised');
    assert(r.j.settings.links.active === 'https://gojoinly.com', 'active link base is the new domain');

    let h = await viaHost('gojoinly.com', '/');
    assert(h.s === 302 && h.loc === 'http://localhost:3999/', 'link domain home page redirects to the main site');
    h = await viaHost('gojoinly.com', '/login?x=1');
    assert(h.s === 302 && h.loc === 'http://localhost:3999/login?x=1', 'other pages on the link domain redirect to the same page on the main site');
    h = await viaHost('gojoinly.com', '/api/me');
    assert(h.s === 302, 'the API is not served on the link domain');
    h = await viaHost('gojoinly.com', '/c/nosuchlink');
    assert(h.s === 404 && /Link not found/.test(h.t), 'tracking links are served on the link domain');
    h = await viaHost('tapvia.com', '/c/nosuchlink');
    assert(h.s === 404, 'tracking links also work on a backup domain');
    h = await viaHost('gojoinly.com', '/health');
    assert(h.s === 200 && /"ok":true/.test(h.t), '/health works on the link domain');
    h = await viaHost('gojoinly.com', '/robots.txt');
    assert(h.s === 200 && /Disallow: \//.test(h.t), 'link domain tells search engines not to index it');
    h = await viaHost('localhost:3999', '/c/nosuchlink');
    assert(h.s === 404, 'old links on the main site keep working');
    h = await viaHost('unknown-host.com', '/');
    assert(h.s === 200, 'unknown hosts are not redirected');

    r = await put(ADM, '/api/admin/settings', { links: { domain: null } });
    assert(r.s === 200 && r.j.settings.links.domain === '' && r.j.settings.links.active === r.j.settings.links.main, 'clearing the domain goes back to the main site');
    assert((await anon('/api/admin/settings')).s >= 401, 'link settings are admin-only');
  } catch (e) { console.log('FAIL: crashed', e); process.exitCode = 1; }
})();
