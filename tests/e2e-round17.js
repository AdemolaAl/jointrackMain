// Round 17 (part 1): team seats. Invites (Basic → 402 'seats', Pro 3 included, extra seats charged from the wallet or 402 top-up),
// invite links (new account via sign-up, existing account via accept), workspace switching, roles enforced on EVERY data endpoint
// (a media buyer only sees their channels; a manager has no billing/wallet/withdrawals/team/API keys), per-person leaderboard,
// Pro → Basic pauses members (their sessions lose the workspace) and an upgrade brings them back, audit log, admin user detail,
// invite expiry + resend, and the account-deletion cascade. Also: Meta spend endpoints answer "unavailable" without a Meta app.
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const ms = () => fetch('http://localhost:4000/__state').then((r) => r.json());
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);
let ipn = 30;
const click = (slug, camp) => fetch(B + slug + '/go', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'user-agent': 'Mozilla/5.0 (iPhone) FBAN', 'x-forwarded-for': '102.89.9.' + (ipn++) },
  body: JSON.stringify({ url: 'https://x.com' + slug + '?fbclid=IwR' + ipn + '&utm_campaign=' + camp }) }).then((x) => x.json());
const d = new Date().toISOString().slice(0, 10);
const tokenOf = (url) => url.split('/join-team/')[1];

(async () => {
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });
    const uid = async (email) => (await ADM('/api/admin/users?q=' + encodeURIComponent(email))).j.users.find((x) => x.email === email).id;

    // ---------- owner with three channels ----------
    const O = client();
    await post(O, '/api/signup', { country: 'NG', email: 'own17@x.com', password: 'password1', name: 'Ola Owner' });
    const oid = await uid('own17@x.com');
    const BOT = 7717000011;
    await post(O, '/api/bots', { token: BOT + ':AAHk3vZq_r17ownerbotxxxxxxxxxxxxxxxW' });
    const st = await ms(); const H = { 'x-telegram-bot-api-secret-token': st.webhook.secret_token }, hook = new URL(st.webhook.url).pathname;
    const tgPost = (u) => O(hook, { method: 'POST', headers: H, body: JSON.stringify(u) });
    let upd = 1;
    const addCh = (id, title) => tgPost({ update_id: upd++, my_chat_member: { chat: { id, title, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: BOT } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: BOT } } } });
    await addCh(-1701, 'Alpha'); await addCh(-1702, 'Bravo'); await addCh(-1703, 'Charlie');
    // ---------- seats on Basic: none (checked before the first deposit starts the Pro trial, which counts as Pro) ----------
    let r = await post(O, '/api/team/invite', { email: 'mgr17@x.com', role: 'manager' });
    assert(r.s === 402 && r.j.limit && r.j.limit.kind === 'seats' && r.j.upgrade && /Pro/.test(r.j.error), 'Basic: inviting answers 402 with the upgrade prompt (kind seats)');
    r = await O('/api/team'); assert(r.s === 200 && r.j.seats.plan === 'basic' && r.j.seats.included === 0 && r.j.members.length === 0, 'team page on Basic: 0 seats');
    let chans = (await O('/api/channels')).j.channels;
    const A = chans.find((c) => c.title === 'Alpha'), Bv = chans.find((c) => c.title === 'Bravo'), Cc = chans.find((c) => c.title === 'Charlie');
    assert(A && Bv && Cc && chans.every((c) => c.lost_at === null && c.backup_channel_id === null && c.auto_failover === false && c.created_by === null), 'three channels; new channel fields default to empty (nothing changes for existing channels)');
    for (let i = 0; i < 30 && (await O('/api/channels')).j.channels.some((c) => !c.pool); i++) await sleep(250);
    const slugA = new URL(A.tracking_url).pathname, slugB = new URL(Bv.tracking_url).pathname;
    // traffic: 3 clicks + 2 joins on Alpha (campaign CampA), 2 clicks + 1 join on Bravo (CampB)
    const join = async (go, chat, tgid) => tgPost({ update_id: upd++, chat_member: { chat: { id: chat, type: 'channel' }, from: { id: tgid }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: 'left', user: { id: tgid } },
      new_chat_member: { status: 'member', user: { id: tgid, first_name: 'U' + tgid, is_bot: false } }, invite_link: { invite_link: go.url, creator: { id: BOT } } } });
    const ga1 = await click(slugA, 'CampA'), ga2 = await click(slugA, 'CampA'); await click(slugA, 'CampA');
    const gb1 = await click(slugB, 'CampB'); await click(slugB, 'CampB');
    await join(ga1, -1701, 5001); await join(ga2, -1701, 5002); await join(gb1, -1702, 5003);
    let rows = (await O(`/api/joins?from=${d}&to=${d}&tz=0`)).j.rows;
    const jA = rows.find((r) => r.tg_user_id === 5001), jA2 = rows.find((r) => r.tg_user_id === 5002), jB = rows.find((r) => r.tg_user_id === 5003);
    assert(jA && jB && jA.click_id && jB.click_id, 'owner sees ad joins on Alpha and Bravo');
    await post(O, `/api/joins/${jA.id}/convert`, { event: 'ftd', value: 50 });
    await post(O, `/api/joins/${jB.id}/convert`, { event: 'ftd', value: 80 });
    r = await post(O, '/api/spend', { date: d, platform: 'meta', campaign: 'CampA', amount: 20, channel_id: A.id }); assert(r.s === 200, 'spend can be tied to a channel');
    await post(O, '/api/spend', { date: d, platform: 'meta', campaign: 'CampB', amount: 30, channel_id: Bv.id });
    await post(O, '/api/spend', { date: d, platform: 'meta', campaign: 'CampC', amount: 5 });
    r = await O(`/api/spend?from=${d}&to=${d}`);
    assert(r.j.rows.length === 3 && r.j.rows.every((x) => x.source === 'manual') && r.j.rows.some((x) => x.channel_id === A.id), 'spend rows show source=manual and channel_id');

    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'pro' });
    r = await O('/api/team'); assert(r.j.seats.plan === 'pro' && r.j.seats.included === 3 && r.j.seats.seat_cents === 500, 'Pro: 3 seats included, extra seats $5');
    r = await post(O, '/api/team/invite', { email: 'own17@x.com', role: 'buyer' }); assert(r.s === 400, 'can’t invite yourself');
    r = await post(O, '/api/team/invite', { email: 'nobody', role: 'buyer' }); assert(r.s === 400, 'bad email refused');
    r = await post(O, '/api/team/invite', { email: 'z@x.com', role: 'owner' }); assert(r.s === 400, 'unknown role refused');
    const invM = await post(O, '/api/team/invite', { email: 'Mgr17@x.com', role: 'manager' });
    assert(invM.s === 200 && invM.j.member.status === 'invited' && invM.j.member.email === 'mgr17@x.com' && /\/join-team\/[\w-]{20,}$/.test(invM.j.invite_url) && invM.j.emailed === false && invM.j.charged_cents === 0,
      'invite a manager: no email provider → the invite link is in the response');
    assert(/Join the team/.test(logTxt()) || /to mgr17@x\.com/.test(logTxt()), 'the invite email goes to the log without an email provider');
    r = await post(O, '/api/team/invite', { email: 'mgr17@x.com', role: 'buyer' }); assert(r.s === 400 && /already/.test(r.j.error), 'same person twice refused');
    const invB = await post(O, '/api/team/invite', { email: 'buy17@x.com', role: 'buyer', channel_ids: [A.id, 999999] });
    assert(invB.s === 200 && JSON.stringify(invB.j.member.channel_ids) === JSON.stringify([A.id]), 'invite a media buyer with Alpha only (unknown channel ids ignored)');
    const invX = await post(O, '/api/team/invite', { email: 'x17@x.com', role: 'buyer', channel_ids: [Cc.id] });
    assert(invX.s === 200 && invX.j.charged_cents === 0 && invX.j.seats.used === 3 && invX.j.seats.extra === 0, 'third seat still included');
    r = await post(O, '/api/team/invite', { email: 'y17@x.com', role: 'buyer' });
    assert(r.s === 402 && r.j.topup && r.j.need_cents === 500 && r.j.cost_cents === 500, 'a 4th seat with an empty wallet → 402 with the top-up prompt');
    await post(ADM, `/api/admin/users/${oid}/credits`, { credits: 1200, reason: 'test' });
    const bal0 = (await O('/api/billing')).j.balance_cents;
    const invY = await post(O, '/api/team/invite', { email: 'y17@x.com', role: 'buyer' });
    let bill = (await O('/api/billing')).j;
    assert(invY.s === 200 && invY.j.charged_cents === 500 && bill.balance_cents === bal0 - 500 && bill.credits.seats === 500 && bill.history.some((h) => h.kind === 'seats' && /Extra team seat 1/.test(h.note)),
      'extra seat: a full month ($5) charged from the wallet at once, shown in the history');
    r = await O('/api/team'); assert(r.j.seats.used === 4 && r.j.seats.extra === 1 && r.j.seats.extra_paid_this_month === 1, 'seat counts: 4 used, 1 extra paid this month');

    // ---------- invite links ----------
    r = await fetch(B + '/api/team/invite-info?token=' + tokenOf(invM.j.invite_url)).then((x) => x.json());
    assert(r.valid && r.role === 'manager' && r.email === 'mgr17@x.com' && r.account_exists === false && r.owner_name, 'invite info for the sign-up page');
    r = await fetch(B + '/join-team/' + tokenOf(invM.j.invite_url), { redirect: 'manual' });
    assert(r.status === 302 && /^\/signup\?team=/.test(r.headers.get('location')), 'link opened logged out (no account) → sign-up with the token');
    r = await fetch(B + '/join-team/notarealtoken1234567890', { redirect: 'manual' }); assert(r.status === 302 && /team_error=invalid/.test(r.headers.get('location')), 'unknown token → error');
    const M = client();
    r = await post(M, '/api/signup', { country: 'NG', email: 'mgr17@x.com', password: 'password1', name: 'Mia Manager', team_token: tokenOf(invM.j.invite_url) });
    assert(r.s === 200 && r.j.team && r.j.team.ok && r.j.team.role === 'manager', 'sign-up with the invite token joins the team');
    let me = (await M('/api/me')).j;
    assert(me.email === 'mgr17@x.com' && me.workspace.current.owner_id === oid && me.workspace.current.role === 'manager' && me.workspace.workspaces.length === 2, 'the new manager lands in the owner’s workspace; /api/me stays theirs');
    r = await post(M, '/api/team/accept', { token: tokenOf(invM.j.invite_url) }); assert(r.s === 404, 'an invite works once');
    // buyer already has an account
    const Bu = client();
    await post(Bu, '/api/signup', { country: 'KE', email: 'buy17@x.com', password: 'password1', name: 'Ben Buyer' });
    const buid = await uid('buy17@x.com');
    r = await Bu('/join-team/' + tokenOf(invB.j.invite_url));
    assert(r.s === 302 && /^\/app\?team=/.test(r.h.get('location')), 'logged in → the dashboard asks to confirm (a GET link alone never joins)');
    assert((await Bu('/api/me')).j.workspace.current.own === true, 'still in their own workspace before confirming');
    r = await post(Bu, '/api/team/accept', { token: tokenOf(invB.j.invite_url) });
    assert(r.s === 200 && r.j.status === 'active' && r.j.owner_id === oid, 'buyer accepts');
    me = (await Bu('/api/me')).j;
    assert(me.workspace.current.owner_id === oid && me.workspace.current.role === 'buyer' && JSON.stringify(me.workspace.current.channel_ids) === JSON.stringify([A.id]), 'buyer is in the team workspace with Alpha only');
    r = await post(O, '/api/team/accept', { token: tokenOf(invX.j.invite_url) }); assert(r.s === 400, 'the owner can’t accept their own invite');

    // ---------- media buyer: every data endpoint only shows Alpha ----------
    const q = `from=${d}&to=${d}&tz=0`;
    r = await Bu('/api/channels');
    assert(r.s === 200 && r.j.channels.length === 1 && r.j.channels[0].id === A.id && r.j.bots.length === 0 && r.j.domains.length === 0 && r.j.team_role === 'buyer', 'GET /api/channels: Alpha only, no bots or domains');
    r = await Bu('/api/stats?' + q);
    assert(r.s === 200 && r.j.totals.clicks === 3 && r.j.totals.joins === 2 && r.j.totals.ftd === 1 && r.j.totals.spend_cents === 2000 && r.j.channels.every((c) => c.id === A.id) && r.j.counts.channels_all === 1, 'GET /api/stats: Alpha’s clicks, joins, FTDs and spend only');
    r = await Bu(`/api/stats?${q}&channel=${Bv.id}`); assert(r.s === 403, 'GET /api/stats?channel=Bravo → 403');
    r = await Bu(`/api/joins?${q}`); assert(r.s === 200 && r.j.total === 2 && r.j.rows.every((x) => x.channel_id === A.id), 'GET /api/joins: Alpha’s people only');
    r = await Bu(`/api/joins?${q}&channel=${Bv.id}`); assert(r.s === 403, 'GET /api/joins?channel=Bravo → 403');
    r = await Bu(`/api/joins.csv?${q}`); assert(r.s === 200 && /Alpha/.test(r.t) && !/Bravo/.test(r.t), 'GET /api/joins.csv: export without Bravo');
    r = await Bu('/api/conversions'); assert(r.s === 200 && r.j.postback_url === null && r.j.rows.length === 1 && r.j.rows[0].channel_title === 'Alpha', 'GET /api/conversions: Alpha’s deposits, no postback key');
    r = await Bu(`/api/breakdown?${q}&dim=channel`); assert(r.s === 200 && r.j.rows.length === 1 && r.j.rows[0].key === 'Alpha', 'GET /api/breakdown (channel): Alpha only');
    r = await Bu(`/api/breakdown?${q}&dim=campaign`); assert(r.j.rows.every((x) => x.key !== 'CampB' && x.key !== 'CampC') && r.j.rows.find((x) => x.key === 'CampA').spend_cents === 2000, 'GET /api/breakdown (campaign): no Bravo campaign or unassigned spend');
    r = await Bu(`/api/funnel?${q}`); assert(r.s === 200 && r.j.a.counts.clicks === 3 && r.j.a.counts.ftd === 1, 'GET /api/funnel: Alpha only');
    r = await Bu('/api/cohorts?weeks=2&tz=0'); assert(r.s === 200 && r.j.rows.reduce((a, x) => a + x.joins, 0) === 2, 'GET /api/cohorts: Alpha joins only');
    r = await Bu('/api/compare?group=day&periods=2&tz=0'); assert(r.s === 200 && r.j.periods.reduce((a, x) => a + x.clicks, 0) === 3 && r.j.periods.reduce((a, x) => a + x.spend_cents, 0) === 2000, 'GET /api/compare: Alpha only');
    r = await Bu(`/api/compare/periods?a_from=${d}&a_to=${d}&b_from=${d}&b_to=${d}&tz=0`); assert(r.s === 200 && r.j.a.totals.clicks === 3 && r.j.a.totals.ftd === 1, 'GET /api/compare/periods: Alpha only');
    r = await Bu(`/api/compare/insights?a_from=${d}&a_to=${d}&b_from=${d}&b_to=${d}&tz=0`); assert(r.s === 200 && !JSON.stringify(r.j).includes('CampB'), 'GET /api/compare/insights: nothing from Bravo');
    r = await Bu(`/api/compare/campaigns?${q}&names=CampA,CampB`);
    assert(r.s === 200 && r.j.series.CampA.reduce((a, x) => a + x.joins, 0) === 2 && r.j.series.CampB.reduce((a, x) => a + x.joins + x.ftd + x.spend_cents, 0) === 0, 'GET /api/compare/campaigns: Bravo’s campaign is empty for them');
    r = await Bu(`/api/spend?${q}`); assert(r.s === 200 && r.j.rows.length === 1 && r.j.rows[0].campaign === 'CampA', 'GET /api/spend: Alpha’s spend only');
    r = await Bu('/api/audience-guide'); assert(r.s === 200 && r.j.channels.length === 1 && r.j.channels[0].channel_id === A.id && r.j.event_name === 'Purchase', 'GET /api/audience-guide: Alpha only');
    r = await Bu('/api/team/leaderboard?' + q); assert(r.s === 200 && r.j.rows.length === 1 && r.j.rows[0].role === 'buyer' && r.j.rows[0].clicks === 3, 'GET /api/team/leaderboard: only their own row');
    r = await Bu('/api/deadlink/options?channel_id=' + Bv.id); assert(r.s === 404, 'dead-link options for Bravo → 404');
    r = await Bu('/api/deadlink/options?channel_id=' + A.id); assert(r.s === 200 && r.j.channel_id === A.id, 'dead-link options for Alpha');
    r = await patch(Bu, '/api/channels/' + Bv.id, { pixel_id: '123456789012345' }); assert(r.s === 404, 'PATCH Bravo → 404');
    r = await post(Bu, `/api/channels/${Bv.id}/test`); assert(r.s === 404, 'test Bravo’s pixel → 404');
    r = await post(Bu, `/api/channels/${Bv.id}/switch-back`); assert(r.s === 404, 'switch-back on Bravo → 404');
    r = await patch(Bu, '/api/channels/' + A.id, { redirect_to: Bv.id }); assert(r.s === 400, 'can’t send Alpha’s traffic into Bravo');
    r = await patch(Bu, '/api/channels/' + A.id, { backup_channel_id: Bv.id }); assert(r.s === 400, 'can’t pick Bravo as Alpha’s backup');
    r = await patch(Bu, '/api/channels/' + A.id, { pixel_id: '884210395527140', capi_token: 'EAAbuyer' }); assert(r.s === 200, 'buyer can set the pixel on Alpha');
    r = await post(Bu, `/api/joins/${jB.id}/convert`, { event: 'reg' }); assert(r.s === 404, 'convert a Bravo person → 404');
    r = await post(Bu, `/api/joins/${jA2.id}/convert`, { event: 'reg' }); assert(r.s === 200, 'convert an Alpha person works');
    for (const [m, p2] of [['GET', '/api/billing'], ['POST', '/api/billing/topup'], ['POST', '/api/billing/deposit'], ['POST', '/api/billing/plan'], ['GET', '/api/billing/methods'], ['GET', '/api/referrals'], ['POST', '/api/referrals/withdraw'], ['POST', '/api/referrals/credit'],
      ['GET', '/api/team'], ['POST', '/api/team/invite'], ['GET', '/api/domains'], ['POST', '/api/domains'], ['GET', '/api/alerts'], ['POST', '/api/conversions/rotate'], ['GET', '/api/joe/insights'], ['POST', '/api/joe/chat'],
      ['GET', '/api/meta'], ['POST', '/api/bots'], ['POST', '/api/channels'], ['POST', '/api/bot-targets/external'], ['DELETE', '/api/channels/' + A.id], ['POST', '/api/spend'], ['DELETE', '/api/spend/1'], ['GET', '/api/integrations'], ['DELETE', '/api/bots/1'],
      ['PATCH', `/api/team/${invX.j.member.id}`], ['DELETE', `/api/team/${invX.j.member.id}`]]) {
      r = await Bu(p2, { method: m, body: m === 'GET' ? undefined : '{}' });
      assert(r.s === 403 && r.j.team_denied, `buyer ${m} ${p2} → 403`);
    }
    r = await Bu('/api/inbox'); assert(r.s === 200, 'their own inbox still works inside the team');
    // own workspace and back
    r = await post(Bu, '/api/workspace', { owner_id: buid });
    assert(r.s === 200 && r.j.current.own && (await Bu('/api/channels')).j.channels.length === 0 && (await Bu('/api/billing')).s === 200, 'switch to their own workspace: their (empty) channels, their own billing');
    r = await post(Bu, '/api/workspace', { owner_id: oid }); assert(r.s === 200 && r.j.current.owner_id === oid && (await Bu('/api/channels')).j.channels.length === 1, 'switch back to the team');
    const Z = client(); await post(Z, '/api/signup', { country: 'NG', email: 'stranger17@x.com', password: 'password1' });
    r = await post(Z, '/api/workspace', { owner_id: oid }); assert(r.s === 403, 'a stranger can’t enter the workspace');

    // ---------- manager: all channels, can add/edit, no money or team ----------
    r = await M('/api/channels'); assert(r.s === 200 && r.j.channels.length === 3 && r.j.team_role === 'manager' && r.j.channels.every((c) => !c.hook_start), 'manager sees all channels (no postback key in hook URLs)');
    r = await M('/api/stats?' + q); assert(r.j.totals.clicks === 5 && r.j.totals.ftd === 2, 'manager sees all results');
    r = await M('/api/conversions'); assert(r.j.postback_url === null && r.j.rows.filter((x) => x.event === 'ftd').length === 2, 'manager: all deposits, no postback key');
    r = await patch(M, '/api/channels/' + Bv.id, { landing: 'button' }); assert(r.s === 200, 'manager edits a channel');
    r = await post(M, '/api/bot-targets/external', { username: 'mgr17shop_bot' });
    assert(r.s === 200 && r.j.channel && r.j.hook_start === '', 'manager adds a channel (bot without token); hook URLs withheld');
    const mgrCh = r.j.channel;
    for (const [m, p2] of [['GET', '/api/billing'], ['POST', '/api/billing/topup'], ['POST', '/api/billing/plan'], ['POST', '/api/referrals/withdraw'], ['GET', '/api/referrals'], ['GET', '/api/team'], ['POST', '/api/team/invite'],
      ['DELETE', `/api/team/${invX.j.member.id}`], ['POST', '/api/conversions/rotate'], ['POST', '/api/domains'], ['PATCH', '/api/meta/accounts'], ['POST', '/api/meta/sync'], ['DELETE', '/api/meta'], ['DELETE', '/api/bots/1'], ['GET', '/api/alerts'], ['GET', '/api/integrations']]) {
      r = await M(p2, { method: m, body: m === 'GET' ? undefined : '{}' });
      assert(r.s === 403, `manager ${m} ${p2} → 403`);
    }
    r = await M('/api/me'); assert(r.j.email === 'mgr17@x.com' && r.j.workspace.current.role === 'manager', '/api/me is the manager’s own profile');
    r = await post(M, '/api/password', { current: 'password1', password: 'password2' }); assert(r.s === 200, 'manager changes their own password (not the owner’s)');
    r = await post(client(), '/api/login', { email: 'own17@x.com', password: 'password1' }); assert(r.s === 200, 'owner’s password unchanged');

    // ---------- leaderboard ----------
    r = await O('/api/team/leaderboard?' + q);
    const lb = Object.fromEntries(r.j.rows.map((x) => [x.role === 'owner' ? 'owner' : x.email, x]));
    assert(r.s === 200 && lb.owner && lb['mgr17@x.com'] && lb['buy17@x.com'] && !lb['x17@x.com'], 'leaderboard: owner + members who joined');
    assert(lb['buy17@x.com'].channels === 1 && lb['buy17@x.com'].clicks === 3 && lb['buy17@x.com'].joins === 2 && lb['buy17@x.com'].ftds === 1 && lb['buy17@x.com'].revenue_cents === 5000 && lb['buy17@x.com'].spend_cents === 2000 && lb['buy17@x.com'].cost_per_ftd_cents === 2000,
      'buyer row: channels, clicks, joins, FTDs, revenue, spend, cost per FTD');
    assert(lb['mgr17@x.com'].channel_ids.includes(mgrCh) && lb.owner.channel_ids.includes(Bv.id) && !lb.owner.channel_ids.includes(mgrCh), 'channels count for whoever added them (channels.created_by)');
    r = await M('/api/team/leaderboard?' + q); assert(r.s === 200 && r.j.rows.length === 3, 'manager sees the whole leaderboard');
    r = await patch(O, `/api/team/${invB.j.member.id}`, { channel_ids: [A.id, Bv.id] });
    assert(r.s === 200 && r.j.member.channel_ids.length === 2, 'owner gives the buyer Bravo too');
    r = await Bu('/api/stats?' + q); assert(r.j.totals.clicks === 5, 'buyer sees Bravo at once');
    r = await patch(O, `/api/team/${invB.j.member.id}`, { channel_ids: [A.id] });

    // ---------- remove frees the seat, no refund ----------
    const balR = (await O('/api/billing')).j.balance_cents;
    r = await del(O, `/api/team/${invY.j.member.id}`);
    assert(r.s === 200 && r.j.seats.used === 3 && (await O('/api/billing')).j.balance_cents === balR, 'removing a member frees the seat (no refund)');
    r = await fetch(B + '/api/team/invite-info?token=' + tokenOf(invY.j.invite_url)).then((x) => x.status); assert(r === 404, 'the removed person’s invite link stops working');
    r = await post(O, '/api/team/invite', { email: 'y17@x.com', role: 'buyer' }); assert(r.s === 200 && r.j.charged_cents === 0, 're-adding in the same month reuses the paid seat (no second charge)');
    const invY2 = r.j;

    // ---------- expiry + resend ----------
    db.prepare(`UPDATE team_members SET invited_at=? WHERE id=?`).run(Date.now() - 8 * 864e5, invX.j.member.id);
    r = await fetch(B + '/api/team/invite-info?token=' + tokenOf(invX.j.invite_url)).then((x) => x.json()); assert(r.expired === true, 'invites expire after 7 days');
    const Xc = client(); r = await post(Xc, '/api/signup', { country: 'NG', email: 'x17@x.com', password: 'password1', team_token: tokenOf(invX.j.invite_url) });
    assert(r.s === 200 && r.j.team && r.j.team.code === 'expired' && (await Xc('/api/me')).j.workspace.current.own, 'sign-up with an expired invite still creates the account, but doesn’t join');
    r = await O('/api/team'); assert(r.j.members.find((x) => x.id === invX.j.member.id).status === 'expired', 'team page shows it expired');
    r = await post(O, `/api/team/${invX.j.member.id}/resend`);
    assert(r.s === 200 && r.j.invite_url !== invX.j.invite_url, 'resend gives a fresh link');
    r = await post(Xc, '/api/team/accept', { token: tokenOf(r.j.invite_url) }); assert(r.s === 200 && r.j.status === 'active', 'the fresh link works');
    r = await post(O, `/api/team/${invM.j.member.id}/resend`); assert(r.s === 400, 'no resend for someone who already joined');

    // ---------- Pro → Basic: members paused, sessions lose the workspace; upgrade brings them back ----------
    await post(ADM, `/api/admin/users/${oid}/trial`, { action: 'end' }); // the trial counts as Pro: end it first
    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'basic' });
    r = await O('/api/team'); assert(r.j.members.filter((x) => x.status !== 'removed').every((x) => x.status === 'paused') && r.j.seats.paused >= 3, 'downgrade: every member paused');
    r = await M('/api/channels'); assert(r.s === 200 && r.j.channels.every((c) => c.title !== 'Alpha'), 'the manager’s session drops back to their own workspace');
    me = (await M('/api/me')).j; assert(me.workspace.current.own && me.workspace.workspaces.find((w) => w.owner_id === oid).status === 'paused', '/api/me shows the team as paused');
    r = await post(Bu, '/api/workspace', { owner_id: oid }); assert(r.s === 403 && r.j.paused, 'can’t enter a paused workspace');
    r = await O('/api/inbox'); assert(r.j.items ? r.j.items.some((x) => x.title === 'Team members paused') : JSON.stringify(r.j).includes('Team members paused'), 'owner gets an inbox note');
    r = await post(O, '/api/team/invite', { email: 'new17@x.com', role: 'buyer' }); assert(r.s === 402 && r.j.limit.kind === 'seats', 'no invites on Basic');
    await post(ADM, `/api/admin/users/${oid}/plan`, { plan: 'pro' });
    r = await O('/api/team'); const back = r.j.members.filter((x) => x.user_id);
    assert(back.length >= 3 && back.every((x) => x.status === 'active'), 'upgrade: members are active again');
    r = await post(Bu, '/api/workspace', { owner_id: oid }); assert(r.s === 200 && (await Bu('/api/channels')).j.channels.length === 1, 'buyer can enter again (still Alpha only)');

    // ---------- audit log + admin ----------
    r = await O('/api/team'); const acts = r.j.log.map((x) => x.action);
    assert(['team.invite', 'team.accept', 'team.remove', 'team.update', 'team.resend', 'team.pause', 'team.resume'].every((a) => acts.includes(a)), 'team actions are in the audit log');
    r = await ADM(`/api/admin/users/${oid}`); assert(r.s === 200 && r.j.team && r.j.team.size >= 4 && r.j.team.members.length >= 4 && r.j.team.seats.included === 3, 'admin user detail shows the team size');
    r = await ADM(`/api/admin/users/${buid}`); assert(r.j.team.member_of.some((x) => x.owner_email === 'own17@x.com' && x.role === 'buyer'), 'admin sees which teams someone is on');
    r = await ADM('/api/admin/settings'); assert(r.j.round17 && r.j.round17.seat_cents === 500 && r.j.round17.pro_included === 3 && r.j.round17.meta_available === false, 'admin settings show seat prices');
    r = await put(ADM, '/api/admin/settings', { round17: { seat_cents: 700, pro_included: 4 } });
    assert(r.s === 200 && r.j.settings.round17.seat_cents === 700 && (await O('/api/team')).j.seats.included === 4, 'admin changes the seat price and included seats');
    await put(ADM, '/api/admin/settings', { round17: { seat_cents: 500, pro_included: 3 } });
    r = await post(ADM, '/api/admin/jobs/run', { job: 'team_seats' }); assert(r.s === 200, 'the seat job runs from admin');

    // ---------- Meta spend sync without a Meta app: "coming soon" ----------
    r = await O('/api/meta'); assert(r.s === 200 && r.j.available === false && r.j.reason === 'Waiting for Meta app approval', 'GET /api/meta without META_APP_ID → available:false');
    r = await post(O, '/api/meta/sync'); assert(r.j.available === false, 'sync too');
    r = await O('/auth/meta/start'); assert(r.s === 302 && /meta=unavailable/.test(r.h.get('location')), '/auth/meta/start → back with meta=unavailable');

    // ---------- the monthly renewal: the seat job charges extra seats for a new month once ----------
    const extraNow = (await O('/api/team')).j.seats.extra;
    db.prepare(`DELETE FROM ledger WHERE user_id=? AND kind='seats'`).run(oid); // as if the month just turned
    db.prepare(`UPDATE users SET balance_cents=balance_cents+? WHERE id=?`).run(500 * Math.max(1, extraNow), oid);
    const balM = (await O('/api/billing')).j.balance_cents;
    await post(ADM, '/api/admin/jobs/run', { job: 'team_seats' }); await post(ADM, '/api/admin/jobs/run', { job: 'team_seats' });
    bill = (await O('/api/billing')).j;
    assert(extraNow >= 1 && bill.balance_cents === balM - 500 * extraNow && bill.history.filter((h) => h.kind === 'seats').length === extraNow, 'monthly: extra seats charged once per seat (running the job twice charges nothing more)');
    // can't pay → newest extra member paused; top up → back
    db.prepare(`DELETE FROM ledger WHERE user_id=? AND kind='seats'`).run(oid);
    db.prepare(`UPDATE users SET balance_cents=0 WHERE id=?`).run(oid);
    await post(ADM, '/api/admin/jobs/run', { job: 'team_seats' });
    r = await O('/api/team'); const unpaid = r.j.members.filter((x) => x.status === 'paused' && x.pause_reason === 'unpaid');
    assert(unpaid.length === extraNow && unpaid.every((x) => x.id === invY2.member.id || x.id > invB.j.member.id), 'empty wallet at renewal → the newest extra member is paused (unpaid)');
    await post(ADM, `/api/admin/users/${oid}/credits`, { credits: 1000, reason: 'top up' });
    await post(ADM, '/api/admin/jobs/run', { job: 'team_seats' });
    r = await O('/api/team'); assert(!r.j.members.some((x) => x.status === 'paused'), 'after a top-up they come back');

    // ---------- account deletion takes the team rows with it (trigger, like custom_domains) ----------
    const Q2 = client(); await post(Q2, '/api/signup', { country: 'NG', email: 'gone17@x.com', password: 'password1' });
    const gid = await uid('gone17@x.com'); await post(ADM, `/api/admin/users/${gid}/plan`, { plan: 'pro' });
    const gi = await post(Q2, '/api/team/invite', { email: 'buy17@x.com', role: 'buyer' });
    await post(Bu, '/api/team/accept', { token: tokenOf(gi.j.invite_url) });
    assert(db.prepare(`SELECT COUNT(*) n FROM team_members WHERE owner_id=?`).get(gid).n === 1, 'second team exists');
    db.prepare(`DELETE FROM users WHERE id=?`).run(gid);
    assert(db.prepare(`SELECT COUNT(*) n FROM team_members WHERE owner_id=?`).get(gid).n === 0 && db.prepare(`SELECT COUNT(*) n FROM sessions WHERE workspace_owner=?`).get(gid).n === 0, 'deleting the owner removes their team rows and workspace sessions');
    r = await Bu('/api/me'); assert(r.s === 200 && r.j.workspace.workspaces.every((w) => w.owner_id !== gid), 'the member’s list no longer shows it');
  } catch (e) { console.log('FAIL: exception', e.stack); process.exitCode = 1; }
  finally { try { db.close(); } catch { /* */ } }
})();
