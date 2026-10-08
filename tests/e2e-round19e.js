// Round 19e: Joe's get_stats tool on a real account with ad joins: the ads_only numbers must match the dashboard.
const http = require('http'), fs = require('fs');
const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() { let ck = ''; return async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t }; } }; }
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) }), put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
let toolResults = [], calls = [];
const ai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { const b = JSON.parse(raw), last = b.messages[b.messages.length - 1]; calls.push(b);
  let out;
  if (Array.isArray(last.content) && last.content[0].type === 'tool_result') { toolResults.push(JSON.parse(last.content[0].content)); out = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; }
  else out = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'get_stats', input: global.INPUT || {} }] };
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', usage: { input_tokens: 10, output_tokens: 5 }, ...out })); }); }).listen(4961);
(async () => {
  const ADM = client(), U = client();
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1' }); await sleep(100);
  const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop(); await fetch(B + vlink[1], { redirect: 'manual' });
  await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-joe-123456' } });
  await post(U, '/api/signup', { country: 'GB', email: 'buyer@x.com', password: 'password1', name: 'Mo' });
  let r = await post(U, '/api/bots', { token: '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  await post(U, '/api/bot-targets', { bot_id: r.j.bot.id });
  const ch = (await U('/api/channels')).j.channels[0], st = await ms(), H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  for (let i = 0; i < 5; i++) {
    const g = await fetch(B + new URL(ch.tracking_url).pathname + '/go', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '102.89.2.' + i }, body: JSON.stringify({ url: 'https://x.com/?fbclid=F' + i + '&utm_campaign=Spring' }) }).then((x) => x.json());
    if (i < 3) await U(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: 10 + i, message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 900 + i, type: 'private' }, from: { id: 900 + i, first_name: 'P' + i }, text: '/start ' + new URL(g.url).searchParams.get('start') } }) });
  }
  const today = new Date().toISOString().slice(0, 10);
  const dash = (await U(`/api/stats?from=${today}&to=${today}&tz=0`)).j.totals;
  for (const [label, input] of [['no dates', {}], ['today only', { from: today, to: today }], ['last 7 days', { from: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), to: today }]]) {
    global.INPUT = input; toolResults = [];
    r = await post(U, '/api/joe/chat', { message: 'How’s my campaign?' });
    const tr = toolResults[0] || {};
    console.log('   ', label, JSON.stringify(tr.ads_only || tr).slice(0, 300));
    assert(tr.ads_only && tr.ads_only.clicks === dash.clicks && tr.ads_only.joins_from_ads === dash.joins && dash.clicks === 5 && dash.joins === 3, `Joe's get_stats (${label}) sees the same ad numbers as the dashboard: 5 clicks, 3 joins`);
  }
  const sys = calls[0].system.map((x) => x.text).join('\n');
  assert(/Today is \d{4}-\d{2}-\d{2}/.test(sys), 'Joe is told today’s date');
  assert(/LIVE SNAPSHOT/.test(sys) && /Today so far: 5 ad clicks, 3 joins from ads/.test(sys) && /ads ARE running/.test(sys), 'Joe always sees a live ads snapshot (5 clicks, 3 joins today) and is told never to say ads aren’t running');
  // round 20: AI support sees the same live numbers (support said "no traffic today" while ads were running)
  await put(ADM, '/api/admin/support-ai', { settings: { on: true, speed: 'instant' } });
  calls = []; global.INPUT = { from: '2024-01-01', to: '2024-01-01' }; // a model guessing the wrong dates
  await post(U, '/api/support', { body: 'is there any traffic today?' }); await sleep(3500);
  const sup = calls.find((c) => Array.isArray(c.system) && c.system[1] && /THIS CHAT/.test(c.system[1].text));
  const dyn = sup ? sup.system[1].text : '', st2 = sup ? sup.system[0].text : '';
  assert(/LIVE SNAPSHOT/.test(dyn) && /Today so far: 5 ad clicks, 3 joins from ads/.test(dyn), 'AI support sees the live snapshot: 5 clicks and 3 joins today, same as the dashboard');
  assert(new RegExp('Today is ' + today).test(dyn) || /Today is \d{4}-\d{2}-\d{2}/.test(dyn), 'AI support knows today’s date in the customer’s time zone');
  assert(/Never say they have no traffic/.test(st2) && /SETUP STATUS/.test(dyn), 'and is told never to say “no traffic” when the snapshot shows clicks, plus their setup status');
  ai.close(); console.log('done');
})().catch((e) => { console.log('FAIL: crashed', e); process.exitCode = 1; ai.close(); });
