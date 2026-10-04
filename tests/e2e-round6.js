// Round 6: profile + Joomoji, levels, plans + Pro trial + locking, adset/lang reports, compare insights and campaigns, smart links,
// fraud join filtering, alerts (morning summary in the user's time zone), Joe (rules without a key, AI with a fake Anthropic API),
// admin credits (single + bulk), admin plans/trial/levels/Joe settings, server i18n, email templates + art, static files, blog routes.
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http');
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
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
let ipn = 20;
const click = (slug, q = '', o = {}) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': o.ua || UA, 'x-forwarded-for': '102.90.1.' + (ipn++), cookie: 'jv_h=1' },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwR6' + ipn + q }) }).then((x) => x.json());
const today = new Date().toISOString().slice(0, 10), yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const I18N = path.join(__dirname, '..', 'public', 'i18n');
const FR = JSON.parse(fs.readFileSync(path.join(I18N, 'server.fr.json'), 'utf8')), RU = JSON.parse(fs.readFileSync(path.join(I18N, 'server.ru.json'), 'utf8'));
const EN = JSON.parse(fs.readFileSync(path.join(I18N, 'server.en.json'), 'utf8'));

// ---- a fake Anthropic Messages API on :4200: first asks for a tool, then answers from the tool result ----
let aiMode = 'stats'; const aiCalls = [];
const ai = http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
  const j = JSON.parse(b || '{}'); aiCalls.push({ url: req.url, headers: req.headers, body: j }); res.setHeader('content-type', 'application/json');
  if (aiMode === 'fail') { res.statusCode = 529; return res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })); }
  const last = j.messages[j.messages.length - 1];
  const results = Array.isArray(last.content) ? last.content.filter((c) => c.type === 'tool_result') : [];
  if (!results.length) {
    const name = aiMode === 'health' ? 'channels_health' : 'get_stats';
    return res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: j.model, stop_reason: 'tool_use', content: [{ type: 'text', text: 'Checking your numbers.' }, { type: 'tool_use', id: 'toolu_1', name, input: {} }] }));
  }
  const data = JSON.parse(results[0].content);
  const text = data.totals ? `You had **${data.totals.joins} tracked joins** in the last 7 days.` : `Your channels: ${data.channels.map((c) => c.title).join(', ')}.`;
  res.end(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: j.model, stop_reason: 'end_turn', content: [{ type: 'text', text }] }));
}); }).listen(4200);

(async () => {
  const ADM = client(), U = client(), V = client();
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
  await sleep(100);
  const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
  await fetch(B + vlink[1], { redirect: 'manual' });
  const mails = async () => (await ADM('/api/admin/emails')).j.log;
  const mail = async (kind, to) => (await mails()).find((l) => l.kind === kind && l.to_addr === to);

  // ---------- profile at sign-up ----------
  let r = await post(client(), '/api/signup', { country: 'GB', email: 'bad@x.com', password: 'password1', nickname: '<script>' });
  assert(r.s === 400 && /Nickname/i.test(r.j.error), 'sign-up refuses a bad nickname');
  r = await post(U, '/api/signup', { country: 'GB', email: 'buyer@x.com', password: 'password1', name: 'Lucas Grant', nickname: 'Lucky', gender: 'male', lang: 'fr',
    avatar: { v: 1, g: 'm', skin: 3, hair: 2, hairColor: 1, eyes: 2, brows: 1, mouth: 2, outfit: 3, outfitColor: 4, acc: 1, bg: 5 } });
  assert(r.s === 200, 'sign-up with gender, avatar, lang and nickname');
  let me = (await U('/api/me')).j;
  assert(me.nickname === 'Lucky' && me.display_name === 'Lucky' && me.gender === 'male' && me.lang === 'fr' && me.avatar && me.avatar.skin === 3 && me.avatar.acc === 1, 'GET /api/me has nickname, gender, avatar, lang, display_name');
  assert(me.level && me.level.id === 'rookie' && me.level.index === 1 && me.level.leads_30d === 0 && me.level.next.id === 'hustler' && me.level.next.need === 1000 && me.level.show_badge === true, 'new account is a Rookie, 1,000 leads to Hustler');
  assert(me.levels.length === 7 && me.levels.map((l) => l.name).join() === 'Rookie,Hustler,Operator,Shark,Whale,Kraken,Legend' && me.levels[3].from === 25000 && me.levels[6].from === 1000000, 'the 7-level ladder');
  const wm = await mail('welcome', 'buyer@x.com');
  assert(wm && wm.subject === FR['welcome.subject'] && FR['welcome.subject'] !== EN['welcome.subject'], 'welcome email goes out in the user’s language (fr)');

  // ---------- PATCH /api/me ----------
  r = await patch(U, '/api/me', { nickname: 'x' }); assert(r.s === 400, 'nickname under 2 characters refused');
  r = await patch(U, '/api/me', { avatar: { v: 1, g: 'm', skin: 3, laser: 1 } }); assert(r.s === 400 && /Unknown avatar part/.test(r.j.error), 'avatar with an unknown key refused');
  r = await patch(U, '/api/me', { avatar: { v: 1, g: 'm', skin: 9 } }); assert(r.s === 400, 'avatar value out of range refused');
  r = await patch(U, '/api/me', { avatar: { v: 1, g: 'm', skin: 1, pad: 'x'.repeat(420) } }); assert(r.s === 400 && /too big/.test(r.j.error), 'avatar over 400 bytes refused');
  r = await patch(U, '/api/me', { lang: 'de' }); assert(r.s === 400, 'unsupported language refused');
  r = await patch(U, '/api/me', { tz: 'Mars/Olympus' }); assert(r.s === 400, 'unknown time zone refused');
  r = await patch(U, '/api/me', { ad_account_id: 'abc' }); assert(r.s === 400, 'bad ad account id refused');
  r = await patch(U, '/api/me', { nickname: 'Lucky Ace', tz: 'Europe/Lisbon', show_level: false, ad_account_id: 'act_1234567890', gender: 'other' });
  assert(r.s === 200 && r.j.nickname === 'Lucky Ace' && r.j.tz === 'Europe/Lisbon' && r.j.level.show_badge === false && r.j.ad_account_id === 'act_1234567890' && r.j.gender === 'other', 'PATCH /api/me saves nickname, tz, show_level, ad account, gender');
  await patch(U, '/api/me', { show_level: true, nickname: 'Lucky' });
  await post(ADM, '/api/admin/jobs/run', { job: 'levels' }); // first pass records Rookie quietly

  // ---------- channels: A, B (backup) and a bot ----------
  r = await post(U, '/api/bots', { token: '7712046001:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  let st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname, BOT = 7712046001;
  const tgPost = (u) => U(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
  let upd = 100;
  const addCh = (id, title) => tgPost({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT } } } });
  await addCh(-100601, 'Daily Deals Club'); await addCh(-100602, 'Deals Backup');
  await post(U, '/api/bot-targets', { bot_id: r.j.bot.id });
  let chs = (await U('/api/channels')).j.channels;
  const A = chs.find((c) => c.title === 'Daily Deals Club'), Bk = chs.find((c) => c.title === 'Deals Backup'), BT = chs.find((c) => c.type === 'bot');
  for (const c of [A, Bk]) await patch(U, '/api/channels/' + c.id, { pixel_id: '884210395527140', capi_token: 'EAAr6test' });
  for (let i = 0; i < 80; i++) { chs = (await U('/api/channels')).j.channels; if (chs.every((c) => c.type === 'bot' || c.pool >= 3)) break; await sleep(400); }
  assert(chs.filter((c) => c.type !== 'bot').every((c) => c.pool >= 3) && A.redirect_to === null && A.redirect_title === null, 'two channels with ready links; redirect_to/redirect_title in GET /api/channels');
  const slugA = new URL(A.tracking_url).pathname, slugB = new URL(Bk.tracking_url).pathname, slugBot = new URL(BT.tracking_url).pathname;
  const join = (chat, title, link, user) => tgPost({ update_id: upd++, chat_member: { chat: { id: chat, title, type: 'channel' }, from: { id: user.id }, date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: user.id } }, new_chat_member: { status: 'member', user: { is_bot: false, ...user } }, invite_link: { invite_link: link, creator: { id: BOT } } } });

  // ---------- joins: ad set + language, and the fraud filter ----------
  const people = [[6001, 'Sofia', 'pt', '&utm_campaign=Spring&utm_term=Broad%2025-34'], [6002, 'Ravi', 'en', '&utm_campaign=Spring&utm_term=Lookalike'], [6003, 'Yuki', 'es-ES', '&utm_campaign=Autumn&utm_adset=Broad%2025-34']];
  for (const [id, name, lang, q] of people) { const go = await click(slugA, q); await join(-100601, 'Daily Deals Club', go.url, { id, first_name: name, username: name.toLowerCase(), language_code: lang }); }
  let go = await click(slugA, '&utm_campaign=Spring&utm_term=Lookalike'); await join(-100601, 'Daily Deals Club', go.url, { id: 6004, first_name: 'Deleted Account' });
  go = await click(slugA, '&utm_campaign=Spring&utm_term=Lookalike', { ua: 'python-requests/2.31' }); await join(-100601, 'Daily Deals Club', go.url, { id: 6005, first_name: 'Chloe', username: 'chloe_c' });
  go = await click(slugB, '&utm_campaign=Spring'); await join(-100602, 'Deals Backup', go.url, { id: 6001, first_name: 'Sofia', username: 'sofia' });
  // a burst of 16 bot Starts within seconds
  const codes = []; for (let i = 0; i < 16; i++) codes.push(new URL((await click(slugBot, '&utm_campaign=Botty')).url).searchParams.get('start'));
  await Promise.all(codes.map((c, i) => tgPost({ update_id: upd++, message: { message_id: i + 1, date: Math.floor(Date.now() / 1000), chat: { id: 7100 + i, type: 'private' }, from: { id: 7100 + i, first_name: 'Mateo' + i, username: 'mateo' + i }, text: '/start ' + c } })));
  await sleep(2600);
  let jr = (await U(`/api/joins?from=${today}&to=${today}&tz=0&type=filtered&limit=50`)).j;
  const reasons = new Set(jr.rows.map((x) => x.suspect_reason));
  assert(['deleted_account', 'fake_click', 'repeat_user', 'burst'].every((x) => reasons.has(x)) && jr.rows.every((x) => x.suspect === 1), 'filtered joins: deleted account, fake click, repeat user and burst (' + [...reasons].join(', ') + ')');
  assert(jr.rows.filter((x) => x.channel_id !== BT.id).every((x) => x.capi_status === 'filtered'), 'filtered joins get status “filtered” instead of being sent');
  st = await ms();
  const ev = (st.events || []).filter((e) => /^tgjoin_-10060[12]_|^tgjoin_7712046001_/.test(e.event_id || ''));
  assert(ev.some((e) => e.event_id === 'tgjoin_-100601_6001') && !ev.some((e) => /_6004$|_6005$/.test(e.event_id)) && !ev.some((e) => e.event_id === 'tgjoin_-100602_6001'), 'filtered joins are never sent to Meta; real ones are');
  let s1 = (await U(`/api/stats?from=${today}&to=${today}&tz=0`)).j;
  const nBurst = jr.rows.filter((x) => x.suspect_reason === 'burst').length;
  assert(s1.totals.filtered_joins === 3 + nBurst && s1.totals.joins === 3 + 16 - nBurst, `stats: ${s1.totals.joins} tracked joins, ${s1.totals.filtered_joins} filtered`);
  const allj = (await U(`/api/joins?from=${today}&to=${today}&tz=0&limit=100`)).j;
  assert(allj.rows.every((x) => x.suspect === 0 || x.suspect === 1) && allj.rows.some((x) => x.suspect === 1 && x.suspect_reason), '/api/joins rows carry suspect + suspect_reason');
  let bd = (await U(`/api/breakdown?dim=adset&from=${today}&to=${today}&tz=0`)).j.rows;
  const row = (k) => bd.find((x) => x.key === k) || {};
  assert(row('Broad 25-34').joins === 2 && row('Lookalike').joins === 1 && row('Lookalike').filtered_joins === 2, 'ad set report from utm_term / utm_adset, fake joins left out');
  bd = (await U(`/api/breakdown?dim=lang&from=${today}&to=${today}&tz=0`)).j.rows;
  assert(row('pt').joins === 1 && row('en').joins === 1 && row('es').joins === 1, 'language report from the joiner’s Telegram language');

  // ---------- levels ----------
  r = await put(ADM, '/api/admin/settings', { levels: { levels: [{ name: 'Rookie', from: 0 }, { id: 'hustler', name: 'Hustler', from: 5 }, { id: 'operator', name: 'Operator', from: 1000 }, { id: 'shark', name: 'Shark', from: 25000 }] } });
  assert(r.s === 200 && r.j.settings.levels.length === 4 && r.j.settings.levels[1].from === 5, 'admin edits the level ladder');
  await post(ADM, '/api/admin/jobs/run', { job: 'levels' });
  me = (await U('/api/me')).j;
  assert(me.level.id === 'hustler' && me.level.index === 2 && me.level.leads_30d === s1.totals.joins && me.level.next.name === 'Operator' && me.level.since > 0, 'leads (ad joins + bot Starts, no fake ones) make a Hustler');
  let lm = await mail('level_up', 'buyer@x.com');
  assert(lm && lm.subject.includes('Hustler'), 'level-up email sent');
  let ins = (await U('/api/joe/insights')).j;
  assert(ins.items[0].title.startsWith('You just hit Hustler'), 'Joe announces the new level');
  let ul = (await ADM('/api/admin/users?q=buyer')).j.users[0];
  assert(ul.level && ul.level.id === 'hustler' && ul.plan === 'basic', 'admin users list shows level and plan');
  await put(ADM, '/api/admin/settings', { levels: { levels: [{ name: 'Rookie', from: 0 }, { id: 'hustler', name: 'Hustler', from: 500 }] } });
  await post(ADM, '/api/admin/jobs/run', { job: 'levels' });
  me = (await U('/api/me')).j;
  assert(me.level.id === 'rookie' && (await mails()).filter((l) => l.kind === 'level_up' && l.to_addr === 'buyer@x.com').length === 1, 'level down is silent');
  await put(ADM, '/api/admin/settings', { levels: { levels: null } });
  assert((await U('/api/me')).j.levels.length === 7, 'levels back to the default ladder');

  // ---------- smart link ----------
  r = await patch(U, '/api/channels/' + A.id, { redirect_to: A.id }); assert(r.s === 400, 'cannot redirect a channel to itself');
  r = await patch(U, '/api/channels/' + A.id, { redirect_to: BT.id }); assert(r.s === 400, 'cannot redirect a channel to a bot');
  r = await patch(U, '/api/channels/' + A.id, { redirect_to: Bk.id });
  chs = (await U('/api/channels')).j.channels;
  assert(r.s === 200 && chs.find((c) => c.id === A.id).redirect_to === Bk.id && chs.find((c) => c.id === A.id).redirect_title === 'Deals Backup', 'backup channel set: redirect_to + redirect_title');
  const pageA = await fetch(B + slugA).then((x) => x.text());
  assert(pageA.includes(slugB + '/go') && !pageA.includes(slugA + '/go'), 'the old link’s page now opens the backup channel');
  go = await click(slugA, '&utm_campaign=Moved');
  await join(-100602, 'Deals Backup', go.url, { id: 6010, first_name: 'Hannah', username: 'hannah_b', language_code: 'en' });
  await sleep(300);
  const moved = (await U(`/api/joins?from=${today}&to=${today}&tz=0&q=hannah_b`)).j.rows[0];
  assert(moved && moved.channel_title === 'Deals Backup' && moved.click_id && moved.params.utm_campaign === 'Moved', 'a click on the old ad link joins the backup channel, tracked and attributed');
  r = await patch(U, '/api/channels/' + A.id, { redirect_to: null });
  assert(r.s === 200 && (await U('/api/channels')).j.channels.find((c) => c.id === A.id).redirect_to === null, 'traffic sent back to the original channel');

  // ---------- spend, compare periods, insights, campaign lines ----------
  await post(U, '/api/spend', { date: today, platform: 'meta', campaign: 'Spring', amount: '50.00' });
  await post(U, '/api/spend', { date: today, platform: 'meta', campaign: 'Autumn', amount: '20.00' });
  let cp = (await U(`/api/compare/periods?a_from=${today}&a_to=${today}&b_from=${yday}&b_to=${yday}&tz=0`)).j;
  assert(cp.a.totals.spend_cents === 7000 && cp.a.totals.cost_per_join_cents === Math.round(7000 / cp.a.totals.joins) && cp.a.totals.roas === 0 && 'ftd_rate' in cp.a.totals && cp.a.totals.cost_per_ftd_cents === null, 'compare periods: spend, cost per join, cost per FTD (null without FTDs), ROAS, FTD rate');
  assert(cp.a.series.every((x) => 'spend_cents' in x && 'cost_per_join_cents' in x && 'roas' in x && 'ftd_rate' in x), 'compare series carry the spend metrics too');
  let ci = (await U(`/api/compare/insights?a_from=${today}&a_to=${today}&b_from=${yday}&b_to=${yday}&tz=0`)).j;
  assert(Array.isArray(ci.sentences) && ci.sentences.some((x) => /joins, up from none/.test(x)) && ci.highlights.some((h) => h.metric === 'joins' && h.a === cp.a.totals.joins && h.good === true), 'compare insights: sentences + highlights from real numbers');
  let cc = (await U(`/api/compare/campaigns?names=Spring,Autumn&from=${yday}&to=${today}&tz=0&group=day`)).j;
  assert(cc.series.Spring.length === 2 && cc.series.Spring[1].key === today && cc.series.Spring[1].joins === 2 && cc.series.Spring[1].spend_cents === 5000 && cc.series.Autumn[1].joins === 1 && cc.series.Spring[0].joins === 0, 'campaign lines: joins and spend per day');
  cc = (await U(`/api/compare/campaigns?names=Spring&from=${today}&to=${today}&tz=0&group=week`)).j;
  assert(cc.series.Spring.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(cc.series.Spring[0].key) && new Date(cc.series.Spring[0].key + 'T00:00:00Z').getUTCDay() === 1, 'campaign lines by week (week starts Monday)');

  // ---------- conversions, Pro trial and the lock ----------
  r = await put(ADM, '/api/admin/settings', { trial: { ftd_limit: 2 } });
  assert(r.s === 200 && r.j.settings.trial.ftd_limit === 2 && r.j.settings.trial.days === 7 && r.j.settings.trial.starts === 'first_ftd', 'admin edits the trial (2 FTDs, 7 days, starts at first FTD)');
  let bill = (await U('/api/billing')).j;
  assert(bill.plan.id === 'basic' && bill.plan.renews && bill.plan.change_pending === null && bill.plans.pro.base_cents === 9900 && bill.trial.status === 'not_started' && bill.trial.ftd_limit === 2, 'billing: plan, plans, trial (not started)');
  const pbPath = new URL((await U('/api/conversions')).j.postback_url).pathname;
  r = await fetch(B + pbPath + '?sub1=6001&status=ftd&payout=100&txid=R6A').then((x) => x.json());
  await sleep(250);
  bill = (await U('/api/billing')).j;
  assert(r.matched && bill.trial.status === 'active' && bill.trial.ftd_used === 1 && bill.trial.ends_at - bill.trial.started_at === 7 * 864e5, 'first attributed FTD starts the Pro trial');
  assert(await mail('trial_started', 'buyer@x.com'), 'trial_started email');
  let conv = (await U('/api/conversions')).j;
  assert(!conv.locked && conv.rows.length === 1, 'during the trial, deposits are visible');
  await fetch(B + pbPath + '?sub1=6002&status=ftd&payout=50&txid=R6B');
  await sleep(2600);
  bill = (await U('/api/billing')).j;
  assert(bill.trial.status === 'ended' && bill.trial.ftd_used === 2, 'trial ends at the FTD limit');
  assert(await mail('trial_ended', 'buyer@x.com'), 'trial_ended email');
  conv = (await U('/api/conversions')).j;
  assert(conv.locked === true && conv.locked_count === 2 && conv.rows.length === 0 && /\/pb\//.test(conv.postback_url), 'Basic after the trial: conversions locked with a count');
  s1 = (await U(`/api/stats?from=${today}&to=${today}&tz=0`)).j;
  assert(s1.totals.ftd === 2 && s1.totals.ftd_locked === true && s1.totals.revenue_cents === null, 'stats keep the FTD count, lock the revenue');
  bd = (await U(`/api/breakdown?dim=campaign&from=${today}&to=${today}&tz=0`)).j;
  assert(bd.locked && bd.rows.every((x) => x.locked === true && x.ftd === null && x.revenue_cents === null && x.roas === null) && bd.rows.find((x) => x.key === 'Spring').joins === 2, 'campaign rows hide FTD/revenue/ROAS, keep joins');
  cp = (await U(`/api/compare/periods?a_from=${today}&a_to=${today}&b_from=${yday}&b_to=${yday}&tz=0`)).j;
  assert(cp.locked && cp.a.totals.revenue_cents === null && cp.a.totals.ftd === 2, 'compare locks revenue, keeps the FTD count');
  jr = (await U(`/api/joins?from=${today}&to=${today}&tz=0&type=ftd`)).j;
  assert(jr.rows.length === 2 && jr.rows.every((x) => x.convs.every((c) => c.value_cents === null && c.locked)), 'people list hides deposit values');
  st = await ms();
  assert((st.events || []).filter((e) => e.event_name === 'Purchase' && /^jvconv_/.test(e.event_id) && e.custom_data && (e.custom_data.value === 100 || e.custom_data.value === 50)).length >= 2, 'deposits are still sent to Meta after the trial');
  ins = (await U('/api/joe/insights')).j;
  assert(ins.items.some((i) => i.id === 'locked' && /2 deposits tracked/.test(i.title)), 'Joe: “2 deposits tracked — upgrade”');

  // ---------- admin credits ----------
  const uid = ul.id;
  r = await post(U, `/api/admin/users/${uid}/credits`, { credits: 100 }); assert(r.s === 403, 'only admins add credits');
  r = await post(ADM, `/api/admin/users/${uid}/credits`, { credits: 'lots' }); assert(r.s === 400, 'credits must be a whole number');
  r = await post(U, '/api/billing/plan', { plan: 'pro' });
  const { left, dim } = (() => { const d = new Date(); const dm = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); return { left: dm - d.getUTCDate() + 1, dim: dm }; })();
  const cost = Math.round((9900 - 3000) * left / dim);
  assert(r.s === 400 && r.j.need_cents === cost && /more credits/.test(r.j.error), 'upgrade needs credits: {error, need_cents}');
  r = await post(ADM, `/api/admin/users/${uid}/credits`, { credits: 20000, reason: 'Launch gift', notify: true });
  assert(r.s === 200 && r.j.ok && r.j.balance_credits === 20000, 'admin adds 20,000 credits');
  bill = (await U('/api/billing')).j;
  assert(bill.history[0].kind === 'gift' && bill.history[0].note === 'Launch gift' && bill.credits.gift === 20000 && bill.balance_cents === 20000, 'positive credits are a “gift” ledger row with the reason');
  const cm = await mail('credits_added', 'buyer@x.com');
  assert(cm && cm.subject === FR['credits.subject_add'].replace('{n}', '20,000'), 'credits_added email in French');

  // ---------- Pro ----------
  r = await post(U, '/api/billing/plan', { plan: 'pro' });
  bill = (await U('/api/billing')).j;
  assert(r.s === 200 && r.j.charged_cents === cost && bill.plan.id === 'pro' && bill.plan.base_cents === 9900 && bill.plan.included === 5000 && bill.balance_cents === 20000 - cost, `upgrade charges the prorated difference (${cost} credits)`);
  assert(bill.trial.status === 'pro' && !(await U('/api/conversions')).j.locked && (await U('/api/conversions')).j.rows.length === 2, 'on Pro everything unlocks');
  assert(await mail('pro_welcome', 'buyer@x.com'), 'pro_welcome email');
  r = await post(U, '/api/billing/plan', { plan: 'basic' });
  bill = (await U('/api/billing')).j;
  assert(r.j.change_pending === 'basic' && bill.plan.id === 'pro' && bill.plan.change_pending === 'basic' && await mail('plan_changed', 'buyer@x.com'), 'downgrade is booked for month end (plan_changed email)');
  r = await post(U, '/api/billing/plan', { plan: 'pro' });
  bill = (await U('/api/billing')).j;
  assert(r.s === 200 && bill.plan.change_pending === null && bill.balance_cents === 20000 - cost, 'staying on Pro cancels the downgrade, no new charge');
  r = await post(U, '/api/billing/plan', { plan: 'gold' }); assert(r.s === 400, 'unknown plan refused');

  // ---------- second user: bulk credits, admin plan/trial, rank up, isolation ----------
  await post(V, '/api/signup', { country: 'GB', email: 'other@x.com', password: 'password1', name: 'Aisha' });
  const vid = (await ADM('/api/admin/users?q=other')).j.users[0].id;
  r = await post(ADM, '/api/admin/credits/bulk', { user_ids: [uid, vid], credits: -500, reason: 'Correction', notify: false });
  assert(r.s === 200 && r.j.count === 2 && r.j.results.every((x) => x.ok), 'bulk: remove 500 credits from two users');
  assert((await V('/api/billing')).j.history[0].kind === 'adjust' && (await V('/api/billing')).j.balance_cents === -500, 'negative amounts are “adjust” rows');
  r = await post(ADM, '/api/admin/credits/bulk', { user_ids: [], credits: 10 }); assert(r.s === 400, 'bulk needs users');
  r = await post(ADM, `/api/admin/users/${vid}/plan`, { plan: 'pro' });
  assert(r.s === 200 && r.j.plan.id === 'pro' && (await V('/api/billing')).j.balance_cents === -500, 'admin can set a plan without charging');
  r = await post(ADM, `/api/admin/users/${uid}/plan`, { plan: 'basic' });
  assert(r.j.trial.status === 'ended' && (await U('/api/conversions')).j.locked, 'back on Basic, the ended trial locks again');
  r = await post(ADM, `/api/admin/users/${uid}/trial`, {});
  let ud = (await ADM('/api/admin/users/' + uid)).j;
  assert(r.s === 200 && r.j.trial.status === 'not_started' && ud.trial.status === 'not_started' && ud.plan.id === 'basic' && ud.level && !(await U('/api/conversions')).j.locked, 'admin resets the trial (unlocks until the next FTD)');
  // rank up with a manual top-up
  r = await post(V, '/api/billing/deposit', { provider: 'crypto', amount: 300 });
  await post(V, '/api/billing/deposit', { provider: 'crypto', reference: r.j.reference, tx: crypto.randomBytes(32).toString('hex') });
  const dep = (await ADM('/api/admin/deposits?status=pending')).j.deposits.find((d) => d.email === 'other@x.com');
  await post(ADM, `/api/admin/deposits/${dep.id}/approve`, {});
  await sleep(150);
  const rk = await mail('rank_up', 'other@x.com');
  assert(rk && /Silver/.test(rk.subject), 'rank_up email when top-ups reach a new rank');
  // V's own bot and channel, to prove Joe only reads the asking user's data
  await post(V, '/api/bots', { token: '7712046002:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  const st2 = await ms();
  await V(new URL(st2.webhook.url).pathname, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': st2.webhook.secret_token }, body: JSON.stringify({ update_id: 1, my_chat_member: { chat: { id: -100603, title: 'Other Owner Club', type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: 7712046002 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: 7712046002 } } } }) });

  // ---------- alerts: Telegram bot connect + morning summary at 08:00 in the user's time zone ----------
  let al = (await U('/api/alerts')).j;
  assert(al.available && al.prefs.no_joins_2h === true && al.prefs.no_ftd_campaign === false && al.prefs.daily_report === true && /\?start=/.test(al.link), 'alerts: new prefs no_joins_2h + no_ftd_campaign');
  al = (await post(U, '/api/alerts', { prefs: { no_ftd_campaign: true } })).j;
  assert(al.prefs.no_ftd_campaign === true, 'alert prefs saved');
  const secret = fs.readFileSync(path.join(path.dirname(process.env.SRV_LOG), 'data', '.secret'), 'utf8');
  const code = new URL(al.link).searchParams.get('start');
  r = await fetch(B + '/tg-alert', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': crypto.createHmac('sha256', secret).update('alertbot').digest('base64url').slice(0, 16) },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, chat: { id: 8800, type: 'private' }, from: { id: 8800, language_code: 'en' }, text: '/start ' + code } }) });
  await sleep(150);
  let msgs = ((await ms()).msgs || []).filter((x) => x.chat_id === 8800);
  assert(r.status === 200 && msgs.length && msgs[msgs.length - 1].text === FR['alertbot.connected'], 'alert bot connects and replies in the account’s language');
  const off = (new Date().getUTCHours() - 12) * 60; // the user's clock says 12:xx
  await patch(U, '/api/me', { tz: String(off) });
  await post(ADM, '/api/admin/jobs/run', { job: 'alerts' });
  await sleep(150);
  msgs = ((await ms()).msgs || []).filter((x) => x.chat_id === 8800);
  const morning = msgs.find((x) => x.text.startsWith(FR['alert.daily_title'].split('{date}')[0]));
  assert(morning && morning.text.includes(FR['alert.daily_joins'].split('{joins}')[0]), 'morning summary sent after 08:00 local, in French');
  await post(ADM, '/api/admin/jobs/run', { job: 'alerts' }); await sleep(100);
  assert(((await ms()).msgs || []).filter((x) => x.chat_id === 8800 && x.text.startsWith(FR['alert.daily_title'].split('{date}')[0])).length === 1, 'only one morning summary per day');
  await patch(U, '/api/me', { tz: 'Europe/Lisbon' });

  // ---------- Joe without an AI key: rule-based ----------
  let jc = (await U('/api/joe/chat')).j;
  assert(jc.enabled === true && jc.ai === false && jc.remaining_today === 30 && Array.isArray(jc.messages), 'Joe chat: enabled, rule-based (ai:false), 30 questions a day');
  r = await post(U, '/api/joe/chat', { message: 'How are my ads doing?' });
  assert(r.s === 200 && /tracked joins/.test(r.j.reply) && r.j.reply.includes(String((await U(`/api/stats?from=${new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)}&to=${today}&tz=0`)).j.totals.joins)) && r.j.remaining_today === 29 && r.j.suggestions.length, 'rules: 7-day summary from the user’s real numbers');
  r = await post(U, '/api/joe/chat', { message: 'Which campaign should I scale?' });
  assert(/campaign/i.test(r.j.reply), 'rules: scaling answer (or says what data is missing)');
  r = await post(U, '/api/joe/chat', { message: 'How does request-to-join mode work?' });
  assert(/Request-to-join/i.test(r.j.reply) && /approves/.test(r.j.reply), 'rules: answers from joe/knowledge.md');
  r = await post(U, '/api/joe/chat', { message: 'Any fake joins?' });
  assert(/suspicious joins/.test(r.j.reply), 'rules: fraud summary');
  jc = (await U('/api/joe/chat')).j;
  assert(jc.messages.length === 8 && jc.messages[0].role === 'user' && jc.messages[1].role === 'joe' && jc.remaining_today === 26, 'chat history saved, limit counted');
  r = await post(U, '/api/joe/chat', { message: '' }); assert(r.s === 400, 'empty question refused');
  await put(ADM, '/api/admin/settings', { joe: { daily_limit: 4 } });
  r = await post(U, '/api/joe/chat', { message: 'And today?' });
  assert(r.s === 429 && r.j.remaining_today === 0, 'daily limit enforced');
  await put(ADM, '/api/admin/settings', { joe: { daily_limit: 30 } });
  r = await U('/api/joe/chat', { method: 'DELETE' });
  assert(r.s === 200 && (await U('/api/joe/chat')).j.messages.length === 0, 'DELETE clears the chat');
  ins = (await U('/api/joe/insights')).j;
  assert(/Lucky/.test(ins.greeting) && ['good', 'warn', 'bad', 'calm'].includes(ins.mood) && ins.items.every((i) => i.id && i.level && i.title && i.body) && ins.items.some((i) => i.id === 'fraud'), 'insights: greeting with nickname, mood, items (fake joins filtered)');

  // ---------- Joe with an AI key (fake Anthropic API) ----------
  r = await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-123456789', model: 'claude-haiku-4-5-20251001', persona: 'Always end with a short tip.', knowledge: 'Our support hours are 8am to 10pm.' } });
  assert(r.s === 200 && r.j.settings.joe.has_key && r.j.settings.joe.api_key.includes('•') && !r.j.settings.joe.api_key.includes('123456') && r.j.settings.joe.ai_live, 'admin saves the API key (masked) and Joe settings');
  r = await put(ADM, '/api/admin/settings', { joe: { api_key: '••••' } });
  assert((await ADM('/api/admin/settings')).j.joe.has_key, 'a masked key sent back is kept');
  assert((await U('/api/joe/chat')).j.ai === true, 'chat reports ai:true with a key');
  aiMode = 'stats'; aiCalls.length = 0;
  r = await post(U, '/api/joe/chat', { message: 'How many joins this week?' });
  const wk = (await U(`/api/stats?from=${new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)}&to=${today}&tz=0`)).j.totals.joins;
  assert(r.s === 200 && r.j.ai === true && r.j.reply === `You had **${wk} tracked joins** in the last 7 days.`, 'AI answer built from a get_stats tool call');
  const c0 = aiCalls[0];
  assert(c0 && c0.url === '/v1/messages' && c0.headers['x-api-key'] === 'sk-ant-test-123456789' && c0.headers['anthropic-version'] === '2023-06-01' && c0.body.model === 'claude-haiku-4-5-20251001', 'Anthropic Messages API: x-api-key, anthropic-version 2023-06-01, model from settings');
  const sys0 = JSON.stringify(c0.body.system); // round 12: system is a list of blocks (the big one cached); the playbook tools come on top of the data tools
  assert(['billing_summary', 'channels_health', 'compare_periods', 'conversions_summary', 'get_breakdown', 'get_stats'].every((n) => c0.body.tools.some((t) => t.name === n)) && /You are Joe/.test(sys0) && /Request-to-join mode/.test(sys0) && /support hours are 8am/.test(sys0) && /short tip/.test(sys0), 'tools + system prompt (persona, knowledge.md, extra knowledge, persona tweak)');
  aiMode = 'health';
  r = await post(ADM, '/api/admin/joe/test', { message: 'Which channels do I have?', user_id: uid });
  assert(r.s === 200 && r.j.ai && r.j.tools.join() === 'channels_health' && /Daily Deals Club/.test(r.j.reply) && !/Other Owner Club/.test(r.j.reply) && r.j.as === 'buyer@x.com', 'Test Joe console; tools only see that user’s channels');
  aiMode = 'fail';
  r = await post(U, '/api/joe/chat', { message: 'How are my ads doing?' });
  assert(r.s === 200 && r.j.ai === false && /tracked joins/.test(r.j.reply), 'AI error → falls back to the rules');
  r = await put(ADM, '/api/admin/settings', { joe: { api_key: null } });
  assert(!r.j.settings.joe.has_key && (await U('/api/joe/chat')).j.ai === false, 'removing the key switches back to rules');
  await put(ADM, '/api/admin/settings', { features: { joe: false } });
  assert((await U('/api/joe/insights')).s === 403 && (await U('/api/joe/chat')).s === 403 && (await fetch(B + '/api/config').then((x) => x.json())).features.joe === false, 'features.joe off hides Joe');
  await put(ADM, '/api/admin/settings', { features: { joe: true } });

  // ---------- emails: new templates, art, languages ----------
  const em = (await ADM('/api/admin/emails')).j;
  const names = em.templates.map((t) => t.name);
  assert(['trial_started', 'trial_ending', 'trial_ended', 'pro_welcome', 'plan_changed', 'meet_joe', 'rank_up', 'level_up', 'credits_added'].every((n) => names.includes(n)), 'all new templates listed in admin');
  let artOk = true, textOk = true;
  for (const n of names) {
    const html = (await ADM(`/api/admin/emails/${n}/preview`)).t;
    const img = /<img src="http:\/\/localhost:3999\/media\/email\/[\w-]+\.(png|gif)" width="600" height="260" alt="[^"]+"/.test(html);
    // a broadcast's picture is whatever the admin uploads, so it has no fixed art
    if (!img && n !== 'broadcast') { artOk = false; console.log('   no art for', n); }
    const tx = (await ADM(`/api/admin/emails/${n}/preview?format=text`)).t;
    if (!tx || tx.includes('{') && /\{\w+\}/.test(tx)) { textOk = false; console.log('   text problem', n); }
  }
  assert(artOk, 'every template has its header art (600×260, alt text) when the file exists');
  assert(textOk, 'plain-text versions have no unfilled {placeholders}');
  const ru = (await ADM('/api/admin/emails/trial_ended/preview?lang=ru')).t;
  assert(ru.includes(`<title>${RU['trial_ended.subject']}</title>`) && ru.includes('lang="ru"'), 'preview in Russian (?lang=ru)');
  await post(U, '/api/login', { email: 'buyer@x.com', password: 'password1' });
  await post(U, '/api/login', { email: 'buyer@x.com', password: 'password1' });
  assert((await mails()).filter((l) => l.kind === 'meet_joe' && l.to_addr === 'buyer@x.com').length === 1, 'meet_joe once, at the first login when email is off');

  // ---------- admin settings: plans ----------
  let as = (await ADM('/api/admin/settings')).j;
  assert(as.plans.basic.base_cents === 3000 && as.plans.pro.base_cents === 9900 && as.levels.length === 7 && as.joe.model && as.features.joe === true, 'admin settings: plans, trial, levels, Joe');
  r = await put(ADM, '/api/admin/settings', { plans: { pro: { name: 'Pro', base_cents: 12000, included: 6000, per_join_cents: 1 }, basic: { base_cents: 3500 } } });
  const cfg = await fetch(B + '/api/config').then((x) => x.json());
  assert(r.s === 200 && cfg.plans.pro.base_cents === 12000 && cfg.plans.pro.included === 6000 && cfg.pricing.base_cents === 3500 && (await V('/api/billing')).j.plan.base_cents === 12000, 'plans editor: Pro saved, Basic = the Pricing page');
  r = await put(ADM, '/api/admin/settings', { plans: { pro: { base_cents: -5 } } }); assert(r.s === 400, 'bad plan price refused');
  await put(ADM, '/api/admin/settings', { plans: { basic: { base_cents: 3000 } } });
  assert(cfg.levels.length === 7 && cfg.trial.days === 7, '/api/config has plans, trial and levels');

  // ---------- static files, i18n, blog ----------
  let res = await fetch(B + '/i18n/server.ru.json');
  const et = res.headers.get('etag');
  assert(res.status === 200 && et && /max-age=\d{5,}/.test(res.headers.get('cache-control')) && (await res.json())['welcome.subject'] === RU['welcome.subject'], '/i18n/*.json served with long cache + ETag');
  res = await fetch(B + '/i18n/server.ru.json', { headers: { 'if-none-match': et } });
  assert(res.status === 304, 'If-None-Match → 304');
  res = await fetch(B + '/joomoji.js?v=3');
  assert(res.status === 200 && /immutable/.test(res.headers.get('cache-control')) && res.headers.get('etag') && /javascript/.test(res.headers.get('content-type')), '/joomoji.js served (versioned URL cached for a year)');
  res = await fetch(B + '/media/email/welcome.gif');
  assert(res.status === 200 && res.headers.get('content-type') === 'image/gif', '/media/email/* serves the art');
  assert((await fetch(B + '/media/email/nope.png')).status === 404 && (await fetch(B + '/i18n/../server.js')).status === 404, 'missing art and path tricks → 404');
  const robots = await fetch(B + '/robots.txt').then((x) => x.text());
  assert(robots.includes('Sitemap: http://localhost:3999/sitemap.xml') && robots.includes('Allow: /blog'), 'robots.txt: Sitemap line, /blog allowed');
  const blogDir = path.join(__dirname, '..', 'public', 'blog');
  const posts = fs.existsSync(blogDir) ? fs.readdirSync(blogDir).filter((x) => /\.html$/.test(x) && x !== 'index.html' && !x.startsWith('tag-')) : [];
  res = await fetch(B + '/blog');
  if (fs.existsSync(path.join(blogDir, 'index.html'))) { const t = await res.text(); assert(res.status === 200 && !t.includes('{{BASE_URL}}') && /<html/i.test(t), '/blog serves the index with {{BASE_URL}} filled in'); }
  else assert(res.status === 404, '/blog 404s cleanly before the blog is built');
  if (posts.length) { res = await fetch(B + '/blog/' + posts[0].replace(/\.html$/, '')); const t = await res.text(); assert(res.status === 200 && !t.includes('{{BASE_URL}}'), '/blog/<slug> serves a post'); }
  const tags = fs.existsSync(blogDir) ? fs.readdirSync(blogDir).filter((x) => x.startsWith('tag-')) : [];
  if (tags.length) assert((await fetch(B + '/blog/tag/' + tags[0].slice(4, -5))).status === 200, '/blog/tag/<tag> serves a tag page');
  res = await fetch(B + '/blog/no-such-post');
  assert(res.status === 404 && /Page not found/.test(await res.text()), 'unknown post → clean 404 page');
  assert((await fetch(B + '/blog/tag/nothing-here')).status === 404 && (await fetch(B + '/blog/..%2f..%2fserver')).status === 404, 'unknown tag and path tricks → 404');
  for (const f of ['sitemap.xml', 'rss.xml']) {
    res = await fetch(B + '/' + f);
    if (fs.existsSync(path.join(__dirname, '..', 'public', f))) { const t = await res.text(); assert(res.status === 200 && t.includes('http://localhost:3999') && !t.includes('{{BASE_URL}}') && /xml/.test(res.headers.get('content-type')), `/${f} with {{BASE_URL}} replaced`); }
    else assert(res.status === 404, `/${f} 404s before the blog is built`);
  }
  if (fs.existsSync(path.join(__dirname, '..', 'public', 'media', 'blog'))) {
    const img = fs.readdirSync(path.join(__dirname, '..', 'public', 'media', 'blog')).find((x) => /\.(jpg|png|webp)$/.test(x));
    if (img) assert((await fetch(B + '/media/blog/' + img)).status === 200, '/media/blog/* serves covers');
  }
  ai.close();
})().catch((e) => { console.log('FAIL: crashed', e.stack); process.exitCode = 1; ai.close(); });
