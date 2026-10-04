const B = 'http://localhost:3999';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let ck = ''; const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) } }); const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t }; } };
const post = (p, b) => f(p, { method: 'POST', body: JSON.stringify(b) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
(async () => {
  await post('/api/signup', { country: 'GB', email: 'trial@x.com', password: 'password1' });
  let b = (await f('/api/billing')).j;
  assert(b.free_joins_left === 3 && b.balance_cents === 0 && b.tracking && b.state === 'trial', 'new account: free joins, $0 balance, tracking on (trial)');
  let r = await post('/api/bots', { token: '7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  await post('/api/bot-targets', { bot_id: r.j.bot.id });
  const ch = (await f('/api/channels')).j.channels[0]; const slug = new URL(ch.tracking_url).pathname;
  let uid = 7000;
  const click = () => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"https://x.com/?fbclid=1"}' }).then((x) => x.json());
  const join = async (go) => { uid++; const code = new URL(go.url).searchParams.get('start'); await f(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: uid, message: { message_id: 1, date: 1, chat: { id: uid, type: 'private' }, from: { id: uid, first_name: 'T' }, text: '/start ' + (code || '') } }) }); return code; };
  for (let i = 0; i < 3; i++) { const go = await click(); assert(/start=/.test(go.url), 'free join ' + (i + 1) + ' tracked'); await join(go); }
  b = (await f('/api/billing')).j;
  assert(b.free_joins_left === 0 && b.balance_cents === 0 && !b.month.plan_paid && b.month.joins === 0, 'free joins used, nothing charged, not counted toward paid allowance');
  const go = await click();
  assert(!/start=/.test(go.url), 'after free joins with $0 balance: tracking pauses (visitor still gets in)');
  b = (await f('/api/billing')).j;
  assert(b.state === 'need_plan' && b.history.some((h) => h.kind === 'welcome' && /500|free/.test(h.note)), 'wallet asks for the plan; history shows the welcome gift');
})();
