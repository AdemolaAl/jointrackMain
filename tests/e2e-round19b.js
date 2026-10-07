// Round 19b: DM numbers on Overview/Results, CSV downloads, custom webhooks, link tags ({utm_campaign}, {sub1}…).
// Runs a webhook receiver on :4950 (WEBHOOK_TEST_ALLOW=1 lets the server post to localhost in tests only).
const crypto = require('crypto'), http = require('http');
const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ck = ''; const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_ses')) ck = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* csv */ } return { s: r.status, j, t, h: r.headers }; };
const post = (p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) }), patch = (p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b) }), del = (p) => f(p, { method: 'DELETE' });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const TOKEN = '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx';
const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FBAN/FBIOS', 'content-type': 'application/json' };
let ipn = 20;
const click = async (url, q = '') => (await fetch(B + new URL(url).pathname + '/go', { method: 'POST', headers: { ...UA, cookie: 'jv_h=1', 'x-forwarded-for': '102.89.1.' + (ipn++) },
  body: JSON.stringify({ url: 'https://ad.example/?fbclid=FB_' + Math.random().toString(36).slice(2) + q }) })).json();
const got = []; let mode = 200;
const rx = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ path: req.url, h: req.headers, body: b }); res.writeHead(mode); res.end('ok'); }); });
const today = new Date().toISOString().slice(0, 10);

(async () => {
  await new Promise((r) => rx.listen(4950, r));
  await post('/api/signup', { country: 'BR', email: 'wh@x.com', password: 'password1' });
  let r = await post('/api/bots', { token: TOKEN }); const botId = r.j.bot.id;
  const st = await ms(), H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  let u = 0; const upd = (x) => f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: ++u, ...x }) });
  const cfg = (await f('/api/config')).j; assert(cfg.features.webhooks === true, 'webhooks feature is on by default');

  // ---- webhooks: validation
  r = await post('/api/webhooks', { url: 'http://example.com/hook', events: ['start'] }); assert(r.s === 400 && /https/.test(r.j.error), 'plain http address is refused');
  r = await post('/api/webhooks', { url: 'https://10.0.0.5/hook', events: ['start'] }); assert(r.s === 400, 'private network address is refused');
  r = await post('/api/webhooks', { url: 'https://hooks.example.com/x', events: [] }); assert(r.s === 400 && /event/.test(r.j.error), 'at least one event is needed');
  r = await post('/api/webhooks', { url: 'https://hooks.example.com/x', events: ['nope'] }); assert(r.s === 400, 'unknown events are dropped (then none left → refused)');
  r = await post('/api/webhooks', { url: 'http://localhost:4950/jv', events: ['start', 'join', 'ftd', 'start'] });
  assert(r.s === 200 && r.j.secret && /^whsec_/.test(r.j.secret) && r.j.webhooks.length === 1, 'webhook added; secret shown once');
  const secret = r.j.secret, hid = r.j.created, wh = r.j.webhooks[0];
  assert(wh.events.join() === 'start,join,ftd' && wh.secret_hint === '…' + secret.slice(-4) && !JSON.stringify(r.j.webhooks).includes(secret), 'events de-duplicated; the list never shows the full secret');
  assert(r.j.events.length === 7 && r.j.events.some((e) => e.key === 'dm'), 'event list includes DMs');

  // ---- send test, signature
  r = await post('/api/webhooks/' + hid + '/test');
  assert(r.s === 200 && /answered 200/.test(r.j.message), 'Send test reaches the server');
  let g0 = got.pop(); const sig = (x) => 'sha256=' + crypto.createHmac('sha256', secret).update(x.h['x-joinvoo-timestamp'] + '.' + x.body).digest('hex');
  assert(g0 && g0.h['x-joinvoo-signature'] === sig(g0) && JSON.parse(g0.body).event === 'test' && g0.h['content-type'] === 'application/json', 'test event is JSON and signed with the secret (timestamp.body)');
  mode = 500; r = await post('/api/webhooks/' + hid + '/test'); assert(r.s === 400 && /500/.test(r.j.error), 'a failing server is reported in plain words'); mode = 200; got.length = 0;
  r = await f('/api/webhooks'); assert(r.j.webhooks[0].last_status === 'error', 'status shows the last failure');

  // ---- link tags in the bot welcome + button, and the start webhook
  r = await post('/api/bot-targets', { bot_id: botId, welcome: 'Hi {name}! You came from {utm_campaign}. Unknown {foo} stays.', btn_text: 'Open offer', btn_url: 'https://partner.example/go?sub1={tg_id}&camp={utm_campaign}&ad={utm_content}&s2={sub2}&c={click_id}' });
  let d = (await f('/api/channels')).j, bt = d.channels.find((c) => c.type === 'bot');
  await patch('/api/channels/' + bt.id, { pixel_id: '884210395527140', capi_token: 'EAAtest' });
  let g = await click(bt.tracking_url, '&utm_campaign=Spring%20Sale&utm_content=Video%201&sub2=a%26b');
  const code = new URL(g.url).searchParams.get('start'); assert(code, 'bot link carries a start code');
  const P = { id: 8101, is_bot: false, first_name: 'Lucas', username: 'lucas' };
  await upd({ message: { message_id: 1, from: P, chat: { id: P.id, type: 'private' }, date: Math.floor(Date.now() / 1000), text: '/start ' + code } });
  await sleep(300);
  const msg = (await ms()).msgs.filter((m) => m.chat_id === P.id).pop();
  assert(msg && msg.text === 'Hi Lucas! You came from Spring Sale. Unknown {foo} stays.', 'welcome fills {name} and {utm_campaign}; unknown tags are left alone');
  const bu = msg && new URL(msg.reply_markup.inline_keyboard[0][0].url);
  assert(bu && bu.searchParams.get('sub1') === '8101' && bu.searchParams.get('camp') === 'Spring Sale' && bu.searchParams.get('ad') === 'Video 1' && bu.searchParams.get('s2') === 'a&b' && /^\d+$/.test(bu.searchParams.get('c')), 'button link gets each tag URL-encoded (a&b stays one value)');
  // organic Start: empty tags, no crash
  const P2 = { id: 8102, is_bot: false, first_name: 'Aisha' };
  await upd({ message: { message_id: 2, from: P2, chat: { id: P2.id, type: 'private' }, date: Math.floor(Date.now() / 1000), text: '/start' } });
  await sleep(3800);
  const m2 = (await ms()).msgs.filter((m) => m.chat_id === P2.id).pop();
  assert(m2 && m2.text === 'Hi Aisha! You came from . Unknown {foo} stays.' && new URL(m2.reply_markup.inline_keyboard[0][0].url).searchParams.get('camp') === '', 'organic Start: tags with no ad become empty');
  let starts = got.filter((x) => JSON.parse(x.body).event === 'start').map((x) => ({ ...x, j: JSON.parse(x.body) }));
  assert(starts.length === 2 && starts.every((x) => x.h['x-joinvoo-signature'] === sig(x)), 'each Start is sent to the webhook, signed');
  const s1 = starts.find((x) => x.j.person.tg_user_id === 8101), s2 = starts.find((x) => x.j.person.tg_user_id === 8102);
  assert(s1 && s1.j.from_ad && s1.j.ad.utm_campaign === 'Spring Sale' && s1.j.ad.utm_content === 'Video 1' && s1.j.ad.subs.sub2 === 'a&b' && s1.j.ad.platform === 'meta' && s1.j.channel.type === 'bot', 'payload has the person, the ad (campaign, ad, subs, platform) and the channel');
  assert(s2 && s2.j.from_ad === false && s2.j.ad === null, 'organic Start: from_ad false');
  r = await f('/api/webhooks'); assert(r.j.webhooks[0].last_status === 'ok' && r.j.webhooks[0].sent_24h === 2, 'status: working, 2 sent today');

  // ---- conversions → webhook; unchecked events are not sent
  const pb = new URL((await f('/api/conversions')).j.postback_url).pathname;
  await fetch(B + pb + '?sub1=8101&status=reg'); await fetch(B + pb + '?sub1=8101&status=ftd&payout=55.5&currency=eur&txid=T1');
  await sleep(3600);
  const evs = got.map((x) => JSON.parse(x.body).event);
  const ftd = got.map((x) => JSON.parse(x.body)).find((x) => x.event === 'ftd');
  assert(ftd && ftd.value === 55.5 && ftd.currency === 'EUR' && ftd.txid === 'T1' && ftd.ad.utm_campaign === 'Spring Sale' && ftd.person.tg_user_id === 8101, 'first deposit sent with value, currency and the ad behind it');
  assert(!evs.includes('reg'), 'registration not sent (not ticked)');

  // ---- pause, edit, retries, limits, delete
  got.length = 0; r = await patch('/api/webhooks/' + hid, { enabled: false }); assert(r.j.webhooks[0].enabled === false, 'webhook paused');
  await fetch(B + pb + '?sub1=8101&status=dep&payout=10');
  await upd({ message: { message_id: 3, from: { id: 8103, first_name: 'Mateo' }, chat: { id: 8103, type: 'private' }, date: Math.floor(Date.now() / 1000), text: '/start' } });
  await sleep(3500); assert(got.length === 0, 'paused webhook gets nothing');
  r = await patch('/api/webhooks/' + hid, { enabled: true, events: ['start'], url: 'http://localhost:4950/jv2' }); assert(r.j.webhooks[0].url.endsWith('/jv2') && r.j.webhooks[0].events.join() === 'start', 'webhook edited');
  mode = 503; await upd({ message: { message_id: 4, from: { id: 8104, first_name: 'Sofia' }, chat: { id: 8104, type: 'private' }, date: Math.floor(Date.now() / 1000), text: '/start' } });
  await sleep(3500); r = await f('/api/webhooks');
  assert(got.length === 1 && r.j.webhooks[0].last_status === 'error' && /503/.test(r.j.webhooks[0].last_error), 'a failed delivery is shown and kept for a retry');
  mode = 200;
  r = await post('/api/webhooks/' + hid + '/secret'); assert(r.j.secret && r.j.secret !== secret, 'new signing secret');
  for (let i = 0; i < 4; i++) await post('/api/webhooks', { url: 'https://hooks.example.com/' + i, events: ['join'] });
  r = await post('/api/webhooks', { url: 'https://hooks.example.com/6', events: ['join'] }); assert(r.s === 400 && /5 webhooks/.test(r.j.error), 'up to 5 webhooks per account');
  r = await del('/api/webhooks/' + hid); assert(r.j.webhooks.length === 4 && !r.j.webhooks.some((x) => x.id === hid), 'webhook deleted');
  r = await del('/api/webhooks/99999'); assert(r.s === 404, 'unknown webhook → 404');

  // ---- CSV downloads
  r = await f(`/api/clicks.csv?from=${today}&to=${today}&tz=0`);
  const cl = r.t.replace(/^﻿/, '').split('\n');
  assert(r.s === 200 && /text\/csv/.test(r.h.get('content-type')) && /attachment; filename="joinvoo-ad-taps-/.test(r.h.get('content-disposition')), 'ad taps CSV downloads');
  assert(cl[0].startsWith('clicked_at,channel,kind,platform') && cl.some((l) => /Spring Sale/.test(l) && /,started,/.test(l) && /Bot Start/.test(l) && /,Meta,/.test(l)), 'ad taps CSV: campaign, kind, platform and result');
  r = await f(`/api/conversions.csv?from=${today}&to=${today}&tz=0`);
  assert(r.s === 200 && /First deposit,55\.50,EUR,T1/.test(r.t) && /Registration/.test(r.t) && /Spring Sale/.test(r.t), 'deposits CSV with value, currency, txid and campaign');
  r = await f(`/api/conversions.csv?from=2020-01-01&to=2020-01-02&tz=0`); assert(r.t.replace(/^﻿/, '').split('\n').length === 1, 'deposits CSV respects the dates');
  r = await f(`/api/joins.csv?from=${today}&to=${today}&tz=0`); assert(/^joined_at,channel,tg_user_id,.*,left_at,kind\n/.test(r.t) && /,8101,.*,Bot Start(\n|$)/.test(r.t), 'People CSV: same columns as before, plus “kind” at the end');
  ck = ''; r = await f(`/api/clicks.csv`); assert(r.s === 401 || r.s === 403, 'CSV needs a login');
  r = await f(`/api/webhooks`); assert(r.s === 401 || r.s === 403, 'webhooks need a login');

  // ---- stats: no DM channel → no DM numbers to show
  await post('/api/login', { email: 'wh@x.com', password: 'password1' });
  const s = (await f(`/api/stats?from=${today}&to=${today}&tz=0`)).j;
  assert(s.totals.dms === 0 && s.counts && s.counts.has_dm === false, 'stats carry DM numbers (zero, and no DM tile without DM tracking)');
  const bd = (await f(`/api/breakdown?from=${today}&to=${today}&tz=0&dim=campaign`)).j;
  assert((bd.rows || []).every((x) => x.dms === 0), 'Results rows carry a DMs count');

  rx.close(); console.log('done');
})().catch((e) => { console.log('FAIL: crashed', e); process.exitCode = 1; rx.close(); });
