// Fake Paystack + Flutterwave on :4100. /__paid/<ref> marks a reference as paid.
const http = require('http'); const paid = new Map(), amounts = new Map();
http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
  const u = req.url, j = b ? JSON.parse(b) : {}; res.setHeader('content-type', 'application/json');
  if (u === '/transaction/initialize') { amounts.set(j.reference, j.amount); return res.end(JSON.stringify({ status: true, data: { authorization_url: 'https://checkout.paystack.test/' + j.reference } })); }
  let m;
  if ((m = /^\/transaction\/verify\/(.+)$/.exec(u))) { const r = decodeURIComponent(m[1]); return res.end(JSON.stringify({ status: true, data: { id: 77, status: paid.get(r) ? 'success' : 'abandoned', amount: paid.get(r) || 0 } })); }
  if (u === '/v3/payments') { amounts.set(j.tx_ref, j.amount); return res.end(JSON.stringify({ status: 'success', data: { link: 'https://checkout.flw.test/' + j.tx_ref } })); }
  if ((m = /tx_ref=(.+)$/.exec(u))) { const r = decodeURIComponent(m[1]); return res.end(JSON.stringify({ status: 'success', data: { id: 88, status: paid.get(r) ? 'successful' : 'pending', amount: paid.get(r) || 0, currency: 'USD' } })); }
  if ((m = /^\/__paid\/([^/]+)\/(\d+(?:\.\d+)?)$/.exec(u))) { paid.set(m[1], +m[2]); return res.end('{}'); }
  if ((m = /^\/__amount\/(.+)$/.exec(u))) return res.end(JSON.stringify({ amount: amounts.get(m[1]) }));
  res.statusCode = 404; res.end('{}'); }); }).listen(4100);
