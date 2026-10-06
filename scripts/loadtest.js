// Joinvoo load test. Runs entirely on this machine: a fake Telegram + Meta API, and Joinvoo servers on scratch ports.
// Nothing touches the real Telegram or Meta.
//
//   node scripts/loadtest.js burst  [clicks=10000] [bots=5] [channels=3]   server capacity: as fast as it can go
//   node scripts/loadtest.js paced  [perSec=3] [seconds=180]                realistic Telegram pacing: 1 bot vs 5 bots on one channel
//   node scripts/loadtest.js fleet  [customers=2000] [visits=20000]          many customers at once, with dashboards and the website open
//   node scripts/loadtest.js cleanup [oldRows=500000]                       storage clean-up on a big database while the website is used
//
// Prints a JSON report at the end.
const http = require('http'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const KIDS = []; process.on('exit', () => { for (const k of KIDS) try { k.kill('SIGKILL'); } catch {} });
const MOCK_PORT = 4810;
const sleep = (t) => new Promise((r) => setTimeout(r, t));

// ---------- fake Telegram + Meta ----------
const M = { hooks: {}, links: 0, meta: 0, metaCalls: 0, metaFirst: 0, metaLast: 0, edits: 0 };
function startMock() {
  return new Promise((ok) => http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const j = b ? JSON.parse(b) : {}, m = /^\/bot(\d+):([^/]+)\/(\w+)/.exec(req.url);
      if (m) {
        const id = +m[1], meth = m[3], tok = m[1] + ':' + m[2];
        const R = (result) => res.end(JSON.stringify({ ok: true, result }));
        if (meth === 'getMe') return R({ id, is_bot: true, username: 'load' + id + '_bot' });
        if (meth === 'setWebhook') { M.hooks[tok] = j; return R(true); }
        if (meth === 'getWebhookInfo') return R({ url: (M.hooks[tok] || {}).url || '', pending_update_count: 0 });
        if (meth === 'createChatInviteLink') { M.links++; return R({ invite_link: 'https://t.me/+L' + M.links + 'x' + Math.random().toString(36).slice(2, 8), name: j.name, member_limit: j.member_limit }); }
        if (meth === 'editChatInviteLink') { M.edits++; return R({ invite_link: j.invite_link, name: j.name }); }
        if (meth === 'getChat') return R({ id: j.chat_id, type: 'channel', title: 'C' });
        return R(true);
      }
      if (/\/events$/.test(req.url)) {
        const n = (j.data || []).length; M.meta += n; M.metaCalls++; const t = Date.now(); if (!M.metaFirst) M.metaFirst = t; M.metaLast = t;
        return res.end(JSON.stringify({ events_received: n }));
      }
      res.statusCode = 404; res.end('{}');
    });
  }).listen(MOCK_PORT, ok));
}

// ---------- Joinvoo server ----------
function startServer(port, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jvload-'));
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, TG_API: `http://127.0.0.1:${MOCK_PORT}`, GRAPH_API: `http://127.0.0.1:${MOCK_PORT}`,
      TIKTOK_API: `http://127.0.0.1:${MOCK_PORT}`, SNAP_API: `http://127.0.0.1:${MOCK_PORT}`, BILLING: 'off', ADMIN_EMAILS: '', RESEND_API_KEY: '', ANTHROPIC_API_KEY: '', ...extra } });
  KIDS.push(p);
  const lg = fs.createWriteStream(path.join(dir, 'server.log')); p.stdout.pipe(lg); p.stderr.pipe(lg);
  let errs = 0; p.stdout.on('data', (d) => { if (/server error|update error/i.test(String(d))) errs++; }); p.stderr.on('data', () => errs++);
  p.on('exit', (c, s) => { if (!p.killedByUs) console.error('server', port, 'exited', c, s); });
  return { p, dir, port, errs: () => errs };
}
async function waitUp(port) { await sleep(300); for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/health`).then((x) => x.json()); if (r.ok) return; } catch { /* not yet */ } await sleep(100); } throw new Error('server did not start'); }
const settle = () => sleep(1500);
const memMB = (pid) => { try { return Math.round(+fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024); } catch { return null; } };
const cpuTicks = (pid) => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return +f[11] + +f[12]; } catch { return 0; } };

// ---------- one customer with bots + channels ----------
async function setup(port, bots, channels) {
  const B = `http://127.0.0.1:${port}`; let ck = '';
  const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) } }); const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; return r.json().catch(() => ({})); };
  await f('/api/signup', { method: 'POST', body: JSON.stringify({ country: 'NG', email: 'load' + port + '@x.com', password: 'password1' }) });
  const botRows = [];
  for (let i = 0; i < bots; i++) {
    const id = 8000000000 + port * 10 + i, tok = `${id}:AAHloadtesttokenxxxxxxxxxxxxxxxxxxxx${i}`;
    const r = await f('/api/bots', { method: 'POST', body: JSON.stringify({ token: tok }) });
    botRows.push({ id, tok, dbId: r.bot.id, hook: new URL(M.hooks[tok].url).pathname, secret: M.hooks[tok].secret_token });
  }
  const tg = (bot, upd) => fetch(B + bot.hook, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': bot.secret }, body: JSON.stringify(upd) });
  let uid = 1;
  for (let c = 0; c < channels; c++) for (const bot of botRows)
    await tg(bot, { update_id: uid++, my_chat_member: { chat: { id: -100900 - c, title: 'Load ' + (c + 1), type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id: bot.id } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id: bot.id } } } });
  const chs = (await f('/api/channels')).channels;
  for (const ch of chs) await f('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ pixel_id: '884210395527140', capi_token: 'EAAloadtest' }) });
  return { B, f, botRows, tg, chs: (await f('/api/channels')).channels };
}
const pools = async (S) => (await S.f('/api/channels')).channels.reduce((a, c) => a + c.pool, 0);

// one ad click → invite link → join (the way Telegram reports it)
let tgUser = 1e9, upd = 1e6;
async function visit(S, ch, ip) {
  const t0 = performance.now();
  const r = await fetch(S.B + new URL(ch.tracking_url).pathname + '/go', { method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'jv_h=1', 'x-forwarded-for': ip, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FBAN/FBIOS' },
    body: JSON.stringify({ url: `https://joinvoo.com/c/x?fbclid=IwAR${Math.random().toString(36).slice(2)}&utm_campaign=load`, fbp: 'fb.1.1700000000000.' + Math.floor(Math.random() * 1e9) }) });
  const go = await r.json(); const clickMs = performance.now() - t0;
  const tracked = /t\.me\/\+L/.test(go.url || '');
  let joinMs = null;
  if (tracked) {
    const u = ++tgUser, t1 = performance.now();
    await S.tg(S.botRows[0], { update_id: ++upd, chat_member: { chat: { id: ch.chat_id, type: 'channel' }, from: { id: u }, date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: u } }, new_chat_member: { status: 'member', user: { id: u, first_name: 'U' + u } }, invite_link: { invite_link: go.url, creator: { id: S.botRows[0].id }, member_limit: 1 } } });
    joinMs = performance.now() - t1;
  }
  return { ok: r.status === 200, tracked, clickMs, joinMs };
}
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] * 10) / 10; };
const ipOf = (i) => `102.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

async function burst(total = 10000, bots = 5, channels = 3) {
  const srv = startServer(3995, { LINK_INTERVAL_MS: '1', POOL_SIZE: '400', FEATURE_FAKE_FILTER: process.env.KEEP_FILTER ? '1' : '0' }); await waitUp(3995); await settle(); // the fake-join filter would (correctly) flag a synthetic burst this fast
  const S = await setup(3995, bots, channels);
  // channel ids for chat_member: the api view hides chat_id, so read it from the tracking order we created
  S.chs.forEach((c, i) => { c.chat_id = -100900 - i; });
  const target = channels * 400; let t = Date.now();
  while ((await pools(S)) < target * 0.98 && Date.now() - t < 120000) await sleep(500);
  const ready = await pools(S), cpu0 = cpuTicks(srv.p.pid), wall0 = Date.now();
  const res = []; let i = 0, mem = 0;
  const memT = setInterval(() => { mem = Math.max(mem, memMB(srv.p.pid) || 0); }, 250);
  const worker = async () => { while (i < total) { const k = i++; res.push(await visit(S, S.chs[k % S.chs.length], ipOf(k + 7))); } };
  await Promise.all(Array.from({ length: 50 }, worker));
  const wall = (Date.now() - wall0) / 1000, cpu = (cpuTicks(srv.p.pid) - cpu0) / 100;
  const sentTarget = res.filter((r) => r.tracked).length; t = Date.now();
  while (M.meta < sentTarget && Date.now() - t < 120000) await sleep(250);
  const drain = (Date.now() - wall0) / 1000; clearInterval(memT);
  const d = new Date().toISOString().slice(0, 10), st = (await S.f(`/api/stats?from=${d}&to=${d}&tz=0`)).totals;
  const dbMB = Math.round(fs.readdirSync(srv.dir).filter((x) => /\.db/.test(x)).reduce((a, x) => a + fs.statSync(path.join(srv.dir, x)).size, 0) / 1048576 * 10) / 10;
  srv.p.kill();
  return { scenario: 'burst', bots, channels, ready_links_before: ready, visitors: total, seconds: Math.round(wall * 10) / 10, visitors_per_sec: Math.round(total / wall),
    http_errors: res.filter((r) => !r.ok).length, tracked_pct: Math.round(sentTarget / total * 1000) / 10,
    click_ms: { p50: pct(res.map((r) => r.clickMs), 50), p95: pct(res.map((r) => r.clickMs), 95), p99: pct(res.map((r) => r.clickMs), 99) },
    join_ms: { p50: pct(res.filter((r) => r.joinMs != null).map((r) => r.joinMs), 50), p95: pct(res.filter((r) => r.joinMs != null).map((r) => r.joinMs), 95) },
    joins_recorded: st.joins, meta_events_delivered: M.meta, meta_calls: M.metaCalls, all_sent_to_meta_after_sec: Math.round(drain), server_cpu_sec: Math.round(cpu * 10) / 10, peak_memory_mb: mem, db_mb: dbMB, server_errors_logged: srv.errs(), filtered_fake: st.filtered_joins, log: path.join(srv.dir, 'server.log') };
}

async function paced(perSec = 3, seconds = 180) {
  const out = [];
  for (const [bots, port] of [[1, 3996], [5, 3997]]) {
    const POOL = +process.env.POOL || 200; const srv = startServer(port, { POOL_SIZE: String(POOL) }); await waitUp(port); await settle(); // real pacing: one new link per bot every 1.5 s
    const S = await setup(port, bots, 1); S.chs[0].chat_id = -100900;
    let t = Date.now(); while ((await pools(S)) < POOL && Date.now() - t < 400000) await sleep(1000);
    const ready = await pools(S), res = [], timeline = []; let k = 0;
    const tick = setInterval(async () => { timeline.push(await pools(S).catch(() => null)); }, 15000);
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
      const due = Math.floor((Date.now() - t0) / 1000 * perSec);
      while (k < due) { const n = k++; visit(S, S.chs[0], ipOf(n + port * 1000)).then((r) => res.push(r)); }
      await sleep(50);
    }
    await sleep(1500); clearInterval(tick);
    const tracked = res.filter((r) => r.tracked).length;
    out.push({ bots, clicks_per_sec: perSec, per_hour_rate: perSec * 3600, seconds, ready_links_at_start: ready, visitors: res.length, tracked_pct: Math.round(tracked / res.length * 1000) / 10,
      ready_links_every_15s: timeline, click_p95_ms: pct(res.map((r) => r.clickMs), 95), server_errors_logged: srv.errs() });
    srv.p.kill();
  }
  return { scenario: 'paced (real Telegram speed: 1 link per bot every 1.5 s)', runs: out };
}


async function fleet(customers = 2000, visits = 20000) {
  const port = 3994, srv = startServer(port, { POOL_SIZE: '20' }); await waitUp(port); await settle();
  const B = `http://127.0.0.1:${port}`, T0 = Date.now();
  const custs = []; let k = 0, uid = 1;
  const one = async (i) => {
    let ck = ''; const ip = ipOf(50000 + i);
    const f = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': ip, ...(o.headers || {}) } }); const sc = r.headers.get('set-cookie'); if (sc && sc.startsWith('jp_session')) ck = sc.split(';')[0]; return r.json().catch(() => ({})); };
    await f('/api/signup', { method: 'POST', body: JSON.stringify({ country: 'NG', email: `c${i}@x.com`, password: 'password1' }) });
    const id = 7500000000 + i, tok = `${id}:AAHfleettesttokenxxxxxxxxxxxxxxxxxxx${i}`;
    const r = await f('/api/bots', { method: 'POST', body: JSON.stringify({ token: tok }) });
    const bot = { id, hook: new URL(M.hooks[tok].url).pathname, secret: M.hooks[tok].secret_token };
    const tg = (upd) => fetch(B + bot.hook, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': bot.secret }, body: JSON.stringify(upd) });
    await tg({ update_id: uid++, my_chat_member: { chat: { id: -200000 - i, title: 'Fleet ' + i, type: 'channel' }, from: { id: 9 }, date: 1, old_chat_member: { status: 'left', user: { id } }, new_chat_member: { status: 'administrator', can_invite_users: true, user: { id } } } });
    const ch = (await f('/api/channels')).channels[0];
    await f('/api/channels/' + ch.id, { method: 'PATCH', body: JSON.stringify({ pixel_id: '884210395527140', capi_token: 'EAAfleet' }) });
    ch.chat_id = -200000 - i;
    custs[i] = { f, B, botRows: [bot], tg: (b, u) => tg(u), chs: [ch] };
  };
  const work = async () => { while (k < customers) { const i = k++; try { await one(i); } catch (e) { custs[i] = null; } } };
  await Promise.all(Array.from({ length: 20 }, work));
  const ready = custs.filter(Boolean).length, setupSec = Math.round((Date.now() - T0) / 1000);
  await sleep(20000); // let the invite-link pools fill
  const cpu0 = cpuTicks(srv.p.pid); let mem = 0; const memT = setInterval(() => { mem = Math.max(mem, memMB(srv.p.pid) || 0); }, 250);
  // the public website and customers' dashboards are used during the traffic
  let stop = false; const home = [], dash = [];
  const homeLoop = (async () => { while (!stop) { const t = performance.now(); await fetch(B + '/').then((r) => r.text()).catch(() => {}); home.push(performance.now() - t); await sleep(200); } })();
  const d = new Date().toISOString().slice(0, 10);
  const dashLoop = Array.from({ length: 30 }, async () => { while (!stop) { const c = custs[Math.floor(Math.random() * customers)]; if (!c) continue; const t = performance.now();
    await Promise.all([c.f(`/api/stats?from=${d}&to=${d}&tz=0`), c.f(`/api/joins?from=${d}&to=${d}&tz=0`), c.f('/api/channels')]); dash.push(performance.now() - t); await sleep(300); } });
  const res = []; let v = 0; const t1 = Date.now();
  const traffic = async () => { while (v < visits) { const n = v++; const c = custs[Math.floor(Math.random() * customers)]; if (!c) continue; res.push(await visit(c, c.chs[0], ipOf(n + 100000))); } };
  await Promise.all(Array.from({ length: 100 }, traffic));
  const wall = (Date.now() - t1) / 1000, cpu = (cpuTicks(srv.p.pid) - cpu0) / 100;
  const tracked = res.filter((r) => r.tracked).length; let t = Date.now();
  while (M.meta < tracked && Date.now() - t < 180000) await sleep(500);
  stop = true; await homeLoop; await Promise.all(dashLoop); clearInterval(memT);
  const dbMB = Math.round(fs.readdirSync(srv.dir).filter((x) => /\.db/.test(x)).reduce((a, x) => a + fs.statSync(path.join(srv.dir, x)).size, 0) / 1048576 * 10) / 10;
  srv.p.kill();
  return { scenario: 'fleet', customers_ready: ready, setup_seconds: setupSec, visits: res.length, seconds: Math.round(wall * 10) / 10, visits_per_sec: Math.round(res.length / wall),
    http_errors: res.filter((r) => !r.ok).length, tracked_pct: Math.round(tracked / res.length * 1000) / 10,
    click_ms: { p50: pct(res.map((r) => r.clickMs), 50), p95: pct(res.map((r) => r.clickMs), 95), p99: pct(res.map((r) => r.clickMs), 99) },
    dashboard_load_ms: { loads: dash.length, p50: pct(dash, 50), p95: pct(dash, 95) },
    website_home_ms: { loads: home.length, p50: pct(home, 50), p95: pct(home, 95), max: Math.round(Math.max(...home)) },
    meta_events_delivered: M.meta, invite_links_made: M.links, server_cpu_sec: Math.round(cpu * 10) / 10, peak_memory_mb: mem, db_mb: dbMB, server_errors_logged: srv.errs() };
}

async function cleanupRun(rows = 500000) {
  const port = 3993, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jvclean-'));
  let srv = startServer(port, { DATA_DIR: dir, PRUNE_FIRST_MS: '600000' }); await waitUp(port); await settle(); srv.p.kill(); await sleep(1000);
  const { DatabaseSync } = require('node:sqlite'); let db = new DatabaseSync(path.join(dir, 'joinvoo.db'));
  const old = Date.now() - 200 * 864e5, mid = Date.now() - 120 * 864e5, X = 'x'.repeat(120);
  db.exec('BEGIN');
  const ins = db.prepare(`INSERT INTO clicks(owner_id,channel_id,ts,ip,ua,country,fbclid,fbc,fbp,page_url,params,joined) VALUES(1,1,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < rows; i++) { const joined = i % 5 === 0 ? 1 : 0; ins.run(joined ? old + i : mid + i, '102.89.1.' + (i % 250), 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FBAN/FBIOS;FBAV/450.0', 'NG',
    'IwAR' + X, 'fb.1.1700000000000.IwAR' + X, 'fb.1.1700000000000.123456789', 'https://joinvoo.com/c/abc?fbclid=IwAR' + X + '&utm_campaign=old', '{"utm_campaign":"old"}', joined); }
  const il = db.prepare(`INSERT INTO links(channel_id,bot_id,url,status,created_at,assigned_at) VALUES(1,1,?,'used',?,?)`);
  for (let i = 0; i < rows / 5; i++) il.run('https://t.me/+old' + i, old, old);
  db.exec('COMMIT');
  const count = () => ({ clicks: db.prepare('SELECT COUNT(*) n FROM clicks').get().n, with_ip: db.prepare('SELECT COUNT(*) n FROM clicks WHERE ip IS NOT NULL').get().n, links: db.prepare('SELECT COUNT(*) n FROM links').get().n });
  const before = count(); db.close();
  srv = startServer(port, { DATA_DIR: dir, PRUNE_FIRST_MS: '3000', PRUNE_EVERY_MS: '3600000' }); await waitUp(port);
  const B = `http://127.0.0.1:${port}`, home = []; let stop = false; const t0 = Date.now();
  const probe = (async () => { while (!stop) { const t = performance.now(); await fetch(B + '/').then((r) => r.text()).catch(() => {}); home.push(performance.now() - t); await sleep(100); } })();
  const logf = path.join(srv.dir, 'server.log');
  while (Date.now() - t0 < 300000) { await sleep(1000); if (/storage clean-up/.test(fs.readFileSync(logf, 'utf8'))) break; }
  stop = true; await probe;
  const line = (fs.readFileSync(logf, 'utf8').match(/storage clean-up (\{.*\})/) || [])[1];
  srv.p.kill(); await sleep(800);
  db = new DatabaseSync(path.join(dir, 'joinvoo.db')); const after = count(); db.close();
  return { scenario: 'cleanup', seeded: { old_unjoined_clicks: rows * 0.8, old_joined_clicks: rows * 0.2, old_used_links: rows / 5 }, before, after, cleanup: line ? JSON.parse(line) : null,
    website_home_ms_during_cleanup: { loads: home.length, p50: pct(home, 50), p95: pct(home, 95), max: Math.round(Math.max(...home)) } };
}

(async () => {
  await startMock();
  const [mode = 'burst', a, b, c] = process.argv.slice(2);
  const r = mode === 'paced' ? await paced(+a || 3, +b || 180) : mode === 'fleet' ? await fleet(+a || 2000, +b || 20000) : mode === 'cleanup' ? await cleanupRun(+a || 500000) : await burst(+a || 10000, +b || 5, +c || 3);
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
