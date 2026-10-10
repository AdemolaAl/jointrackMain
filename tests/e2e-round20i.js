// Round 20i: more Meta pixels per channel. Each join (and conversion) also goes to up to 4 extra pixels, each with its own
// access token. Checks: saving and validation, tokens never sent back, the test button, joins reach every pixel with the
// same event, a failing extra pixel never affects the main one, removing pixels, and the dashboard form.
const B = 'http://localhost:3999'; let ck = '';
const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' }); const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t } } catch { return { s: r.status, t } } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const setMock = (o) => fetch('http://localhost:4000/__set', { method: 'POST', body: JSON.stringify(o) });
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const patch = (id, b) => f('/api/channels/' + id, { method: 'PATCH', body: JSON.stringify(b) });
(async () => {
  await setMock({ byPixel: {}, badPixels: [], tokens: {} });
  await f('/api/signup', { method: 'POST', body: JSON.stringify({ country: 'GB', email: 'px@x.com', password: 'password1' }) });
  await f('/api/bots', { method: 'POST', body: JSON.stringify({ token: '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' }) });
  const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  await f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: 1, my_chat_member: { chat: { id: -1001, title: 'VIP Room', type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: 7712045533 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: 7712045533 } } } }) });
  await sleep(1200);
  const ch = (await f('/api/channels')).j.channels[0];
  const MAIN = '884210395527140', A = '111111111111', Bp = '222222222222';

  // ---- saving and validation
  let r = await patch(ch.id, { meta_extra: [{ pixel_id: A, token: 'tokA' }] });
  assert(r.s === 400 && /main pixel first/.test(r.j.error), 'extra pixels need a main pixel first');
  r = await patch(ch.id, { pixel_id: MAIN, capi_token: 'tokMAIN', event_name: 'Lead', meta_extra: [{ pixel_id: A, token: 'tokA' }, { pixel_id: Bp, token: 'tokB' }] });
  assert(r.s === 200 && r.j.meta_extra.length === 2, 'main pixel + 2 extra pixels save together');
  let list = (await f('/api/channels')).j;
  const c1 = list.channels[0];
  assert(c1.meta_extra.length === 2 && c1.meta_extra.every((x) => x.has_token) && c1.meta_extra_max === 4, 'the channel shows its 2 extra pixels');
  assert(!/tokA|tokB|tokMAIN/.test(JSON.stringify(list)), 'access tokens are never sent back to the browser');
  r = await patch(ch.id, { pixel_id: MAIN, meta_extra: [{ pixel_id: MAIN, token: 'x' }] });
  assert(r.s === 400 && /already your main pixel/.test(r.j.error), 'the main pixel can’t be added again as an extra');
  r = await patch(ch.id, { pixel_id: MAIN, meta_extra: [{ pixel_id: A, token: 'x' }, { pixel_id: A, token: 'y' }] });
  assert(r.s === 400 && /twice/.test(r.j.error), 'the same extra pixel can’t be added twice');
  r = await patch(ch.id, { pixel_id: MAIN, meta_extra: [{ pixel_id: '12ab', token: 'x' }] });
  assert(r.s === 400 && /numbers only/.test(r.j.error), 'a wrong pixel ID is refused');
  r = await patch(ch.id, { pixel_id: MAIN, meta_extra: [{ pixel_id: '333333333333', token: '' }] });
  assert(r.s === 400 && /access token for pixel 333333333333/.test(r.j.error), 'a new extra pixel needs its token');
  r = await patch(ch.id, { pixel_id: MAIN, meta_extra: ['1', '2', '3', '4', '5'].map((d) => ({ pixel_id: d.repeat(12), token: 't' })) });
  assert(r.s === 400 && /up to 4/.test(r.j.error), 'at most 4 extra pixels');
  r = await patch(ch.id, { pixel_id: MAIN, capi_token: '', meta_extra: [{ pixel_id: A, token: '' }, { pixel_id: Bp, token: '' }] });
  assert(r.s === 200, 'saving again with empty tokens keeps the saved ones');
  r = await patch(ch.id, { pixel_id: MAIN, capi_token: '', event_name: 'Lead' });
  assert(r.s === 200 && (await f('/api/channels')).j.channels[0].meta_extra.length === 2, 'saving the main pixel alone (setup wizard) keeps the extra pixels');

  // ---- test button reaches every pixel
  r = await f('/api/channels/' + ch.id + '/test', { method: 'POST' });
  let s = await ms();
  assert(r.s === 200 && /2 extra pixels received it too/.test(r.j.message) && s.byPixel[A] && s.byPixel[Bp] && s.byPixel[MAIN], 'Send a test event: the main and both extra pixels get it');
  assert(s.tokens[A] === 'tokA' && s.tokens[Bp] === 'tokB' && s.tokens[MAIN] === 'tokMAIN', 'each pixel is sent with its own access token');

  // ---- a real join goes to all three, as the same event
  const slug = new URL(ch.tracking_url).pathname;
  const join = async (uid, upd) => {
    const go = await fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.1.' + uid % 200, 'cf-ipcountry': 'NG' }, body: JSON.stringify({ fbp: 'fb.1.1700000000000.' + uid, url: 'https://x.com' + slug + '?fbclid=IwAR' + uid }) });
    const gj = await go.json();
    await f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: upd, chat_member: { chat: { id: -1001, title: 'VIP Room', type: 'channel' }, from: { id: uid }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: uid } }, new_chat_member: { status: 'member', user: { id: uid, first_name: 'U' + uid } }, invite_link: { invite_link: gj.url, creator: { id: 7712045533 }, member_limit: 1 } } }) });
  };
  await setMock({ byPixel: {} });
  await join(701, 10); await sleep(2600);
  s = await ms();
  const ev = (px) => (s.byPixel[px] || []).find((e) => /_701$/.test(e.event_id));
  assert(ev(MAIN) && ev(A) && ev(Bp), 'a join is sent to the main pixel and to both extra pixels');
  assert(ev(A).event_id === ev(MAIN).event_id && ev(Bp).event_name === 'Lead' && JSON.stringify(ev(A).user_data) === JSON.stringify(ev(MAIN).user_data), 'every pixel gets the same event (same ID, name and user data)');
  let res = (await f('/api/channels')).j.channels[0];

  // ---- a failing extra pixel never touches the main one
  await setMock({ byPixel: {}, badPixels: [Bp] });
  await join(702, 11); await sleep(2600);
  s = await ms();
  assert((s.byPixel[MAIN] || []).some((e) => /_702$/.test(e.event_id)) && (s.byPixel[A] || []).some((e) => /_702$/.test(e.event_id)), 'when one extra pixel refuses, the main pixel and the other extra pixel still get the join');
  { // read the test database directly: the join's Meta status comes only from the main pixel
    const { DatabaseSync } = require('node:sqlite'); const path = require('path');
    const d = new DatabaseSync(path.join(__dirname, '.run', 'data', 'joinvoo.db'), { readOnly: true });
    const j = d.prepare(`SELECT capi_status, capi_error FROM joins WHERE tg_user_id=?`).get(702);
    const q = d.prepare(`SELECT status, attempts, target FROM capi_queue WHERE platform='meta_x' AND target=? ORDER BY id DESC LIMIT 1`).get(Bp);
    assert(j && j.capi_status === 'sent' && !j.capi_error, 'the join still shows as sent to Meta (the extra pixel’s error is kept apart)');
    assert(q && q.status === 'pending' && q.attempts >= 1, 'the refused extra pixel is retried later on its own');
    d.close();
  }
  await setMock({ badPixels: [] });

  // ---- removing pixels
  r = await patch(ch.id, { pixel_id: MAIN, meta_extra: [{ pixel_id: A, token: '' }] });
  assert(r.s === 200 && r.j.meta_extra.length === 1, 'an extra pixel can be removed');
  await setMock({ byPixel: {} });
  await join(703, 12); await sleep(2600);
  s = await ms();
  assert((s.byPixel[A] || []).length === 1 && !(s.byPixel[Bp] || []).length, 'a removed pixel gets nothing new');
  r = await patch(ch.id, { pixel_id: '', capi_token: '' });
  assert(r.s === 200 && !(await f('/api/channels')).j.channels[0].meta_extra.length, 'removing the main pixel removes the extra ones too');

  // ---- the dashboard form
  const app = await (await fetch(B + '/app')).text();
  assert(/id="pf-mx"/.test(app) && /data-mx-add/.test(app) && /More pixels/.test(app) && /meta_extra:/.test(app), 'the channel’s Meta settings have the “More pixels” section');
})().catch((e) => { console.log('FAIL:', e.message); process.exitCode = 1; });
