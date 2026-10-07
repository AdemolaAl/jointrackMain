// Round 19: manager chats (Telegram Business) and mini apps.
const crypto = require('crypto');
const B = 'http://localhost:3999';
let fails = 0; const assert = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ck = ''; const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' }); const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; } };
const post = (p, b) => f(p, { method: 'POST', body: JSON.stringify(b) });
const patch = (p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const TOKEN = '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx';
const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FBAN/FBIOS', 'content-type': 'application/json' };
/** initData exactly as Telegram signs it. */
function initData(user, startParam, { token = TOKEN, age = 0 } = {}) {
  const p = new URLSearchParams(); p.set('user', JSON.stringify(user)); p.set('auth_date', String(Math.floor(Date.now() / 1000) - age)); p.set('query_id', 'AAH' + user.id);
  if (startParam) p.set('start_param', startParam);
  const rows = [...p].map(([k, v]) => k + '=' + v).sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(rows.join('\n')).digest('hex'));
  return p.toString();
}
const click = async (url, extra = '') => (await fetch(B + new URL(url).pathname + '/go', { method: 'POST', headers: { ...UA, cookie: 'jv_h=1' }, body: JSON.stringify({ url: 'https://ad.example/?fbclid=FB_' + Math.random().toString(36).slice(2) + '&utm_campaign=DMs' + extra, fbp: 'fb.1.1700000000000.42' }) })).json();

(async () => {
  await post('/api/signup', { country: 'NG', email: 'dm@x.com', password: 'password1' });
  let r = await post('/api/bots', { token: TOKEN }); const botId = r.j.bot.id;
  const st = await ms(), H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  assert(st.webhook.allowed_updates.includes('business_connection') && st.webhook.allowed_updates.includes('business_message'), 'webhook asks Telegram for business_connection + business_message');
  let u = 0; const upd = (x) => f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: ++u, ...x }) });

  // ---- manager connects the bot under Telegram Business → Chatbots
  const MGR = { id: 5550001, is_bot: false, first_name: 'Ada', last_name: 'Sales', username: 'ada_sales' };
  await upd({ business_connection: { id: 'BC-1', user: MGR, user_chat_id: MGR.id, date: 1, can_reply: true, is_enabled: true } });
  let d = (await f('/api/channels')).j;
  let dm = d.channels.find((c) => c.type === 'dm');
  assert(dm && dm.status === 'pending' && dm.title === 'Ada Sales' && dm.username === 'ada_sales', 'manager chat appears by itself, waiting for the owner to approve it');
  assert(d.limits.channels.used === 0, 'a waiting manager chat takes no plan slot');
  let g0 = await click(dm.tracking_url);
  assert(g0.url === 'https://t.me/ada_sales', 'before approval the link opens the chat untracked');
  const ib = (await f('/api/inbox')).j; assert((ib.rows || ib.items || []).some((x) => /Is this your manager/.test(x.title)), 'inbox asks “Is this your manager?”');
  let r0 = await post('/api/channels/' + dm.id + '/approve', {});
  assert(r0.j.ok && r0.j.status === 'active', 'owner approves: “Yes, that’s my manager”');
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(dm.status === 'active' && d.limits.channels.used === 1, 'approved manager chat is tracking and uses a slot');
  assert(dm.event_name === 'Lead' && dm.tt_event === 'Contact' && dm.sc_event === 'SIGN_UP', 'manager chats send Lead / Contact / SIGN_UP by default');
  assert(dm.go_via === 'text' && dm.bots[0] === 'test_track_bot', 'no mini app yet → link goes straight to the chat; shows which bot');
  assert(d.dm_on === true && d.miniapp_on === true && d.dm_plan_ok === true, 'features on and allowed on every plan by default');
  assert(dm.stats7 && dm.stats7.clicks === 0, 'manager chat has 7-day stats');
  await patch('/api/channels/' + dm.id, { pixel_id: '884210395527140', capi_token: 'EAAtest', event_name: 'Lead' });

  // ---- straight-to-chat link with a ref code
  let g = await click(dm.tracking_url);
  assert(/^https:\/\/t\.me\/ada_sales\?text=/.test(g.url), 'ad link opens the manager’s chat with a ready message');
  const text = new URL(g.url).searchParams.get('text'), code = /Ref: (\S+)/.exec(text)[1];
  assert(/^Hi! I’m interested\./.test(text) && code, 'ready message carries a ref code');
  const P1 = { id: 7001, is_bot: false, first_name: 'Kemi', username: 'kemi' };
  const bm = (from, t, extra = {}) => upd({ business_message: { business_connection_id: 'BC-1', message_id: Math.floor(Math.random() * 1e6), from, chat: { id: from.id, type: 'private', first_name: from.first_name }, date: Math.floor(Date.now() / 1000), text: t, ...extra } });
  await bm(P1, text);
  await bm(P1, 'second message');
  await bm(MGR, 'Hi Kemi, welcome!'); // the manager's own reply
  const P2 = { id: 7002, is_bot: false, first_name: 'Tunde' };
  await bm(P2, 'hello, saw you on Instagram'); // organic
  await sleep(2600);
  let mt = (await ms()).events.filter((e) => e.event_name === 'Lead' && e.user_data.external_id[0] === crypto.createHash('sha256').update('7001').digest('hex'));
  assert(mt.length === 1, 'first message from the ad → one Lead sent to Meta (later messages and the manager’s replies send nothing)');
  assert(mt[0] && mt[0].user_data.fbc && /^fb\.1\.\d+\.FB_/.test(mt[0].user_data.fbc) && mt[0].user_data.fbp === 'fb.1.1700000000000.42', 'the Lead carries the ad click (fbc, fbp)');
  const today = new Date().toISOString().slice(0, 10);
  let jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(jr.total === 2 && jr.rows.find((x) => x.first_name === 'Kemi').click_id && !jr.rows.find((x) => x.first_name === 'Tunde').click_id, 'People: Kemi from the ad, Tunde organic; no duplicates');
  let s = (await f(`/api/stats?from=${today}&to=${today}&tz=0`)).j.totals;
  assert(s.joins === 1 && s.organic === 1, 'stats: 1 message from ads, 1 organic');
  { const sx = (await f(`/api/stats?from=${today}&to=${today}&tz=0`)).j;
    assert(sx.totals.dms === 1 && sx.totals.dms_organic === 1 && sx.totals.dm_clicks >= 1 && sx.counts.has_dm === true, 'Overview: “DMs from ads” = 1 (+1 organic), with the taps behind it');
    const bd = (await f(`/api/breakdown?from=${today}&to=${today}&tz=0&dim=campaign`)).j.rows || [];
    assert(bd.reduce((a, x) => a + (x.dms || 0), 0) === 1 && bd.reduce((a, x) => a + (x.dm_clicks || 0), 0) >= 1, 'Results: the campaign row shows 1 DM'); }
  // a ref code from another link is not trusted
  g = await click(dm.tracking_url);
  const P3 = { id: 7003, is_bot: false, first_name: 'Bisi' };
  await bm(P3, 'Hi Ref: zzzz_abcdef');
  jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(!jr.rows.find((x) => x.first_name === 'Bisi').click_id, 'a made-up ref code counts as organic');

  // ---- mini app
  r = await patch('/api/bots/' + botId, { ma_app: 'https://t.me/otherbot/app' });
  assert(r.s === 400 && /otherbot/.test(r.j.error), 'mini app link for another bot is refused');
  r = await patch('/api/bots/' + botId, { ma_app: 't.me/test_track_bot/play' });
  assert(r.j.ok && r.j.ma_app === 'play' && r.j.ma_link === 'https://t.me/test_track_bot/play' && /\/ma\/\d+\.\w{10}$/.test(r.j.ma_url), 'mini app link saved; Joinvoo gives the URL to paste in BotFather');
  const maPath = new URL(r.j.ma_url).pathname;
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(d.bots[0].ma_app === 'play' && d.bots[0].ma_url && !d.bots[0].ma_seen_at, 'bot shows its mini app, not opened yet');
  r = await patch('/api/channels/' + dm.id, { go_via: 'miniapp', dm_text: 'Hello Ada' });
  assert(r.j.ok && r.j.go_via === 'miniapp' && !r.j.needs_miniapp, 'manager chat switched to the mini app');
  // the page
  const pg = await fetch(B + maPath); const html = await pg.text();
  assert(pg.status === 200 && html.includes('telegram-web-app.js') && /frame-ancestors[^;]*web\.telegram\.org/.test(pg.headers.get('content-security-policy') || '') && !pg.headers.get('x-frame-options'), 'mini app page loads and may be shown inside Telegram Web');
  assert((await fetch(B + '/ma/' + botId + '.AAAAAAAAAA')).status === 404, 'a wrong mini app key is 404');
  // setup test: opened from BotFather / the bot's profile (no code)
  const P9 = { id: 7009, first_name: 'Owner' };
  r = await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P9, '') }) });
  assert(r.j.url === 'https://t.me/ada_sales?text=Hello%20Ada' && r.j.kind === 'chat', 'opened without an ad code → straight to the manager, untracked');
  d = (await f('/api/channels')).j; assert(d.bots[0].ma_seen_at > 0, 'dashboard sees the mini app was opened (setup check)');
  // forged / old / other bot's data
  const opensBefore = (await f('/api/channels')).j.channels.find((c) => c.type === 'dm').stats7.opens;
  r = await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P9, '', { token: '111:wrong' }) }) });
  assert(r.j.untracked && r.j.url === 'https://t.me/ada_sales?text=Hello%20Ada', 'initData signed with another token is not trusted, but the visitor still reaches the chat');
  r = await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P9, '', { age: 90000 }) }) });
  assert(r.j.untracked, 'initData older than 24 h is not trusted');
  const forged = initData(P9, '').replace(/user=[^&]+/, 'user=' + encodeURIComponent(JSON.stringify({ id: 1, first_name: 'X' })));
  assert((await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: forged }) })).j.untracked, 'changing the user breaks the signature');
  // a forged open with a real click code records nothing
  { const gx = await click(dm.tracking_url); const spx = new URL(gx.url).searchParams.get('startapp');
    await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData({ id: 7999, first_name: 'Fake' }, spx, { token: '111:wrong' }) }) });
    assert((await f('/api/channels')).j.channels.find((c) => c.type === 'dm').stats7.opens === opensBefore, 'a forged open is not counted'); }
  // the real flow
  g = await click(dm.tracking_url);
  assert(/^https:\/\/t\.me\/test_track_bot\/play\?startapp=[0-9a-z]+_[A-Za-z0-9]{6}$/.test(g.url), 'ad link now opens the mini app with the click code');
  const sp = new URL(g.url).searchParams.get('startapp');
  const P4 = { id: 7004, first_name: 'Zainab', username: 'zee', language_code: 'en' };
  r = await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P4, sp) }) });
  assert(r.j.kind === 'chat' && r.j.url === 'https://t.me/ada_sales?text=Hello%20Ada' && r.j.name === 'Ada Sales', 'mini app sends them on to the manager’s chat');
  r = await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P4, sp) }) });
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(dm.stats7.opens === 1, 'opening twice counts one open');
  await bm(P4, 'Hello Ada'); // no ref code needed: Telegram told us who opened the mini app
  await sleep(2600);
  mt = (await ms()).events.filter((e) => e.event_name === 'Lead' && e.user_data.external_id[0] === crypto.createHash('sha256').update('7004').digest('hex'));
  assert(mt.length === 1, 'their first message is matched through the mini app open → Lead sent to Meta');
  jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(jr.rows.find((x) => x.first_name === 'Zainab').click_id, 'People shows Zainab from the ad');
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(dm.stats7.clicks === 4 && dm.stats7.opens === 1 && dm.stats7.from_ads === 2 && dm.stats7.organic === 2, 'manager chat stats: taps, opens, messages from ads, organic');

  // ---- someone who joined a channel from one ad can still be a new message from another
  // (manager chats only check repeats within the same chat)
  await upd({ my_chat_member: { chat: { id: -1009, title: 'VIP', type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: 7712045533 } }, new_chat_member: { status: 'administrator', user: { id: 7712045533 }, can_invite_users: true } } });
  await sleep(1500);
  d = (await f('/api/channels')).j; const vip = d.channels.find((c) => c.title === 'VIP');
  assert(vip && vip.type === 'channel', 'a normal channel still connects next to the manager chat');
  const gv = await click(vip.tracking_url);
  const P5 = { id: 7005, is_bot: false, first_name: 'Femi', username: 'femi' };
  await upd({ chat_member: { chat: { id: -1009, type: 'channel', title: 'VIP' }, from: P5, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: P5 }, new_chat_member: { status: 'member', user: P5 }, invite_link: { invite_link: gv.url, creator: { id: 7712045533 } } } });
  g = await click(dm.tracking_url); const sp5 = new URL(g.url).searchParams.get('startapp');
  await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P5, sp5) }) });
  await bm(P5, 'Hi');
  jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  const femi = jr.rows.filter((x) => x.first_name === 'Femi');
  assert(femi.length === 2 && femi.every((x) => x.click_id && !x.suspect), 'Femi’s channel join and his message to the manager both count');
  d = (await f('/api/channels')).j;
  assert(d.channels.find((c) => c.title === 'VIP').pool >= 0 && !d.channels.find((c) => c.type === 'dm').pool, 'invite-link pools only for channels, never for manager chats');

  // ---- manager pauses / removes the bot in Telegram Business
  await upd({ business_connection: { id: 'BC-1', user: MGR, user_chat_id: MGR.id, date: 2, is_enabled: false } });
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(dm.status === 'no_rights', 'manager disconnected the bot → manager chat shows it needs attention');
  await bm({ id: 7006, first_name: 'Late' }, 'hi');
  jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(!jr.rows.find((x) => x.first_name === 'Late'), 'nothing is recorded while disconnected');
  await upd({ business_connection: { id: 'BC-2', user: MGR, user_chat_id: MGR.id, date: 3, is_enabled: true } });
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(dm.status === 'active' && d.channels.filter((c) => c.type === 'dm').length === 1, 'reconnecting brings the same manager chat back (no duplicate)');
  // a stranger connects the bot: waits for approval, takes nothing, routes nothing
  const STR = { id: 5550099, is_bot: false, first_name: 'Stranger', username: 'stranger_x' };
  await upd({ business_connection: { id: 'BC-X', user: STR, user_chat_id: STR.id, date: 4, is_enabled: true } });
  await bm({ id: 7020, first_name: 'Someone' }, 'hi', { business_connection_id: 'BC-X' });
  d = (await f('/api/channels')).j; const st0 = d.channels.find((c) => c.username === 'stranger_x');
  jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(st0 && st0.status === 'pending' && !jr.rows.find((x) => x.first_name === 'Someone'), 'a stranger who connects the bot waits for approval; their messages are not recorded');
  // switching the chatbot off and on again must not skip the owner's approval
  await upd({ business_connection: { id: 'BC-X', user: STR, user_chat_id: STR.id, date: 4, is_enabled: false } });
  await upd({ business_connection: { id: 'BC-X', user: STR, user_chat_id: STR.id, date: 5, is_enabled: true } });
  await bm({ id: 7021, first_name: 'Someone2' }, 'hi', { business_connection_id: 'BC-X' });
  d = (await f('/api/channels')).j; jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(d.channels.find((c) => c.username === 'stranger_x').status === 'pending' && !jr.rows.find((x) => x.first_name === 'Someone2'), 'turning the chatbot off and on again does not skip approval');
  r = await f('/api/channels/' + st0.id, { method: 'DELETE' });
  await upd({ business_connection: { id: 'BC-X2', user: STR, user_chat_id: STR.id, date: 5, is_enabled: true } });
  d = (await f('/api/channels')).j;
  assert(!d.channels.find((c) => c.username === 'stranger_x'), '“Not my manager”: removing it sticks even when they reconnect');
  r = await patch('/api/channels/' + dm.id, { join_mode: 'request' });
  assert(r.s === 400, 'join requests are refused for manager chats');
  r = await patch('/api/channels/' + dm.id, { redirect_to: vip.id });
  assert(r.s === 400, 'backup channels refuse manager chats');

  // ---- a bot that opens the customer's own mini app (the open is the lead)
  r = await post('/api/bot-targets', { bot_id: botId });
  d = (await f('/api/channels')).j; const bt = d.channels.find((c) => c.type === 'bot');
  r = await patch('/api/channels/' + bt.id, { go_via: 'miniapp' });
  assert(r.s === 400 && /address/.test(r.j.error), 'bot mini app needs the app’s address');
  r = await patch('/api/channels/' + bt.id, { go_via: 'miniapp', app_url: 'http://insecure.example' });
  assert(r.s === 400, 'only https app addresses');
  r = await patch('/api/channels/' + bt.id, { go_via: 'miniapp', app_url: 'https://app.vantiba.example/play' });
  assert(r.j.ok, 'bot set to open the customer’s own mini app');
  await patch('/api/channels/' + bt.id, { pixel_id: '884210395527140', capi_token: 'EAAtest', event_name: 'CompleteRegistration' });
  g = await click(bt.tracking_url);
  assert(/^https:\/\/t\.me\/test_track_bot\/play\?startapp=/.test(g.url), 'bot link opens the mini app');
  const P7 = { id: 7007, first_name: 'Musa', username: 'musa' };
  r = await f(maPath + '/open', { method: 'POST', body: JSON.stringify({ init: initData(P7, new URL(g.url).searchParams.get('startapp')) }) });
  assert(r.j.kind === 'app' && r.j.url === 'https://app.vantiba.example/play', 'mini app hands over to the customer’s own app');
  await upd({ message: { message_id: 1, from: P7, chat: { id: P7.id, type: 'private' }, date: Math.floor(Date.now() / 1000), text: '/start' } });
  await sleep(2600);
  mt = (await ms()).events.filter((e) => e.event_name === 'CompleteRegistration' && e.user_data.external_id[0] === crypto.createHash('sha256').update('7007').digest('hex'));
  assert(mt.length === 1, 'the mini app open is sent to Meta once (pressing Start later is not counted twice)');
  // the old flow still works untouched
  await patch('/api/channels/' + bt.id, { go_via: 'start' });
  g = await click(bt.tracking_url);
  assert(/^https:\/\/t\.me\/test_track_bot\?start=/.test(g.url), 'switching back: the bot link opens the bot with /start as before');

  // ---- admin switches
  ck = ''; await post('/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1' }); await sleep(100);
  { const vl = [...require('fs').readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop(); await fetch(B + vl[1], { redirect: 'manual' }); }
  const adminCk = ck;
  r = await f('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ dm: { plan: 'pro' } }) });
  assert(r.s === 200, 'admin can make manager chats and mini apps Pro-only');
  r = await f('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ dm: { plan: 'gold' } }) });
  assert(r.s === 400, 'only "all" or "pro"');
  const dmLogin = async () => { ck = ''; await post('/api/login', { email: 'dm@x.com', password: 'password1' }); };
  await dmLogin();
  d = (await f('/api/channels')).j; dm = d.channels.find((c) => c.type === 'dm');
  assert(d.dm_plan_ok === false, 'a Basic account sees it is Pro-only');
  g = await click(dm.tracking_url);
  assert(g.url === 'https://t.me/ada_sales', 'Pro-only + Basic: the link still opens the chat, just untracked');
  r = await patch('/api/channels/' + dm.id, { go_via: 'miniapp' });
  assert(r.s === 402, 'and the settings ask to upgrade');
  ck = adminCk;
  r = await f('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ dm: { plan: 'all' }, features: { dm_tracking: false } }) });
  assert(r.s === 200 && (await f('/api/admin/settings')).j.features.dm_tracking === false, 'admin switches manager chats off');
  await dmLogin();
  await bm({ id: 7010, first_name: 'Off' }, 'hi');
  jr = (await f(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(!jr.rows.find((x) => x.first_name === 'Off'), 'feature off: business messages are ignored');
  console.log(fails ? `${fails} failed` : 'all passed');
})().catch((e) => { console.log('FAIL: crashed', e.stack); process.exitCode = 1; });
