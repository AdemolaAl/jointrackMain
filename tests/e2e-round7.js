// Round 7: in-app inbox (events → inbox rows in the user's language, notify_prefs for email copies, inbox API, important pop-up),
// admin broadcasts (audience, live reach, fan-out, email, read counts, delete, image upload), daily Joe tip, blog API + new-post notes.
// The runner sets BLOG_DIR to an empty temp folder, so the blog files are written by this test.
const B = 'http://localhost:3999';
const fs = require('fs'), path = require('path');
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
const patch = (f, p, b) => f(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = (f, p) => f(p, { method: 'DELETE' });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const I18N = path.join(__dirname, '..', 'public', 'i18n');
const PT = JSON.parse(fs.readFileSync(path.join(I18N, 'server.pt.json'), 'utf8'));
const BLOG = process.env.BLOG_DIR;
const today = new Date().toISOString().slice(0, 10), old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  const ADM = client(), U = client(), V = client();
  await post(ADM, '/api/signup', { country: 'GB', email: 'admin@x.com', password: 'password1', name: 'Noah' });
  await sleep(100);
  const vlink = [...fs.readFileSync(process.env.SRV_LOG, 'utf8').matchAll(/to admin@x\.com .*?(\/verify\?t=[\w.-]+)/g)].pop();
  await fetch(B + vlink[1], { redirect: 'manual' });
  await post(U, '/api/signup', { country: 'GB', email: 'mia@x.com', password: 'password1', name: 'Mia Costa', lang: 'pt' });
  await post(V, '/api/signup', { country: 'GB', email: 'ravi@x.com', password: 'password1', name: 'Ravi', lang: 'en' });
  const uid = (await ADM('/api/admin/users?q=mia')).j.users[0].id, vid = (await ADM('/api/admin/users?q=ravi')).j.users[0].id;
  const log = async () => (await ADM('/api/admin/emails')).j.log;
  const inbox = async (f, q = '') => (await f('/api/inbox' + q)).j;

  // ---------- /api/me ----------
  let me = (await U('/api/me')).j;
  assert(me.inbox_unread === 0 && ['update', 'account', 'alert', 'joe'].every((k) => me.notify_prefs[k].email === true), '/api/me: inbox_unread and notify_prefs (all emails on)');
  assert((await U('/api/inbox')).s === 200 && (await client()('/api/inbox')).s === 401, 'inbox needs a login');

  // ---------- events land in the inbox, in the user's language ----------
  let r = await post(ADM, `/api/admin/users/${uid}/credits`, { credits: 5000, reason: 'Obrigado pelo feedback', notify: true });
  let ib = await inbox(U);
  let it = ib.items[0];
  assert(it && it.kind === 'account' && it.title === PT['credits.title_add'] && /\*\*5,000 créditos\*\*/.test(it.body) && it.body.includes('Obrigado pelo feedback') && it.cta_url === '#tab:wallet' && it.cta_label === PT['mail.cta_wallet'] && /^\/media\/email\/\w+\.png$/.test(it.image) && it.read === false && it.important === false,
    'credits added → inbox row (Portuguese, reason, wallet button, art thumbnail)');
  assert(ib.unread.total === 1 && ib.unread.account === 1 && (await U('/api/me')).j.inbox_unread === 1, 'unread counts per kind + inbox_unread on /api/me');
  let lg = (await log()).find((l) => l.kind === 'credits_added' && l.to_addr === 'mia@x.com');
  assert(lg && lg.ok !== 2, 'email copy sent while account emails are on');
  await post(U, '/api/login', { email: 'mia@x.com', password: 'password1' });
  ib = await inbox(U, '?kind=joe');
  assert(ib.items.length === 1 && ib.items[0].title === PT['meet_joe.title'] && ib.items[0].cta_url === '#tab:joe', '“Meet Joe” lands in the Joe tab of the inbox');

  // ---------- notify_prefs control email copies only ----------
  r = await patch(U, '/api/me', { notify_prefs: 'nope' }); assert(r.s === 400, 'bad notify_prefs refused');
  r = await patch(U, '/api/me', { notify_prefs: { account: { email: false }, joe: { email: false }, weird: { email: false } } });
  assert(r.s === 200 && r.j.notify_prefs.account.email === false && r.j.notify_prefs.joe.email === false && r.j.notify_prefs.update.email === true && !r.j.notify_prefs.weird, 'PATCH /api/me {notify_prefs}');
  await post(ADM, `/api/admin/users/${uid}/credits`, { credits: 1000, reason: 'Segundo', notify: true });
  lg = (await log()).filter((l) => l.kind === 'credits_added' && l.to_addr === 'mia@x.com');
  ib = await inbox(U, '?kind=account');
  assert(lg[0].ok === 2 && ib.items[0].body.includes('Segundo') && ib.unread.account === 2, 'account emails off → inbox only (email_log ok=2), inbox still gets it');
  await post(client(), '/api/forgot', { email: 'mia@x.com' });
  lg = (await log()).find((l) => l.kind === 'password_reset' && l.to_addr === 'mia@x.com');
  assert(lg && lg.ok !== 2 && !(await inbox(U)).items.some((x) => x.title === PT['reset.title']), 'security emails (password reset) always go out and stay out of the inbox');

  // ---------- inbox API ----------
  for (let i = 0; i < 30; i++) await post(ADM, `/api/admin/users/${uid}/credits`, { credits: 10 + i, reason: 'Lote ' + i, notify: true });
  ib = await inbox(U);
  assert(ib.items.length === 30 && ib.more === true && ib.items[0].id > ib.items[29].id, 'page of 30, newest first, more:true');
  let ib2 = await inbox(U, '?before=' + ib.items[29].id);
  assert(ib2.items.length >= 3 && ib2.items.every((x) => x.id < ib.items[29].id) && ib2.more === false, '?before= pages back');
  const total0 = ib.unread.total;
  r = await post(U, '/api/inbox/read', { ids: [ib.items[0].id, ib.items[1].id] });
  assert(r.s === 200 && r.j.unread.total === total0 - 2 && (await inbox(U)).items[0].read === true, 'mark some read');
  r = await post(U, '/api/inbox/read', {}); assert(r.s === 400, 'read needs ids or all');
  r = await post(U, '/api/inbox/read', { all: true, kind: 'joe' });
  assert(r.j.unread.joe === 0 && r.j.unread.account > 0, 'mark all read in one tab');
  const vIb = await inbox(V);
  r = await del(U, '/api/inbox/' + ib.items[2].id);
  assert(r.s === 200 && !(await inbox(U)).items.some((x) => x.id === ib.items[2].id), 'delete an item');
  if (vIb.items[0]) assert((await del(U, '/api/inbox/' + vIb.items[0].id)).s === 404, 'cannot delete someone else’s item');
  r = await post(U, '/api/inbox/read', { all: true });
  assert(r.j.unread.total === 0 && (await U('/api/me')).j.inbox_unread === 0, 'mark everything read');

  // ---------- broadcasts ----------
  assert((await U('/api/admin/broadcasts')).s === 403, 'broadcasts are admin-only');
  r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { lang: 'pt' } });
  assert(r.s === 200 && r.j.count === 1 && r.j.sample[0] === 'mia@x.com', 'live reach: Portuguese speakers = 1');
  r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { plan: 'pro' } }); assert(r.j.count === 0, 'reach: nobody on Pro yet');
  await post(ADM, `/api/admin/users/${vid}/plan`, { plan: 'pro' });
  r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { plan: 'pro' } }); assert(r.j.count === 1 && r.j.sample[0] === 'ravi@x.com', 'reach: Pro plan filter');
  r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { active_days: 1 } }); assert(r.j.count >= 2, 'reach: active in the last N days');
  r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { level: 'rookie' } }); assert(r.j.count === 3, 'reach: level filter (new accounts are Rookies)');
  r = await post(ADM, '/api/admin/broadcasts/preview', { audience: { user_ids: [uid, vid] } }); assert(r.j.count === 2, 'reach: picked users');
  r = await post(ADM, '/api/admin/broadcasts', { body: 'x' }); assert(r.s === 400, 'broadcast needs a title');
  r = await post(ADM, '/api/admin/broadcasts', { title: 'Hi', cta_label: 'Go', cta_url: 'javascript:alert(1)' }); assert(r.s === 400, 'unsafe button link refused');
  r = await post(ADM, '/api/admin/broadcasts/image', { data: PNG });
  assert(r.s === 200 && /^\/media\/broadcast\/[\w-]+\.png$/.test(r.j.url), 'image upload');
  const img = r.j.url, ir = await fetch(B + img);
  assert(ir.status === 200 && ir.headers.get('content-type') === 'image/png' && ir.headers.get('etag'), '/media/broadcast/* served');
  assert((await fetch(B + '/media/broadcast/missing.png')).status === 404, 'missing broadcast image → 404');
  await patch(V, '/api/me', { notify_prefs: { update: { email: false } } });
  r = await post(ADM, '/api/admin/broadcasts', { title: 'Snapchat cost per FTD is live', body: 'Add your spend and see **cost per FTD** per campaign. [How it works](/guide)', image: img, cta_label: 'Open campaigns', cta_url: '#tab:campaigns', important: true, also_email: true, audience: { plan: 'all' } });
  assert(r.s === 200 && r.j.sent_count === 3 && r.j.broadcast.sent_count === 3 && r.j.broadcast.read_count === 0, 'broadcast fanned out to every active account');
  const bid = r.j.id;
  ib = await inbox(U, '?kind=update');
  it = ib.items.find((x) => x.title === 'Snapchat cost per FTD is live');
  assert(it && it.important && it.image === img && it.cta_url === '#tab:campaigns' && it.body.includes('**cost per FTD**'), 'broadcast in the Updates tab with image, button and markdown');
  let pop = (await U('/api/inbox/popup')).j;
  assert(pop && pop.id === it.id && pop.important, 'important → GET /api/inbox/popup returns it');
  await post(U, '/api/inbox/read', { ids: [pop.id] });
  assert((await U('/api/inbox/popup')).j === null, 'pop-up shown once (null after read)');
  await sleep(700);
  lg = (await log()).filter((l) => l.kind === 'broadcast');
  assert(lg.length === 3 && lg.filter((l) => l.ok === 2).length === 1 && lg.find((l) => l.to_addr === 'ravi@x.com').ok === 2 && lg[0].subject === 'Snapchat cost per FTD is live', 'also email: sent except to people who turned update emails off');
  const html = (await ADM('/api/admin/emails/broadcast/preview')).t;
  assert(/<b>cost per FTD<\/b>/.test(html) && /href="https:\/\/joinvoo\.com\/guide"/.test(html), 'broadcast email template renders **bold** and links');
  let list = (await ADM('/api/admin/broadcasts')).j;
  assert(list.broadcasts[0].id === bid && list.broadcasts[0].sent_count === 3 && list.broadcasts[0].read_count === 1 && list.broadcasts[0].emailed === 2 && list.levels.length === 7 && list.langs.length === 5, 'past broadcasts with sent/read/emailed counts');
  r = await del(ADM, '/api/admin/broadcasts/' + bid);
  assert(r.s === 200 && r.j.removed === 2 && (await inbox(U, '?kind=update')).items.some((x) => x.id === it.id) && !(await inbox(V, '?kind=update')).items.some((x) => x.title === 'Snapchat cost per FTD is live'), 'delete removes unread copies, keeps read ones');
  assert((await ADM('/api/admin/broadcasts')).j.broadcasts.every((b) => b.id !== bid), 'deleted broadcast gone from the list');
  r = await post(ADM, '/api/admin/broadcasts', { title: 'Only for Pro', body: 'Thanks!', audience: { plan: 'pro' } });
  assert(r.j.sent_count === 1 && (await inbox(V, '?kind=update')).items[0].title === 'Only for Pro' && !(await inbox(U, '?kind=update')).items.some((x) => x.title === 'Only for Pro'), 'audience filter respected on send');

  // ---------- Joe’s daily tip (once a day, user’s clock after 09:00) ----------
  await patch(U, '/api/me', { tz: String((new Date().getUTCHours() - 12) * 60) });
  await post(ADM, '/api/admin/jobs/run', { job: 'inbox_daily' });
  await post(ADM, '/api/admin/jobs/run', { job: 'inbox_daily' });
  ib = await inbox(U, '?kind=joe');
  const tips = ib.items.filter((x) => x.title.startsWith(PT['inbox.joe_tip'].split('{title}')[0]));
  assert(tips.length === 1 && tips[0].cta_url && tips[0].cta_url.startsWith('#tab:'), 'Joe’s daily tip: one per day, with a dashboard button');

  // ---------- blog API ----------
  r = await fetch(B + '/api/blog').then((x) => x.json());
  assert(Array.isArray(r.posts) && r.posts.length === 0, '/api/blog with no posts.json yet → empty list');
  assert((await fetch(B + '/api/blog/anything')).status === 404, '/api/blog/:slug for a missing post → 404');
  assert((await post(ADM, '/api/admin/jobs/run', { job: 'blog' })).s === 200, 'new-post check copes with missing files');
  fs.mkdirSync(path.join(BLOG, '_body'), { recursive: true });
  const P = (slug, date, title, tags) => ({ slug, title, description: 'About ' + title, author: 'Dchessking', date, tags, cover: `/media/blog/${slug}.webp`, reading_time: 5, url: `/blog/${slug}` });
  fs.writeFileSync(path.join(BLOG, 'posts.json'), JSON.stringify([P('old-guide', old, 'An older guide', ['Tracking']), P('fresh-news', today, 'Fresh news', ['Tracking', 'Meta']), { slug: '../bad', title: 'x' }]));
  fs.writeFileSync(path.join(BLOG, '_body', 'fresh-news.html'), '<!--\nArticle body only.\n-->\n<p>Hello from <a href="{{BASE_URL}}/guide">the guide</a>.</p>');
  r = await fetch(B + '/api/blog').then((x) => x.json());
  assert(r.posts.length === 2 && r.posts[0].slug === 'fresh-news' && r.posts[1].slug === 'old-guide' && r.posts[0].cover === '/media/blog/fresh-news.webp' && r.posts[0].url === '/blog/fresh-news' && r.posts[0].reading_time === 5 && r.posts[0].tags.join() === 'Tracking,Meta', '/api/blog lists posts newest first (bad slugs skipped)');
  r = await fetch(B + '/api/blog/fresh-news').then((x) => x.json());
  assert(r.title === 'Fresh news' && r.author === 'Dchessking' && r.html.startsWith('<p>Hello') && !r.html.includes('<!--') && r.html.includes('http://localhost:3999/guide') && r.related[0].slug === 'old-guide', '/api/blog/:slug: meta + article body only (+ related)');
  r = await fetch(B + '/api/blog/old-guide').then((x) => x.json());
  assert(r.title === 'An older guide' && r.html === '', 'post without a body file → empty html, no crash');
  await post(ADM, '/api/admin/jobs/run', { job: 'blog' });
  ib = await inbox(U, '?kind=update');
  const blogRows = ib.items.filter((x) => x.title.startsWith(PT['inbox.blog_title'].split('{title}')[0]));
  assert(blogRows.length === 1 && blogRows[0].title.includes('Fresh news') && blogRows[0].image === '/media/blog/fresh-news.webp' && blogRows[0].cta_url === '#tab:learn', 'new post (last 7 days) → “New on the blog” inbox note, old post ignored');
  await post(ADM, '/api/admin/jobs/run', { job: 'blog' });
  assert((await inbox(U, '?kind=update')).items.filter((x) => /Fresh news/.test(x.title)).length === 1, 'each post announced once');
  const ps = JSON.parse(fs.readFileSync(path.join(BLOG, 'posts.json'), 'utf8')); ps.unshift(P('second-news', today, 'Second news', ['Scaling']));
  await sleep(20); fs.writeFileSync(path.join(BLOG, 'posts.json'), JSON.stringify(ps));
  await post(ADM, '/api/admin/jobs/run', { job: 'blog' });
  assert((await inbox(V, '?kind=update')).items.some((x) => /Second news/.test(x.title)) && (await fetch(B + '/api/blog').then((x) => x.json())).posts.length === 3, 'posts.json reloads when it changes; the next new post is announced');
  await sleep(20); fs.writeFileSync(path.join(BLOG, 'posts.json'), '{ broken');
  r = await fetch(B + '/api/blog');
  assert(r.status === 200 && (await r.json()).posts.length === 0, 'unreadable posts.json → empty list, no crash');

  // ---------- admin page has the new section ----------
  const page = await fetch(B + '/admin').then((x) => x.text());
  assert(page.includes('Inbox / Broadcast') && page.includes('/api/admin/broadcasts/preview'), 'admin page ships the Inbox / Broadcast section');
})().catch((e) => { console.log('FAIL: crashed', e.stack); process.exitCode = 1; });
