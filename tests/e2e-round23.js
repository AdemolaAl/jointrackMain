// Round 23: login sessions ("Where you're logged in") + new-device login emails.
//  - every login records browser/system/IP/country; GET /api/sessions lists them, current first, IPs masked
//  - no alert on sign-up, on the same browser, or for an account's first device (round 23 review: a cleared-cookie browser now alerts)
//  - a browser the account never used → "new_login" security email (in the user's language) with a working "Secure my account" link
//  - logged-in browsers from before the update are remembered quietly on their next /api/me (no flood of alerts after the deploy)
//  - sign out one device, all others, or this one; /secure-account signs everyone out and sends a reset link; the admin switch turns emails off
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
// fake AI for support translation: replies "translated" text, or changes a number when the reply contains BREAKNUM
const http = require('http');
const ai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { const b = JSON.parse(raw), sys = String(b.system || ''), txt = b.messages[b.messages.length - 1].content;
  let out;
  if (/detect its language and translate it into English/.test(sys)) out = JSON.stringify({ items: JSON.parse(txt).map((x) => ({ id: x.id, lang: /[а-я]/i.test(x.text) ? 'ru' : 'en', en: /[а-я]/i.test(x.text) ? 'EN: where is my top-up of 50 dollars' : null })) });
  else if (/into Russian/.test(sys)) out = /BREAKNUM/.test(txt) ? 'Пополнение 60 долларов' : 'RU: ' + txt;
  else out = 'ok';
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: out }] })); }); }).listen(4965);
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const UA = { iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };
let ipn = 10;
function client(ua, lang = 'en-NG,en;q=0.9') {
  const jar = {}, ip = '102.89.23.' + (ipn++);
  const f = async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': ip, 'user-agent': ua, 'accept-language': lang, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v === '') delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = v; }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), h: r.headers }; } catch { return { s: r.status, t, h: r.headers }; }
  };
  f.jar = jar; return f;
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const RUN = path.dirname(process.env.SRV_LOG);

(async () => {
  const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
  const alerts = (uid) => db.prepare(`SELECT COUNT(*) n FROM email_log WHERE user_id=? AND kind='new_login'`).get(uid).n;
  try {
    const ADM = client(UA.mac);
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Alex Admin' });
    await sleep(100);
    const vlink = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
    await fetch(B + vlink[1], { redirect: 'manual' });

    // sign-up on an iPhone: no alert, device remembered, session has details
    const P1 = client(UA.iphone);
    let r = await post(P1, '/api/signup', { country: 'NG', email: 'sess23@x.com', password: 'password1', name: 'Sola', lang: 'en' });
    assert(r.s === 200 && P1.jar.jv_dev && P1.jar.jp_session, 'sign-up sets the session and a device cookie');
    const uid = db.prepare(`SELECT id FROM users WHERE email='sess23@x.com'`).get().id;
    const s0 = db.prepare(`SELECT * FROM sessions WHERE user_id=?`).get(uid);
    assert(s0.created_at && /iPhone/.test(s0.ua) && s0.country === 'NG' && s0.dev === P1.jar.jv_dev && s0.ip, 'the session records browser, country, IP and device');
    assert(alerts(uid) === 0 && db.prepare(`SELECT COUNT(*) n FROM devices WHERE user_id=?`).get(uid).n === 1, 'no alert on sign-up; the iPhone is a known device');
    r = await P1('/api/sessions');
    assert(r.s === 200 && r.j.sessions.length === 1 && r.j.sessions[0].current && r.j.sessions[0].os === 'iPhone' && r.j.sessions[0].browser === 'Safari' && /\.••$/.test(r.j.sessions[0].ip) && r.j.sessions[0].flag === '🇳🇬' && r.j.alerts === true, 'sessions list: this iPhone, Safari, Nigeria, IP masked');
    assert(!JSON.stringify(r.j).includes(s0.token), 'the list never shows session tokens');

    // log out and back in on the same iPhone: no alert
    await post(P1, '/api/logout');
    r = await post(P1, '/api/login', { email: 'sess23@x.com', password: 'password1' }); assert(r.s === 200, 'log in again on the same iPhone');
    assert(alerts(uid) === 0, 'same browser: no alert');

    // a new Windows laptop: alert
    const P2 = client(UA.win);
    r = await post(P2, '/api/login', { email: 'sess23@x.com', password: 'password1' }); assert(r.s === 200, 'log in on a Windows laptop');
    await sleep(100);
    assert(alerts(uid) === 1, 'new device: one "new_login" email');
    const mailLine = logTxt().split('\n').filter((l) => /New login to your Joinvoo account/.test(l)).pop() || '';
    assert(/sess23@x\.com/.test(mailLine), 'the email goes to the account owner');
    const inbox = db.prepare(`SELECT title FROM inbox WHERE user_id=? ORDER BY id DESC LIMIT 1`).get(uid);
    assert(inbox && /New login/.test(inbox.title), 'and a copy lands in the dashboard inbox');

    // cookies cleared on that laptop (same Chrome on Windows, same country). Round 23 review: only the device cookie counts as known now
    // (the "same browser + system + country" fallback let a stranger with the same common phone in the same country log in silently)
    const P2b = client(UA.win);
    r = await post(P2b, '/api/login', { email: 'sess23@x.com', password: 'password1' }); await sleep(50); assert(r.s === 200 && alerts(uid) === 2, 'cleared cookies, same browser + system + country: alert (round 23 review)');
    // the same kind of browser from another country: alert
    const P3 = client(UA.win, 'fr-FR,fr;q=0.9');
    r = await post(P3, '/api/login', { email: 'sess23@x.com', password: 'password1' }); await sleep(50); assert(r.s === 200 && alerts(uid) === 3, 'Chrome on Windows from France: alert');

    r = await P1('/api/sessions'); const L = r.j.sessions;
    assert(L.length === 4 && L[0].current && L[0].os === 'iPhone' && L.filter((x) => x.os === 'Windows').length === 3, 'the list shows all 4 logins, this one first');

    // sign out one device (the French one)
    const fr = L.find((x) => x.country === 'FR');
    r = await post(P1, '/api/sessions/end', { id: fr.id }); assert(r.s === 200 && r.j.ended === 1 && !r.j.current, 'sign out the French login');
    r = await P3('/api/me'); assert(r.s === 401, 'that browser is logged out now');
    r = await post(P1, '/api/sessions/end', { id: 'nope-nope-nope-1' }); assert(r.s === 404, 'unknown id → 404');
    // another account can't end mine
    const X = client(UA.mac); await post(X, '/api/signup', { country: 'KE', email: 'other23@x.com', password: 'password1', name: 'X' });
    r = await post(X, '/api/sessions/end', { id: L.find((x) => x.os === 'Windows' && !x.current).id }); assert(r.s === 404, 'another account can’t sign out my devices');
    r = await P2('/api/me'); assert(r.s === 200, '…my laptop is still logged in');
    // sign out all others
    r = await post(P1, '/api/sessions/end', { others: true }); assert(r.s === 200 && r.j.ended === 2, 'sign out all other devices (2)');
    r = await P2('/api/me'); assert(r.s === 401, 'laptop logged out');
    r = await P1('/api/me'); assert(r.s === 200, 'this iPhone stays logged in');
    r = await P1('/api/sessions'); assert(r.j.sessions.length === 1, 'only this device left');

    // logged in before the update: a session row with no details and no device cookie, account with no devices yet
    const old = client(UA.android);
    await post(old, '/api/signup', { country: 'GH', email: 'old23@x.com', password: 'password1', name: 'Old' });
    const oid = db.prepare(`SELECT id FROM users WHERE email='old23@x.com'`).get().id;
    db.prepare(`UPDATE sessions SET created_at=NULL, ua=NULL, ip=NULL, country=NULL, dev=NULL, last_seen=NULL WHERE user_id=?`).run(oid); db.prepare(`DELETE FROM devices WHERE user_id=?`).run(oid);
    delete old.jar.jv_dev;
    r = await old('/api/sessions'); assert(r.s === 200 && r.j.sessions[0].legacy === true, 'an old session shows as "logged in before devices were recorded"');
    r = await old('/api/me'); assert(r.s === 200 && old.jar.jv_dev && db.prepare(`SELECT COUNT(*) n FROM devices WHERE user_id=?`).get(oid).n === 1, 'its next /api/me remembers the device quietly');
    r = await old('/api/sessions'); assert(r.j.sessions[0].legacy === false && r.j.sessions[0].os === 'Android', 'and fills in the device details');
    assert(alerts(oid) === 0, 'no alert for a device that was already logged in');
    // an account whose devices we never saw, logging in fresh after the update: first device, no alert
    const fresh = client(UA.mac); await post(fresh, '/api/signup', { country: 'GH', email: 'fresh23@x.com', password: 'password1', name: 'F' });
    const fid = db.prepare(`SELECT id FROM users WHERE email='fresh23@x.com'`).get().id; db.prepare(`DELETE FROM devices WHERE user_id=?`).run(fid);
    const fresh2 = client(UA.android); r = await post(fresh2, '/api/login', { email: 'fresh23@x.com', password: 'password1' });
    assert(r.s === 200 && alerts(fid) === 0, 'account with no devices on record: the first login is not an alert');

    // the email in Russian, and its "Wasn't you?" link
    await P1('/api/me', { method: 'PATCH', body: JSON.stringify({ lang: 'ru' }) });
    const P4 = client(UA.android, 'ru-RU,ru;q=0.9');
    r = await post(P4, '/api/login', { email: 'sess23@x.com', password: 'password1' }); await sleep(100);
    const row = db.prepare(`SELECT subject FROM email_log WHERE user_id=? AND kind='new_login' ORDER BY id DESC LIMIT 1`).get(uid);
    assert(alerts(uid) === 4 && /Новый вход/.test(row.subject), 'alert in the user’s language (Russian)');
    const link = [...logTxt().matchAll(/\/secure-account\?u=(\d+)&(?:amp;)?e=(\d+)&(?:amp;)?s=([\w-]+)/g)].pop();
    assert(link && +link[1] === uid, 'the email has a "Secure my account" link');
    let pg = await fetch(`${B}/secure-account?u=${uid}&e=${link[2]}&s=${link[3]}`);
    let html = await pg.text(); assert(pg.status === 200 && /<form method="post"/.test(html) && /Выйти на всех устройствах/.test(html), 'opening the link only shows a button (in Russian), it doesn’t act');
    r = await P1('/api/me'); assert(r.s === 200, 'still logged in after just opening the link');
    pg = await fetch(`${B}/secure-account?u=${uid}&e=${link[2]}&s=bad${link[3].slice(3)}`); assert(pg.status === 400, 'a tampered link is refused');
    pg = await fetch(`${B}/secure-account`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `u=${uid}&e=${link[2]}&s=${link[3]}` });
    html = await pg.text();
    assert(pg.status === 200 && /Все сеансы завершены/.test(html), 'pressing the button signs everyone out');
    r = await P1('/api/me'); assert(r.s === 401, 'iPhone logged out'); r = await P4('/api/me'); assert(r.s === 401, 'the new device logged out');
    assert(db.prepare(`SELECT COUNT(*) n FROM sessions WHERE user_id=?`).get(uid).n === 0 && db.prepare(`SELECT 1 FROM resets WHERE user_id=?`).get(uid), 'no sessions left, and a password reset link was created');
    assert(db.prepare(`SELECT COUNT(*) n FROM email_log WHERE user_id=? AND kind='password_reset'`).get(uid).n === 1, 'reset email sent');
    // round 23 review: the old password stops working, every device is forgotten, and the link is single-use
    r = await post(client(UA.android), '/api/login', { email: 'sess23@x.com', password: 'password1' }); assert(r.s === 400, 'after "Secure my account" the old password no longer works');
    assert(db.prepare(`SELECT COUNT(*) n FROM devices WHERE user_id=?`).get(uid).n === 0, 'and no device is remembered any more');
    pg = await fetch(`${B}/secure-account`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `u=${uid}&e=${link[2]}&s=${link[3]}` });
    assert(pg.status === 400, 'the same "Secure my account" link can’t be used twice');
    pg = await fetch(`${B}/secure-account?u=${uid}&e=${link[2]}&s=${link[3]}`); assert(pg.status === 400, '…not even to open it');
    // the owner sets a new password from the reset email (a fresh browser), then logs in normally
    const rtok = [...logTxt().matchAll(/to sess23@x\.com .*?\/app\?reset=([\w-]+)/g)].pop();
    const R = client(UA.iphone); r = await post(R, '/api/reset', { token: rtok && rtok[1], password: 'password1' }); assert(r.s === 200, 'the owner sets a new password from the reset email');

    // a password reset logs in without an alert
    // admin switch off → no alert email
    r = await ADM('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ features: { login_alerts: false } }) }); assert(r.s === 200, 'admin turns new-login emails off');
    const P5 = client(UA.mac, 'es-MX'); r = await post(P5, '/api/login', { email: 'sess23@x.com', password: 'password1' }); await sleep(50);
    assert(r.s === 200 && alerts(uid) === 4, 'switched off: no email');
    r = await P5('/api/sessions'); assert(r.j.alerts === false && r.j.sessions.length === 2, 'the list still works (this browser + the one that reset the password), and says alerts are off');
    // admin preview of the template
    r = await ADM('/api/admin/emails/new_login/preview?lang=fr'); assert(r.s === 200 && /Nouvelle connexion/.test(r.t), 'admin can preview the new email (French)');
    r = await fetch(B + '/api/sessions'); assert(r.status === 401, 'logged out → 401');

    // ---------- Admin → Analytics: any dates, all customers ----------
    const H = 3600000, D = 864e5, today0 = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const ins = db.prepare(`INSERT OR REPLACE INTO hourly(channel_id,hour,owner_id,clicks,joins,organic,leaves) VALUES(?,?,?,?,?,?,?)`);
    // this week: user A 300 joins (2 days), user B 40; the week before: A 100, B 200 (B is slowing down)
    ins.run(901, today0 / H + 10, uid, 900, 200, 30, 5); ins.run(901, (today0 - D) / H + 9, uid, 400, 100, 10, 1);
    ins.run(902, (today0 - 2 * D) / H + 12, fid, 100, 40, 5, 0);
    ins.run(901, (today0 - 9 * D) / H + 8, uid, 300, 100, 0, 0); ins.run(902, (today0 - 10 * D) / H + 8, fid, 600, 200, 0, 0);
    db.prepare(`INSERT INTO deposits(user_id,provider,reference,amount_cents,currency,status,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?)`).run(uid, 'paystack', 'r23-a', 5000, 'USD', 'paid', today0 + 3600e3, today0 + 3600e3);
    db.prepare(`INSERT INTO deposits(user_id,provider,reference,amount_cents,currency,status,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?)`).run(fid, 'paystack', 'r23-b', 2000, 'USD', 'paid', today0 - 8 * D, today0 - 8 * D);
    const day = (n) => new Date(today0 - n * D).toISOString().slice(0, 10);
    r = await ADM(`/api/admin/analytics?from=${day(6)}&to=${day(0)}&tz=0`);
    const A = r.j;
    assert(r.s === 200 && A.range.days === 7 && A.range.prev_from === day(13) && A.range.prev_to === day(7), 'analytics: 7 days, compared with the 7 before');
    assert(A.totals.joins === 340 && A.totals.organic === 45 && A.totals.clicks === 1400 && A.prev.joins === 300 && A.totals.active_customers === 2, 'totals: 340 tracked joins (300 before), 45 organic, 1,400 clicks, 2 customers');
    assert(A.totals.paid_cents === 5000 && A.prev.paid_cents === 2000 && A.totals.topups === 1, 'paid in: $50 this week, $20 before');
    assert(A.series.length === 7 && A.series[6].day === day(0) && A.series[6].joins === 200 && A.series[5].joins === 100 && A.series[0].joins === 0, 'one row per day, empty days included');
    assert(A.top[0].id === uid && A.top[0].joins === 300 && A.top[0].prev_joins === 100 && A.top[0].change_pct === 200 && A.top[0].paid_cents === 5000, 'top customer: 300 joins, +200%, $50 paid');
    assert(A.quiet.length === 1 && A.quiet[0].id === fid && A.quiet[0].prev_joins === 200 && A.quiet[0].joins === 40, 'slowing down: the customer who went from 200 to 40');
    assert(A.hours === null && Array.isArray(A.by_platform) && Array.isArray(A.visitor_countries), 'no hourly chart for a week; platform and country lists are there');
    r = await ADM(`/api/admin/analytics?from=${day(0)}&to=${day(0)}&tz=0`);
    assert(r.j.hours.length === 24 && r.j.hours[10].joins === 200 && r.j.totals.joins === 200, 'today: 24 hours, 200 joins at 10:00');
    r = await ADM(`/api/admin/analytics?from=${day(0)}&to=${day(0)}&tz=-60`);
    assert(r.s === 200 && r.j.series.length === 1, 'works in the viewer’s time zone (UTC+1)');
    r = await ADM(`/api/admin/analytics.csv?from=${day(6)}&to=${day(0)}&tz=0`);
    let rows = r.t.trim().split('\n');
    assert(r.s === 200 && /text\/csv/.test(r.h.get('content-type')) && rows[0].startsWith('day,tracked_joins') && rows.length === 8 && rows[7].startsWith(day(0) + ',200,30,900'), 'download: one row per day');
    r = await ADM(`/api/admin/analytics.csv?from=${day(6)}&to=${day(0)}&tz=0&kind=customers`); rows = r.t.trim().split('\n');
    assert(rows[0].startsWith('user_id,email') && rows.length === 3 && rows[1].includes('sess23@x.com'), 'download: customers');
    r = await P5(`/api/admin/analytics?from=${day(6)}&to=${day(0)}`); assert(r.s === 403, 'a customer can’t open admin analytics');

    // ---------- support translation ----------
    await ADM('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ joe: { api_key: 'sk-ant-test-joe-123456' } }) });
    r = await post(P5, '/api/support', { body: 'Где моё пополнение на 50 долларов?' }); assert(r.s === 200, 'a customer writes to support in Russian');
    const tk = db.prepare(`SELECT id FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 1`).get(uid).id;
    r = await ADM('/api/admin/support/' + tk); assert(r.s === 200 && r.j.translate && r.j.translate.on === true, 'admin opens the chat: translation is available');
    r = await post(ADM, `/api/admin/support/${tk}/translate`); 
    assert(r.s === 200 && r.j.lang === 'ru' && r.j.messages[0].tr_body === 'EN: where is my top-up of 50 dollars', 'the team sees the message in English; the chat is marked Russian');
    r = await ADM('/api/admin/support/' + tk); assert(r.j.translate.lang === 'ru' && r.j.translate.name === 'Russian' && r.j.messages.find((m) => !m.from_admin).tr_body, 'reopening the chat keeps the translation');
    r = await post(ADM, '/api/admin/support/' + tk, { body: 'Your top-up of $50 is in. Ref ABC123', translate: true });
    let msg = db.prepare(`SELECT body, tr_body, tr_lang, tr_note FROM ticket_msgs WHERE ticket_id=? AND from_admin=1 ORDER BY id DESC LIMIT 1`).get(tk);
    assert(r.s === 200 && r.j.translated === true && msg.body === 'RU: Your top-up of $50 is in. Ref ABC123' && msg.tr_body === 'Your top-up of $50 is in. Ref ABC123' && msg.tr_lang === 'ru', 'the English reply goes out in Russian; the English is kept for the team');
    r = await P5('/api/support'); const cm = (r.j.messages || []).filter((m) => m.from_admin).pop();
    assert(cm && cm.body.startsWith('RU: ') && !('tr_body' in cm), 'the customer gets the Russian, never the team’s notes');
    r = await post(ADM, '/api/admin/support/' + tk, { body: 'BREAKNUM: you topped up $50', translate: true });
    msg = db.prepare(`SELECT body, tr_lang, tr_note FROM ticket_msgs WHERE ticket_id=? AND from_admin=1 ORDER BY id DESC LIMIT 1`).get(tk);
    assert(r.j.translated === false && msg.body === 'BREAKNUM: you topped up $50' && /number or link/.test(msg.tr_note) && /number or link/.test(r.j.note), 'a translation that changes a number is NOT sent: the English goes out, with a note');
    r = await post(ADM, '/api/admin/support/' + tk, { body: 'Plain English please', translate: false });
    msg = db.prepare(`SELECT body, tr_lang FROM ticket_msgs WHERE ticket_id=? AND from_admin=1 ORDER BY id DESC LIMIT 1`).get(tk);
    assert(msg.body === 'Plain English please' && !msg.tr_lang, 'with the switch off, it goes in English');
    ai.close(); await sleep(50);
    r = await post(ADM, '/api/admin/support/' + tk, { body: 'Hello again, 2 things', translate: true });
    msg = db.prepare(`SELECT body, tr_note FROM ticket_msgs WHERE ticket_id=? AND from_admin=1 ORDER BY id DESC LIMIT 1`).get(tk);
    assert(r.s === 200 && msg.body === 'Hello again, 2 things' && /wasn’t available/.test(msg.tr_note), 'AI down: the reply still goes out, in English');
    r = await ADM('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ features: { support_translate: false } }) });
    r = await ADM('/api/admin/support/' + tk); assert(r.j.translate.on === false, 'admin can switch translation off');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  finally { try { ai.close(); } catch {} process.exit(); }
})();
