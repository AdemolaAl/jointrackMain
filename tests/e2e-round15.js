// Round 15: who lets people in for request-to-join channels — Joinvoo (instant + welcome), the customer's own bot (Joinvoo only tracks),
// or their bot with Joinvoo approving as a backup after N seconds. Tracking stays exact in every mode.
const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  return async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
let ipn = 20;
const click = (slug) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.7.' + (ipn++) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwR' + ipn + '&utm_campaign=Own' }) }).then((x) => x.json());
const d = new Date().toISOString().slice(0, 10);

(async () => {
  try {
    const U = client();
    await post(U, '/api/signup', { country: 'NG', email: 'own@x.com', password: 'password1' });
    const BOT = 7713000011;
    await post(U, '/api/bots', { token: BOT + ':AAHk3vZq_testtokenxxxxxxxxxxxxxxxxxW' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    const tgPost = (u) => U(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    await tgPost({ update_id: 1, my_chat_member: { chat: { id: -1500, title: 'Own Bot Club', type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT } } } });
    let ch = (await U('/api/channels')).j.channels.find((c) => c.title === 'Own Bot Club');
    assert(ch && ch.join_approver === 'joinvoo' && ch.approve_after === 60, 'default: Joinvoo approves (existing channels keep today’s behaviour)');
    await patch(U, '/api/channels/' + ch.id, { pixel_id: '884210395527140', capi_token: 'EAAtest' });
    let r = await patch(U, '/api/channels/' + ch.id, { join_approver: 'robot' }); assert(r.s === 400, 'unknown approver refused');
    r = await patch(U, '/api/channels/' + ch.id, { join_approver: 'backup', approve_after: 3 }); assert(r.s === 400, 'backup wait below 10 s refused');
    r = await patch(U, '/api/channels/' + ch.id, { join_mode: 'request', join_approver: 'own' });
    assert(r.s === 200, 'request-to-join on with “my own bot approves” (no welcome message needed)');
    ch = (await U('/api/channels')).j.channels.find((c) => c.id === ch.id);
    assert(ch.join_mode === 'request' && ch.join_approver === 'own', 'channel shows request mode + own approver');
    for (let i = 0; i < 25 && !(await U('/api/channels')).j.channels.find((c) => c.id === ch.id).pool; i++) await sleep(300);
    const slug = new URL(ch.tracking_url).pathname;

    // --- own bot: Joinvoo never approves or messages
    let go = await click(slug);
    assert(/t\.me\/\+L/.test(go.url), 'click gets its own request link');
    const before = await ms(); const ap0 = (before.approvals || []).length, msg0 = (before.msgs || []).length;
    await tgPost({ update_id: 2, chat_join_request: { chat: { id: -1500, type: 'channel' }, from: { id: 801, first_name: 'Ada', is_bot: false }, user_chat_id: 801, date: Math.floor(Date.now() / 1000), invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    await sleep(400);
    let s = await ms();
    assert((s.approvals || []).length === ap0 && (s.msgs || []).length === msg0, 'own bot mode: Joinvoo does not approve and sends no message');
    ch = (await U('/api/channels')).j.channels.find((c) => c.id === ch.id);
    assert(ch.pending_requests === 1, 'the request waits for the customer’s bot (1 pending)');
    let rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows;
    assert(!rows.some((x) => x.tg_user_id === 801), 'not counted as a join before approval');
    // their bot approves → Telegram sends chat_member (with the link)
    await tgPost({ update_id: 3, chat_member: { chat: { id: -1500, type: 'channel' }, from: { id: 999 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 801 } }, new_chat_member: { status: 'member', user: { id: 801, first_name: 'Ada' } }, invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows;
    let j = rows.find((x) => x.tg_user_id === 801);
    assert(j && j.click_id && j.click_code && j.params.utm_campaign === 'Own', 'approved by their bot → join counted against the right ad click');
    // second person: chat_member WITHOUT the link (some approvals don't carry it) → matched from the request
    go = await click(slug);
    await tgPost({ update_id: 4, chat_join_request: { chat: { id: -1500, type: 'channel' }, from: { id: 802, first_name: 'Bo', is_bot: false }, user_chat_id: 802, date: Math.floor(Date.now() / 1000), invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    await tgPost({ update_id: 5, chat_member: { chat: { id: -1500, type: 'channel' }, from: { id: 999 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 802 } }, new_chat_member: { status: 'member', user: { id: 802, first_name: 'Bo' } }, via_join_request: true } });
    rows = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows;
    j = rows.find((x) => x.tg_user_id === 802);
    assert(j && j.click_id, 'approval update without the link → still matched to the click from the request');
    await sleep(2500);
    s = await ms();
    assert(s.events.filter((e) => e.event_name === 'Subscribe').length >= 2, 'both joins sent to Meta');
    ch = (await U('/api/channels')).j.channels.find((c) => c.id === ch.id);
    assert(ch.pending_requests === 0, 'no requests left waiting');

    // --- backup: their bot doesn't answer → Joinvoo approves after the wait
    r = await patch(U, '/api/channels/' + ch.id, { join_approver: 'backup', approve_after: 10 });
    assert(r.s === 200 && r.j.join_approver === 'backup' && r.j.approve_after === 10, 'switch to “my bot first, Joinvoo as backup” (10 s)');
    go = await click(slug);
    await tgPost({ update_id: 6, chat_join_request: { chat: { id: -1500, type: 'channel' }, from: { id: 803, first_name: 'Cy', is_bot: false }, user_chat_id: 803, date: Math.floor(Date.now() / 1000), invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    await sleep(3000);
    s = await ms(); assert(!(s.approvals || []).some((a) => a.user_id === 803), 'backup: Joinvoo waits while the customer’s bot has time');
    for (let i = 0; i < 30 && !((await ms()).approvals || []).some((a) => a.user_id === 803); i++) await sleep(500);
    s = await ms(); assert((s.approvals || []).some((a) => a.user_id === 803 && a.chat_id === -1500), 'backup: nobody approved in 10 s → Joinvoo approves');
    // a request their bot handled in time is not approved again
    go = await click(slug);
    await tgPost({ update_id: 7, chat_join_request: { chat: { id: -1500, type: 'channel' }, from: { id: 804, first_name: 'Di', is_bot: false }, user_chat_id: 804, date: Math.floor(Date.now() / 1000), invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    await tgPost({ update_id: 8, chat_member: { chat: { id: -1500, type: 'channel' }, from: { id: 999 }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: 804 } }, new_chat_member: { status: 'member', user: { id: 804, first_name: 'Di' } }, invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    await sleep(12500);
    s = await ms(); assert(!(s.approvals || []).some((a) => a.user_id === 804), 'backup: if their bot already let them in, Joinvoo does nothing');

    // --- back to Joinvoo approving: instant approval + welcome, as before
    r = await patch(U, '/api/channels/' + ch.id, { join_approver: 'joinvoo', offer_text: 'Hi {name}!', offer_url: 'https://partner.example/go?sub1={tg_id}' });
    go = await click(slug);
    await tgPost({ update_id: 9, chat_join_request: { chat: { id: -1500, type: 'channel' }, from: { id: 805, first_name: 'Ed', is_bot: false }, user_chat_id: 805, date: Math.floor(Date.now() / 1000), invite_link: { invite_link: go.url, creator: { id: BOT }, creates_join_request: true } } });
    await sleep(500);
    s = await ms();
    assert((s.approvals || []).some((a) => a.user_id === 805) && (s.msgs || []).some((m) => m.chat_id === 805 && /Hi Ed!/.test(m.text)), 'Joinvoo mode: instant approval + welcome message (unchanged)');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
})();
