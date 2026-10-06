// Cloudflare Worker for customer link domains (Cloudflare for SaaS + Railway). See UPGRADE.md, round 16.
// Railway only accepts hostnames it knows, so this Worker forwards every request on a customer's domain to
// Joinvoo's Railway address and passes the real host and the visitor's IP in signed headers.
// Settings (Worker → Settings → Variables): ORIGIN = https://fallback.gojoinly.com (a domain added in Railway),
// EDGE_SECRET = the same long random value as Joinvoo's EDGE_SECRET variable (mark it as a Secret).
export default {
  async fetch(request, env) {
    const inUrl = new URL(request.url);
    const origin = new URL(env.ORIGIN);
    const out = new URL(inUrl.pathname + inUrl.search, origin);
    const h = new Headers(request.headers);
    h.set('x-jv-orig-host', inUrl.host);
    h.set('x-jv-client-ip', request.headers.get('cf-connecting-ip') || '');
    h.set('x-jv-edge-secret', env.EDGE_SECRET);
    h.delete('host');
    const init = { method: request.method, headers: h, redirect: 'manual' };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
    return fetch(out.toString(), init);
  },
};
