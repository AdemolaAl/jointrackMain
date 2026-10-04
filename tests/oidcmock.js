// Fake VooSquare for tests: an OpenID Connect provider that signs RS256 ID tokens (discovery, authorize, token with PKCE,
// JWKS, end_session) plus an events receiver. Zero dependencies. Used in-process by tests/e2e-voo.js (start(port)), or alone:
//   node tests/oidcmock.js 4400
const http = require('http'), crypto = require('crypto');
function start(port = 4400) {
  const base = `http://localhost:${port}`;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey; // for "bad signature"
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const M = { clientId: 'joinvoo-test', clientSecret: 'cs_test_secret', next: null, codes: new Map(), events: [], fail: false, tokenCalls: [], authCalls: [] };
  const sign = (claims, key = privateKey, kid = 'k1') => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url'), p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key).toString('base64url')}`;
  };
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const u = new URL(req.url, base), j = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/.well-known/openid-configuration') return j(200, { issuer: base, authorization_endpoint: base + '/authorize', token_endpoint: base + '/token', jwks_uri: base + '/jwks',
        end_session_endpoint: base + '/logout', token_endpoint_auth_methods_supported: ['client_secret_post'], id_token_signing_alg_values_supported: ['RS256'] });
      if (u.pathname === '/jwks') return j(200, { keys: [jwk] });
      if (u.pathname === '/authorize') {
        const q = Object.fromEntries(u.searchParams); M.authCalls.push(q);
        const code = 'c_' + crypto.randomBytes(8).toString('hex');
        M.codes.set(code, { ...q, claims: M.next || {} });
        res.writeHead(302, { location: `${q.redirect_uri}?code=${code}&state=${encodeURIComponent(q.state)}` }); return res.end();
      }
      if (u.pathname === '/token' && req.method === 'POST') {
        const f = Object.fromEntries(new URLSearchParams(raw)); M.tokenCalls.push(f);
        const c = M.codes.get(f.code); M.codes.delete(f.code);
        if (!c || f.client_id !== M.clientId || f.client_secret !== M.clientSecret || f.redirect_uri !== c.redirect_uri) return j(400, { error: 'invalid_grant' });
        if (crypto.createHash('sha256').update(f.code_verifier || '').digest('base64url') !== c.code_challenge || c.code_challenge_method !== 'S256') return j(400, { error: 'invalid_grant', error_description: 'PKCE' });
        const t = Math.floor(Date.now() / 1000), x = c.claims.tamper || {};
        const claims = { iss: x.iss || base, aud: x.aud || M.clientId, sub: c.claims.sub, email: c.claims.email, email_verified: c.claims.email_verified !== false, name: c.claims.name,
          country: c.claims.country, voo_ref: c.claims.voo_ref, nonce: x.nonce || c.nonce, iat: t, exp: x.expired ? t - 600 : t + 600 };
        return j(200, { access_token: 'at_' + Date.now(), token_type: 'Bearer', expires_in: 600, id_token: sign(claims, x.sig ? other : privateKey) });
      }
      if (u.pathname === '/logout') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('logged out'); }
      if (u.pathname === '/events' && req.method === 'POST') { M.events.push({ raw, sig: req.headers['x-voo-signature'] }); if (M.fail) return j(500, { error: 'down' }); return j(200, { ok: true }); }
      j(404, { error: 'not found' });
    });
  });
  srv.listen(port);
  return { M, base, close: () => srv.close() };
}
module.exports = { start };
if (require.main === module) { start(+process.argv[2] || 4400); console.log('oidc mock on', +process.argv[2] || 4400); }
