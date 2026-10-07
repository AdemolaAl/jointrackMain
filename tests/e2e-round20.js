// Round 20: photos and screenshots in the support chat. A scripted fake AI on :4962 records what it is sent.
// Checks: upload (website/dashboard chat + Telegram), only real images, size limits, who can see a photo (owner + staff only),
// the AI really receives the image (newest 3), screenshots never unlock credits, and the attach buttons are on the pages.
const http = require('http'), fs = require('fs');
const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() { let ck = ''; return async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const c of sc) { const kv = c.split(';')[0]; if (/^(jp_session|jv_vis)=/.test(kv)) ck = (ck ? ck.split('; ').filter((x) => !x.startsWith(kv.split('=')[0] + '=')).concat(kv).join('; ') : kv); }
  const ct = r.headers.get('content-type') || '', buf = Buffer.from(await r.arrayBuffer()), t = buf.toString();
  try { return { s: r.status, j: JSON.parse(t), ct, h: r.headers }; } catch { return { s: r.status, t, ct, buf, h: r.headers }; } }; }
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) }), put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', IMG = 'data:image/png;base64,' + PNG;

const seen = [];
const ai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
  const b = JSON.parse(raw), msgs = b.messages, last = msgs[msgs.length - 1];
  const blocks = msgs.filter((m) => m.role === 'user').flatMap((m) => Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]);
  const images = blocks.filter((x) => x.type === 'image'), text = blocks.filter((x) => x.type === 'text').map((x) => x.text).join(' | ');
  seen.push({ images, text, tools: (b.tools || []).map((t) => t.name), system: (b.system || []).map((x) => x.text).join('\n') });
  let out = images.length ? 'Thanks for the screenshot! 👀\n~~\nI can see it clearly.' : 'Hi there! 👋\n~~\nHow can I help?';
  if (Array.isArray(last.content) && last.content[0].type === 'tool_result') out = 'Checked.';
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: out }], usage: { input_tokens: 900, output_tokens: 40 } })); }); }).listen(4962);

(async () => {
  const ADM = client(), U = client(), U2 = client(), V = client(), NOBODY = client();
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1' }); await sleep(100);
  const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop(); await fetch(B + vlink[1], { redirect: 'manual' });
  await post(U, '/api/signup', { country: 'GB', email: 'lucas@x.com', password: 'password1', name: 'Lucas Martin' });
  await post(U2, '/api/signup', { country: 'GB', email: 'aisha@x.com', password: 'password1', name: 'Aisha' });

  // ---- with the AI off: photos still reach the team
  let r = await post(U, '/api/support', { image: IMG });
  assert(r.s === 200 && /^\/api\/support\/image\/[a-f0-9]{24}\.png$/.test(r.j.image), 'a customer can send a photo with no text (AI off: it goes to the team)');
  let g = (await U('/api/support')).j; const m1 = g.messages[g.messages.length - 1];
  assert(m1.image === r.j.image && m1.body === '📷 Photo', 'the chat shows the photo (text “📷 Photo” for lists, emails and VooSquare)');
  const img1 = await U(m1.image);
  assert(img1.s === 200 && img1.ct === 'image/png' && img1.buf.equals(Buffer.from(PNG, 'base64')) && img1.h.get('x-content-type-options') === 'nosniff' && /default-src 'none'/.test(img1.h.get('content-security-policy') || ''), 'the customer can open their own photo (real PNG, nosniff, locked down)');
  assert((await U2(m1.image)).s === 404 && (await NOBODY(m1.image)).s === 404, 'another customer, or someone not logged in, can’t open it');
  assert((await U('/api/support/image/..%2F..%2Fjointrack.db')).s === 404 && (await U('/api/support/image/abc.png')).s === 404, 'odd file names are refused');
  r = await post(U, '/api/support', { body: 'x', image: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') });
  assert(r.s === 400 && /photo or screenshot/i.test(r.j.error), 'a file that isn’t really an image is refused');
  r = await post(U, '/api/support', { image: 'data:image/png;base64,' + Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(5.2 * 1024 * 1024)]).toString('base64') });
  assert(r.s === 400 && /too big/.test(r.j.error), 'a photo over 5 MB is refused');
  r = await post(U, '/api/support', { image: 'https://evil.example/x.png' }); assert(r.s === 400, 'only uploaded data, never a link to fetch');


  const tid = (await ADM('/api/admin/support')).j.tickets.find((t) => t.email === 'lucas@x.com' || t.user_id).id;
  let at = (await ADM('/api/admin/support/' + tid)).j; const am = at.messages.find((x) => x.image);
  assert(am && /^\/api\/admin\/support\/image\/[a-f0-9]{24}\.png$/.test(am.image) && (await ADM(am.image)).s === 200, 'staff see and open the photo in admin');
  assert([401, 403].includes((await U(am.image)).s), 'the admin photo link needs a staff login');

  // ---- AI on: it receives the image itself
  await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-photos-1234' } });
  r = await put(ADM, '/api/admin/support-ai', { settings: { on: true, speed: 'fast' } }); assert(r.j.ready === true, 'AI support on');
  seen.length = 0;
  r = await post(U, '/api/support', { body: 'my pixel shows nothing, see screenshot', image: IMG }); assert(r.j.ai === true, 'photo with a caption goes to the AI');
  await sleep(4000);
  assert(seen.length && seen[0].images.length >= 1 && seen[0].images[0].source.type === 'base64' && seen[0].images[0].source.media_type === 'image/png' && seen[0].images[0].source.data === PNG, 'the AI really receives the photo (base64 PNG)');
  assert(/\(sent a photo\) my pixel shows nothing/.test(seen[0].text), 'and the caption, marked as sent with a photo');
  assert(/PHOTOS AND SCREENSHOTS/.test(seen[0].system) && /NEVER proof of payment/.test(seen[0].system), 'its rules: read screenshots carefully, a screenshot is never proof of payment');
  assert(!seen[0].tools.some((t) => /credit|refund|bonus/.test(t)), 'still no tool that can give credits (a fake payment screenshot can’t unlock anything)');
  g = (await U('/api/support')).j;
  assert(g.messages.some((x) => x.from_admin && /I can see it clearly/.test(x.body)), 'the AI answers about the screenshot');
  // only the newest 3 photos are sent to the AI
  for (let i = 0; i < 3; i++) { await post(U, '/api/support', { image: IMG }); await sleep(300); }
  seen.length = 0; await sleep(4500);
  const lastCall = seen[seen.length - 1];
  assert(lastCall && lastCall.images.length === 3 && /no longer shown/.test(lastCall.text), 'only the 3 newest photos go to the AI (older ones are just mentioned), to stay fast and cheap');

  // ---- visitors (not logged in): need an email first, and see only their own photos
  r = await post(V, '/api/support', { image: IMG }); assert(r.s === 400 && r.j.need_email, 'a website visitor gives an email before the first message, photo or not');
  r = await post(V, '/api/support', { image: IMG, email: 'visitor@y.com' }); assert(r.s === 200 && r.j.image, 'then the visitor can send a photo');
  assert((await V(r.j.image)).s === 200 && (await U(r.j.image)).s === 404 && (await NOBODY(r.j.image)).s === 404, 'only that visitor (by their chat cookie) can open it');

  // ---- Telegram support bot: photos are saved and read too
  r = await post(ADM, '/api/admin/support-ai/telegram', { token: '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' }); assert(r.j.ok, 'support bot connected');
  const st = await ms(), wh = st.webhook, path = new URL(wh.url).pathname;
  seen.length = 0;
  await fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': wh.secret_token }, body: JSON.stringify({ update_id: 900, message: { message_id: 9, date: 1, chat: { id: 7771, type: 'private' }, from: { id: 7771, first_name: 'Priya', is_bot: false },
    photo: [{ file_id: 'small1', width: 90, height: 90, file_size: 70 }, { file_id: 'big1', width: 1280, height: 960, file_size: 70 }], caption: 'error on my bot' } }) });
  await sleep(4500);
  const tt = (await ADM('/api/admin/support')).j.tickets.find((t) => t.tg_chat === 7771 || t.source === 'telegram');
  at = (await ADM('/api/admin/support/' + tt.id)).j; const tm = at.messages.find((x) => !x.from_admin && x.image);
  assert(tm && tm.body === 'error on my bot' && (await ADM(tm.image)).s === 200, 'Telegram: the photo (largest size) is downloaded and saved with its caption');
  assert(seen.length && seen[0].images.length === 1 && seen[0].images[0].source.data === PNG, 'Telegram: the AI receives that photo');

  // ---- the chat windows have the photo button
  const home = await (await fetch(B + '/')).text(), app = await (await fetch(B + '/app')).text();
  assert(/id="spAtt"/.test(home) && /id="spFile"[^>]*accept="image\/\*"/.test(home), 'website chat: photo button');
  assert(/chatatt/.test(app) && /chatfile/.test(app) && /function shrinkPhoto/.test(app), 'dashboard chat: photo button (photos are shrunk on the phone before upload)');
  assert(/class="nav-a sup-nav" data-act="chat"/.test(app) && /function r20SupNav/.test(app), 'dashboard: Support in the side menu opens the chat');
  assert(/HR\[\(h>>>3\)%5\]/.test(app), 'dashboard faces use unsigned maths (no more black “Daniel” face)');

  // ---- 4 AI teammates with their own faces; new chats are shared between them
  const cfg = (await fetch(B + '/api/config').then((x) => x.json())).support;
  const aiTeam = cfg.team.filter((m) => m.ai);
  assert(aiTeam.length === 4 && aiTeam.map((m) => m.name).join() === 'Sofia,Daniel,Maya,Leo', 'default AI team: Sofia, Daniel, Maya and Leo');
  let facesOk = true; for (const m of aiTeam) { const f = await fetch(B + m.photo); facesOk = facesOk && f.status === 200 && f.headers.get('content-type') === 'image/png'; }
  assert(facesOk, 'each AI teammate has their own face picture');
  const names = new Set();
  for (let i = 0; i < 4; i++) { const c = client(); await post(c, '/api/support', { body: 'hello ' + i, email: `v${i}@z.com` }); await sleep(200); }
  await sleep(4000);
  for (const t of (await ADM('/api/admin/support')).j.tickets) { const d = (await ADM('/api/admin/support/' + t.id)).j; for (const m of d.messages) if (m.from_admin && m.agent && m.agent.ai) names.add(m.agent.name); }
  assert(names.size >= 3, 'new chats are picked up by different AI teammates (' + [...names].join(', ') + ')');

  // ---- payment methods: the AI only offers what's switched on in admin (and what this customer's country sees)
  const pm = (await ADM('/api/admin/pay-methods')).j, list = pm.methods || pm.items || pm;
  for (const x of list) await ADM('/api/admin/pay-methods/' + x.id, { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
  r = await post(ADM, '/api/admin/pay-methods', { type: 'manual', label: 'USDT (TRC20) test', currency: 'USDT', address: 'TXYZtestaddressxxxxxxxxxxxxxxxxxxx', instructions: 'Send USDT on TRC20.' });
  const usdtId = (r.j.method || r.j).id; if (usdtId) await ADM('/api/admin/pay-methods/' + usdtId, { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
  seen.length = 0; await post(U, '/api/support', { body: 'can I pay with paystack?' }); await sleep(4000);
  const sysPay = seen.length ? seen[seen.length - 1].system : '';
  const onBlock = (/PAYMENT METHODS SWITCHED ON RIGHT NOW[^\n]*\n((?:  • .*\n)+)/.exec(sysPay) || [])[1] || '';
  assert(/USDT \(TRC20\) test/.test(onBlock) && !/Paystack|Stripe/i.test(onBlock), 'the AI is told the live payment methods: only the one switched on (USDT), not Paystack');
  assert(/switched OFF at the moment: never say they can pay with it/.test(sysPay), 'and told never to offer a method that is switched off');
  assert(/TOP-UP METHODS THIS CUSTOMER SEES[^\n]*USDT \(TRC20\) test/.test(sysPay), 'it also knows exactly which methods this customer sees');
  // ---- reviewer fix: rejected posts never leave a photo on disk, and big posts are limited per network
  const DIR = __dirname + '/.run/data/media/support', nfiles = () => { try { return fs.readdirSync(DIR).length; } catch { return 0; } };
  const before = nfiles(); let codes = [];
  for (let i = 0; i < 16; i++) { const rr = await fetch(B + '/api/support', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: IMG + 'A'.repeat(70000) }) }); codes.push(rr.status); }
  assert(nfiles() === before, 'cookieless visitors without an email can’t leave photos on the disk (' + (nfiles() - before) + ' files written)');
  assert(codes.includes(429), 'big posts from one network are limited before the upload is read (' + [...new Set(codes)].join('/') + ')');
  ai.close(); console.log('done');
})().catch((e) => { console.log('FAIL: crashed', e); process.exitCode = 1; ai.close(); });
