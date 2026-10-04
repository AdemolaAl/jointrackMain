// Round 13: Joe pay-as-you-go. Free answers per plan per local day, then paid from credits priced from the REAL token usage
// (Anthropic + OpenAI-compatible usage fields) × markup, clamped to min/max; margin guard; autopay confirm; monthly cap;
// balance check; Deep mode; bonus chats; no charge on errors; admin pricing + earnings report.
// Fake Anthropic on :4500 and fake OpenAI-compatible API on :4600 (inside this file) return usage numbers we choose.
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
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
fs.mkdirSync(process.env.JOE_PLAYBOOKS_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.JOE_PLAYBOOKS_DIR, 'INDEX.md'), '- metrics.md: formulas.\n');
fs.writeFileSync(path.join(process.env.JOE_PLAYBOOKS_DIR, 'metrics.md'), '# Metrics\n## CPA\nCost per FTD = spend / FTDs.\n');

// usage per response is set by the test: U = {input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}
const A = { calls: [], mode: 'simple', usage: { input_tokens: 2000, cache_read_input_tokens: 10000, output_tokens: 500 } };
const anth = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
  const body = JSON.parse(raw || '{}'); A.calls.push(body);
  const j = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const had = body.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'));
  if (A.mode === 'fail') return j({ error: { message: 'Overloaded' } }, 529);
  if (A.mode === 'fail2' && had) return j({ error: { message: 'Overloaded' } }, 529);
  if ((A.mode === 'tools' || A.mode === 'fail2' || A.mode === 'loop') && (!had || A.mode === 'loop') && !body.tool_choice)
    return j({ stop_reason: 'tool_use', usage: A.usage, content: [{ type: 'tool_use', id: 'tu_' + A.calls.length, name: 'get_stats', input: {} }] });
  j({ stop_reason: 'end_turn', usage: A.usage, content: [{ type: 'text', text: 'Here is my answer.' }] });
}); }).listen(4500);
const O = { calls: [], usage: { prompt_tokens: 10000, completion_tokens: 1000, prompt_tokens_details: { cached_tokens: 4000 } } };
const oai = http.createServer((req, res) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
  O.calls.push(JSON.parse(raw || '{}')); res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OpenAI answer.' } }], usage: O.usage }));
}); }).listen(4600);

(async () => {
  try {
    const ADM = client();
    await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' }); await sleep(120);
    const vl = [...logTxt().matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop(); await fetch(B + vl[1], { redirect: 'manual' });
    const mk = async (email, name) => { const f = client(); await post(f, '/api/signup', { country: 'GB', email, password: 'password1', name }); f.id = (await ADM('/api/admin/users?q=' + email)).j.users[0].id; return f; };
    const ACE = await mk('ace@x.com', 'Ace Doe'), BO = await mk('bo@x.com', 'Bo'), CY = await mk('cy@x.com', ''), DI = await mk('di@x.com', 'Di');
    const chat = (f, b) => post(f, '/api/joe/chat', typeof b === 'string' ? { message: b } : b);
    const bal = async (f) => (await f('/api/billing')).j.balance_cents;
    const give = (f, credits) => post(ADM, `/api/admin/users/${f.id}/credits`, { credits, reason: 'test' });

    // ---------- defaults ----------
    let s = (await ADM('/api/admin/settings')).j.joe;
    assert(s.billing.enabled && s.billing.free_daily.basic === 5 && s.billing.free_daily.pro === 30 && s.billing.markup === 4 && s.billing.min_credits === 3 && s.billing.max_credits === 40 && s.billing.deep_model === 'claude-sonnet-5-5' && s.billing.deep_markup === 3 && s.billing.deep_min_credits === 10 && s.billing.show_cost && s.billing.default_monthly_cap_credits === 1000, 'default Joe pricing matches the spec');
    assert(s.prices['claude-haiku-4-5-20251001'].in === 1 && s.prices['claude-haiku-4-5-20251001'].cache_read === 0.1 && s.prices['claude-sonnet-5-5'].out === 10 && s.prices['openai-default'].check, 'price table seeded (OpenAI placeholder flagged)');
    let g = (await ACE('/api/joe/chat')).j;
    assert(g.billing.enabled === false && g.billing.free_left === 5, 'no AI key: billing off, everything rule-based and free');
    await put(ADM, '/api/admin/settings', { joe: { api_key: 'sk-ant-test-pay-1234567' } });
    g = (await ACE('/api/joe/chat')).j;
    assert(g.billing.enabled && g.billing.free_left === 5 && g.billing.free_daily === 5 && g.billing.autopay === false && g.billing.monthly_cap === 1000 && g.billing.spent_month_credits === 0
      && g.billing.est_range.join() === '3,8' && g.billing.deep_allowed === false && g.billing.show_cost === true, 'GET /api/joe/chat billing block (free 10 on Basic, autopay off, cap 1,000, estimate 3–8)');

    // ---------- settings validation + partial updates ----------
    assert((await put(ADM, '/api/admin/settings', { joe: { billing: { markup: 1 } } })).s === 400, 'markup under 1.2× refused (every answer must make money)');
    assert((await put(ADM, '/api/admin/settings', { joe: { billing: { min_credits: 50 } } })).s === 400, 'min above max refused');
    let r = await put(ADM, '/api/admin/settings', { joe: { billing: { free_daily: { basic: 2 } } } });
    assert(r.s === 200 && r.j.settings.joe.billing.free_daily.basic === 2 && r.j.settings.joe.billing.free_daily.pro === 30 && r.j.settings.joe.billing.markup === 4, 'partial pricing update keeps the other fields');

    // ---------- free answers count down ----------
    r = await chat(ACE, 'q1');
    assert(r.j.ai && r.j.cost_credits === 0 && r.j.free_left === 1, 'free AI answer: no cost, 1 free left');
    r = await chat(ACE, 'q2'); assert(r.j.ai && r.j.cost_credits === 0 && r.j.free_left === 0, 'second free answer: 0 left');
    await chat(CY, { message: 'x' }); // CY still has free chats (used for the no-name wording later)
    const callsBefore = A.calls.length;
    r = await chat(ACE, 'q3');
    assert(r.j.needs_confirm === true && r.j.ai === false && r.j.cost_credits === 0 && A.calls.length === callsBefore && /free chats, Ace/.test(r.j.reply) && r.j.actions.some((a) => a.confirm_paid) && r.j.actions.some((a) => a.tab === 'credits'), 'free used up + autopay off → needs_confirm, no AI call, rule text with the first name and buttons');
    // confirm without balance → top-up note, autopay now on
    r = await chat(ACE, { message: 'q3', confirm_paid: true });
    assert(r.j.ai === false && r.j.cost_credits === 0 && /Top up credits to keep chatting — most answers cost 3–8 credits \(≈ \$0\.03–\$0\.08\)/.test(r.j.reply) && r.j.actions[0].tab === 'credits' && A.calls.length === callsBefore, 'Continue tapped but balance < max price → free top-up note, no AI call');
    assert((await ACE('/api/joe/chat')).j.billing.autopay === true, 'Continue turns autopay on');

    // ---------- paid price math ----------
    await give(ACE, 1000);
    const b0 = await bal(ACE);
    A.usage = { input_tokens: 2000, cache_read_input_tokens: 10000, output_tokens: 500 }; // $0.0055 × 4 = 2.2 → ceil 3 (= min)
    r = await chat(ACE, 'paid small');
    assert(r.j.ai && r.j.cost_credits === 3 && r.j.balance_credits === b0 - 3 && (await bal(ACE)) === b0 - 3, 'paid answer: $0.0055 × 4 markup → min 3 credits, taken from the balance');
    A.usage = { input_tokens: 20000, output_tokens: 2000 }; // $0.03 × 400 = 12
    r = await chat(ACE, 'paid medium'); assert(r.j.cost_credits === 12, 'paid answer: $0.03 × 4 = 12 credits (ceil)');
    A.usage = { input_tokens: 21000, cache_creation_input_tokens: 4000, output_tokens: 2000 }; // 0.021+0.005+0.01=0.036 → 14.4 → 15
    r = await chat(ACE, 'paid cache write'); assert(r.j.cost_credits === 15, 'cache writes priced at 1.25/M: $0.036 → 15 credits');
    A.usage = { input_tokens: 200000, output_tokens: 8000 }; // 0.24 → 96 → clamp 40
    r = await chat(ACE, 'paid big'); assert(r.j.cost_credits === 40, 'expensive answer clamped to max 40 credits');
    const led = (await ACE('/api/billing')).j.history.filter((h) => h.kind === 'joe');
    assert(led.length === 4 && led.every((h) => h.note === 'Joe answer') && led.reduce((a, h) => a + h.amount_cents, 0) === -70, 'ledger rows kind joe, “Joe answer”, total −70 credits');

    // ---------- margin guard ----------
    A.mode = 'tools'; A.usage = { input_tokens: 110000, output_tokens: 1000 }; A.calls.length = 0; // $0.115 per round
    r = await chat(ACE, 'guarded');
    const lastCall = A.calls[A.calls.length - 1];
    assert(r.j.ai && A.calls.length === 2 && lastCall.tool_choice && lastCall.tool_choice.type === 'none' && lastCall.max_tokens === 450 && r.j.cost_credits === 40, 'margin guard: next round would push cost × 1.2 past 40 credits → answers without more tools, shorter, charged 40');
    // Anthropic: cache_control on the static system block and the latest tool_result
    const sec = A.calls[1], tr = sec.messages[sec.messages.length - 1].content;
    assert(sec.system[0].cache_control && tr[tr.length - 1].type === 'tool_result' && tr[tr.length - 1].cache_control && tr[tr.length - 1].cache_control.type === 'ephemeral', 'cache_control on the system block and on the last tool_result');
    assert(A.calls[0].max_tokens === 900, 'standard answers: max_tokens 900');
    A.mode = 'simple';

    // ---------- no charge on errors ----------
    const EV = await mk('ev@x.com', 'Ev'); await patch(EV, '/api/me', { joe_autopay: true }); await chat(EV, 'f1'); await chat(EV, 'f2'); await give(EV, 500);
    let b1 = await bal(EV);
    A.mode = 'fail'; r = await chat(EV, 'fails');
    assert(r.j.ai === false && r.j.cost_credits === 0 && (await bal(EV)) === b1, 'AI error on a paid answer → rule answer, no charge');
    A.mode = 'fail2'; A.usage = { input_tokens: 3000, output_tokens: 100 }; r = await chat(EV, 'fails later');
    assert(r.j.ai === false && r.j.cost_credits === 0 && (await bal(EV)) === b1, 'error after a tool round → no charge either');
    A.mode = 'simple';

    // ---------- monthly cap ----------
    r = await patch(ACE, '/api/me', { joe_monthly_cap: -5 }); assert(r.s === 400, 'bad cap refused');
    r = await patch(ACE, '/api/me', { joe_monthly_cap: 100 }); assert(r.s === 200 && r.j.joe.monthly_cap === 100, 'PATCH /api/me joe_monthly_cap');
    // spent so far: 3+12+15+40+40 = 110 ≥ 100
    r = await chat(ACE, 'over cap');
    assert(r.j.ai === false && r.j.cost_credits === 0 && /monthly Joe budget of 100 credits, Ace/.test(r.j.reply) && r.j.actions[0].joe_settings, 'cap reached → friendly note, no AI, no charge');
    await patch(ACE, '/api/me', { joe_monthly_cap: 0 });
    r = await chat(ACE, 'cap zero'); assert(/Paid answers are switched off/.test(r.j.reply) && r.j.cost_credits === 0, 'cap 0 = no paid answers');
    await patch(ACE, '/api/me', { joe_monthly_cap: null, joe_autopay: false });
    g = (await ACE('/api/joe/chat')).j.billing;
    assert(g.monthly_cap === 1000 && g.autopay === false && g.spent_month_credits === 110, 'cap null → default 1,000; autopay can be switched off; spent this month 110');

    // ---------- insufficient balance (autopay on) ----------
    await patch(BO, '/api/me', { joe_autopay: true });
    await chat(BO, 'f1'); await chat(BO, 'f2');
    await give(BO, 30); // 30 < 40 needed
    r = await chat(BO, 'paid but poor');
    assert(r.j.ai === false && r.j.cost_credits === 0 && /used today’s free chats, Bo 😄 Top up credits/.test(r.j.reply) && (await bal(BO)) === 30, 'balance under the max price → top-up note (name), nothing charged');
    const cyR = await chat(CY, 'y'); await chat(CY, 'z');
    r = await chat(CY, 'paid?'); assert(r.j.needs_confirm && /^You’ve used today’s free chats 😄/.test(r.j.reply), 'no first name → no name in the note (never the email)');

    // ---------- Deep mode ----------
    r = await chat(DI, { message: 'deep please', deep: true });
    assert(r.j.ai === false && /Deep answers are part of Pro, Di/.test(r.j.reply) && r.j.cost_credits === 0, 'Deep on Basic (deep_for pro) → explained, no charge');
    await put(ADM, '/api/admin/settings', { joe: { billing: { deep_for: 'all' } } });
    await patch(DI, '/api/me', { joe_autopay: true }); await give(DI, 500);
    A.calls.length = 0; A.usage = { input_tokens: 10000, output_tokens: 1000 }; // sonnet-5-5: 0.02+0.01 = 0.03 × 3 = 9 → deep min 10
    const freeBefore = (await DI('/api/joe/chat')).j.billing.free_left;
    r = await chat(DI, { message: 'deep please', deep: true });
    assert(r.j.ai && r.j.deep && r.j.cost_credits === 10 && A.calls[0].model === 'claude-sonnet-5-5' && A.calls[0].max_tokens === 1600 && (await DI('/api/joe/chat')).j.billing.free_left === freeBefore, 'Deep: deep model, 1,600 tokens, deep markup ×3 → deep minimum 10 credits, never uses a free chat');
    A.usage = { input_tokens: 40000, output_tokens: 2000 }; // 0.08+0.02=0.10 × 3 = 30
    r = await chat(DI, { message: 'deep again', deep: true }); assert(r.j.cost_credits === 30, 'Deep: $0.10 × 3 = 30 credits');
    assert((await DI('/api/joe/chat')).j.billing.deep_allowed === true, 'deep_allowed follows deep_for');

    // ---------- bonus chats ----------
    assert((await post(ADM, `/api/admin/users/${BO.id}/joe-bonus`, { chats: -1 })).s === 400, 'bad bonus refused');
    r = await post(ADM, `/api/admin/users/${BO.id}/joe-bonus`, { chats: 1 });
    A.usage = { input_tokens: 2000, output_tokens: 200 };
    r = await chat(BO, 'with bonus');
    assert(r.j.ai && r.j.cost_credits === 0 && (await ADM('/api/admin/users/' + BO.id)).j.user.joe_bonus === 0, 'admin bonus chat: free answer, bonus used');

    // ---------- free resets at local midnight ----------
    const utcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    const off = utcMin + 5 <= 840 ? utcMin + 5 : -(1440 - utcMin + 5); // move the user's clock to yesterday or tomorrow
    await patch(ACE, '/api/me', { tz: String(off) });
    g = (await ACE('/api/joe/chat')).j.billing;
    assert(g.free_left === 2, 'another local day → free chats are back (reset at the user’s midnight)');

    // ---------- OpenAI usage ----------
    await put(ADM, '/api/admin/settings', { joe: { provider: 'openai', openai_base: 'http://localhost:4600/v1', openai_key: 'sk-openai-pay-99999999', openai_model: 'gpt-4o-mini' } });
    await give(BO, 100);
    r = await chat(BO, 'openai paid'); // (6000×0.15 + 4000×0.075 + 1000×0.60)/1e6 = $0.0018 → ×400 = 0.72 → min 3
    assert(r.j.ai && r.j.cost_credits === 3 && O.calls.length === 1 && O.calls[0].max_tokens === 900, 'OpenAI usage (prompt incl. cached, completion) priced → 3 credits');
    await put(ADM, '/api/admin/settings', { joe: { provider: 'anthropic' } });

    // ---------- admin is free ----------
    A.usage = { input_tokens: 2000, output_tokens: 200 };
    for (let i = 0; i < 3; i++) r = await chat(ADM, 'admin ' + i);
    assert(r.j.ai && r.j.cost_credits === 0, 'owners/admins use Joe for free');

    // ---------- admin usage report ----------
    r = await ADM('/api/admin/joe/usage');
    const T = r.j.totals;
    assert(r.s === 200 && T.paid_messages === 8 && T.free_messages >= 8 && T.errors >= 1 && T.credits === 3 + 12 + 15 + 40 + 40 + 10 + 30 + 3 && T.revenue_usd === T.credits / 100, `usage totals: ${T.messages} messages, ${T.paid_messages} paid, ${T.credits} credits`);
    assert(T.ai_cost_usd > 0 && Math.abs(T.margin_usd - (T.revenue_usd - T.ai_cost_usd)) < 0.001 && T.margin_pct > 20 && T.margin_guarded === 1, `cost $${T.ai_cost_usd}, margin ${T.margin_pct}% (guarded answers counted)`);
    assert(r.j.by_model.some((m) => m.model === 'claude-sonnet-5-5') && r.j.by_model.some((m) => m.model === 'gpt-4o-mini' && m.ai_cost_usd === 0.0018) && r.j.by_day.length >= 1 && r.j.top_users[0].email === 'ace@x.com', 'by model (real OpenAI cost $0.0018), by day, top users');
    await post(ADM, '/api/admin/staff', { email: 'sup@x.com', role: 'support' }); await post(ADM, '/api/admin/staff', { email: 'vw@x.com', role: 'viewer' }); await sleep(150);
    const acc = async (email) => { const t = [...logTxt().matchAll(new RegExp(`to ${email.replace(/[.@]/g, '\\$&')} .*?/app\\?reset=([\\w-]+)`, 'g'))].pop()[1]; const f = client(); await post(f, '/api/reset', { token: t, password: 'password1' }); return f; };
    const SUP = await acc('sup@x.com'), VW = await acc('vw@x.com');
    assert((await SUP('/api/admin/joe/usage')).s === 403 && (await VW('/api/admin/joe/usage')).s === 200, 'earnings report needs overview.view or audit.view');
    assert((await put(VW, '/api/admin/settings', { joe: { billing: { markup: 5 } } })).s === 403, 'pricing needs settings.edit');

    const html = await (await fetch(B + '/admin')).text();
    assert(html.includes('Joe earnings') && html.includes('Pricing') && html.includes('margin'), 'admin page: Pricing card and Joe earnings');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
  anth.close(); oai.close();
})();
