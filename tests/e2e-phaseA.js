// Phase A: sales/qualified/rejected, integrations, join-request mode, period compare + funnel + cohorts, spend/ROAS,
// fake-click filter, bonus credits + ranks + promo codes, custom pricing, sales leads, alerts without a bot token.
const B = 'http://localhost:3999';
const fs = require('fs');
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
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
let ipn = 10;
const click = (slug, q = '', o = {}) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': o.ua || UA, 'x-forwarded-for': o.ip || ('102.89.0.' + (ipn++)), ...(o.cookie ? { cookie: o.cookie } : {}) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwA' + ipn + q }) }).then((x) => x.json());
const today = new Date().toISOString().slice(0, 10), yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

(async () => {
  const ADM = client(), U = client();
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
  await sleep(100);
  const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
  await fetch(B + vlink[1], { redirect: 'manual' });
  await post(U, '/api/signup', { country: 'GB', email: 'media@x.com', password: 'password1', name: 'Mateo' });

  let cfg = await fetch(B + '/api/config').then((x) => x.json());
  assert(['integrations', 'join_requests', 'spend', 'fake_filter', 'credits_bonus', 'ranks', 'enterprise'].every((k) => cfg.features[k] === true) && cfg.features.alerts === false, 'config has the new feature flags (alerts off without a bot token)');

  // ---- channel through our bot, join-request mode
  let r = await post(U, '/api/bots', { token: '7712045544:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx' });
  const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
  assert(st.webhook.allowed_updates.includes('chat_join_request'), 'webhook asks Telegram for chat_join_request updates');
  const tgPost = (u) => U(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
  await tgPost({ update_id: 1, my_chat_member: { chat: { id: -1002, title: 'Daily Deals Club', type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: 7712045544 } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: 7712045544 } } } });
  let ch = (await U('/api/channels')).j.channels.find((c) => c.title === 'Daily Deals Club');
  assert(ch && ch.join_mode === 'link', 'channel connected in normal link mode');
  await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ pixel_id: '884210395527140', capi_token: 'EAAtest' }) });
  r = await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ join_mode: 'request', offer_url: 'http://insecure.example' }) });
  assert(r.s === 400, 'offer link must be https');
  r = await U('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ join_mode: 'request', offer_text: 'Hi {name}! Your bonus is waiting.', offer_btn: 'Claim bonus', offer_url: 'https://partner.example/go?sub1={tg_id}&c={click_id}' }) });
  assert(r.s === 200 && r.j.join_mode === 'request', 'join-request mode switched on');
  for (let i = 0; i < 20 && !(await U('/api/channels')).j.channels.find((c) => c.id === ch.id).pool; i++) await sleep(300);
  ch = (await U('/api/channels')).j.channels.find((c) => c.id === ch.id);
  const st2 = await ms();
  assert(ch.join_mode === 'request' && ch.offer_btn === 'Claim bonus' && st2.reqLinks > 0 && ch.pool > 0, 'pool refilled with join-request links (' + st2.reqLinks + ' made, ' + ch.pool + ' ready)');
  const slug = new URL(ch.tracking_url).pathname;
  let go = await click(slug, '&utm_campaign=Spring');
  assert(/t\.me\/\+L/.test(go.url), 'click gets its own join-request link');
  await tgPost({ update_id: 2, chat_join_request: { chat: { id: -1002, title: 'Daily Deals Club', type: 'channel' }, from: { id: 555, first_name: 'Lena', is_bot: false }, user_chat_id: 555, date: Math.floor(Date.now() / 1000),
    invite_link: { invite_link: go.url, creator: { id: 7712045544 }, creates_join_request: true } } });
  await sleep(300);
  const st3 = await ms();
  assert((st3.approvals || []).some((a) => a.user_id === 555 && a.chat_id === -1002), 'join request approved by the bot');
  const dm = (st3.msgs || []).find((m) => m.chat_id === 555);
  assert(dm && dm.text === 'Hi Lena! Your bonus is waiting.' && /sub1=555&c=\d+/.test(dm.reply_markup.inline_keyboard[0][0].url), 'welcome DM sent with the offer link carrying the Telegram ID');
  await tgPost({ update_id: 3, chat_member: { chat: { id: -1002, type: 'channel' }, from: { id: 555 }, date: Math.floor(Date.now() / 1000), invite_link: { invite_link: go.url, creator: { id: 7712045544 } }, via_join_request: true,
    old_chat_member: { status: 'left', user: { id: 555, first_name: 'Lena' } }, new_chat_member: { status: 'member', user: { id: 555, first_name: 'Lena' } } } });
  let joins = (await U(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(joins.total === 1 && joins.rows[0].click_id && joins.rows[0].tg_user_id === 555, 'join recorded once against the click (approval + member update not double counted)');

  // ---- conversions: ftd, sale, qualified, rejected with network attribution
  const pb = new URL((await U('/api/conversions')).j.postback_url).pathname;
  const pbf = (q) => fetch(B + pb + '?' + q).then((x) => x.json());
  r = await pbf('sub1=555&status=ftd&payout=100&txid=F1&net=1win');
  assert(r.event === 'ftd' && r.matched, 'FTD postback from 1win');
  r = await pbf('sub1=555&status=purchase&payout=40&txid=S1&net=1win');
  assert(r.event === 'sale', 'purchase → sale');
  r = await pbf('sub1=555&goal=cpa&net=1win');
  assert(r.event === 'qualified', 'cpa → qualified');
  r = await pbf('sub1=555&status=chargeback&txid=S1&net=1win');
  assert(r.event === 'rejected', 'chargeback → rejected');
  r = await pbf('sub1=555&status=chargeback&txid=S1');
  assert(r.duplicate, 'same chargeback twice is ignored');
  await sleep(2600);
  let stats = (await U(`/api/stats?from=${today}&to=${today}&tz=0`)).j.totals;
  assert(stats.ftd === 1 && stats.sales === 1 && stats.qualified === 1 && stats.rejected === 1 && stats.revenue_cents === 10000, 'stats: ftd, sales, qualified, rejected and net revenue ($100 after the $40 chargeback) ' + JSON.stringify({ f: stats.ftd, s: stats.sales, q: stats.qualified, r: stats.rejected, rev: stats.revenue_cents }));
  const conv = (await U('/api/conversions')).j.rows;
  const sale = conv.find((c) => c.event === 'sale'), rej = conv.find((c) => c.event === 'rejected');
  assert(sale.rejected === 1 && sale.network === '1win' && rej.meta_status === 'none', 'sale marked rejected, network kept, chargeback never sent to ad platforms');
  const ev = (await ms()).events;
  assert(ev.some((e) => e.event_name === 'Qualified') && ev.some((e) => e.event_name === 'Purchase' && e.custom_data.value === 40), 'sale sent as Purchase with value, CPA as Qualified');

  // ---- integrations
  let it = (await U('/api/integrations')).j;
  const one = it.items.find((x) => x.id === '1win');
  assert(it.items.length >= 13 && one && one.postback_template.startsWith(it.postback_base) && /net=1win/.test(one.postback_template) && Array.isArray(one.setup_steps) && one.setup_steps.length && one.verified === false, 'integrations list with ready postback templates');
  assert(['kingfin', 'affstore', 'pocketoption', 'olymptrade', 'binomo', 'quotex', 'exness', '1xbet', 'melbet', 'keitaro', 'binom', 'custom'].every((id) => it.items.some((x) => x.id === id)), 'all seeded programs present');
  assert(one.events_30d >= 3, 'network events counted per account (' + one.events_30d + ')');
  r = await post(U, '/api/integrations/1win/connect');
  assert(r.j.items.find((x) => x.id === '1win').connected === true, 'customer connects 1win');
  r = await post(ADM, '/api/admin/integrations', { name: 'Test Network', category: 'iGaming', macros_note: 'Use {click} for sub1.', verified: true, events: 'reg,ftd,dep' });
  const tid = r.j.id;
  assert(r.s === 200 && r.j.items.some((x) => x.id === tid && x.verified && x.postback_template.includes('net=' + tid)), 'admin adds a program');
  r = await post(ADM, `/api/admin/integrations/${tid}/logo`, { data: PNG });
  assert(r.s === 200 && /^\/media\/logos\/\w+\.png\?v=\d+$/.test(r.j.logo), 'logo uploaded');
  const lg = await fetch(B + r.j.logo.split('?')[0]);
  assert(lg.status === 200 && lg.headers.get('content-type') === 'image/png', 'logo served');
  assert((await post(ADM, `/api/admin/integrations/${tid}/logo`, { data: 'data:image/png;base64,' + Buffer.from('nope').toString('base64') })).s === 400, 'fake logo rejected');
  r = await ADM('/api/admin/integrations/' + tid, { method: 'PATCH', body: JSON.stringify({ postback_template: 'https://evil.example/?x=1' }) });
  assert(r.s === 400, 'template must start with {postback}');
  r = await ADM('/api/admin/integrations/' + tid, { method: 'DELETE' });
  assert(!r.j.items.some((x) => x.id === tid), 'admin deletes a program');

  // ---- periods, funnel, cohorts
  r = await U(`/api/compare/periods?a_from=${today}&a_to=${today}&b_from=${yday}&b_to=${yday}&tz=0&group=day`);
  assert(r.s === 200 && r.j.a.totals.clicks >= 1 && r.j.a.totals.ftd === 1 && r.j.b.totals.clicks === 0 && r.j.delta.clicks === null && r.j.a.series[0].key === today, 'A vs B periods with series and deltas');
  assert((await U('/api/compare/periods?a_from=x')).s === 400, 'bad period dates rejected');
  r = await U('/api/compare?group=week&periods=4&tz=0');
  assert(r.j.periods.length === 4 && r.j.periods[3].partial && /W\d\d$/.test(r.j.periods[3].key), 'compare by weeks');
  r = await U(`/api/funnel?from=${today}&to=${today}&tz=0&dim=campaign&a=Spring&b=Autumn`);
  assert(r.j.steps.join() === 'clicks,joins,reg,ftd,dep' && r.j.a.label === 'Spring' && r.j.a.counts.clicks === 1 && r.j.a.counts.joins === 1 && r.j.a.counts.ftd === 1 && r.j.b.counts.clicks === 0, 'funnel A (Spring) vs B (Autumn)');
  r = await U('/api/cohorts?weeks=4&tz=0');
  assert(r.j.rows[0].joins === 1 && r.j.rows[0].ftd_d1 === 1 && r.j.rows[0].rate_d7 === 1, 'weekly cohort: joined and deposited within a day');

  // ---- spend + ROAS
  r = await post(U, '/api/spend', { date: today, platform: 'meta', campaign: 'Spring', amount: '50', currency: 'USD' });
  assert(r.j.ok, 'spend entered');
  assert((await post(U, '/api/spend', { date: 'yesterday', amount: '5' })).s === 400, 'bad spend date rejected');
  r = await U('/api/spend/import', { method: 'POST', headers: { 'content-type': 'text/csv' }, body: `date,platform,campaign,amount\n${today},Facebook,"Spring",25.00\nnot-a-date,meta,x,1` });
  assert(r.j.imported === 1 && r.j.skipped === 1, 'CSV import: 1 imported, 1 bad row skipped');
  r = await U(`/api/spend?from=${today}&to=${today}`);
  assert(r.j.total_cents === 7500 && r.j.rows.length === 2, 'spend list totals $75');
  stats = (await U(`/api/stats?from=${today}&to=${today}&tz=0`)).j.totals;
  assert(stats.spend_cents === 7500, 'stats include spend');
  let bd = (await U(`/api/breakdown?from=${today}&to=${today}&tz=0&dim=campaign`)).j.rows.find((x) => x.key === 'Spring');
  assert(bd && bd.spend_cents === 7500 && bd.cost_per_ftd_cents === 7500 && bd.cost_per_join_cents === 7500 && bd.roas === 1.33, 'breakdown: cost per join/FTD and ROAS ' + JSON.stringify(bd));
  bd = (await U(`/api/breakdown?from=${today}&to=${today}&tz=0&dim=platform`)).j.rows.find((x) => x.key === 'Meta');
  assert(bd && bd.spend_cents === 7500, 'spend mapped to platform Meta');
  r = await U('/api/spend/' + (await U(`/api/spend?from=${today}&to=${today}`)).j.rows[0].id, { method: 'DELETE' });
  assert(r.j.ok, 'spend row deleted');

  // ---- fake-click filter
  const sus = async () => (await U(`/api/stats?from=${today}&to=${today}&tz=0`)).j.totals.suspect_clicks;
  const s0 = await sus();
  await click(slug, '', { ua: 'curl/8.4.0' });
  assert(await sus() === s0 + 1, 'bot user agent flagged');
  await click(slug, '', { ip: '3.5.6.7' });
  assert(await sus() === s0 + 2, 'datacenter IP flagged');
  const page = await fetch(B + slug, { headers: { 'user-agent': UA } });
  const hs = page.headers.getSetCookie().find((c) => c.startsWith('jv_h=')).split(';')[0];
  await click(slug, '', { cookie: hs, ip: '102.89.9.1' });
  assert(await sus() === s0 + 2, 'real browser click (landing page loaded) not flagged');
  await click(slug, '', { ip: '102.89.9.2' });
  assert(await sus() === s0 + 3, 'click without the landing page handshake flagged (no_js)');
  for (let i = 0; i < 4; i++) await click(slug, '', { cookie: hs, ip: '102.89.9.3' });
  assert(await sus() === s0 + 4, '4th click from one IP in 10 minutes flagged as repeat');
  bd = (await U(`/api/breakdown?from=${today}&to=${today}&tz=0&dim=campaign`)).j.rows;
  assert(bd.reduce((a, x) => a + (x.suspect_clicks || 0), 0) === s0 + 4, 'breakdown shows suspect clicks');
  joins = (await U(`/api/joins?from=${today}&to=${today}&tz=0`)).j;
  assert(joins.total === 1, 'people list unaffected by suspect clicks');

  // ---- credits: bonus tier, rank, promo
  const dep = async (f, amount, approve = amount, promo) => {
    let x = await post(f, '/api/billing/deposit', { provider: 'crypto', amount, promo });
    if (x.s !== 200) return x;
    await post(f, '/api/billing/deposit', { provider: 'crypto', reference: x.j.reference, tx: require('crypto').randomBytes(32).toString('hex') });
    const d = (await ADM('/api/admin/deposits')).j.deposits[0];
    return post(ADM, `/api/admin/deposits/${d.id}/approve`, { amount: approve });
  };
  let bill = (await U('/api/billing')).j;
  assert(bill.rank.name === 'Bronze' && bill.rank.next.name === 'Silver' && bill.bonus_tiers.length === 4 && bill.ranks.length === 5 && bill.credits && bill.promo === null, 'billing shows rank, bonus tiers, ranks, credits');
  const before = bill.credits.balance;
  await dep(U, 500);
  bill = (await U('/api/billing')).j;
  const bonusRow = bill.history.find((h) => h.kind === 'bonus');
  assert(bill.credits.bonus === 5000 && bonusRow && bonusRow.note === 'Bonus +10% for a $500 top-up' && bill.credits.balance === before + 55000, '$500 top-up: 50,000 credits + 5,000 bonus (' + (bonusRow && bonusRow.note) + ')');
  assert(bill.rank.name === 'Silver' && bill.rank.next.name === 'Gold' && bill.rank.next.need_cents === 50000, 'ranked up to Silver; Gold needs $500 more');
  r = await post(ADM, '/api/admin/promos', { code: 'launch20', bonus_pct: 20, min_cents: 5000, max_uses: 10, featured: true });
  assert(r.s === 200 && r.j.promos[0].code === 'LAUNCH20', 'admin creates promo LAUNCH20');
  assert((await U('/api/billing')).j.promo.code === 'LAUNCH20', 'featured promo shown in billing');
  r = await U('/api/billing/promo?code=launch20&amount=10');
  assert(r.j.valid === false && /at least/.test(r.j.message), 'promo needs the minimum top-up');
  r = await U('/api/billing/promo?code=launch20&amount=60');
  assert(r.j.valid && r.j.bonus_pct === 20, 'promo valid for $60');
  assert((await post(U, '/api/billing/deposit', { provider: 'crypto', amount: 60, promo: 'NOPE' })).s === 400, 'unknown promo rejected at checkout');
  await dep(U, 60, 60, 'launch20');
  bill = (await U('/api/billing')).j;
  assert(bill.credits.bonus === 6200 && bill.history.some((h) => h.kind === 'bonus' && /LAUNCH20/.test(h.note)), 'promo adds 20% (1,200 bonus credits)');
  assert((await U('/api/billing/promo?code=LAUNCH20&amount=60')).j.valid === false, 'a promo works once per customer');
  r = await (await ADM('/api/admin/promos')).j.promos.find((x) => x.code === 'LAUNCH20');
  assert(r.used === 1, 'promo usage counted');
  await ADM('/api/admin/promos/LAUNCH20', { method: 'PATCH', body: JSON.stringify({ expire: true }) });
  assert((await ADM('/api/admin/promos')).j.promos[0].active === false && (await U('/api/billing')).j.promo === null, 'promo expired by admin');
  await dep(U, 500);
  bill = (await U('/api/billing')).j;
  assert(bill.rank.name === 'Gold' && bill.rank.join_discount_pct === 5 && bill.month.per_join_cents === 1.9, 'Gold rank: 5% off each join (1.9 credits)');
  const ref = (await client()('/api/referrals')).s; // just to touch the route unauthenticated
  assert(ref === 401, 'referrals still need login');

  // ---- custom pricing per customer (external bot: no Telegram needed)
  await put(ADM, '/api/admin/settings', { pricing: { free_joins: 0 } });
  const W = client();
  await post(W, '/api/signup', { country: 'GB', email: 'corp@x.com', password: 'password1', name: 'Daniel' });
  const wu = (await ADM('/api/admin/users?q=corp@x.com')).j.users[0];
  await post(ADM, `/api/admin/users/${wu.id}/adjust`, { amount: 30 });
  r = await post(ADM, `/api/admin/users/${wu.id}/pricing`, { base_cents: 1000, included: 1, per_join_cents: 1.5, note: 'Agency deal' });
  assert(r.s === 200 && r.j.price.per === 1.5 && r.j.price.custom, 'admin sets a custom deal');
  assert((await post(ADM, `/api/admin/users/${wu.id}/pricing`, { per_join_cents: -1 })).s === 400, 'bad custom price rejected');
  bill = (await W('/api/billing')).j;
  assert(bill.custom_pricing.note === 'Agency deal' && bill.month.base_cents === 1000 && bill.month.per_join_cents === 1.5, 'customer sees their custom pricing');
  r = await post(W, '/api/bot-targets/external', { username: 'corpshop_bot' });
  const hs2 = new URL(r.j.hook_start).pathname;
  const wch = (await W('/api/channels')).j.channels[0], wslug = new URL(wch.tracking_url).pathname;
  for (let i = 0; i < 3; i++) { const g = await click(wslug); await fetch(B + hs2 + `?bot=corpshop_bot&tg_id=${9000 + i}&start=${new URL(g.url).searchParams.get('start')}`); }
  bill = (await W('/api/billing')).j;
  assert(bill.month.joins === 3 && bill.credits.balance === 3000 - 1000 - 3, 'custom plan 1,000 credits + 1.5 credits per extra join (fractions carried): ' + bill.credits.balance);
  const ud = (await ADM('/api/admin/users/' + wu.id)).j;
  assert(ud.custom_pricing.per_join_cents === 1.5 && ud.rank.name === 'Bronze', 'admin user detail shows deal and rank');
  r = await ADM(`/api/admin/users/${wu.id}/pricing`, { method: 'DELETE' });
  assert(r.j.custom_pricing === null && (await W('/api/billing')).j.custom_pricing === null, 'custom deal cleared');
  await put(ADM, '/api/admin/settings', { pricing: { free_joins: null } });

  // ---- enterprise lead
  const V = client();
  assert((await post(V, '/api/sales', { name: 'Ravi', email: 'bad' })).s === 400, 'sales lead needs an email');
  r = await post(V, '/api/sales', { name: 'Ravi', email: 'ravi@agency.example', company: 'Startup Notes Media', telegram: '@ravi', monthly_volume: '300k clicks', platforms: ['meta', 'tiktok'], message: 'We need volume pricing.' });
  assert(r.j.ok, 'sales lead sent');
  const sl = (await ADM('/api/admin/support?tag=sales')).j;
  assert(sl.tickets.length === 1 && sl.tickets[0].tag === 'sales' && sl.tickets[0].meta.company === 'Startup Notes Media' && sl.counts.sales === 1 && /300k clicks/.test(sl.tickets[0].last_body), 'lead lands in Support as a sales ticket');
  await put(ADM, '/api/admin/settings', { features: { enterprise: false } });
  assert((await post(V, '/api/sales', { name: 'Ravi', email: 'ravi@agency.example' })).s === 403, 'enterprise off → 403');
  await put(ADM, '/api/admin/settings', { features: { enterprise: true } });

  // ---- alerts without a bot token
  r = await U('/api/alerts');
  assert(r.s === 200 && r.j.available === false && r.j.connected === false && r.j.prefs.daily_report === true && r.j.link === '', 'alerts: coming soon without ALERT_BOT_TOKEN');
  assert((await post(U, '/api/alerts', { prefs: { ftd_live: true } })).s === 403, 'alerts can’t be changed while off');

  // ---- admin overview + settings
  const ov = (await ADM('/api/admin/overview')).j;
  assert(ov.sales_month === 1 && ov.qualified_month === 1 && ov.rejected_month === 1 && ov.tracked_revenue_month_cents === 10000 && Array.isArray(ov.topups_by_rank) && ov.topups_by_rank.find((x) => x.rank === 'Gold').users === 1 && ov.bonus_month_cents === 6200 + 5000, 'overview: sales, qualified, rejected, revenue, top-ups by rank, bonus');
  r = await put(ADM, '/api/admin/settings', { credits: { bonus_tiers: [{ min_cents: 20000, bonus_pct: 7 }], ranks: [{ name: 'Member', min_cents: 0, join_discount_pct: 0, perks: 'Support\nUpdates' }, { name: 'VIP', min_cents: 100000, join_discount_pct: 10 }] } });
  assert(r.s === 200 && r.j.settings.credits.ranks[0].perks.length === 2 && r.j.settings.credits.bonus_tiers[0].bonus_pct === 7, 'admin edits bonus tiers and ranks');
  assert((await U('/api/billing')).j.rank.name === 'VIP', 'rank follows the edited ladder');
  assert((await put(ADM, '/api/admin/settings', { credits: { ranks: [{ name: 'X', min_cents: 0, join_discount_pct: 95 }] } })).s === 400, 'bad rank discount rejected');
})();
