// Round 23b: tutorial voices in every language, made from Admin (Settings → Integrations & API keys → Tutorial voices). Fake ElevenLabs on :4968.
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), http = require('http');
const RUN = path.dirname(process.env.SRV_LOG), ROOT = path.join(__dirname, '..');
const calls = []; let refuseKey = false;
const el = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
  const u = req.url; calls.push({ m: req.method, u, key: req.headers['xi-api-key'], body: raw ? JSON.parse(raw) : null });
  const J = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (refuseKey) return J(401, { detail: { message: 'invalid api key' } });
  if (u.startsWith('/v1/voices/') && req.method === 'GET') return /WTn2eCRCpoFAC50VD351|JBFq|EXAV|added_/.test(u) ? J(200, { voice_id: 'x' }) : J(404, { detail: { message: 'voice not found' } });
  if (u.startsWith('/v1/shared-voices')) return J(200, { voices: [{ voice_id: 'qIViwRC6Yj0rDEwrCiEN', public_owner_id: 'own1', name: 'Emiliano' }, { voice_id: 'attjAvEwtUIAm108to6B', public_owner_id: 'own2', name: 'Andrea' }, { voice_id: 'IExsTwnJMk9vWMW4SzsN', public_owner_id: 'own3', name: 'Vera' }] });
  if (u.startsWith('/v1/voices/add/')) return J(200, { voice_id: 'added_' + u.split('/').pop() });
  if (u.includes('/with-timestamps')) { const t = JSON.parse(raw).text, ch = [...t]; return J(200, { audio_base64: Buffer.alloc(4000, 7).toString('base64'), alignment: { characters: ch, character_start_times_seconds: ch.map((_, i) => i * 0.06), character_end_times_seconds: ch.map((_, i) => i * 0.06 + 0.05) } }); }
  J(404, {}); }); }).listen(4968);
const assert = (c, m, extra) => { if (!c) { console.log('FAIL:', m, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); process.exitCode = 1; } else console.log('ok  ', m); };
function client() { const jar = {};
  const f = async (p, o = {}) => { const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': '102.89.9.' + Math.floor(Math.random() * 200), ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const buf = Buffer.from(await r.arrayBuffer()), t = buf.toString(); try { return { s: r.status, j: JSON.parse(t), t, buf, h: r.headers }; } catch { return { s: r.status, t, buf, h: r.headers }; } };
  return f; }
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) }), put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const esc = (s) => s.replace(/[.@+]/g, '\\$&');
async function verify(email) { await sleep(150); const m = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(new RegExp(`to ${esc(email)} .*?(/verify\\?t=[\\w.-]+)`, 'g'))].pop(); await fetch(B + m[1], { redirect: 'manual' }); }
(async () => {
  try {
    const ADM = client(); let r = await post(ADM, '/api/signup', { email: 'admin@x.com', password: 'password1', name: 'Owner', country: 'NG' }); assert(r.s === 200, 'owner signs up'); await verify('admin@x.com');
    const CUS = client(); await post(CUS, '/api/signup', { email: 'cust@x.com', password: 'password1', name: 'C', country: 'BR' });
    r = await CUS('/api/admin/voiceovers'); assert(r.s === 401 || r.s === 403, 'a customer can’t see or start the voice maker', r.s);
    r = await ADM('/api/admin/voiceovers'); assert(r.s === 200 && r.j.key_set === false && r.j.langs.length === 10 && r.j.langs.every((l) => l.total === 14 && l.made === 0), 'status: 10 languages × 14 tutorials, nothing made, no key yet', r.j);
    assert(r.j.todo_files === 140 && r.j.todo_chars > 60000, 'it shows how many credits all of them cost', r.j.todo_chars);
    r = await post(ADM, '/api/admin/voiceovers/start', { langs: ['es'] }); assert(r.s === 400 && /API key/.test(r.j.error), 'without a key it asks for one');
    r = await put(ADM, '/api/admin/settings', { keys: { elevenlabs_key: 'sk_test_eleven_123' } }); assert(r.s === 200 && r.j.settings.keys.elevenlabs_set && !/sk_test_eleven_123/.test(JSON.stringify(r.j.settings)), 'the ElevenLabs key is saved and only shown masked');
    r = await post(ADM, '/api/admin/voiceovers/start', { langs: ['es', 'ru'] }); assert(r.s === 200 && r.j.job && r.j.job.total === 28, 'start: Spanish + Russian = 28 voices', r.j);
    r = await post(ADM, '/api/admin/voiceovers/start', { langs: ['pt'] }); assert(r.s === 400 && /already/.test(r.j.error), 'a second start while it runs is refused');
    for (let i = 0; i < 100; i++) { r = await ADM('/api/admin/voiceovers'); if (r.j.job && !r.j.job.running) break; await sleep(100); }
    assert(r.j.job.done === 28 && r.j.job.failed === 0, 'all 28 made', r.j.job);
    const es = r.j.langs.find((l) => l.lang === 'es'), pt = r.j.langs.find((l) => l.lang === 'pt'); assert(es.made === 14 && pt.made === 0, 'status: Spanish 14 of 14, Portuguese still 0');
    const tts = calls.filter((c) => c.u.includes('/with-timestamps')); assert(tts.length === 28 && tts.every((c) => c.key === 'sk_test_eleven_123' && c.body.model_id === 'eleven_multilingual_v2'), 'ElevenLabs called with the key and the multilingual model');
    assert(tts.some((c) => c.u.includes('added_qIViwRC6Yj0rDEwrCiEN')) && tts.some((c) => c.u.includes('WTn2eCRCpoFAC50VD351')), 'a Voice Library voice is added to the account first; one already there is used as is');
    assert(tts.filter((c) => /added_attj|IExs|added_IExs/.test(c.u)).length === 8, 'tutorials 11–14 use the female voice (4 per language)');
    assert(fs.existsSync(path.join(RUN, 'data', 'voiceovers', 'es', 't1.mp3')) && !fs.existsSync(path.join(ROOT, 'public', 'media', 'tutorials', 'es')), 'files are saved on the data volume, not in the app folder');
    r = await fetch(B + '/media/tutorials/es/t1.mp3'); assert(r.status === 200 && r.headers.get('content-type') === 'audio/mpeg' && (await r.arrayBuffer()).byteLength === 4000, 'the voice is live for customers at /media/tutorials/es/t1.mp3');
    r = await fetch(B + '/media/tutorials/t1.mp3'); assert(r.status === 200, 'the English voice still plays');
    r = await fetch(B + '/media/tutorials/pt/t1.mp3'); assert(r.status === 404, 'a language not made yet: 404, so the player falls back to the English voice');
    r = await fetch(B + '/media/tutorials/es/marks.json'); assert(r.status === 404, 'the timing file isn’t downloadable');
    r = await fetch(B + '/i18n/tut.es.json'); const tj = await r.json(); assert(r.status === 200 && Array.isArray(tj.t1.marks) && tj.t1.marks.length === tj.t1.sents.length && tj.t1.marks[0] === 0 && tj.t1.marks[1] > 0, 'the script comes with exact sentence start times (screens change with the voice)', tj.t1.marks);
    assert(/no-cache/.test(r.headers.get('cache-control')), '…and is never cached for long, so new voices show at once');
    // a script change: that voice shows as needing a new one, and only it is remade
    const f = path.join(ROOT, 'public', 'i18n', 'tut.es.json'), orig = fs.readFileSync(f, 'utf8');
    try {
      const j = JSON.parse(orig); j.t2.sents[0] = j.t2.sents[0].replace(/\.$/, ' ahora.'); fs.writeFileSync(f, JSON.stringify(j, null, 1));
      r = await ADM('/api/admin/voiceovers'); const e2 = r.j.langs.find((l) => l.lang === 'es'); assert(e2.made === 13 && e2.changed === 1, 'an edited tutorial shows “1 needs a new voice”', e2);
      r = await (await fetch(B + '/i18n/tut.es.json')).json(); assert(!r.t2.marks && Array.isArray(r.t1.marks), '…and its old timings are no longer used');
      const before = calls.length; r = await post(ADM, '/api/admin/voiceovers/start', { langs: ['es'] }); assert(r.s === 200 && r.j.job.total === 1, 'Make voices again: only the changed one is made', r.j.job);
      for (let i = 0; i < 50; i++) { r = await ADM('/api/admin/voiceovers'); if (!r.j.job.running) break; await sleep(100); }
      assert(r.j.langs.find((l) => l.lang === 'es').made === 14 && calls.slice(before).filter((c) => c.u.includes('/with-timestamps')).length === 1, 'Spanish is complete again (1 credit-costing call)');
    } finally { fs.writeFileSync(f, orig); }
    r = await post(ADM, '/api/admin/voiceovers/start', { langs: ['ru'] }); assert(r.s === 400 && /up to date/.test(r.j.error), 'nothing to do: it says so instead of charging');
    // a refused key stops the run at once
    refuseKey = true; r = await post(ADM, '/api/admin/voiceovers/start', { langs: ['pt'] }); for (let i = 0; i < 50; i++) { r = await ADM('/api/admin/voiceovers'); if (!r.j.job.running) break; await sleep(100); }
    assert(r.j.job.done === 0 && r.j.job.failed === 1 && r.j.job.log.some((x) => /refused/.test(x)), 'a wrong key stops after the first try (no 14 failed calls)', r.j.job);
    refuseKey = false;
    // ===== support: "Correct AI" teaches every AI chat (round 23b) =====
    r = await post(CUS, '/api/support', { body: 'Hi I am Carla, my Pixel ID 123456789012 says invalid. email carla@shop.com' }); assert(r.s === 200, 'customer writes to support', r.t && r.t.slice(0, 200));
    const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(RUN, 'data', 'joinvoo.db')); db.exec('PRAGMA busy_timeout=5000');
    const tk = db.prepare(`SELECT id FROM tickets ORDER BY id DESC LIMIT 1`).get();
    db.prepare(`UPDATE tickets SET name='Carla Gomez' WHERE id=?`).run(tk.id);
    const ai1 = Number(db.prepare(`INSERT INTO ticket_msgs(ticket_id,from_admin,body,created_at,source) VALUES(?,1,'Please send us your password so we can check',?,'ai')`).run(tk.id, Date.now()).lastInsertRowid);
    db.prepare(`INSERT INTO ticket_msgs(ticket_id,from_admin,body,created_at,source) VALUES(?,1,'Thanks!',?,'ai')`).run(tk.id, Date.now());
    r = await post(CUS, '/api/admin/support-ai/correct', { ticket_id: tk.id, msg_id: ai1, answer: 'x long answer' }); assert(r.s === 401 || r.s === 403, 'a customer can’t correct the AI');
    r = await post(ADM, '/api/admin/support-ai/correct', { ticket_id: tk.id, msg_id: ai1, answer: 'Hi Carla! A Pixel ID is only numbers, copy it from Events Manager → your pixel → Settings. Never share your password.' });
    assert(r.s === 200 && /### Correction/.test(r.j.knowledge) && /WRONG \(never answer like this\): Please send us your password/.test(r.j.knowledge), 'Correct AI saves the right answer and what not to say', r.j);
    assert(/Q: Hi I am \[name\], my Pixel ID \[number\] says invalid\. email \[email\]/.test(r.j.knowledge) && /RIGHT: Hi \[name\]!/.test(r.j.knowledge) && !/Carla|carla@|123456789012/.test(r.j.knowledge), 'the lesson has the customer’s question with their name, email and numbers removed', r.j.knowledge.slice(-400));
    r = await post(ADM, '/api/admin/support-ai/correct', { ticket_id: tk.id, msg_id: ai1 - 1, answer: 'whatever text' }); assert(r.s === 400, 'only AI answers can be corrected');
    const sys = require('fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8'); assert(/THINK LIKE OUR BEST HUMAN AGENT/.test(sys) && /maxRounds: 8, maxTokens: 900/.test(sys), 'support AI has the senior-agent rules and room to check, fix and re-check');
    const sup = fs.readFileSync(path.join(ROOT, 'joe', 'support.md'), 'utf8'); assert(/## Solved cases/.test(sup) && (sup.match(/\n### /g) || []).length > 40 && !/Channels → Join mode|Channels → Add a bot/.test(sup), 'support handbook has the solved cases and correct menu paths');
    // ===== referral tiers (decided by Ejiro): 5% → 10% at 30 → … 30% at 500; active = topped up in the last 30 days =====
    const REF = client(); await post(REF, '/api/signup', { email: 'ref@x.com', password: 'password1', name: 'R', country: 'NG' }); await verify('ref@x.com');
    const rid = db.prepare(`SELECT id FROM users WHERE email='ref@x.com'`).get().id, T0 = Date.now();
    r = await REF('/api/referrals'); assert(r.s === 200 && r.j.rate === 0.05 && r.j.tiers.map((t) => t.rate * 100 + '@' + t.min).join(',') === '5@0,10@30,15@100,20@250,30@500', 'tiers: 5% from the first, 10% at 30, 15% at 100, 20% at 250, 30% at 500', r.j.tiers);
    const addRef = db.prepare(`INSERT INTO users(email,pass,created_at,ref_code,referred_by) VALUES(?,?,?,?,?)`), addDep = db.prepare(`INSERT INTO deposits(user_id,provider,reference,amount_cents,status,created_at,paid_at) VALUES(?,?,?,?,?,?,?)`);
    const ids = []; for (let i = 0; i < 31; i++) ids.push(Number(addRef.run(`r${i}@x.com`, 'x', T0, 'rc' + i, rid).lastInsertRowid));
    ids.slice(0, 30).forEach((u, i) => addDep.run(u, 'paystack', 'rd' + i, 5000, 'paid', T0 - 2 * 864e5, T0 - 2 * 864e5)); // 30 topped up 2 days ago
    addDep.run(ids[30], 'paystack', 'rdold', 5000, 'paid', T0 - 40 * 864e5, T0 - 40 * 864e5); // 1 topped up 40 days ago: not active
    r = await REF('/api/referrals'); assert(r.j.active === 30 && r.j.rate === 0.10 && r.j.next_tier.need === 70 && r.j.people.filter((p) => p.active).length === 30, '30 who topped up in the last 30 days → 10%; the one from 40 days ago doesn’t count', { a: r.j.active, rate: r.j.rate });
    db.prepare(`UPDATE deposits SET paid_at=?, created_at=? WHERE reference='rd0'`).run(T0 - 31 * 864e5, T0 - 31 * 864e5);
    r = await REF('/api/referrals'); assert(r.j.active === 29 && r.j.rate === 0.05, 'one stops topping up → 29 active → the rate drops back to 5%', { a: r.j.active, rate: r.j.rate });
    db.prepare(`INSERT INTO deposits(user_id,provider,reference,amount_cents,status,created_at,paid_at) VALUES(?,?,?,?,?,?,?)`).run(ids[0], 'paystack', 'rdx', 5000, 'refunded', T0, T0);
    r = await REF('/api/referrals'); assert(r.j.active === 29, 'a refunded top-up doesn’t count as funding');
    // dashboard + admin pages carry the feature
    const app = fs.readFileSync(path.join(ROOT, 'public', 'app.html'), 'utf8'), adm = fs.readFileSync(path.join(ROOT, 'public', 'admin.html'), 'utf8');
    assert(/media\/tutorials\/'\+\(lang\?lang\+'\/':''\)/.test(app) && /tut\.\$\{l\}\.json/.test(app), 'the player asks for the voice in the user’s language, then falls back to English');
    assert(/Tutorial voices/.test(adm) && /\/api\/admin\/voiceovers\/start/.test(adm) && /elevenlabs_key/.test(adm), 'Admin has the Tutorial voices card and the ElevenLabs key');
  } catch (e) { assert(false, 'crashed ' + e.stack); }
  el.close(); process.exit();
})();
