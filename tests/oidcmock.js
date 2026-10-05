// Fake VooSquare for tests: VooSquare's own OAuth 2.0 (/oauth/authorize, /oauth/token with an HS256 id_token signed with the
// client secret, /oauth/userinfo, /oauth/logout) plus the events and support APIs (Bearer API key). Zero dependencies.
// Used in-process by tests/e2e-voo.js (start(port)), or alone:  node tests/oidcmock.js 4400
const http = require('http'), crypto = require('crypto');
function start(port = 4400, { clientId = 'joinvoo-test', clientSecret = 'cs_test_secret', apiKeys = ['svc_test_key_123'] } = {}) {
  const base = `http://localhost:${port}`;
  const M = { clientId, clientSecret, next: null, codes: new Map(), events: [], fail: false, tokenCalls: [], authCalls: [], logouts: [], support: [] };
  const sign = (claims, secret) => {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${h}.${p}.${crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url')}`;
  };
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const u = new URL(req.url, base), j = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const keyOk = () => apiKeys.some((k) => req.headers.authorization === 'Bearer ' + k);
      if (u.pathname === '/healthz') return j(200, { ok: true });
      if (u.pathname === '/oauth/authorize') {
        const q = Object.fromEntries(u.searchParams); M.authCalls.push(q);
        const code = 'c_' + crypto.randomBytes(8).toString('hex');
        M.codes.set(code, { ...q, claims: M.next || {} });
        res.writeHead(302, { location: `${q.redirect_uri}?code=${code}&state=${encodeURIComponent(q.state)}` }); return res.end();
      }
      if (u.pathname === '/oauth/token' && req.method === 'POST') {
        const f = Object.fromEntries(new URLSearchParams(raw)); M.tokenCalls.push(f);
        if (f.client_id !== M.clientId || f.client_secret !== M.clientSecret) return j(401, { error: 'invalid_client' });
        const c = M.codes.get(f.code); M.codes.delete(f.code);
        if (!c || f.redirect_uri !== c.redirect_uri) return j(400, { error: 'invalid_grant' });
        const t = Math.floor(Date.now() / 1000), x = c.claims.tamper || {};
        const user = { sub: c.claims.sub, voo_id: c.claims.sub, email: c.claims.email, email_verified: c.claims.email_verified !== false, name: c.claims.name, country: c.claims.country, voo_ref: c.claims.voo_ref };
        const claims = { ...user, iss: x.iss || base, aud: x.aud || M.clientId, iat: t, exp: x.expired ? t - 600 : t + 600 };
        return j(200, { access_token: 'at_' + Date.now(), token_type: 'Bearer', expires_in: 600, id_token: sign(claims, x.sig ? 'another-secret' : M.clientSecret), user });
      }
      if (u.pathname === '/oauth/logout') { M.logouts.push(u.searchParams.get('redirect_uri')); res.writeHead(302, { location: u.searchParams.get('redirect_uri') || base + '/' }); return res.end(); }
      if (u.pathname === '/api/v1/events' && req.method === 'POST') {
        if (!keyOk()) return j(401, { error: 'Unknown API key' });
        M.events.push({ raw, auth: req.headers.authorization }); if (M.fail) return j(500, { error: 'down' });
        return j(200, { ok: true, stored: (JSON.parse(raw).events || []).length });
      }
      if (u.pathname === '/api/v1/support/messages' && req.method === 'POST') { if (!keyOk()) return j(401, { error: 'Unknown API key' }); M.support.push(JSON.parse(raw)); return j(200, { ok: true, ticket_id: M.support.length }); }
      j(404, { error: 'not found' });
    });
  });
  srv.listen(port);
  return { M, base, close: () => srv.close() };
}
module.exports = { start };
if (require.main === module) { start(+process.argv[2] || 4400); console.log('VooSquare mock on', +process.argv[2] || 4400); }
