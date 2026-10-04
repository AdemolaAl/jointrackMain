// Admin settings: feature switches, live pricing, payment methods (manual two-step), support team faces, email templates + throttled email log.
const B = 'http://localhost:3999';
const fs = require('fs');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  return async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  const ADM = client(), U = client(), V = client();
  // verified admin
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
  await sleep(100);
  const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
  await fetch(B + vlink[1], { redirect: 'manual' });
  let r = await ADM('/api/admin/settings');
  assert(r.s === 200 && r.j.features.signup === true && r.j.pricing.base_cents === 3000, 'admin reads settings (env defaults)');

  // public config shape
  let cfg = (await fetch(B + '/api/config').then((x) => x.json()));
  assert(cfg.features && cfg.features.snapchat === true && cfg.support && Array.isArray(cfg.support.team) && cfg.brand.company === 'Zedapex' && cfg.pricing.included === 2000, 'public config has features, support, brand, pricing');

  // ---- feature: signup off
  r = await put(ADM, '/api/admin/settings', { features: { signup: false } });
  assert(r.s === 200 && r.j.settings.features.signup === false, 'admin switches sign-ups off');
  r = await post(client(), '/api/signup', { country: 'GB', email: 'late@x.com', password: 'password1' });
  assert(r.s === 403, 'sign-up blocked while switched off (' + r.s + ')');
  cfg = await fetch(B + '/api/config').then((x) => x.json());
  assert(cfg.signup === false && cfg.features.signup === false, 'config says sign-ups are closed');
  await put(ADM, '/api/admin/settings', { features: { signup: true } });

  // ---- pricing: live values used for billing
  r = await put(ADM, '/api/admin/settings', { pricing: { base_cents: 1000, included: 1, per_join_cents: 5, free_joins: 0 } });
  assert(r.s === 200 && r.j.settings.pricing.base_cents === 1000, 'admin edits pricing');
  r = await put(ADM, '/api/admin/settings', { pricing: { per_join_cents: -3 } });
  assert(r.s === 400, 'bad pricing value rejected');
  cfg = await fetch(B + '/api/config').then((x) => x.json());
  assert(cfg.pricing.base_cents === 1000 && cfg.pricing.per_join_cents === 5, 'config shows new pricing');

  await post(U, '/api/signup', { country: 'GB', email: 'cust@x.com', password: 'password1', name: 'Mia' });
  let bill = (await U('/api/billing')).j;
  assert(bill.free_joins_left === 0 && bill.month.base_cents === 1000 && bill.month.per_join_cents === 5, 'customer billing uses the new prices');
  const cust = (await ADM('/api/admin/users?q=cust@x.com')).j.users[0];
  await post(ADM, `/api/admin/users/${cust.id}/adjust`, { amount: 13, note: 'Test credit' });

  // channel with Meta + Snapchat
  r = await post(U, '/api/bots', { token: '7712045599:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  await post(U, '/api/bot-targets', { bot_id: r.j.bot.id });
  const ch = (await U('/api/channels')).j.channels[0];
  await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ pixel_id: '884210395527140', capi_token: 'EAAtest' }) });
  r = await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ platform: 'snap', sc_pixel: '1a2b3c4d-1234-5678-9abc-def012345678', sc_token: 'snaptok' }) });
  assert(r.s === 200, 'Snapchat connects while switched on');
  const slug = new URL(ch.tracking_url).pathname;
  const click = () => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwT&ScCid=sc1' }) }).then((x) => x.json());
  let uid = 5000;
  const joinVia = async (go) => { const code = new URL(go.url).searchParams.get('start'); uid++;
    await U(hook, { method: 'POST', headers: H, body: JSON.stringify({ update_id: uid, message: { message_id: 1, date: 1, chat: { id: uid, type: 'private' }, from: { id: uid, first_name: 'U' + uid }, text: '/start ' + (code || '') } }) }); };

  // ---- feature: snapchat off
  await put(ADM, '/api/admin/settings', { features: { snapchat: false } });
  r = await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ platform: 'snap', sc_pixel: '1a2b3c4d-1234-5678-9abc-def012345678' }) });
  assert(r.s === 403, 'Snapchat settings rejected while switched off');
  r = await post(U, `/api/channels/${ch.id}/test?platform=snap`);
  assert(r.s === 403, 'Snapchat test event rejected while switched off');
  cfg = await fetch(B + '/api/config').then((x) => x.json());
  assert(cfg.features.snapchat === false, 'config hides Snapchat');
  const html = await fetch(B + slug).then((x) => x.text());
  assert(!/snaptr/.test(html), 'click page drops the Snap pixel');

  let go = await click();
  assert(/start=/.test(go.url), 'tracked click');
  bill = (await U('/api/billing')).j;
  assert(bill.balance_cents === 300 && bill.month.plan_paid, 'plan charged at the edited price ($10): balance ' + bill.balance_cents);
  await joinVia(go); await joinVia(await click()); await joinVia(await click());
  bill = (await U('/api/billing')).j;
  assert(bill.month.joins === 3 && bill.balance_cents === 290, '1 included join, then 5¢ per extra join (balance ' + bill.balance_cents + ')');
  const d = new Date().toISOString().slice(0, 10);
  const joins = (await U(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows;
  assert(joins.length === 3 && joins.every((j) => j.sc_status === 'none' && ['pending', 'sent'].includes(j.capi_status)), 'joins not queued for Snapchat while it is off, Meta still sent');
  await put(ADM, '/api/admin/settings', { features: { snapchat: true } });

  // ---- throttled emails: low balance (once per 3 days) and tracking paused (once a day)
  await sleep(150);
  let el = (await ADM('/api/admin/emails')).j;
  const count = (kind) => el.log.filter((l) => l.kind === kind && l.to_addr === 'cust@x.com').length;
  assert(count('low_balance') === 1, 'low balance email sent once although several joins charged (' + count('low_balance') + ')');
  await post(ADM, `/api/admin/users/${cust.id}/adjust`, { amount: -2.9, note: 'Zero it' });
  go = await click(); go = await click();
  assert(!/start=/.test(go.url), 'empty wallet pauses tracking');
  await sleep(150);
  el = (await ADM('/api/admin/emails')).j;
  assert(count('tracking_paused') === 1, 'tracking paused email sent once for several paused clicks (' + count('tracking_paused') + ')');

  // ---- payment methods: add BTC, two-step manual deposit, approval
  r = await post(ADM, '/api/admin/pay-methods', { type: 'manual', label: 'Bitcoin (BTC)', currency: 'BTC', address: 'bc1qexampleaddressxxxxxxxxxxxxxxxx', explorer: 'https://mempool.space/tx/', instructions: 'Send BTC only.' });
  assert(r.s === 400, 'explorer link without {tx} rejected');
  r = await post(ADM, '/api/admin/pay-methods', { type: 'manual', label: 'Bitcoin (BTC)', note: 'On-chain Bitcoin', currency: 'BTC', address: 'bc1qexampleaddressxxxxxxxxxxxxxxxx', explorer: 'https://mempool.space/tx/{tx}', instructions: 'Send BTC only.' });
  assert(r.s === 200 && r.j.id && r.j.methods.some((x) => x.label === 'Bitcoin (BTC)'), 'admin adds a manual BTC method');
  const btc = r.j.id;
  bill = (await U('/api/billing')).j;
  const pm = bill.pay_methods.find((x) => x.id === btc);
  assert(pm && pm.type === 'manual' && pm.currency === 'BTC' && pm.explorer && bill.pay_methods.some((x) => x.id === 'm_usdt') && bill.methods.crypto === true, 'customer sees the BTC method next to USDT');
  await ADM('/api/admin/pay-methods/' + btc, { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
  assert(!(await U('/api/billing')).j.pay_methods.some((x) => x.id === btc), 'disabled method hidden from customers');
  r = await post(U, '/api/billing/deposit', { provider: 'manual', method_id: btc, amount: 25 });
  assert(r.s === 400, 'disabled method cannot be used');
  await ADM('/api/admin/pay-methods/' + btc, { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
  r = await post(U, '/api/billing/deposit', { provider: 'manual', method_id: btc, amount: 25 });
  assert(r.j.manual && /^25\.\d\d$/.test(r.j.pay_amount) && r.j.pay_amount !== '25.00' && r.j.currency === 'BTC' && r.j.address.startsWith('bc1') && r.j.label === 'Bitcoin (BTC)', 'step 1 reserves a unique amount and returns where to pay (' + r.j.pay_amount + ')');
  const bref = r.j.reference;
  r = await post(U, '/api/billing/deposit', { provider: 'manual', reference: bref, tx: 'nope' });
  assert(r.s === 400, 'step 2 rejects a bad transaction hash');
  r = await post(U, '/api/billing/deposit', { provider: 'manual', reference: bref, tx: 'B'.repeat(64) });
  assert(r.s === 200 && r.j.pending, 'step 2 submits the hash for review');
  let ov = (await ADM('/api/admin/overview')).j;
  assert(ov.pending_deposits === 1, 'overview counts the manual deposit as waiting');
  const dep = (await ADM('/api/admin/deposits')).j.deposits[0];
  assert(dep.label === 'Bitcoin (BTC)' && dep.explorer_url === 'https://mempool.space/tx/' + 'b'.repeat(64), 'admin sees method label and explorer link');
  r = await post(ADM, `/api/admin/deposits/${dep.id}/approve`, { amount: 25 });
  bill = (await U('/api/billing')).j;
  assert(bill.balance_cents === 2500 && bill.history[0].note === 'Top-up via Bitcoin (BTC)', 'approval credits the wallet (' + bill.balance_cents + ')');
  // bank transfer: free-text reference
  r = await post(ADM, '/api/admin/pay-methods', { type: 'manual', label: 'Bank transfer', currency: 'USD', instructions: 'Bank: Example Bank\nAccount: 0000000000' });
  const bank = r.j.id;
  r = await post(U, '/api/billing/deposit', { provider: 'manual', method_id: bank, amount: 15 });
  r = await post(U, '/api/billing/deposit', { provider: 'manual', reference: r.j.reference, tx: 'TRF-2026-0042' });
  assert(r.j.pending, 'bank method accepts a transfer reference');
  const bdep = (await ADM('/api/admin/deposits')).j.deposits[0];
  r = await post(ADM, `/api/admin/deposits/${bdep.id}/reject`, { reason: 'Not received' });
  await sleep(150);
  el = (await ADM('/api/admin/emails')).j;
  assert(count('topup_review') === 2 && count('topup_rejected') === 1 && count('payment_received') >= 1, 'review, rejection and receipt emails logged');
  // reorder + delete
  r = await post(ADM, '/api/admin/pay-methods/order', { ids: [bank, btc, 'm_usdt'] });
  assert(r.j.methods[0].id === bank, 'methods can be reordered');
  r = await ADM('/api/admin/pay-methods/' + btc, { method: 'DELETE' });
  assert(r.s === 200 && !(await U('/api/billing')).j.pay_methods.some((x) => x.id === btc), 'deleted method is gone for customers');
  r = await post(U, '/api/billing/deposit', { provider: 'crypto', amount: 20 });
  assert(r.j.crypto && r.j.method_id === 'm_usdt', 'old {provider:"crypto"} flow still maps to USDT');
  // paystack key from admin, masked
  r = await post(ADM, '/api/admin/pay-methods', { type: 'paystack', secret: 'sk_test_abcdef1234567890' });
  assert(r.s === 200 && r.j.methods.find((x) => x.id === 'paystack').secret.includes('••••') && !JSON.stringify(r.j).includes('abcdef1234567890'), 'Paystack key saved from admin and masked');
  assert((await U('/api/billing')).j.methods.paystack === true, 'Paystack becomes available to customers');

  // ---- support team: photo upload + agent face on replies
  r = await post(ADM, '/api/admin/team/photo', { data: 'data:image/png;base64,' + Buffer.from('not an image').toString('base64') });
  assert(r.s === 400, 'non-image upload rejected');
  r = await post(ADM, '/api/admin/team/photo', { data: 'data:image/png;base64,' + Buffer.alloc(1.6 * 1024 * 1024, 1).toString('base64') });
  assert(r.s === 400 || r.s === 413, 'photo over 1.5 MB rejected (' + r.s + ')');
  r = await post(ADM, '/api/admin/team/photo', { data: PNG });
  assert(r.s === 200 && /^\/media\/team\/\w+\.png\?v=\d+$/.test(r.j.photo), 'team photo uploaded');
  const photo = r.j.photo;
  const img = await fetch(B + photo.split('?')[0]);
  assert(img.status === 200 && img.headers.get('content-type') === 'image/png', 'team photo served');
  r = await put(ADM, '/api/admin/settings', { support: { team: [{ id: r.j.id, name: 'Maya', role: 'Customer success', photo, email: 'admin@x.com' }, { name: 'Noah', role: 'Tech support' }], reply_time: 'Replies in under 5 minutes', hours: 'Every day, 8am–10pm' } });
  assert(r.s === 200 && r.j.settings.support.team.length === 2, 'team saved');
  cfg = await fetch(B + '/api/config').then((x) => x.json());
  assert(cfg.support.team[0].name === 'Maya' && cfg.support.team[0].photo === photo && cfg.support.team[1].photo === '' && !('email' in cfg.support.team[0]) && cfg.support.reply_time === 'Replies in under 5 minutes', 'config shows team without their emails');
  await post(V, '/api/support', { body: 'Hello, do you support TikTok?', email: 'visitor@y.com' });
  const tk = (await ADM('/api/admin/support')).j;
  assert(tk.counts.unread === 1 && tk.me && tk.me.name === 'Maya', 'inbox has unread count and knows my face');
  r = await post(ADM, '/api/admin/support/' + tk.tickets[0].id, { body: 'Yes, TikTok works.' });
  r = await V('/api/support');
  const am = r.j.messages.find((x) => x.from_admin);
  assert(am && am.agent && am.agent.name === 'Maya' && am.agent.photo === photo && r.j.team.length === 2 && r.j.hours === 'Every day, 8am–10pm' && r.j.reply_time, 'customer sees who replied, with face, team and hours');
  await sleep(150);
  el = (await ADM('/api/admin/emails')).j;
  assert(el.log.some((l) => l.kind === 'support_reply' && l.to_addr === 'visitor@y.com' && /Maya/.test(l.subject)), 'support reply email names the agent');
  r = await post(ADM, `/api/admin/support/${tk.tickets[0].id}/close`);
  r = await post(ADM, `/api/admin/support/${tk.tickets[0].id}/reopen`);
  assert((await ADM('/api/admin/support')).j.tickets.length === 1, 'conversation can be closed and reopened');
  await post(U, '/api/support', { body: 'Where is my BTC top-up?' });
  const ut = (await ADM('/api/admin/support')).j.tickets.find((t) => t.email === 'cust@x.com');
  r = await ADM('/api/admin/support/' + ut.id);
  assert(r.j.context && r.j.context.channels.length === 1 && r.j.context.last_joins.length === 3 && r.j.context.balance_cents === 2500, 'customer context panel data');
  r = await put(ADM, '/api/admin/canned', { items: [{ title: 'Snap Pixel ID', body: 'Events Manager → your pixel → copy the ID.' }] });
  assert(r.s === 200 && (await ADM('/api/admin/canned')).j.items[0].title === 'Snap Pixel ID', 'saved replies stored');
  await put(ADM, '/api/admin/settings', { features: { support_chat: false } });
  assert((await V('/api/support')).s === 403, 'support chat off → /api/support 403');
  await put(ADM, '/api/admin/settings', { features: { support_chat: true } });

  // ---- other switches
  await put(ADM, '/api/admin/settings', { features: { referrals: false, withdrawals: false, ftd: false, bot_no_token: false, tiktok: false } });
  assert((await U('/api/referrals')).s === 403, 'referrals off → 403');
  assert((await post(U, '/api/referrals/withdraw', { method: 'usdt', details: 'T' + 'A'.repeat(33) })).s === 403, 'withdrawals blocked');
  r = await U('/api/conversions'); const pbu = new URL(r.j.postback_url).pathname;
  assert((await fetch(B + pbu + '?sub1=123&status=ftd')).status === 403, 'ftd off → postback 403');
  assert((await post(U, '/api/bot-targets/external', { username: 'mystore_bot' })).s === 403, 'bot without token off → 403');
  assert((await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ platform: 'tiktok', tt_pixel: 'CABC123DEF456GHI' }) })).s === 403, 'TikTok off → PATCH rejected');
  await put(ADM, '/api/admin/settings', { features: { referrals: true, withdrawals: true, ftd: true, bot_no_token: true, tiktok: true } });
  assert((await U('/api/referrals')).s === 200, 'switches back on');

  // ---- emails: previews + test send
  el = (await ADM('/api/admin/emails')).j;
  assert(el.templates.length >= 15 && ['welcome', 'password_reset', 'password_changed', 'payment_received', 'topup_review', 'topup_rejected', 'low_balance', 'tracking_paused', 'free_joins_80', 'free_joins_used', 'payout_requested', 'payout_sent', 'payout_rejected', 'support_reply', 'weekly_summary'].every((n) => el.templates.some((t) => t.name === n)), 'all email templates listed');
  let pv = await ADM('/api/admin/emails/payment_received/preview');
  assert(pv.s === 200 && /text\/html/.test(pv.h.get('content-type')) && /<table/.test(pv.t) && /By Zedapex company/.test(pv.t) && /max-width:600px/.test(pv.t), 'email preview is table-based HTML with the footer');
  pv = await ADM('/api/admin/emails/support_reply/preview?format=text');
  assert(/Joinvoo · By Zedapex company/.test(pv.t) && !/<table/.test(pv.t), 'plain-text alternative');
  assert((await U('/api/admin/emails/welcome/preview')).s === 403, 'customers cannot open email previews');
  r = await post(ADM, '/api/admin/emails/low_balance/test');
  assert(r.j.ok && r.j.sent_to === 'admin@x.com', 'test email sent to the admin');
  r = await post(U, '/api/password', { current: 'password1', password: 'password2' });
  await sleep(150);
  el = (await ADM('/api/admin/emails')).j;
  assert(count('password_changed') === 1, 'password changed email');
  await put(ADM, '/api/admin/settings', { brand: { company: 'Zedapex', support_email: 'help@joinvoo.com', mail_from_name: 'Joinvoo Team' } });
  pv = await ADM('/api/admin/emails/welcome/preview');
  assert(/help@joinvoo\.com/.test(pv.t), 'brand support email used in emails');
  r = await put(ADM, '/api/admin/settings', { pricing: { base_cents: null, included: null, per_join_cents: null, free_joins: null } });
  assert(r.j.settings.pricing.base_cents === 3000 && r.j.settings.pricing.included === 2000, 'pricing resets to defaults');
})();
