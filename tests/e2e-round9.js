// Round 9: sister-product cross-promotion (settings.sister + features.sister_promo), shown on /api/config and /api/me,
// UTM tags on the link, the click counter, and the admin Sister products section.
const B = 'http://localhost:3999';
const fs = require('fs');
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
const UTM = 'utm_source=joinvoo&utm_medium=dashboard&utm_campaign=sister';

(async () => {
  try {
    const ADM = client(), U = client(), anon = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
    await sleep(100);
    const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    await post(U, '/api/signup', { country: 'GB', email: 'mia@x.com', password: 'password1', name: 'Mia' });

    let c = (await anon('/api/config')).j;
    assert(c.features.sister_promo === true, 'features.sister_promo is on by default');
    assert(c.sister.enabled === true && c.sister.name === 'Replyvoo' && c.sister.url === 'https://replyvoo.com?' + UTM && /Telegram leads/.test(c.sister.tagline) && c.sister.promo_code === '', '/api/config: sister card with UTM tags on the link');
    assert(Object.keys(c.sister).sort().join() === 'enabled,name,promo_code,tagline,url', 'only the public fields are exposed');
    assert((await U('/api/me')).j.sister.url === c.sister.url, '/api/me carries the same card');

    let r = await put(ADM, '/api/admin/settings', { sister: { url: 'javascript:alert(1)' } }); assert(r.s === 400, 'a non-https link is refused');
    r = await put(ADM, '/api/admin/settings', { sister: { promo_code: 'bad code!' } }); assert(r.s === 400, 'a promo code with spaces is refused');
    r = await put(ADM, '/api/admin/settings', { sister: { url: 'https://replyvoo.com/start?ref=jv#top', promo_code: 'JOINVOO20', tagline: 'Close leads faster.' } });
    assert(r.s === 200 && r.j.settings.sister.promo_code === 'JOINVOO20' && r.j.settings.sister.name === 'Replyvoo' && r.j.settings.sister.url_out === 'https://replyvoo.com/start?ref=jv&' + UTM + '#top', 'admin edits merge with the saved values; UTM joins an existing query and keeps the #hash');
    c = (await anon('/api/config')).j; assert(c.sister.promo_code === 'JOINVOO20' && c.sister.tagline === 'Close leads faster.', 'changes show on /api/config right away');
    r = await put(ADM, '/api/admin/settings', { sister: { utm: false } }); c = (await anon('/api/config')).j;
    assert(c.sister.url === 'https://replyvoo.com/start?ref=jv#top', 'utm off → the link as typed');

    // clicks
    for (let i = 0; i < 3; i++) { r = await post(U, '/api/sister/click'); }
    assert(r.s === 200 && r.j.url === c.sister.url, 'POST /api/sister/click returns the link');
    r = await ADM('/api/admin/settings'); assert(r.j.sister.clicks === 3, 'admin sees “Clicks to Replyvoo: 3”');
    for (let i = 0; i < 25; i++) await post(anon, '/api/sister/click');
    assert((await ADM('/api/admin/settings')).j.sister.clicks <= 20, 'clicks are rate-limited per visitor');
    r = await put(ADM, '/api/admin/settings', { sister: { reset_clicks: true } }); assert(r.j.settings.sister.clicks === 0, 'admin can reset the counter');

    // off switches
    await put(ADM, '/api/admin/settings', { sister: { enabled: false } });
    c = (await anon('/api/config')).j;
    assert(JSON.stringify(c.sister) === '{"enabled":false}', 'sister.enabled=false hides everything');
    assert((await post(U, '/api/sister/click')).s === 404, 'no clicks counted while hidden');
    await put(ADM, '/api/admin/settings', { sister: { enabled: true }, features: { sister_promo: false } });
    c = (await anon('/api/config')).j; assert(c.sister.enabled === false && c.features.sister_promo === false, 'feature switch off also hides it');
    await put(ADM, '/api/admin/settings', { features: { sister_promo: true }, sister: null });
    c = (await anon('/api/config')).j; assert(c.sister.enabled && c.sister.url === 'https://replyvoo.com?' + UTM && c.sister.promo_code === '', 'sister:null → back to defaults');
    assert((await put(U, '/api/admin/settings', { sister: { enabled: false } })).s === 403, 'only admins can change it');

    const html = await (await fetch(B + '/admin')).text();
    assert(html.includes('Sister products') && html.includes('#FFC21A'), 'admin page has the Sister products section with the yellow preview');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
})();
