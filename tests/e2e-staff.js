// Round 10: staff accounts with roles and permissions. ADMIN_EMAILS = owners; invites (new + existing accounts); built-in roles
// (admin, finance, support, marketing, viewer) checked server-side on representative endpoints; per-person grants/revokes;
// custom roles; owner protection; suspend; ticket assignment; the audit log (who, what, before/after, IP, filters).
const B = 'http://localhost:3999';
const fs = require('fs');
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
const del = (f, p) => f(p, { method: 'DELETE' });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const logTxt = () => fs.readFileSync(process.env.SRV_LOG, 'utf8');
const lastMatch = (re) => [...logTxt().matchAll(re)].pop();
async function verify(email) { await sleep(120); const m = lastMatch(new RegExp(`to ${email.replace(/[.@]/g, '\\$&')} .*?(/verify\\?t=[\\w.-]+)`, 'g')); await fetch(B + m[1], { redirect: 'manual' }); }
/** Accept an invite: take the set-password link from the invite email (in the server log) and set a password. */
async function accept(email) {
  await sleep(120);
  const m = lastMatch(new RegExp(`to ${email.replace(/[.@]/g, '\\$&')} .*?/app\\?reset=([\\w-]+)&next=admin`, 'g'));
  const f = client(); const r = await post(f, '/api/reset', { token: m && m[1], password: 'password1' });
  return r.s === 200 ? f : null;
}

(async () => {
  try {
    const OWN = client(), MIA = client();
    await post(OWN, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
    let r = await OWN('/api/admin/whoami');
    assert(r.s === 403 && /Confirm your email/.test(r.j.error), 'ADMIN_EMAILS owner still has to confirm the inbox first');
    await verify('admin@x.com');
    r = await OWN('/api/admin/whoami');
    assert(r.s === 200 && r.j.role === 'owner' && r.j.owner && r.j.perms.includes('staff.manage') && r.j.perms.length >= 25, 'ADMIN_EMAILS user is an owner with every permission');
    await post(MIA, '/api/signup', { country: 'GB', email: 'mia@x.com', password: 'password1', name: 'Mia' });
    r = await MIA('/api/admin/whoami'); assert(r.s === 403 && /Staff only/.test(r.j.error), 'a customer gets 403 on /api/admin/*');
    assert((await MIA('/api/me')).j.admin === false && (await OWN('/api/me')).j.admin === true && (await OWN('/api/me')).j.staff_role === 'Owner', '/api/me: admin flag + role name for staff only');
    const miaId = (await OWN('/api/admin/users?q=mia')).j.users[0].id;

    // ---------- roles + permission list ----------
    let st = (await OWN('/api/admin/staff')).j;
    assert(['owner', 'admin', 'finance', 'support', 'marketing', 'viewer'].every((k) => st.roles.some((x) => x.id === k && x.builtin)) && st.perms.length >= 25 && st.staff.length === 1 && st.staff[0].env, 'built-in roles, permission list, the owner from ADMIN_EMAILS');

    // ---------- invite (new account) ----------
    r = await post(OWN, '/api/admin/staff', { email: 'bad', role: 'support' }); assert(r.s === 400, 'invite needs a valid email');
    r = await post(OWN, '/api/admin/staff', { email: 'x@x.com', role: 'nope' }); assert(r.s === 400, 'invite needs a real role');
    r = await post(OWN, '/api/admin/staff', { email: 'Sam@X.com', name: 'Sam', role: 'support' });
    assert(r.s === 200 && r.j.existing === false && r.j.staff.find((x) => x.email === 'sam@x.com').status === 'invited', 'invite a new person as Support → status invited');
    let inv = (await OWN('/api/admin/emails')).j.log.find((l) => l.kind === 'staff_invite' && l.to_addr === 'sam@x.com');
    assert(inv && /Support/.test(inv.subject), 'invite email sent (staff_invite, mentions the role)');
    r = await post(OWN, '/api/admin/staff', { email: 'sam@x.com', role: 'viewer' }); assert(r.s === 400, 'cannot invite someone twice');
    const SAM = await accept('sam@x.com');
    assert(SAM, 'invite link sets a password and logs them in');
    r = await SAM('/api/admin/whoami');
    assert(r.s === 200 && r.j.role === 'support' && !r.j.perms.includes('users.credits') && r.j.badges.deposits === 0, 'invited person is now Support (no money permissions, no deposit badge)');
    assert((await OWN('/api/admin/staff')).j.staff.find((x) => x.email === 'sam@x.com').status === 'active', 'status becomes active after they log in');

    // ---------- support: can / can't ----------
    const sup = async (path, opt) => (await SAM(path, opt)).s;
    assert(await sup('/api/admin/users') === 200 && await sup(`/api/admin/users/${miaId}`) === 200, 'Support: read users');
    assert(await sup('/api/admin/support') === 200 && await sup('/api/admin/broadcasts') === 200, 'Support: support inbox, broadcast history');
    r = await post(SAM, `/api/admin/users/${miaId}/reset-password`, {}); assert(r.s === 200 && /mia@x\.com/.test(r.j.message), 'Support: send a password reset');
    r = await post(SAM, `/api/admin/users/${miaId}/credits`, { credits: 500, reason: 'x' });
    assert(r.s === 403 && /Support/.test(r.j.error) && /credits/.test(r.j.error) && r.j.need.includes('users.credits'), 'Support: add credits → 403 with a clear message');
    for (const [m, path, b] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/deposits?status=pending'], ['GET', '/api/admin/payouts?status=pending'], ['PUT', '/api/admin/settings', { features: { tiktok: false } }],
      ['POST', '/api/admin/broadcasts', { title: 'x' }], ['GET', '/api/admin/staff'], ['GET', '/api/admin/audit'], ['POST', `/api/admin/users/${miaId}/status`, { status: 'suspended' }], ['GET', '/api/admin/backup'], ['GET', '/api/admin/settings']]) {
      const x = await SAM(path, { method: m, body: b ? JSON.stringify(b) : undefined });
      if (x.s !== 403) console.log('   support got', x.s, m, path);
      assert(x.s === 403, `Support: ${m} ${path.replace(/\d+/, ':id')} → 403`);
    }

    // ---------- invite an existing customer (attach the role) ----------
    r = await post(OWN, '/api/admin/staff', { email: 'mia@x.com', role: 'finance' });
    assert(r.s === 200 && r.j.existing === true && r.j.staff.find((x) => x.email === 'mia@x.com').status === 'invited', 'invite an existing (unconfirmed) customer as Finance');
    r = await MIA('/api/admin/whoami'); assert(r.s === 403 && /Confirm your email/.test(r.j.error), '…who must confirm their inbox before getting staff rights');
    await verify('mia@x.com');
    r = await MIA('/api/admin/whoami'); assert(r.s === 200 && r.j.role === 'finance', 'after confirming: Finance, same login');
    assert(lastMatch(/to mia@x\.com \| [^|]*team[^|]*\| links: (\S+)/g)[1].endsWith('/admin'), 'existing accounts get an “open the admin panel” link, not a password link');
    const fin = async (m, path, b) => (await MIA(path, { method: m, body: b ? JSON.stringify(b) : undefined })).s;
    assert(await fin('GET', '/api/admin/deposits?status=pending') === 200 && await fin('GET', '/api/admin/payouts?status=pending') === 200 && await fin('GET', '/api/admin/pay-methods') === 200 && await fin('GET', '/api/admin/settings') === 200, 'Finance: deposits, payouts, payment methods, settings (read)');
    r = await post(MIA, `/api/admin/users/${miaId}/credits`, { credits: 700, reason: 'Goodwill' }); assert(r.s === 200, 'Finance: add credits');
    assert(await fin('POST', '/api/admin/promos', { code: 'FIN10', bonus_pct: 10 }) === 200, 'Finance: promo codes');
    assert(await fin('PUT', '/api/admin/settings', { features: { tiktok: false } }) === 403, 'Finance: change features → 403');
    assert(await fin('PUT', '/api/admin/settings', { keys: { resend_key: 're_abc12345678' } }) === 403, 'Finance: API keys → 403');
    assert(await fin('GET', '/api/admin/support') === 403 && await fin('GET', '/api/admin/staff') === 403 && await fin('POST', `/api/admin/users/${miaId}/plan`, { plan: 'pro' }) === 403, 'Finance: support, staff, plans → 403');

    // ---------- marketing + viewer ----------
    await post(OWN, '/api/admin/staff', { email: 'mark@x.com', role: 'marketing' }); const MK = await accept('mark@x.com');
    await post(OWN, '/api/admin/staff', { email: 'val@x.com', role: 'viewer' }); const VW = await accept('val@x.com');
    const mk = async (m, path, b) => (await MK(path, { method: m, body: b ? JSON.stringify(b) : undefined })).s;
    assert(await mk('PUT', '/api/admin/settings', { sister: { promo_code: 'MKT5' } }) === 200 && await mk('PUT', '/api/admin/settings', { joe: { knowledge: 'We reply within 5 minutes.' } }) === 200, 'Marketing: sister products, Joe knowledge');
    assert(await mk('POST', '/api/admin/broadcasts/preview', { audience: {} }) === 200 && await mk('POST', '/api/admin/broadcasts', { title: 'Hello from marketing', body: 'News.' }) === 200 && await mk('GET', '/api/admin/overview') === 200, 'Marketing: broadcasts, overview');
    assert(await mk('PUT', '/api/admin/settings', { joe: { model: 'x', knowledge: 'y' } }) === 403 && await mk('GET', '/api/admin/deposits') === 403 && await mk('GET', '/api/admin/users') === 403, 'Marketing: Joe model, deposits, users → 403');
    const vw = async (m, path, b) => (await VW(path, { method: m, body: b ? JSON.stringify(b) : undefined })).s;
    assert(await vw('GET', '/api/admin/overview') === 200 && await vw('GET', '/api/admin/users') === 200 && await vw('GET', '/api/admin/health') === 200, 'Viewer: overview, users, health');
    assert(await vw('POST', `/api/admin/users/${miaId}/credits`, { credits: 1 }) === 403 && await vw('GET', '/api/admin/support') === 403 && await vw('POST', '/api/admin/retry-failed') === 403 && await vw('GET', '/api/admin/emails') === 403, 'Viewer: no changes, no support, no jobs, no emails');

    // ---------- per-person overrides ----------
    const samId = (await OWN('/api/admin/staff')).j.staff.find((x) => x.email === 'sam@x.com').user_id;
    r = await patch(OWN, '/api/admin/staff/' + samId, { grants: ['deposits.view'], revokes: ['users.reset'] });
    assert(r.s === 200 && r.j.staff.find((x) => x.user_id === samId).perms.includes('deposits.view'), 'owner adds one permission and removes one for a person');
    assert(await sup('/api/admin/deposits?status=pending') === 200 && (await post(SAM, `/api/admin/users/${miaId}/reset-password`, {})).s === 403, '…takes effect at once (deposits yes, password reset no)');

    // ---------- admin role: everything except owners ----------
    await post(OWN, '/api/admin/staff', { email: 'ada2@x.com', role: 'admin' }); const AD = await accept('ada2@x.com');
    const ownId = (await OWN('/api/admin/whoami')).j && (await OWN('/api/admin/staff')).j.staff.find((x) => x.email === 'admin@x.com').user_id;
    assert((await AD('/api/admin/staff')).s === 200 && (await AD('/api/admin/audit')).s === 200, 'Admin: team page and audit log');
    r = await post(AD, '/api/admin/staff', { email: 'boss2@x.com', role: 'owner' }); assert(r.s === 403 && /owner/.test(r.j.error), 'Admin can’t make someone an owner');
    r = await patch(AD, '/api/admin/staff/' + ownId, { role: 'viewer' }); assert(r.s === 403, 'Admin can’t demote an owner');
    r = await del(AD, '/api/admin/staff/' + ownId); assert(r.s === 403, 'Admin can’t remove an owner');
    r = await post(AD, '/api/admin/staff', { email: 'help@x.com', role: 'support' }); assert(r.s === 200, 'Admin can invite Support');
    r = await post(AD, '/api/admin/roles', { name: 'Sneaky', perms: ['overview.view'] }); assert(r.s === 403, 'only owners create roles');

    // ---------- owners: protection ----------
    r = await del(OWN, '/api/admin/staff/' + ownId); assert(r.s === 403, 'the last owner can’t remove themselves');
    r = await patch(OWN, '/api/admin/staff/' + ownId, { role: 'admin' }); assert(r.s === 403, 'an owner can’t demote themselves');
    await post(OWN, '/api/admin/staff', { email: 'own2@x.com', role: 'owner' }); const O2 = await accept('own2@x.com');
    assert((await O2('/api/admin/whoami')).j.role === 'owner', 'an owner can invite another owner');
    r = await patch(O2, '/api/admin/staff/' + ownId, { role: 'admin' }); assert(r.s === 403 && /ADMIN_EMAILS/.test(r.j.error), 'owners from ADMIN_EMAILS can only be changed on the server');
    const o2Id = (await OWN('/api/admin/staff')).j.staff.find((x) => x.email === 'own2@x.com').user_id;
    r = await patch(OWN, '/api/admin/staff/' + o2Id, { role: 'admin' }); assert(r.s === 200 && (await O2('/api/admin/whoami')).j.role === 'admin', 'another owner can demote an owner');

    // ---------- custom role ----------
    r = await post(OWN, '/api/admin/roles', { name: 'Night support', perms: ['support.view', 'support.reply', 'nope.fake'] });
    const nid = r.j.id; const nr = r.j.roles.find((x) => x.id === nid);
    assert(r.s === 200 && nid === 'night_support' && nr && !nr.builtin && nr.perms.length === 2, 'owner creates a custom role (unknown permissions dropped)');
    r = await patch(OWN, '/api/admin/staff/' + samId, { role: nid, grants: [], revokes: [] });
    r = await SAM('/api/admin/whoami'); assert(r.j.role === 'night_support' && r.j.role_name === 'Night support' && r.j.perms.sort().join() === 'support.reply,support.view', 'person moved to the custom role');
    r = await del(OWN, '/api/admin/roles/' + nid); assert(r.s === 400, 'can’t delete a role someone has');
    r = await del(OWN, '/api/admin/roles/viewer'); assert(r.s === 400, 'can’t delete a built-in role');
    r = await patch(OWN, '/api/admin/roles/viewer', { perms: ['overview.view', 'users.view', 'health.view', 'audit.view'] }); assert(r.s === 200 && (await VW('/api/admin/audit')).s === 200, 'editing a built-in role applies to its people (Viewer can now read the audit log)');

    // ---------- support ticket assignment ----------
    const SUPU = client(); await post(SUPU, '/api/signup', { country: 'GB', email: 'cust@x.com', password: 'password1' }); await post(SUPU, '/api/support', { body: 'Hi, help please' });
    const tid = (await SAM('/api/admin/support')).j.tickets[0].id;
    r = await post(SAM, `/api/admin/support/${tid}/assign`, {}); assert(r.s === 200 && r.j.assigned_to === 'sam@x.com', 'support agent assigns a chat to themselves');
    r = await post(SAM, `/api/admin/support/${tid}/assign`, { email: 'cust@x.com' }); assert(r.s === 400, 'chats can only be assigned to staff');
    assert((await SAM(`/api/admin/support/${tid}`)).j.ticket.assigned_to === 'sam@x.com', 'assignment shows on the chat');

    // ---------- suspend + remove ----------
    r = await patch(OWN, '/api/admin/staff/' + samId, { status: 'suspended' });
    assert(r.s === 200 && (await SAM('/api/admin/whoami')).s !== 200, 'suspended staff lose access at once (logged out)');
    r = await del(OWN, '/api/admin/staff/' + samId); assert(r.s === 200 && !r.j.staff.some((x) => x.email === 'sam@x.com'), 'remove someone from the team');
    r = await post(OWN, `/api/admin/staff/${(await OWN('/api/admin/staff')).j.staff.find((x) => x.email === 'help@x.com').user_id}/resend`, {}); assert(r.s === 200, 'resend an invite');

    // ---------- audit log ----------
    await put(OWN, '/api/admin/settings', { pricing: { free_joins: 321 }, keys: { anthropic_key: 'sk-ant-secretsecret-9999' } });
    r = await OWN('/api/admin/audit');
    const A = r.j.items, txt = JSON.stringify(A);
    assert(r.s === 200 && A.length >= 10, `audit log has the actions (${A.length})`);
    assert(A.some((x) => x.action === 'staff.invite' && x.target === 'sam@x.com' && x.actor_email === 'admin@x.com' && x.summary.role === 'Support'), 'invite recorded: who, what, target');
    const cr = A.find((x) => x.action === 'users.credits' && x.actor_email === 'mia@x.com');
    assert(cr && cr.target === 'user:' + miaId && cr.summary.credits === 700 && cr.ip, 'credits recorded with the actor, target, amount and IP');
    const su = A.find((x) => x.action === 'settings.update' && x.actor_email === 'admin@x.com');
    const fj = su && su.summary.changes.find((c) => c.key === 'price.free_joins');
    assert(fj && fj.after === 321 && fj.before !== 321, 'settings change recorded with before → after');
    assert(!txt.includes('secretsecret') && su.summary.changes.some((c) => c.key === 'joe.api_key' && /^••••9999$/.test(c.after)), 'secrets are masked in the audit log');
    assert(A.some((x) => x.action === 'staff.update' && x.summary.before.role === 'owner' && x.summary.after.role === 'admin'), 'role change recorded with before/after');
    assert(A.some((x) => x.action === 'staff.suspend') && A.some((x) => x.action === 'staff.remove') && A.some((x) => x.action === 'roles.create') && A.some((x) => x.action === 'support.assign'), 'suspend, remove, role creation and assignment recorded');
    assert(!A.some((x) => /preview/.test(x.action)), 'previews are not recorded');
    r = await OWN('/api/admin/audit?actor=mia@x.com'); assert(r.j.items.length && r.j.items.every((x) => x.actor_email === 'mia@x.com'), 'filter by staff member');
    r = await OWN('/api/admin/audit?area=staff'); assert(r.j.items.length && r.j.items.every((x) => x.area === 'staff'), 'filter by action type');
    const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    r = await OWN('/api/admin/audit?from=' + tomorrow); assert(r.j.items.length === 0, 'filter by date');
    assert(r.j.actors.includes('mia@x.com') && r.j.areas.includes('settings'), 'filter options listed');
    assert((await MK('/api/admin/audit')).s === 403, 'people without audit.view can’t read it');

    const html = await (await fetch(B + '/admin')).text();
    assert(html.includes('Team &amp; roles') || html.includes('Team & roles'), 'admin page has Team & roles');
    assert(html.includes('Audit log') && html.includes('/api/admin/whoami'), 'admin page has the Audit log and loads the role first');
  } catch (e) { console.log('FAIL: crashed', e.stack); process.exitCode = 1; }
})();
