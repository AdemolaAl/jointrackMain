// Round 12: Joe as a media-buying expert. Playbooks as tools (list_playbooks / read_playbook, built-in from JOE_PLAYBOOKS_DIR
// fixtures + custom ones from the admin that override), Anthropic (prompt caching, 1,200 tokens, up to 6 tool rounds) and any
// OpenAI-compatible API (function calling), masked secrets, fallback to the rule-based answers on any error.
// Fake Anthropic on :4500 and fake OpenAI-compatible API on :4600 run inside this file.
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path'), http = require('http');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
function client() {
  const jar = {};
  return async (p, o = {}) => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', cookie: ck, ...(o.headers || {}) }, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), t }; } catch { return { s: r.status, t }; }
  };
}
const post = (f, p, b) => f(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = (f, p, b) => f(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');

// ---------- playbook fixtures (the runner points JOE_PLAYBOOKS_DIR here) ----------
const PB = process.env.JOE_PLAYBOOKS_DIR;
fs.mkdirSync(PB, { recursive: true });
fs.writeFileSync(path.join(PB, 'INDEX.md'), '# Joe playbooks index\n\n- vertical-trading.md: forex, options and prop-firm offers for Telegram funnels.\n- metrics-and-diagnosis.md: formulas and a symptom → cause → fix table.\n- big.md: a very long playbook.\n- missing.md: listed but not on disk.\n');
fs.writeFileSync(path.join(PB, 'vertical-trading.md'), '# Trading\nTRADING-FIXTURE-MARKER: start with a hybrid deal, test 3 angles, watch join→FTD.\n');
fs.writeFileSync(path.join(PB, 'metrics-and-diagnosis.md'), '# Metrics\nCPFTD = spend / FTDs.\n');
fs.writeFileSync(path.join(PB, 'big.md'), '# Big\n' + 'x'.repeat(50000) + 'END-OF-BIG');
fs.writeFileSync(path.join(PB, 'extra-notes.md'), '# Extra\nUnindexed but available.\n');
// the real round-12b playbooks (retention, affiliate deals, about Zedapex, FAQ) for the rule-based keyword routing
const REAL = path.join(__dirname, '..', 'joe', 'playbooks'), NEW = ['telegram-retention-dropoff.md', 'affiliate-programs-revshare.md', 'about-zedapex-and-team.md', 'general-faq.md'];
for (const f of NEW) fs.copyFileSync(path.join(REAL, f), path.join(PB, f));
fs.appendFileSync(path.join(PB, 'INDEX.md'), NEW.map((f) => `- ${f}: copied from joe/playbooks.`).join('\n') + '\n');

// ---------- fake providers ----------
const A = { calls: [], mode: 'playbook' }, O = { calls: [], mode: 'tools' };
const lastToolText = (body) => { const m = body.messages[body.messages.length - 1]; return Array.isArray(m.content) ? m.content.map((c) => c.content).join('\n') : ''; };
const anth = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
  const body = JSON.parse(raw || '{}'); A.calls.push({ url: req.url, headers: req.headers, body });
  const j = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (A.mode === 'fail') return j({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529);
  if (A.mode === 'loop') return j({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_' + A.calls.length, name: 'list_playbooks', input: {} }] });
  const hadTool = body.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'));
  if (!hadTool) return j({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Let me check the playbook.' }, { type: 'tool_use', id: 'tu_1', name: 'read_playbook', input: { name: A.want || 'vertical-trading' } }] });
  const t = lastToolText(body); let snippet = ''; try { snippet = JSON.parse(t).text.slice(0, 120); } catch { snippet = t.slice(0, 120); }
  j({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'From the playbook: ' + snippet }], usage: { cache_read_input_tokens: 1000 } });
}); }).listen(4500);
const oai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
  const body = JSON.parse(raw || '{}'); O.calls.push({ url: req.url, headers: req.headers, body });
  const j = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (O.mode === 'fail') return j({ error: { message: 'Rate limit reached' } }, 429);
  if (O.mode === 'loop') return j({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_' + O.calls.length, type: 'function', function: { name: 'list_playbooks', arguments: '{}' } }] } }] });
  const tools = body.messages.filter((m) => m.role === 'tool');
  if (!tools.length) return j({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [
    { id: 'call_a', type: 'function', function: { name: 'get_stats', arguments: '{}' } }, { id: 'call_b', type: 'function', function: { name: 'read_playbook', arguments: JSON.stringify({ name: 'vertical-trading.md' }) } }] } }] });
  const st = JSON.parse(tools.find((t) => t.tool_call_id === 'call_a').content), pb = JSON.parse(tools.find((t) => t.tool_call_id === 'call_b').content);
  j({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: `You had ${st.totals.joins} joins. Playbook: ${pb.text.slice(0, 60)}` } }] });
}); }).listen(4600);

(async () => {
  try {
    const ADM = client(), U = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' }); await sleep(120);
    const vl = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop(); await fetch(B + vl[1], { redirect: 'manual' });
    await post(U, '/api/signup', { country: 'GB', email: 'buyer@x.com', password: 'password1', name: 'Bea' });

    // ---------- playbooks in admin ----------
    let r = await ADM('/api/admin/settings'), J = r.j.joe;
    assert(J.provider === 'anthropic' && J.model === 'claude-haiku-4-5-20251001' && J.ai_live === false, 'defaults: Anthropic, Haiku 4.5, AI off without a key');
    const names = J.playbooks.map((x) => x.name);
    assert(['vertical-trading', 'metrics-and-diagnosis', 'big', 'extra-notes'].every((n) => names.includes(n)) && !names.includes('missing') && !names.includes('index'), 'built-in playbooks from INDEX.md (+ unindexed files; listed-but-missing skipped)');
    assert(J.playbooks.find((x) => x.name === 'vertical-trading').use_when.startsWith('forex'), '“use when” taken from INDEX.md');
    r = await ADM('/api/admin/joe/playbooks/vertical-trading'); assert(r.s === 200 && /TRADING-FIXTURE-MARKER/.test(r.j.text) && r.j.source === 'built-in', 'admin reads a built-in playbook');
    r = await ADM('/api/admin/joe/playbooks/../../server.js'); assert(r.s === 404, 'no path tricks');

    // ---------- Anthropic: playbook tools, caching, max_tokens ----------
    r = await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-abcdefgh1234' } });
    assert(r.s === 200 && r.j.settings.joe.ai_live, 'Anthropic key saved → AI on');
    r = await post(U, '/api/joe/chat', { message: 'How should I run a forex offer?' });
    assert(r.s === 200 && r.j.ai === true && /TRADING-FIXTURE-MARKER/.test(r.j.reply), 'Joe opens the playbook (read_playbook) and answers from it');
    const c0 = A.calls[0].body, c1 = A.calls[1].body;
    assert(['list_playbooks', 'read_playbook', 'get_stats', 'get_breakdown'].every((n) => c0.tools.some((t) => t.name === n)) && c0.tools.find((t) => t.name === 'read_playbook').input_schema.required[0] === 'name', 'list_playbooks + read_playbook offered next to the data tools');
    assert(Array.isArray(c0.system) && c0.system[0].cache_control && c0.system[0].cache_control.type === 'ephemeral' && !c0.system[1].cache_control && /^Context: /.test(c0.system[1].text), 'prompt caching: the big static block is cache_control ephemeral, user context separate');
    const sys = c0.system[0].text;
    assert(/senior media buyer/.test(sys) && /read_playbook/.test(sys) && /cloaking/.test(sys) && /never invent numbers/i.test(sys) && /# Joinvoo knowledge/.test(sys), 'system prompt: expert instructions, policy limits, no invented numbers, knowledge.md kept');
    assert(/first name is Bea \(use it naturally in about one reply in three/.test(c0.system[1].text) && /aggressive traffic buying/.test(sys) && /Vary it/.test(sys) && /at most 1–2 emoji/.test(sys), 'persona: first name about one reply in three, sign-off samples, light emoji');
    assert(/about-zedapex-and-team playbook/.test(sys) && /Never promise profits/.test(sys) && /general marketing, business and tech/.test(sys) && /explain properly with numbered steps/.test(sys), 'persona: founder facts only from the playbook, no profit promises, general questions, detailed why/how');
    assert(c0.max_tokens === 900 && c0.model === 'claude-haiku-4-5-20251001', 'max_tokens 900 (round 13 cost control) and the Haiku model');
    const tr = c1.messages[c1.messages.length - 1].content[0];
    assert(tr.type === 'tool_result' && tr.tool_use_id === 'tu_1' && /TRADING-FIXTURE-MARKER/.test(tr.content), 'tool_result carries the playbook text');
    // long playbook is capped
    A.calls.length = 0; A.want = 'big';
    r = await post(U, '/api/joe/chat', { message: 'Big one please' });
    const big = A.calls[1].body.messages.at(-1).content[0].content;
    assert(big.length < 12800 && /Excerpt/.test(big) && !/END-OF-BIG/.test(big), 'read_playbook caps a long playbook at about 12k characters (excerpt + “ask for more”)');
    A.want = null;

    // ---------- custom playbooks ----------
    r = await post(ADM, '/api/admin/joe/playbooks', { name: 'Vertical-Trading.md', use_when: 'our own trading rules', body: 'CUSTOM-TRADING-MARKER: only hybrid deals, never CPA below $80.' });
    assert(r.s === 200 && r.j.name === 'vertical-trading' && r.j.playbooks.find((x) => x.name === 'vertical-trading').source === 'custom' && r.j.playbooks.find((x) => x.name === 'vertical-trading').overrides, 'custom playbook with the same name overrides the built-in');
    A.calls.length = 0;
    r = await post(U, '/api/joe/chat', { message: 'Forex again' });
    assert(/CUSTOM-TRADING-MARKER/.test(r.j.reply) && !/TRADING-FIXTURE-MARKER/.test(r.j.reply), 'Joe now reads the custom version');
    r = await post(ADM, '/api/admin/joe/playbooks', { name: 'nutra-latam', use_when: 'nutra in Latin America', body: 'NUTRA-MARKER' });
    assert(r.s === 200 && r.j.playbooks.some((x) => x.name === 'nutra-latam' && x.source === 'custom'), 'add a new custom playbook');
    r = await post(ADM, '/api/admin/joe/playbooks', { name: 'nutra-latam', body: 'dup' }); assert(r.s === 400, 'duplicate name refused on create');
    r = await put(ADM, '/api/admin/joe/playbooks/nutra-latam', { name: 'nutra-latam', use_when: 'nutra LATAM', body: 'NUTRA-MARKER v2' }); assert(r.s === 200 && (await ADM('/api/admin/joe/playbooks/nutra-latam')).j.text === 'NUTRA-MARKER v2', 'edit a custom playbook');
    r = await post(ADM, '/api/admin/joe/playbooks', { name: 'huge', body: 'y'.repeat(60001) }); assert(r.s === 400, 'bodies over 60,000 characters refused');
    r = await post(ADM, '/api/admin/joe/playbooks', { name: 'empty', body: '' }); assert(r.s === 400, 'empty playbook refused');
    r = await del(ADM, '/api/admin/joe/playbooks/vertical-trading');
    assert(r.s === 200 && r.j.playbooks.find((x) => x.name === 'vertical-trading').source === 'built-in', 'delete the custom one → the built-in is back');
    r = await del(ADM, '/api/admin/joe/playbooks/metrics-and-diagnosis'); assert(r.s === 404, 'built-in playbooks can’t be deleted');
    // permissions
    await post(ADM, '/api/admin/staff', { email: 'sup@x.com', role: 'support' }); await sleep(120);
    const tok = [...logTxt().matchAll(/to sup@x\.com .*?\/app\?reset=([\w-]+)/g)].pop()[1]; const SUP = client(); await post(SUP, '/api/reset', { token: tok, password: 'password1' });
    assert((await post(SUP, '/api/admin/joe/playbooks', { name: 'x', body: 'y' })).s === 403 && (await SUP('/api/admin/joe/playbooks')).s === 403, 'Support can’t read or edit playbooks');
    const au = (await ADM('/api/admin/audit?area=joe')).j.items;
    assert(au.some((x) => x.action === 'joe.playbook_create') && au.some((x) => x.action === 'joe.playbook_delete'), 'playbook changes are in the audit log');

    // ---------- model choice ----------
    await put(ADM, '/api/admin/settings', { joe: { model: 'claude-sonnet-4-5' } });
    A.calls.length = 0; await post(U, '/api/joe/chat', { message: 'And with Sonnet?' });
    assert(A.calls[0].body.model === 'claude-sonnet-4-5', 'admin picks Sonnet 4.5 (any model id)');
    await put(ADM, '/api/admin/settings', { joe: { model: 'claude-haiku-4-5-20251001' } });

    // ---------- OpenAI-compatible provider (a second customer: Joe allows 12 questions a minute per person) ----------
    const U2 = client(); await post(U2, '/api/signup', { country: 'GB', email: 'second@x.com', password: 'password1' });
    r = await put(ADM, '/api/admin/settings', { joe: { provider: 'openai', openai_base: 'http://localhost:4600/v1/', openai_key: 'sk-openai-test-zyxw9876', openai_model: 'openai/gpt-4o-mini' } });
    J = r.j.settings.joe;
    assert(r.s === 200 && J.provider === 'openai' && J.openai_base === 'http://localhost:4600/v1' && J.openai_model === 'openai/gpt-4o-mini' && J.ai_live && J.active_model === 'openai/gpt-4o-mini', 'switch to an OpenAI-compatible provider (base, key, model)');
    const sj = JSON.stringify(r.j);
    assert(J.openai_key.includes('••••') && !sj.includes('zyxw9876') && !sj.includes('abcdefgh1234') && r.j.settings.keys.openai_key.includes('••••'), 'OpenAI and Anthropic keys are masked (Joe section and Integrations & API keys)');
    r = await put(ADM, '/api/admin/settings', { joe: { openai_key: J.openai_key } }); assert(r.j.settings.joe.has_openai_key, 'masked key sent back is kept');
    O.calls.length = 0; A.calls.length = 0;
    r = await post(U2, '/api/joe/chat', { message: 'How are my numbers and what does the trading playbook say?' });
    const wk = (await U2(`/api/stats?from=${new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&tz=0`)).j.totals.joins;
    assert(r.s === 200 && r.j.ai && r.j.reply.startsWith(`You had ${wk} joins. Playbook: # Trading`) && /TRADING-FIXTURE-MARKER/.test(r.j.reply) && A.calls.length === 0, 'OpenAI answer built from two function calls (get_stats + read_playbook); Anthropic not called');
    const o0 = O.calls[0], o1 = O.calls[1];
    assert(o0.url === '/v1/chat/completions' && o0.headers.authorization === 'Bearer sk-openai-test-zyxw9876' && o0.body.model === 'openai/gpt-4o-mini' && o0.body.max_tokens === 900 && o0.body.messages[0].role === 'system' && /senior media buyer/.test(o0.body.messages[0].content), 'Chat Completions: bearer key, model, system message, 900 tokens');
    assert(o0.body.tools.every((t) => t.type === 'function' && t.function.name && t.function.parameters) && o0.body.tools.some((t) => t.function.name === 'read_playbook'), 'tools sent in OpenAI function format (same tool set)');
    assert(o1.body.messages.some((m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length === 2) && o1.body.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id).join() === 'call_a,call_b', 'assistant tool_calls + tool-role results with tool_call_id');
    r = await post(ADM, '/api/admin/joe/test', { message: 'Test via OpenAI', user_id: (await ADM('/api/admin/users?q=second')).j.users[0].id });
    assert(r.s === 200 && r.j.ai && r.j.provider === 'openai' && r.j.model === 'openai/gpt-4o-mini' && r.j.tools.join() === 'get_stats,read_playbook', 'Test Joe console works with the OpenAI provider');

    assert(/don’t use or invent one/.test(O.calls[0].body.messages[0].content) && !/first name is second/.test(O.calls[0].body.messages[0].content), 'no name on the account → Joe is told not to use or invent one (never the email)');
    // ---------- errors fall back to the rules ----------
    O.mode = 'fail';
    r = await post(U2, '/api/joe/chat', { message: 'How are my ads doing?' });
    assert(r.s === 200 && r.j.ai === false && r.j.reply.length > 10 || console.log('   rules:', JSON.stringify(r.j)), 'OpenAI error → rule-based answer');
    O.mode = 'loop'; O.calls.length = 0;
    r = await post(U2, '/api/joe/chat', { message: 'How are my ads doing?' });
    assert(r.j.ai === false && O.calls.length === 4, 'stops after 4 tool rounds (standard answer) and falls back');
    O.mode = 'tools';
    await put(ADM, '/api/admin/settings', { joe: { provider: 'anthropic' } });
    A.mode = 'fail'; r = await post(U2, '/api/joe/chat', { message: 'How are my ads doing?' });
    assert(r.j.ai === false && r.j.reply.length > 10, 'back on Anthropic: its error → rule-based answer too');
    A.mode = 'loop'; A.calls.length = 0; r = await post(U2, '/api/joe/chat', { message: 'loop' });
    assert(r.j.ai === false && A.calls.length === 4, 'Anthropic also capped at 4 tool rounds');
    A.mode = 'playbook';
    r = await put(ADM, '/api/admin/settings', { joe: { provider: 'openai', openai_key: null } });
    assert(r.j.settings.joe.ai_live === false && (await U2('/api/joe/chat')).j.ai === false, 'OpenAI selected without a key → rules (AI off)');
    r = await put(ADM, '/api/admin/settings', { joe: { openai_base: 'ftp://nope' } }); assert(r.s === 400, 'a bad API base is refused');
    r = await put(ADM, '/api/admin/settings', { keys: { openai_key: 'sk-openai-from-keys-card-1111' } });
    assert(r.s === 200 && r.j.settings.keys.openai_set && r.j.settings.joe.has_openai_key && !JSON.stringify(r.j).includes('keys-card-1111'), 'OpenAI-compatible key can also be saved from Integrations & API keys');
    const au2 = JSON.stringify((await ADM('/api/admin/audit?area=settings')).j.items);
    assert(!au2.includes('zyxw9876') && !au2.includes('keys-card-1111') && !au2.includes('abcdefgh1234'), 'keys never appear in the audit log');

    // ---------- rule mode (no AI): friendly greeting, keyword routing to playbook sections, first name sometimes ----------
    await put(ADM, '/api/admin/settings', { joe: { ai: false } });
    const R = client(); await post(R, '/api/signup', { country: 'GB', email: 'ace@x.com', password: 'password1', name: 'Ace Doe' });
    let ins = (await R('/api/joe/insights')).j, ins2 = (await U2('/api/joe/insights')).j;
    assert(/Ace/.test(ins.greeting) && !/second/.test(ins2.greeting) && /^[A-Z]/.test(ins2.greeting), 'insights greeting uses the first name, and none (not the email) when there is no name');
    const ask = async (m) => (await post(R, '/api/joe/chat', { message: m })).j;
    const DEEP = 'Want me to go deeper? Add an AI key in admin for full chat.';
    const routes = [['Why do people leave my channel after joining?', /leave|stay|drop/i], ['RevShare or CPA, which deal is better?', /revshare|cpa|compar|deal/i], ['How do I set up a postback?', /postback/i],
      ['Who built Joinvoo? Who is the founder?', /founder|zedapex/i], ['Can I get a refund?', /refund/i]];
    const replies = [];
    for (const [q, re] of routes) {
      const a = await ask(q); replies.push(a.reply);
      const title = (/\*\*(.+?)\*\*/.exec(a.reply) || [])[1] || '';
      assert(a.ai === false && a.reply.endsWith(DEEP) && re.test(title) && a.reply.length < 1500, `rules: “${q}” → playbook section “${title}” (trimmed, “go deeper” line)`);
    }
    assert(/Dchessking/.test(replies[3]) && !/\{name\}/.test(replies.join('')), 'founder answer comes from the about playbook');
    const rq = await ask('How does request-to-join mode work?');
    assert(!rq.reply.includes(DEEP) && /request-to-join/i.test(rq.reply), 'other questions still answer from knowledge.md');
    const all = [...replies, rq.reply], named = all.filter((x) => /\bAce\b/.test(x.split('\n')[0])).length;
    assert(named >= 1 && named <= 3, `first name used sometimes, not every reply (${named} of ${all.length})`);
    const pl = (await ADM('/api/admin/joe/playbooks')).j.playbooks.map((x) => x.name);
    assert(['telegram-retention-dropoff', 'affiliate-programs-revshare', 'about-zedapex-and-team', 'general-faq'].every((n) => pl.includes(n)), 'the new playbooks are listed');
    const realIdx = fs.readFileSync(path.join(REAL, 'INDEX.md'), 'utf8');
    assert(NEW.every((f) => realIdx.includes(f) && fs.existsSync(path.join(REAL, f))), 'joe/playbooks ships the new playbooks and INDEX.md lists them');
    assert((await ADM('/api/admin/settings')).j.joe.persona.includes('aggressive traffic buying'), 'the admin persona box starts with the friendly default');

    const html = await (await fetch(B + '/admin')).text();
    assert(html.includes('Playbooks') && html.includes('OpenAI-compatible') && html.includes('claude-sonnet-4-5'), 'admin page: Playbooks, OpenAI-compatible provider, Sonnet option');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  anth.close(); oai.close();
})();
