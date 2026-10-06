"""Joinvoo blog generator (stdlib only; covers use Pillow via covers.py when it's installed).

Source: build/blog/*.md with front matter (title, slug, description, author, date, tags, cover, reading_time,
optional featured: true). Output, for both the live server (public/) and the static demo (dist/):

    blog/index.html          magazine index: featured hero, tag chips, search, card grid
    blog/<slug>.html         a post: progress bar, table of contents, share, author box, CTA, related posts
    blog/tag-<tag>.html      one page per tag
    sitemap.xml, rss.xml     every site page + post (absolute URLs use the literal {{BASE_URL}})

Live pages are complete HTML documents (not fragments): serve them as-is, only replacing {{BASE_URL}}.
Live URLs: /blog, /blog/<slug>, /blog/tag/<tag>, covers at /media/blog/<file>.
Demo pages live in dist/blog/ and link with relative paths (../guide.html, ../media/blog/…).

Markdown supported: ## / ### / #### headings, paragraphs, **bold**, *italic*, `code`, [links](url), - and 1. lists,
> quotes, > [!TIP] / [!NOTE] / [!WARNING] / [!TAKEAWAYS] callouts, ``` fences, | tables |, ---.
Link placeholders inside posts: {{GUIDE}}, {{SIGNUP}}, {{BLOG}}, {{POST:<slug>}}, {{TAG:<tag>}}.
"""
import datetime as dt, html, json, os, re

E = html.escape
SITE_NAME = 'Joinvoo'
LIVE_DOMAIN = 'https://joinvoo.com'  # only used for the dist/ demo copy; public/ keeps {{BASE_URL}}

AUTHORS = {
    'Dchessking': {
        'name': 'Dchessking', 'role': 'Media buyer and founder of Zedapex',
        'bio': 'Dchessking runs paid traffic from Meta, TikTok and Snapchat into Telegram funnels and writes about the parts of the job that the dashboards don’t explain: tracking, signal quality and scaling without breaking what works.',
        'kind': 'Person',
    },
    'Joinvoo Team': {
        'name': 'Joinvoo Team', 'role': 'The people building Joinvoo',
        'bio': 'We build Joinvoo, the tracker for media buyers who run ads to Telegram channels, groups and bots. We write practical guides on tracking, server-side events and getting ad platforms to optimise for real people.',
        'kind': 'Organization',
    },
}
_vf = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '_voofoot.html')
VOOFOOT = open(_vf, encoding='utf-8').read() if os.path.exists(_vf) else ''  # 'Part of VooSquare' line shared with the site footers
TAG_LABEL_FIX = {'capi': 'CAPI', 'utms': 'UTMs', 'roas': 'ROAS', 'ftd': 'FTD'}

# ------------------------------------------------------------------ front matter + markdown

def slugify(s):
    s = re.sub(r'<[^>]+>', '', s).lower().replace('’', '').replace("'", '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def parse_post(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n', raw, re.S)
    if not m: raise ValueError(f'{path}: missing front matter')
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith('#'): continue
        k, _, v = line.partition(':'); k = k.strip(); v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'': v = v[1:-1]
        if k == 'tags':
            v = [t.strip().strip('"\'') for t in v.strip('[]').split(',') if t.strip()]
        meta[k] = v
    body = raw[m.end():]
    for req in ('title', 'slug', 'description', 'author', 'date', 'tags', 'cover'):
        if not meta.get(req): raise ValueError(f'{path}: front matter needs {req}')
    if meta['author'] not in AUTHORS: raise ValueError(f'{path}: unknown author {meta["author"]!r}')
    meta['date_obj'] = dt.date.fromisoformat(meta['date'])
    words = len(re.findall(r'\w+', re.sub(r'```.*?```', '', body, flags=re.S)))
    meta['words'] = words
    rt = str(meta.get('reading_time') or '').strip()
    meta['reading_time'] = int(re.sub(r'\D', '', rt) or 0) or max(1, round(words / 225))
    meta['featured'] = str(meta.get('featured', '')).lower() in ('true', 'yes', '1')
    meta['body'] = body
    return meta


def smart(s):
    """Typographic quotes and apostrophes for prose (code spans are already swapped out)."""
    s = re.sub(r"(\w)'(\w)", '\\1\u2019\\2', s)
    s = re.sub(r"(^|[\s(\[])'", '\\1\u2018', s); s = s.replace("'", '\u2019')
    s = re.sub(r'(^|[\s(\[])"', '\\1\u201c', s); s = s.replace('"', '\u201d')
    return s


def inline(s):
    """Inline markdown -> HTML. Code spans are protected first; everything else is escaped."""
    codes = []
    def keep(m):
        codes.append('<code>%s</code>' % E(m.group(1), quote=False)); return '\x00%d\x00' % (len(codes) - 1)
    s = re.sub(r'`([^`]+)`', keep, s)
    s = E(s, quote=False)
    s = smart(s)
    s = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)\)', lambda m: '<img src="%s" alt="%s" loading="lazy">' % (m.group(2), m.group(1)), s)
    def link(m):
        text, url = m.group(1), m.group(2)
        ext = url.startswith('http')
        return '<a href="%s"%s>%s</a>' % (url, ' target="_blank" rel="noopener"' if ext else '', text)
    s = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', link, s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
    s = s.replace(' -- ', ' – ')
    return re.sub('\x00(\\d+)\x00', lambda m: codes[int(m.group(1))], s)


CALLOUT = {'TIP': ('tip', 'Tip'), 'NOTE': ('note', 'Note'), 'WARNING': ('warn', 'Watch out'), 'TAKEAWAYS': ('tldr', 'Key takeaways'),
           'EXAMPLE': ('ex', 'Hypothetical example')}


def markdown(src, toc=None, used_ids=None):
    """Block-level markdown -> HTML. Appends (level, id, text) for ## and ### headings to toc."""
    toc = toc if toc is not None else []
    used = used_ids if used_ids is not None else set()
    lines = src.replace('\r\n', '\n').split('\n')
    out = []; i = 0; n = len(lines)

    def is_block_start(l):
        return bool(re.match(r'\s*(#{2,4}\s|```|>|[-*]\s|\d+\.\s|\||---\s*$)', l))

    while i < n:
        l = lines[i]
        if not l.strip(): i += 1; continue
        m = re.match(r'^(#{2,4})\s+(.*)$', l)
        if m:
            lvl = len(m.group(1)); text = m.group(2).strip()
            hid = slugify(text)[:60] or 'section'; base = hid; k = 2
            while hid in used: hid = '%s-%d' % (base, k); k += 1
            used.add(hid)
            if lvl <= 3: toc.append((lvl, hid, re.sub(r'<[^>]+>', '', inline(text))))
            out.append('<h%d id="%s"><a class="anc" href="#%s" aria-hidden="true" tabindex="-1">#</a>%s</h%d>' % (lvl, hid, hid, inline(text), lvl))
            i += 1; continue
        if l.startswith('```'):
            lang = l[3:].strip(); buf = []; i += 1
            while i < n and not lines[i].startswith('```'): buf.append(lines[i]); i += 1
            i += 1
            out.append('<pre%s><code>%s</code></pre>' % (' data-lang="%s"' % E(lang) if lang else '', E('\n'.join(buf), quote=False)))
            continue
        if re.match(r'^---\s*$', l): out.append('<hr>'); i += 1; continue
        if l.startswith('>'):
            buf = []
            while i < n and lines[i].startswith('>'): buf.append(re.sub(r'^>\s?', '', lines[i])); i += 1
            cm = re.match(r'^\[!(\w+)\]\s*(.*)$', buf[0]) if buf else None
            if cm and cm.group(1).upper() in CALLOUT:
                cls, label = CALLOUT[cm.group(1).upper()]
                if cm.group(2): label = cm.group(2)
                out.append('<aside class="co co-%s"><b class="co-h">%s</b>%s</aside>' % (cls, inline(label), markdown('\n'.join(buf[1:]), [], used)))
            else:
                out.append('<blockquote>%s</blockquote>' % markdown('\n'.join(buf), [], used))
            continue
        if l.startswith('|') and i + 1 < n and re.match(r'^\|?\s*:?-{2,}', lines[i + 1]):
            row = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
            head = row(l); i += 2; body = []
            while i < n and lines[i].startswith('|'): body.append(row(lines[i])); i += 1
            t = '<div class="tbl"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (
                ''.join('<th>%s</th>' % inline(c) for c in head),
                ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % inline(c) for c in r) for r in body))
            out.append(t); continue
        lm = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', l)
        if lm:
            ordered = lm.group(2)[0].isdigit(); items = []
            while i < n:
                mm = re.match(r'^\s*([-*]|\d+\.)\s+(.*)$', lines[i])
                if mm and (mm.group(1)[0].isdigit()) == ordered:
                    items.append(mm.group(2)); i += 1
                elif lines[i].startswith('  ') and lines[i].strip() and items:
                    items[-1] += ' ' + lines[i].strip(); i += 1
                else: break
            tag = 'ol' if ordered else 'ul'
            out.append('<%s>%s</%s>' % (tag, ''.join('<li>%s</li>' % inline(it) for it in items), tag)); continue
        buf = [l.strip()]; i += 1
        while i < n and lines[i].strip() and not is_block_start(lines[i]): buf.append(lines[i].strip()); i += 1
        out.append('<p>%s</p>' % inline(' '.join(buf)))
    return '\n'.join(out)

# ------------------------------------------------------------------ helpers

def tag_slug(t): return slugify(t)
def tag_label(t): return TAG_LABEL_FIX.get(t.lower(), t)
def fmt_date(d): return d.strftime('%b %-d, %Y')


def esc_json(o):
    return json.dumps(o, ensure_ascii=False, indent=None).replace('</', '<\\/')


ICON = {
    'arrow': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    'back': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    'search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    'link': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    'x': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.5l11.2 14.5Z"/></svg>',
    'in': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 9h3v12H3V9Zm6 0h2.9v1.7h.1c.4-.8 1.4-1.9 3.2-1.9 3.4 0 4 2.2 4 5.1V21h-3v-6.2c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H9V9Z"/></svg>',
    'fb': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H7.5v3.4h2.8V21H14v-9.1h2.8l.4-3.4H14Z"/></svg>',
    'tg': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.4 3.6 2.9 10.8c-1.2.5-1.2 1.2 0 1.6l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.6-1.4ZM9.6 14.2l8.6-5.4c.4-.3.8-.1.5.2l-7.3 6.6-.3 3.1-1.5-4.5Z"/></svg>',
    'wa': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.3 21.8l5.1-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.7 2.6 4.1 3.6 1.5.7 2.1.7 2.9.6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.4Z"/></svg>',
    'share': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    'list': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    'rss': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.4" fill="currentColor"/></svg>',
}
KING = '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#fff" d="M19 6h2v3h3v2h-3v3h-2v-3h-3V9h3V6Zm-6.6 11.2c2-1.5 4.6-2.2 7.6-2.2s5.6.7 7.6 2.2c1.1.8 1.1 2.2.3 3.2L25 25H15l-2.9-4.6c-.8-1-.8-2.4.3-3.2ZM14 27h12l1 3H13l1-3Zm-2 4.5h16V34H12v-2.5Z"/><circle cx="20" cy="20" r="1.6" fill="#c8f169"/></svg>'


TEAM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2" stroke="#c9bfff"/></svg>'


def avatar(author, logo_svg, size=''):
    if author == 'Dchessking':
        return '<span class="av-a king%s">%s</span>' % (size, KING)
    return '<span class="av-a team%s">%s</span>' % (size, TEAM_SVG)

# ------------------------------------------------------------------ CSS + JS (inlined into every blog page)

CSS = r"""
body{background:var(--surface)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) body{background:var(--bg)}}
:root[data-theme="dark"] body{background:var(--bg)}
/* header */
.bh{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.bh .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:68px}
.bh .lg{display:flex;align-items:center;gap:10px;min-width:0}
.bh .logo{font-size:21px}.bh .mark{width:34px;height:34px;border-radius:11px}.bh .mark svg{width:20px;height:20px}
.bh .sec{font-weight:700;font-size:15px;color:var(--brand-text);text-decoration:none;padding:5px 11px;border-radius:99px;background:var(--lilac)}
.bh nav{display:flex;align-items:center;gap:4px}
.bh nav .pl{padding:9px 13px;border-radius:99px;text-decoration:none;font-weight:600;font-size:15px;color:var(--muted)}
.bh nav .pl:hover{color:var(--ink);background:var(--sunk)}
.bh nav .pl[aria-current]{color:var(--ink)}
.bh nav .btn{margin-left:6px}
.prog{position:absolute;left:0;right:0;bottom:-1px;height:3px;pointer-events:none}
.prog i{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(var(--p,0));background:linear-gradient(90deg,#5b3df5,#8f7bff 60%,#c8f169)}
@media (max-width:760px){.bh nav .pl.hm{display:none}}
@media (max-width:420px){.bh .logo{font-size:19px;gap:8px}.bh .mark{width:30px;height:30px}.bh .sec{font-size:13.5px;padding:4px 9px}.bh nav .btn{padding:9px 14px;font-size:14px;margin-left:0}}

/* shared bits */
.eyb{display:inline-flex;align-items:center;gap:8px;color:var(--brand-text);font-weight:800;font-size:13px;letter-spacing:.1em;text-transform:uppercase}
.eyb i{width:8px;height:8px;border-radius:50%;background:#c8f169;box-shadow:0 0 0 4px color-mix(in srgb,#c8f169 30%,transparent)}
.tg{display:inline-flex;align-items:center;padding:4px 10px;border-radius:99px;font-size:12.5px;font-weight:700;background:var(--lilac);color:var(--brand-text);text-decoration:none;white-space:nowrap}
a.tg:hover{background:color-mix(in srgb,#5b3df5 18%,var(--lilac))}
.meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:14px;font-weight:500}
.meta .who{display:inline-flex;align-items:center;gap:8px;color:var(--ink);font-weight:700}
.meta .dot{width:3px;height:3px;border-radius:50%;background:var(--faint)}
.meta svg{width:15px;height:15px;vertical-align:-2px;margin-right:4px;opacity:.7}
.av-a{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;flex:none;overflow:hidden}
.av-a svg{width:100%;height:100%}
.av-a.king{background:linear-gradient(140deg,#5b3df5,#2a1a8a)}
.av-a.team{background:#5b3df5}.av-a.team svg{width:62%;height:62%}
.av-a.big{width:64px;height:64px}
.av-a.team.big svg{width:56%;height:56%}

/* index hero */
.bhero{position:relative;overflow:hidden;isolation:isolate;padding:clamp(44px,7vw,92px) 0 clamp(26px,4vw,40px)}
.bhero .mesh{position:absolute;inset:-40% -10% auto;height:720px;z-index:-1;pointer-events:none;-webkit-mask:linear-gradient(#000 55%,transparent);mask:linear-gradient(#000 55%,transparent)}
.bhero .mesh i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55}
.bhero .mesh i:nth-child(1){width:560px;height:560px;left:-6%;top:12%;background:var(--lilac)}
.bhero .mesh i:nth-child(2){width:460px;height:460px;right:-4%;top:6%;background:color-mix(in srgb,#5b3df5 22%,transparent)}
.bhero .mesh i:nth-child(3){width:300px;height:300px;left:48%;top:48%;background:color-mix(in srgb,#c8f169 40%,transparent)}
.bhero .row{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:40px;align-items:end}
.bhero h1{font-size:clamp(40px,7vw,86px);line-height:.98;letter-spacing:-.055em;margin-top:16px;max-width:13ch}
.bhero h1 span{background:linear-gradient(100deg,#5b3df5,#8f7bff 55%,#5b3df5);-webkit-background-clip:text;background-clip:text;color:transparent}
.bhero p{color:var(--muted);font-size:clamp(17px,2vw,20px);max-width:54ch;margin:18px 0 0}
.srch{display:flex;align-items:center;gap:10px;background:var(--surface);border:1.5px solid var(--line);border-radius:99px;padding:6px 6px 6px 18px;box-shadow:var(--shadow-sm);transition:border-color .15s,box-shadow .15s}
.srch:focus-within{border-color:#5b3df5;box-shadow:0 0 0 4px color-mix(in srgb,#5b3df5 16%,transparent)}
.srch svg{width:18px;height:18px;color:var(--faint);flex:none}
.srch input{border:0;background:none;font:500 16px var(--f);color:var(--ink);flex:1;min-width:0;padding:10px 0;outline:none}
.srch kbd{font:600 12px var(--mono);color:var(--faint);border:1px solid var(--line);border-radius:8px;padding:4px 8px;margin-right:6px}
.hstats{display:flex;gap:18px;margin-top:14px;color:var(--muted);font-size:14px;font-weight:600;padding-left:6px;flex-wrap:wrap}
.hstats b{color:var(--ink)}
.hstats a{color:var(--muted);text-decoration:none;display:inline-flex;gap:5px;align-items:center}.hstats a:hover{color:var(--brand-text)}
.hstats svg{width:15px;height:15px}

/* chips */
.chips{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 14px;margin:0 -2px;scrollbar-width:none;-webkit-mask:linear-gradient(90deg,#000 92%,transparent)}
.chips::-webkit-scrollbar{display:none}
@media (min-width:761px){.chips{flex-wrap:wrap;overflow:visible;-webkit-mask:none}}
.chip{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:700 14.5px var(--f);text-decoration:none;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s,color .15s,transform .15s}
.chip:hover{border-color:color-mix(in srgb,#5b3df5 40%,var(--line));transform:translateY(-1px)}
.chip small{font:600 12px var(--mono);color:var(--faint)}
.chip[aria-current="true"],.chip[aria-pressed="true"]{background:var(--ink-btn);color:var(--ink-btn-fg);border-color:var(--ink-btn)}
.chip[aria-current="true"] small,.chip[aria-pressed="true"] small{color:color-mix(in srgb,var(--ink-btn-fg) 60%,transparent)}

/* featured */
.feat{display:grid;grid-template-columns:1.35fr 1fr;gap:0;border-radius:32px;overflow:hidden;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;color:inherit;margin:10px 0 56px;transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s}
.feat:hover{transform:translateY(-4px)}
.feat .fi{position:relative;min-height:360px;overflow:hidden;background:#2a1a8a}
.feat .fi img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:left center;display:block;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.feat:hover .fi img{transform:scale(1.03)}
.feat .fb{padding:clamp(24px,3vw,44px);display:flex;flex-direction:column;justify-content:center;gap:16px}
.feat .fb .tp{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.feat .star{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:99px;background:#c8f169;color:#141413;font-size:12.5px;font-weight:800}
.feat h2{font-size:clamp(28px,3.2vw,42px);line-height:1.05;letter-spacing:-.045em}
.feat p{margin:0;color:var(--muted);font-size:17px}
.feat .go{display:inline-flex;align-items:center;gap:8px;font-weight:800;color:var(--brand-text)}
.feat .go svg{width:18px;height:18px;transition:transform .2s}.feat:hover .go svg{transform:translateX(4px)}

/* grid */
.sech{display:flex;justify-content:space-between;align-items:end;gap:16px;margin:0 0 18px}
.sech h2{font-size:clamp(26px,3vw,36px);letter-spacing:-.045em}
.sech span{color:var(--muted);font-weight:600;font-size:14.5px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px 24px;padding-bottom:20px}
.card{display:flex;flex-direction:column;text-decoration:none;color:inherit;border-radius:26px;transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.card:hover{transform:translateY(-4px)}
.card .ci{position:relative;aspect-ratio:1200/630;border-radius:22px;overflow:hidden;background:#2a1a8a;box-shadow:0 1px 2px rgba(20,20,18,.06),0 22px 40px -26px rgba(40,20,120,.45)}
.card .ci img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.card:hover .ci img{transform:scale(1.04)}
.card .ci .rt{position:absolute;right:10px;bottom:10px;padding:4px 10px;border-radius:99px;background:rgba(17,12,44,.72);color:#fff;font-size:12px;font-weight:700;backdrop-filter:blur(6px)}
.card .cb{padding:16px 4px 0;display:flex;flex-direction:column;gap:10px;flex:1}
.card .tgs{display:flex;gap:6px;flex-wrap:wrap}
.card h3{font-size:21px;line-height:1.2;letter-spacing:-.03em}
.card:hover h3{color:var(--brand-text)}
.card p{margin:0;color:var(--muted);font-size:15.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .meta{margin-top:auto;padding-top:4px;font-size:13.5px}
.card[hidden]{display:none}
.empty{display:none;text-align:center;padding:50px 20px;border:1.5px dashed var(--line);border-radius:26px;color:var(--muted)}
.empty b{display:block;color:var(--ink);font-size:20px;margin-bottom:6px}

/* CTA */
.cta{position:relative;overflow:hidden;isolation:isolate;border-radius:32px;padding:clamp(28px,4vw,52px);background:radial-gradient(120% 140% at 100% 0%,#8f7bff 0%,#5b3df5 38%,#2a1a8a 100%);color:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center;margin:40px 0}
.cta::before{content:"";position:absolute;inset:0;z-index:-1;background-image:radial-gradient(rgba(255,255,255,.16) 1.2px,transparent 1.2px);background-size:22px 22px;-webkit-mask:linear-gradient(90deg,transparent,#000)}
.cta::after{content:"";position:absolute;width:260px;height:260px;right:-60px;bottom:-120px;border-radius:50%;background:#c8f169;filter:blur(80px);opacity:.45;z-index:-1}
.cta .k{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#c8f169}
.cta h2{font-size:clamp(28px,3.6vw,44px);line-height:1.04;letter-spacing:-.045em;margin:10px 0 8px;color:#fff}
.cta p{margin:0;color:rgba(255,255,255,.82);max-width:52ch}
.cta .btns{display:flex;flex-direction:column;gap:10px;align-items:stretch}
.cta .btn.lime{background:#c8f169;color:#141413;border-color:#c8f169;box-shadow:0 14px 34px -12px rgba(200,241,105,.7)}
.cta .btn.glass{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.25)}
.cta small{color:rgba(255,255,255,.7);font-size:13px;text-align:center}

/* post */
.crumbs{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--muted);flex-wrap:wrap}
.crumbs a{color:var(--muted);text-decoration:none}.crumbs a:hover{color:var(--brand-text)}
.crumbs .sep{opacity:.5}
.phead{max-width:900px;padding-top:clamp(28px,5vw,60px);text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px}
.phead h1{font-size:clamp(36px,5.6vw,64px);line-height:1.02;letter-spacing:-.05em}
.phead .lede{margin:0;color:var(--muted);font-size:clamp(18px,2.1vw,21px);line-height:1.5;max-width:60ch}
.phead .meta{justify-content:center;font-size:14.5px}
.pcover{max-width:1160px;margin:clamp(26px,4vw,44px) auto 0}
.pcover img{display:block;width:100%;height:auto;aspect-ratio:1200/630;border-radius:clamp(20px,3vw,34px);box-shadow:0 2px 4px rgba(20,20,18,.04),0 40px 80px -40px rgba(40,20,120,.55);background:#2a1a8a}
.playout{display:grid;grid-template-columns:230px minmax(0,720px) 1fr;gap:48px;padding-top:clamp(34px,5vw,60px)}
.prail{position:sticky;top:96px;align-self:start;display:flex;flex-direction:column;gap:22px;max-height:calc(100vh - 120px);overflow:auto;scrollbar-width:none}
.prail h4{margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);font-weight:800}
.toc{display:flex;flex-direction:column;border-left:2px solid var(--line)}
.toc a{display:block;padding:6px 0 6px 14px;margin-left:-2px;border-left:2px solid transparent;color:var(--muted);text-decoration:none;font-size:14px;line-height:1.4;font-weight:500;transition:color .15s,border-color .15s}
.toc a.l3{padding-left:26px;font-size:13.5px}
.toc a:hover{color:var(--ink)}
.toc a.on{color:var(--brand-text);border-left-color:#5b3df5;font-weight:700}
.shr{display:flex;gap:8px;flex-wrap:wrap}
.shr a,.shr button{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--surface);display:grid;place-items:center;color:var(--ink);cursor:pointer;transition:transform .15s,background .15s,color .15s,border-color .15s;padding:0}
.shr a:hover,.shr button:hover{transform:translateY(-2px);background:#5b3df5;color:#fff;border-color:#5b3df5}
.shr svg{width:18px;height:18px}
.shr .ok{background:#c8f169!important;color:#141413!important;border-color:#c8f169!important}
.mtoc{display:none;border:1px solid var(--line);border-radius:18px;background:var(--surface);margin-bottom:28px}
.mtoc summary{list-style:none;cursor:pointer;padding:14px 18px;font-weight:700;display:flex;align-items:center;gap:10px}
.mtoc summary::-webkit-details-marker{display:none}
.mtoc summary svg{width:18px;height:18px;color:var(--brand-text)}
.mtoc summary::after{content:"";margin-left:auto;width:9px;height:9px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg) translateY(-3px);transition:transform .2s}
.mtoc[open] summary::after{transform:rotate(225deg)}
.mtoc .toc{margin:0 18px 16px;border-left-width:2px}

/* prose */
.prose{font-size:18.5px;line-height:1.75;color:color-mix(in srgb,var(--ink) 86%,var(--muted))}
.prose>*:first-child{margin-top:0}
.prose p{margin:0 0 1.25em}
.prose h2{font-size:clamp(26px,3vw,34px);line-height:1.15;letter-spacing:-.04em;margin:1.9em 0 .6em;color:var(--ink);scroll-margin-top:96px;position:relative}
.prose h3{font-size:clamp(20px,2.2vw,23px);line-height:1.25;letter-spacing:-.025em;margin:1.6em 0 .5em;color:var(--ink);scroll-margin-top:96px;position:relative}
.prose h4{font-size:18px;margin:1.4em 0 .4em;color:var(--ink);font-weight:800;letter-spacing:-.01em;position:relative}
.prose .anc{position:absolute;left:-1.1em;color:var(--faint);text-decoration:none;opacity:0;transition:opacity .15s;font-weight:600}
.prose h2:hover .anc,.prose h3:hover .anc{opacity:1}
.prose a{color:var(--brand-text);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-color:color-mix(in srgb,var(--brand-text) 35%,transparent);font-weight:600}
.prose a:hover{text-decoration-color:currentColor}
.prose strong{color:var(--ink);font-weight:700}
.prose ul,.prose ol{margin:0 0 1.35em;padding:0;list-style:none}
.prose li{position:relative;padding-left:1.7em;margin:.45em 0}
.prose ul>li::before{content:"";position:absolute;left:.35em;top:.68em;width:8px;height:8px;border-radius:3px;background:#5b3df5;transform:rotate(45deg)}
.prose ol{counter-reset:o}
.prose ol>li{counter-increment:o}
.prose ol>li::before{content:counter(o);position:absolute;left:0;top:.2em;width:1.5em;height:1.5em;border-radius:50%;background:var(--lilac);color:var(--brand-text);font:800 13px/1.5em var(--f);text-align:center}
.prose code{font-family:var(--mono);font-size:.82em;background:var(--sunk);padding:2px 7px;border-radius:7px;color:var(--ink);word-break:break-word}
.prose pre{background:#141026;color:#e9e6ff;border-radius:18px;padding:18px 20px;overflow-x:auto;font:500 14.5px/1.7 var(--mono);margin:0 0 1.5em;border:1px solid #2a2350}
.prose pre code{background:none;padding:0;color:inherit;font-size:inherit;word-break:normal;white-space:pre}
.prose blockquote{margin:1.6em 0;padding:4px 0 4px 24px;border-left:4px solid #5b3df5;font-size:1.12em;line-height:1.6;color:var(--ink);font-weight:600;letter-spacing:-.01em}
.prose blockquote p:last-child{margin-bottom:0}
.prose hr{border:0;height:1px;background:var(--line);margin:2.4em 0}
.prose img{border-radius:18px}
.tbl{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 1.6em;border:1px solid var(--line);border-radius:18px;background:var(--surface)}
.prose table{width:100%;border-collapse:collapse;font-size:15.5px;line-height:1.5}
.prose th,.prose td{padding:12px 16px;text-align:left;border-top:1px solid var(--line);vertical-align:top}
.prose th{border-top:0;background:var(--sunk);font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:800;white-space:nowrap}
.prose td:first-child{font-weight:700;color:var(--ink)}
.co{border-radius:20px;padding:18px 22px;margin:1.6em 0;font-size:16.5px;line-height:1.65;background:var(--lilac);color:var(--ink);position:relative}
.co p:last-child,.co ul:last-child,.co ol:last-child{margin-bottom:0}
.co p{margin:0 0 .7em}
.co-h{display:flex;align-items:center;gap:8px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;margin-bottom:8px;color:var(--brand-text)}
.co-h::before{content:"";width:18px;height:18px;background:currentColor;-webkit-mask:var(--ic) center/contain no-repeat;mask:var(--ic) center/contain no-repeat;flex:none}
.co-tip{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z'/%3E%3C/svg%3E")}
.co-note{background:var(--sky);--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 11v6M12 7.5h.01'/%3E%3C/svg%3E")}
.co-note .co-h{color:var(--blue)}
.co-warn{background:var(--cream);--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M12 3 2 21h20L12 3zM12 10v5M12 18h.01'/%3E%3C/svg%3E")}
.co-warn .co-h{color:var(--gold)}
.co-ex{background:var(--sunk);border:1px dashed color-mix(in srgb,var(--muted) 40%,transparent);--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M4 19V5M4 19h16M8 15l4-5 3 3 5-7'/%3E%3C/svg%3E")}
.co-ex .co-h{color:var(--muted)}
.co-tldr{background:var(--surface);border:1.5px solid color-mix(in srgb,#5b3df5 30%,var(--line));box-shadow:0 18px 40px -28px rgba(91,61,245,.55);padding:22px 24px;--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M12 2l2.4 7.6H22l-6.2 4.6 2.4 7.6L12 17.2l-6.2 4.6 2.4-7.6L2 9.6h7.6z'/%3E%3C/svg%3E")}
.co-tldr ul{margin:0}
.co-tldr li{margin:.35em 0}
.co-tldr ul>li::before{background:#c8f169;border-radius:50%;transform:none;width:9px;height:9px;top:.62em;box-shadow:0 0 0 3px color-mix(in srgb,#c8f169 35%,transparent)}
.icta{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:20px;background:linear-gradient(100deg,var(--lilac),color-mix(in srgb,#c8f169 20%,var(--surface)));margin:2em 0;text-decoration:none!important;color:var(--ink)!important;font-weight:500!important;border:1px solid color-mix(in srgb,#5b3df5 16%,var(--line))}
.icta .ic{width:44px;height:44px;border-radius:14px;background:#5b3df5;display:grid;place-items:center;flex:none;box-shadow:0 10px 24px -10px #5b3df5}
.icta .ic svg{width:24px;height:24px}
.icta span{flex:1;font-size:16px;line-height:1.45}.icta b{display:block;font-size:17px}
.icta em{font-style:normal;font-weight:800;color:var(--brand-text);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.icta em svg{width:16px;height:16px}

/* post end */
.pend{margin-top:44px;padding-top:28px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.pend .tgs{display:flex;gap:6px;flex-wrap:wrap}
.pend .shr b{align-self:center;margin-right:4px;font-size:14px;color:var(--muted)}
@media (max-width:640px){.pend .shr b{display:none}.shr a,.shr button{width:42px;height:42px}}
.abox{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;padding:24px;border-radius:26px;border:1px solid var(--line);background:linear-gradient(160deg,var(--surface),var(--sunk));margin-top:28px}
.abox .k{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--faint)}
.abox h3{font-size:22px;letter-spacing:-.03em;margin:2px 0 2px}
.abox .role{color:var(--brand-text);font-weight:700;font-size:14.5px}
.abox p{margin:10px 0 0;color:var(--muted);font-size:15.5px;line-height:1.6}
.back{display:inline-flex;align-items:center;gap:8px;margin-top:26px;font-weight:700;color:var(--muted);text-decoration:none;font-size:15px;padding:10px 16px 10px 12px;border-radius:99px;border:1px solid var(--line);background:var(--surface)}
.back:hover{color:var(--ink);border-color:color-mix(in srgb,#5b3df5 40%,var(--line))}
.back svg{width:17px;height:17px;transition:transform .2s}.back:hover svg{transform:translateX(-3px)}
.rel{background:var(--bg);border-top:1px solid var(--line);margin-top:70px;padding:56px 0 30px}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .rel{background:var(--surface)}}
:root[data-theme="dark"] .rel{background:var(--surface)}

/* footer */
.bf{border-top:1px solid var(--line);padding:40px 0 56px;color:var(--faint);font-size:14.5px}
.bf .wrap{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-start}
.bf .fby{display:flex;flex-direction:column;gap:10px}
.bf .logo{font-size:20px;color:var(--ink)}.bf .mark{width:32px;height:32px;border-radius:10px}.bf .mark svg{width:19px;height:19px}
.bf nav{display:flex;gap:6px 20px;flex-wrap:wrap;max-width:620px;justify-content:flex-end}
.bf nav a{color:var(--muted);text-decoration:none;font-weight:600}.bf nav a:hover{color:var(--ink)}

@media (max-width:1100px){.playout{grid-template-columns:210px minmax(0,1fr);gap:40px}.playout>.sp{display:none}}
@media (max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.feat{grid-template-columns:1fr}.feat .fi{min-height:0;aspect-ratio:1200/630}.bhero .row{grid-template-columns:1fr;gap:24px}}
@media (max-width:900px){.playout{grid-template-columns:minmax(0,1fr)}.prail{display:none}.mtoc{display:block}.prose .anc{display:none}}
@media (max-width:640px){
  .wrap{padding-inline:16px}
  .grid{grid-template-columns:1fr;gap:30px}
  .feat{border-radius:26px;margin-bottom:40px}.feat .fb{padding:22px 20px 24px;gap:12px}
  .cta{grid-template-columns:1fr;border-radius:26px}.cta .btns{align-items:stretch}
  .phead{text-align:left;align-items:flex-start}.phead .meta{justify-content:flex-start}
  .prose{font-size:17.5px;line-height:1.72}
  .prose blockquote{padding-left:18px;font-size:1.06em}
  .co{padding:16px 18px}.co-tldr{padding:18px}
  .abox{grid-template-columns:1fr;padding:20px}
  .icta{flex-wrap:wrap}.icta em{width:100%;padding-left:60px;margin-top:-6px}
  .pend{flex-direction:column;align-items:flex-start}
  .bf nav{justify-content:flex-start}
  .srch kbd{display:none}
}
/* phones: 44px tap targets without changing the look, no dangling separators */
@media (hover:none){.prose .anc{display:none}}
@media (max-width:760px){
  .bh .sec,.crumbs a,a.tg,.hstats a{position:relative}
  .bh .sec::after,.crumbs a::after,a.tg::after,.hstats a::after{content:"";position:absolute;left:50%;top:50%;width:max(100%,44px);height:max(100%,44px);transform:translate(-50%,-50%)}
  .chip{min-height:44px}
  .srch input{min-height:44px}
  .shr a,.shr button{width:44px;height:44px}
  .toc a{padding-top:12px;padding-bottom:12px}
  .mtoc summary{min-height:44px}
}
@media (max-width:560px){.meta{gap:6px 14px}.meta .dot{display:none}}
"""

JS_COMMON = r"""
(function(){var d=document;
d.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var u=location.href.split('#')[0];
 (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).catch(function(){var t=d.createElement('textarea');t.value=u;d.body.appendChild(t);t.select();try{d.execCommand('copy')}catch(e){}t.remove()}).finally(function(){b.classList.add('ok');b.setAttribute('aria-label','Link copied');setTimeout(function(){b.classList.remove('ok');b.setAttribute('aria-label','Copy link')},1600)})})});
})();
"""

JS_POST = r"""
(function(){var d=document,bar=d.querySelector('.prog'),art=d.querySelector('.prose');
var u=encodeURIComponent(location.href.split('#')[0]),t=encodeURIComponent(d.querySelector('h1').textContent);
var S={x:'https://twitter.com/intent/tweet?text='+t+'&url='+u,in:'https://www.linkedin.com/sharing/share-offsite/?url='+u,fb:'https://www.facebook.com/sharer/sharer.php?u='+u,tg:'https://t.me/share/url?url='+u+'&text='+t,wa:'https://wa.me/?text='+t+'%20'+u};
d.querySelectorAll('[data-share]').forEach(function(a){var k=a.getAttribute('data-share');if(S[k])a.href=S[k]});
var ns=d.querySelectorAll('[data-native]');if(navigator.share){ns.forEach(function(b){b.hidden=false;b.addEventListener('click',function(){navigator.share({title:d.title,url:location.href.split('#')[0]}).catch(function(){})})})}
function prog(){if(!art||!bar)return;var r=art.getBoundingClientRect(),h=r.height-innerHeight*.6,p=Math.min(1,Math.max(0,-r.top/(h>0?h:1)));bar.style.setProperty('--p',p.toFixed(4))}
addEventListener('scroll',prog,{passive:true});addEventListener('resize',prog);prog();
var links=[].slice.call(d.querySelectorAll('.prail .toc a')),heads=links.map(function(a){return d.getElementById(a.getAttribute('href').slice(1))}).filter(Boolean);
function spy(){var cur=0;for(var i=0;i<heads.length;i++){if(heads[i].getBoundingClientRect().top<140)cur=i}links.forEach(function(a,i){a.classList.toggle('on',i===cur)})}
if(heads.length){addEventListener('scroll',spy,{passive:true});spy()}
d.querySelectorAll('.mtoc a').forEach(function(a){a.addEventListener('click',function(){a.closest('details').open=false})});
})();
"""

JS_INDEX = r"""
(function(){var d=document,q=d.getElementById('q'),cards=[].slice.call(d.querySelectorAll('.grid .card')),chips=[].slice.call(d.querySelectorAll('.chips [data-tag]')),
feat=d.querySelector('.featwrap'),empty=d.querySelector('.empty'),head=d.querySelector('.sech h2'),cnt=d.querySelector('.sech span'),tag='',H=head?head.textContent:'';
function run(){var s=(q&&q.value||'').trim().toLowerCase(),n=0,filtering=!!(s||tag);
 cards.forEach(function(c){var ok=(!tag||(' '+c.dataset.tags+' ').indexOf(' '+tag+' ')>-1)&&(!s||c.dataset.q.indexOf(s)>-1);var show=ok&&(filtering||!c.classList.contains('isfeat'));c.hidden=!show;if(show)n++});
 if(feat)feat.hidden=filtering;if(empty)empty.style.display=n?'none':'block';
 if(head){var on=chips.filter(function(c){return c.dataset.tag===tag})[0];head.textContent=s?'Results':(tag&&on?on.dataset.label:H)}
 if(cnt)cnt.textContent=n+(n===1?' post':' posts');
 chips.forEach(function(c){c.setAttribute('aria-pressed',c.dataset.tag===tag?'true':'false')})}
chips.forEach(function(c){c.addEventListener('click',function(e){e.preventDefault();tag=c.dataset.tag;run();try{history.replaceState(null,'',tag?'#'+tag:location.pathname)}catch(_){}})});
if(q){q.addEventListener('input',run);d.addEventListener('keydown',function(e){if(e.key==='/'&&d.activeElement!==q){e.preventDefault();q.focus()}if(e.key==='Escape'&&d.activeElement===q){q.value='';run();q.blur()}})}
var h=decodeURIComponent(location.hash.slice(1));if(h&&chips.some(function(c){return c.dataset.tag===h})){tag=h;run()}
})();
"""

# ------------------------------------------------------------------ page parts

class Target:
    """URL scheme for one output (live server or the static demo)."""
    def __init__(self, live, site_urls, logo_svg):
        self.live = live; self.site = site_urls; self.logo = logo_svg
    def post(self, slug): return '/blog/' + slug if self.live else slug + '.html'
    def tag(self, t): return '/blog/tag/' + tag_slug(t) if self.live else 'tag-' + tag_slug(t) + '.html'
    def index(self): return '/blog' if self.live else 'index.html'
    def media(self, f): return '/media/blog/' + f if self.live else '../media/blog/' + f
    def u(self, key): return self.site[key]
    def rss(self): return '/rss.xml' if self.live else '../rss.xml'


def abs_live(path): return '{{BASE_URL}}' + path


def head(T, title, desc, canonical_path, og_image=None, og_type='website', extra='', jsonld=None, robots=None):
    img = abs_live('/media/blog/' + og_image) if og_image else abs_live('/media/blog/joinvoo-logo.png')
    h = ['<title>%s</title>' % E(title),
         '<meta name="description" content="%s">' % E(desc),
         '<link rel="canonical" href="%s">' % abs_live(canonical_path),
         '<meta name="theme-color" content="#ffffff">',
         '<meta name="robots" content="%s">' % (robots or 'index,follow,max-image-preview:large'),
         '<meta property="og:site_name" content="Joinvoo">',
         '<meta property="og:type" content="%s">' % og_type,
         '<meta property="og:title" content="%s">' % E(title),
         '<meta property="og:description" content="%s">' % E(desc),
         '<meta property="og:url" content="%s">' % abs_live(canonical_path),
         '<meta property="og:image" content="%s">' % img,
         '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' if og_image else '',
         '<meta property="og:image:alt" content="%s">' % E(title),
         '<meta name="twitter:card" content="summary_large_image">',
         '<meta name="twitter:title" content="%s">' % E(title),
         '<meta name="twitter:description" content="%s">' % E(desc),
         '<meta name="twitter:image" content="%s">' % img,
         '<link rel="alternate" type="application/rss+xml" title="Joinvoo Blog" href="%s">' % T.rss(),
         '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Crect width=%2724%27 height=%2724%27 rx=%277%27 fill=%27%235b3df5%27/%3E%3Ccircle cx=%279%27 cy=%2712%27 r=%274.6%27 fill=%27none%27 stroke=%27white%27 stroke-width=%272.2%27/%3E%3Ccircle cx=%2715%27 cy=%2712%27 r=%274.6%27 fill=%27none%27 stroke=%27%23c9bfff%27 stroke-width=%272.2%27/%3E%3C/svg%3E">',
         '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap">',
         extra]
    if jsonld:
        for j in (jsonld if isinstance(jsonld, list) else [jsonld]):
            h.append('<script type="application/ld+json">%s</script>' % esc_json(j))
    return '\n'.join(x for x in h if x)


def header(T, progress=False, current='blog'):
    return ('<header class="bh"><div class="wrap"><div class="lg"><a class="logo" href="%s" aria-label="Joinvoo home">%sJoinvoo</a><a class="sec" href="%s">Blog</a></div>'
            '<nav aria-label="Main"><a class="pl hm" href="%s">Home</a><a class="pl hm" href="%s">Guide</a><a class="pl hm" href="%s"%s>Blog</a><a class="pl hm" href="%s">Log in</a>'
            '<a class="btn sm violet" href="%s">Start free</a></nav></div>%s</header>') % (
        T.u('HOME'), T.logo, T.index(), T.u('HOME'), T.u('GUIDE'), T.index(), ' aria-current="page"' if current == 'blog' else '', T.u('LOGIN'), T.u('SIGNUP'),
        '<div class="prog" aria-hidden="true"><i></i></div>' if progress else '')


def footer(T):
    # Note: the result is concatenated into the page's %-format strings, so literal % (e.g. CSS 100%) must be doubled.
    links = [('HOME', 'Home'), ('GUIDE', 'Guide'), (None, 'Blog'), ('TERMS', 'Terms'), ('PRIVACY', 'Privacy'), ('REFUNDS', 'Refunds'), ('AUP', 'Acceptable use'),
             ('COOKIES', 'Cookies'), ('REFTERMS', 'Referral terms'), ('LOGIN', 'Log in'), ('SIGNUP', 'Start free')]
    nav = ''.join('<a href="%s">%s</a>' % (T.u(k) if k else T.index(), t) for k, t in links)
    return ('<footer class="bf"><div class="wrap"><div class="fby"><a class="logo" href="%s">%sJoinvoo</a><span>© Joinvoo · By Zedapex company</span></div>'
            '<nav aria-label="Footer">%s<a href="%s">RSS</a></nav>%s</div></footer>') % (T.u('HOME'), T.logo, nav, T.rss(), VOOFOOT.replace('%', '%%'))


def cta(T, kicker='Start tracking free'):
    return ('<section class="cta"><div><span class="k">%s</span><h2>Make your ads buy real people, not noise.</h2>'
            '<p>Joinvoo tracks every Telegram join, bot start and deposit from Meta, TikTok and Snapchat, filters the fakes, and sends the real ones back server-side. Your first 500 joins are free.</p></div>'
            '<div class="btns"><a class="btn lg lime" href="%s">Start free %s</a><a class="btn glass" href="%s">Read the setup guide</a><small>No card needed · about 10 minutes to set up</small></div></section>') % (
        E(kicker), T.u('SIGNUP'), ICON['arrow'], T.u('GUIDE'))


def inline_cta(T):
    return ('<a class="icta" href="%s"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2" stroke="#c9bfff"/></svg></span>'
            '<span><b>Track this in Joinvoo, free.</b>Every join, start and deposit matched to the ad that drove it. First 500 joins on us.</span><em>Start free %s</em></a>') % (T.u('SIGNUP'), ICON['arrow'])


def card(T, p, cls=''):
    tags = ''.join('<span class="tg">%s</span>' % E(tag_label(t)) for t in p['tags'][:2])
    q = (p['title'] + ' ' + p['description'] + ' ' + ' '.join(p['tags']) + ' ' + p['author']).lower()
    return ('<a class="card%s" href="%s"%s data-tags="%s" data-q="%s"><div class="ci"><img src="%s" alt="" width="1200" height="630" loading="lazy" decoding="async"><span class="rt">%d min read</span></div>'
            '<div class="cb"><div class="tgs">%s</div><h3>%s</h3><p>%s</p><div class="meta"><span class="who">%s%s</span><span class="dot"></span><time datetime="%s">%s</time></div></div></a>') % (
        cls, T.post(p['slug']), ' hidden' if 'isfeat' in cls else '', ' '.join(tag_slug(t) for t in p['tags']), E(q), T.media(p['cover']), p['reading_time'], tags, E(p['title']), E(p['description']),
        avatar(p['author'], T.logo), E(p['author']), p['date'], fmt_date(p['date_obj']))


def chips(T, all_tags, counts, active=None, interactive=True):
    out = ['<nav class="chips" aria-label="Filter by topic">']
    allc = ' aria-pressed="%s"' % ('false' if active else 'true') if interactive else (' aria-current="true"' if not active else '')
    out.append('<a class="chip" href="%s" data-tag="" data-label="Latest posts"%s>All <small>%d</small></a>' % (T.index(), allc, sum(1 for _ in counts.get('__all__', []))))
    for t in all_tags:
        s = tag_slug(t); on = (active == s)
        attr = (' aria-pressed="%s"' % ('true' if on else 'false')) if interactive else (' aria-current="true"' if on else '')
        out.append('<a class="chip" href="%s" data-tag="%s" data-label="%s"%s>%s <small>%d</small></a>' % (T.tag(t), s, E(tag_label(t)), attr, E(tag_label(t)), len(counts[t])))
    out.append('</nav>')
    return ''.join(out)


def page(T, head_html, body, scripts=''):
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">%s'
            '<style>%s%s</style></head><body>%s<script>%s%s</script></body></html>') % (head_html, T.shared, CSS, body, JS_COMMON, scripts)


def publisher():
    return {'@type': 'Organization', 'name': 'Joinvoo', 'url': '{{BASE_URL}}/', 'logo': {'@type': 'ImageObject', 'url': '{{BASE_URL}}/media/blog/joinvoo-logo.png', 'width': 512, 'height': 512},
            'parentOrganization': {'@type': 'Organization', 'name': 'Zedapex'}}


def author_ld(name):
    a = AUTHORS[name]
    if a['kind'] == 'Person':
        return {'@type': 'Person', 'name': a['name'], 'jobTitle': a['role'], 'worksFor': {'@type': 'Organization', 'name': 'Zedapex'}, 'url': '{{BASE_URL}}/blog'}
    return {'@type': 'Organization', 'name': a['name'], 'url': '{{BASE_URL}}/blog'}

# ------------------------------------------------------------------ renderers

def render_index(T, posts, all_tags, counts):
    feat = next((p for p in posts if p['featured']), posts[0])
    fb = ('<div class="featwrap"><a class="feat" href="%s"><div class="fi"><img src="%s" alt="" width="1200" height="630" fetchpriority="high"></div>'
          '<div class="fb"><div class="tp"><span class="star">★ Featured</span>%s</div><h2>%s</h2><p>%s</p>'
          '<div class="meta"><span class="who">%s%s</span><span class="dot"></span><time datetime="%s">%s</time><span class="dot"></span><span>%s%d min read</span></div>'
          '<span class="go">Read the post %s</span></div></a></div>') % (
        T.post(feat['slug']), T.media(feat['cover']), ''.join('<span class="tg">%s</span>' % E(tag_label(t)) for t in feat['tags'][:2]),
        E(feat['title']), E(feat['description']), avatar(feat['author'], T.logo), E(feat['author']), feat['date'], fmt_date(feat['date_obj']), ICON['clock'], feat['reading_time'], ICON['arrow'])
    grid = ''.join(card(T, p, ' isfeat' if p is feat else '') for p in posts)
    n_rest = len(posts) - 1
    authors = sorted({p['author'] for p in posts})
    body = (header(T) + '<main>'
            '<section class="bhero"><div class="mesh" aria-hidden="true"><i></i><i></i><i></i></div><div class="wrap"><div class="row"><div>'
            '<span class="eyb"><i></i>The Joinvoo blog</span><h1>Field notes for buyers who run ads to <span>Telegram.</span></h1>'
            '<p>Tracking, server-side events, fake-lead filtering and scaling, written by people who buy traffic for a living. No fluff, no fake case studies.</p></div>'
            '<div><label class="srch"><span class="sr">Search posts</span>%s<input id="q" type="search" placeholder="Search posts" autocomplete="off"><kbd>/</kbd></label>'
            '<div class="hstats"><span><b>%d</b> guides</span><span><b>%d</b> topics</span><a href="%s">%sRSS</a></div></div></div></div></section>'
            '<div class="wrap">%s%s'
            '<div class="sech"><h2>Latest posts</h2><span>%d posts</span></div>'
            '<div class="grid">%s</div><div class="empty"><b>Nothing matches that yet.</b>Try another word or pick a topic above.</div>'
            '%s</div></main>' + footer(T)) % (
        ICON['search'], len(posts), len(all_tags), T.rss(), ICON['rss'], chips(T, all_tags, counts), fb, n_rest, grid, cta(T))
    ld = [{'@context': 'https://schema.org', '@type': 'Blog', 'name': 'Joinvoo Blog', 'url': '{{BASE_URL}}/blog',
           'description': 'Guides for media buyers who run Meta, TikTok and Snapchat ads to Telegram channels, groups and bots.',
           'publisher': publisher(),
           'blogPost': [{'@type': 'BlogPosting', 'headline': p['title'], 'url': '{{BASE_URL}}/blog/' + p['slug'], 'datePublished': p['date'],
                         'image': '{{BASE_URL}}/media/blog/' + p['cover_jpg'], 'author': author_ld(p['author'])} for p in posts]}]
    hh = head(T, 'Joinvoo Blog · Telegram ads, tracking and media buying', 'Practical guides for media buyers who run Meta, TikTok and Snapchat ads to Telegram: join tracking, Conversions API, postbacks, fake-lead filtering and scaling.',
              '/blog', feat['cover_jpg'], jsonld=ld)
    return page(T, hh, body, JS_INDEX)


def render_tag(T, tag, posts, all_tags, counts):
    tp = counts[tag]; lab = tag_label(tag)
    body = (header(T) + '<main><section class="bhero"><div class="mesh" aria-hidden="true"><i></i><i></i><i></i></div><div class="wrap">'
            '<nav class="crumbs" aria-label="Breadcrumb"><a href="%s">Blog</a><span class="sep">/</span><span>Topics</span></nav>'
            '<h1 style="max-width:none"><span>%s</span></h1><p>%d %s on %s for media buyers who send traffic to Telegram.</p></div></section>'
            '<div class="wrap">%s<div class="sech"><h2>%s</h2><span>%d posts</span></div><div class="grid">%s</div>%s</div></main>' + footer(T)) % (
        T.index(), E(lab), len(tp), 'guide' if len(tp) == 1 else 'guides', E(lab), chips(T, all_tags, counts, tag_slug(tag), interactive=False), E(lab), len(tp),
        ''.join(card(T, p) for p in tp), cta(T))
    ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': '%s · Joinvoo Blog' % lab, 'url': '{{BASE_URL}}/blog/tag/' + tag_slug(tag),
          'isPartOf': {'@type': 'Blog', 'name': 'Joinvoo Blog', 'url': '{{BASE_URL}}/blog'}}
    hh = head(T, '%s · Joinvoo Blog' % lab, 'Guides about %s for media buyers who run Meta, TikTok and Snapchat ads to Telegram channels, groups and bots.' % lab,
              '/blog/tag/' + tag_slug(tag), tp[0]['cover_jpg'], jsonld=ld)
    return page(T, hh, body)


def fill_links(s, T):
    s = re.sub(r'\{\{POST:([a-z0-9-]+)\}\}', lambda m: T.post(m.group(1)), s)
    s = re.sub(r'\{\{TAG:([^}]+)\}\}', lambda m: T.tag(m.group(1)), s)
    for k in ('GUIDE', 'SIGNUP', 'LOGIN', 'HOME'):
        s = s.replace('{{%s}}' % k, T.u(k))
    return s.replace('{{BLOG}}', T.index())


BODY_DOC = '''<!--
Joinvoo blog article body: %(title)s
Generated by build/blog/blog.py from build/blog/%(slug)s.md. Article HTML only, no site chrome (no header, cover, author box or CTA).
Wrap it in an element with class "prose" (or style these classes yourself):
  h2[id], h3[id], h4      section headings; ids match the slug of the heading text
  a.anc                   "#" anchor link inside each heading (hide it if you don't want it)
  p, ul>li, ol>li         body text and lists; strong, em, code inline
  blockquote              pull quote
  pre[data-lang] > code   code block
  div.tbl > table         table in a horizontally scrollable wrapper (thead th, tbody td)
  aside.co                callout box; b.co-h is its label, followed by normal content
    .co-tldr              "Key takeaways" box (always first in a post)
    .co-tip / .co-note / .co-warn   tip, note and warning callouts
    .co-ex                "Hypothetical example" box
  a.xref                  link to another blog post; href is /blog/<slug> (map to your reader view if you like)
  hr                      divider
Links to the site use live paths: /guide, /signup, /blog/<slug>.
-->
'''


def body_html_for(T, p, posts, cta=True):
    toc = []
    body_html = markdown(p['body'], toc)
    if cta:
        h2s = [m.start() for m in re.finditer(r'<h2 ', body_html)]
        if len(h2s) >= 3:
            at = h2s[min(3, len(h2s) - 1)]
            body_html = body_html[:at] + inline_cta(T) + body_html[at:]
    titles = {q['slug']: q['title'] for q in posts}
    body_html = re.sub(r'(?<!href=")\{\{POST:([a-z0-9-]+)\}\}', lambda m: '<a class="xref" href="{{POST:%s}}">%s</a>' % (m.group(1), E(titles.get(m.group(1), m.group(1)))), body_html)
    body_html = re.sub(r'(?<!href=")\{\{GUIDE\}\}', '<a href="{{GUIDE}}">setup guide</a>', body_html)
    body_html = re.sub(r'(?<!href=")\{\{SIGNUP\}\}', '<a href="{{SIGNUP}}">sign up page</a>', body_html)
    return fill_links(body_html, T), toc


def render_post(T, p, posts):
    body_html, toc = body_html_for(T, p, posts)
    toc_html = ''.join('<a href="#%s" class="l%d">%s</a>' % (i, lvl, t) for lvl, i, t in toc if lvl == 2)
    a = AUTHORS[p['author']]
    # related: shared tags first, then newest
    others = [q for q in posts if q is not p]
    others.sort(key=lambda q: (-len(set(q['tags']) & set(p['tags'])), -q['date_obj'].toordinal()))
    rel = others[:3]
    share = ('<div class="shr">'
             '<a data-share="x" href="https://twitter.com/intent/tweet" target="_blank" rel="noopener" aria-label="Share on X">%s</a>'
             '<a data-share="in" href="https://www.linkedin.com/sharing/share-offsite/" target="_blank" rel="noopener" aria-label="Share on LinkedIn">%s</a>'
             '<a data-share="fb" href="https://www.facebook.com/sharer/sharer.php" target="_blank" rel="noopener" aria-label="Share on Facebook">%s</a>'
             '<a data-share="tg" href="https://t.me/share/url" target="_blank" rel="noopener" aria-label="Share on Telegram">%s</a>'
             '<a data-share="wa" href="https://wa.me/" target="_blank" rel="noopener" aria-label="Share on WhatsApp">%s</a>'
             '<button type="button" data-copy aria-label="Copy link">%s</button>'
             '<button type="button" data-native hidden aria-label="Share">%s</button></div>') % (ICON['x'], ICON['in'], ICON['fb'], ICON['tg'], ICON['wa'], ICON['link'], ICON['share'])
    tags = ''.join('<a class="tg" href="%s">%s</a>' % (T.tag(t), E(tag_label(t))) for t in p['tags'])
    body = (header(T, progress=True) + '<main><article itemscope itemtype="https://schema.org/BlogPosting">'
            '<div class="wrap phead"><nav class="crumbs" aria-label="Breadcrumb"><a href="%s">Blog</a><span class="sep">/</span><a href="%s">%s</a></nav>'
            '<h1 itemprop="headline">%s</h1><p class="lede">%s</p>'
            '<div class="meta"><span class="who">%s<span itemprop="author">%s</span></span><span class="dot"></span><time datetime="%s" itemprop="datePublished">%s</time><span class="dot"></span><span>%s%d min read</span></div></div>'
            '<div class="wrap"><div class="pcover"><img src="%s" alt="%s" width="1200" height="630" fetchpriority="high"></div></div>'
            '<div class="wrap playout"><aside class="prail" aria-label="On this page"><div><h4>On this page</h4><nav class="toc">%s</nav></div><div><h4>Share</h4>%s</div></aside>'
            '<div class="pbody"><details class="mtoc"><summary>%sOn this page</summary><nav class="toc">%s</nav></details>'
            '<div class="prose" itemprop="articleBody">%s</div>'
            '<div class="pend"><div class="tgs">%s</div>%s</div>'
            '<section class="abox" aria-label="About the author">%s<div><span class="k">Written by</span><h3>%s</h3><div class="role">%s</div><p>%s</p></div></section>'
            '%s<a class="back" href="%s">%sBack to blog</a></div><div class="sp"></div></div></article>'
            '<section class="rel"><div class="wrap"><div class="sech"><h2>Keep reading</h2><span><a class="tg" href="%s">All posts</a></span></div><div class="grid">%s</div></div></section>'
            '</main>' + footer(T)) % (
        T.index(), T.tag(p['tags'][0]), E(tag_label(p['tags'][0])), E(p['title']), E(p['description']),
        avatar(p['author'], T.logo), E(p['author']), p['date'], fmt_date(p['date_obj']), ICON['clock'], p['reading_time'],
        T.media(p['cover']), E(p['title']), toc_html, share, ICON['list'], toc_html, body_html, tags, share.replace('<div class="shr">', '<div class="shr"><b>Share</b>', 1),
        avatar(p['author'], T.logo, ' big'), E(a['name']), E(a['role']), E(a['bio']), cta(T), T.index(), ICON['back'],
        T.index(), ''.join(card(T, q) for q in rel))
    url = '/blog/' + p['slug']
    ld = [{'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': p['title'], 'description': p['description'],
           'image': ['{{BASE_URL}}/media/blog/' + p['cover_jpg']], 'datePublished': p['date'], 'dateModified': p.get('updated') or p['date'],
           'author': author_ld(p['author']), 'publisher': publisher(), 'mainEntityOfPage': {'@type': 'WebPage', '@id': '{{BASE_URL}}' + url},
           'url': '{{BASE_URL}}' + url, 'keywords': ', '.join(p['tags']), 'articleSection': tag_label(p['tags'][0]), 'wordCount': p['words'],
           'timeRequired': 'PT%dM' % p['reading_time'], 'inLanguage': 'en'},
          {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
              {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': '{{BASE_URL}}/'},
              {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': '{{BASE_URL}}/blog'},
              {'@type': 'ListItem', 'position': 3, 'name': p['title'], 'item': '{{BASE_URL}}' + url}]}]
    extra = ('<meta property="article:published_time" content="%s">' % p['date'] + ''.join('<meta property="article:tag" content="%s">' % E(t) for t in p['tags']) +
             '<meta property="article:author" content="%s"><meta name="author" content="%s">' % (E(p['author']), E(p['author'])))
    hh = head(T, '%s · Joinvoo Blog' % p['title'], p['description'], url, p['cover_jpg'], og_type='article', extra=extra, jsonld=ld)
    return page(T, hh, body, JS_POST)


def sitemap(posts, tags, counts):
    today = dt.date.today().isoformat()
    newest = max(p['date'] for p in posts)
    pages = [('/', today, 'weekly', '1.0'), ('/guide', today, 'monthly', '0.9'), ('/signup', today, 'yearly', '0.7'), ('/login', today, 'yearly', '0.3'), ('/affiliates', today, 'monthly', '0.6'),
             ('/blog', newest, 'weekly', '0.9')]
    pages += [('/blog/' + p['slug'], p.get('updated') or p['date'], 'monthly', '0.8') for p in posts]
    pages += [('/blog/tag/' + tag_slug(t), max(q['date'] for q in counts[t]), 'weekly', '0.5') for t in tags]
    pages += [('/' + n, today, 'yearly', '0.2') for n in ('terms', 'privacy', 'refunds', 'acceptable-use', 'cookies', 'referral-terms')]
    rows = ''.join('<url><loc>{{BASE_URL}}%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>\n' % (E(u), d, f, pr) for u, d, f, pr in pages)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % rows


def rss(posts):
    def rfc(d): return dt.datetime(d.year, d.month, d.day, 9, 0, tzinfo=dt.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')
    items = ''.join(
        '<item><title>%s</title><link>{{BASE_URL}}/blog/%s</link><guid isPermaLink="true">{{BASE_URL}}/blog/%s</guid><pubDate>%s</pubDate>'
        '<dc:creator>%s</dc:creator>%s<description>%s</description><enclosure url="{{BASE_URL}}/media/blog/%s" type="image/jpeg" length="%d"/></item>\n' % (
            E(p['title']), p['slug'], p['slug'], rfc(p['date_obj']), E(p['author']), ''.join('<category>%s</category>' % E(t) for t in p['tags']),
            E(p['description']), p['cover_jpg'], p.get('cover_jpg_bytes', 0)) for p in posts)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n<channel>'
            '<title>Joinvoo Blog</title><link>{{BASE_URL}}/blog</link><atom:link href="{{BASE_URL}}/rss.xml" rel="self" type="application/rss+xml"/>'
            '<description>Guides for media buyers who run Meta, TikTok and Snapchat ads to Telegram channels, groups and bots.</description><language>en</language>'
            '<lastBuildDate>%s</lastBuildDate><image><url>{{BASE_URL}}/media/blog/joinvoo-logo.png</url><title>Joinvoo Blog</title><link>{{BASE_URL}}/blog</link></image>\n%s</channel></rss>\n') % (
        rfc(posts[0]['date_obj']), items)

# ------------------------------------------------------------------ entry point

def build(root, live_urls, demo_urls, shared_css, logo_svg):
    """Generate the blog into public/ and dist/. Returns a short summary string."""
    src = os.path.join(root, 'build', 'blog'); pub = os.path.join(root, 'public'); dist = os.path.join(root, 'dist')
    media = os.path.join(pub, 'media', 'blog')
    posts = [parse_post(os.path.join(src, f)) for f in sorted(os.listdir(src)) if f.endswith('.md') and not f.startswith('_')]
    if not posts: return 'blog: no posts'
    slugs = [p['slug'] for p in posts]
    if len(set(slugs)) != len(slugs): raise ValueError('blog: duplicate slugs')
    posts.sort(key=lambda p: (p['date_obj'], p['slug']), reverse=True)
    # covers: draw any missing ones (Pillow); posts point at <stem>.webp and use <stem>.jpg for og:image/RSS
    drawn = []
    try:
        import sys; sys.path.insert(0, src); import covers
        drawn = covers.ensure(media, [os.path.splitext(p['cover'])[0] for p in posts])
    except ImportError as e:
        print('blog: covers not drawn (Pillow missing?):', e)
    for p in posts:
        stem = os.path.splitext(p['cover'])[0]
        p['cover_jpg'] = stem + '.jpg' if os.path.exists(os.path.join(media, stem + '.jpg')) else p['cover']
        jp = os.path.join(media, p['cover_jpg']); p['cover_jpg_bytes'] = os.path.getsize(jp) if os.path.exists(jp) else 0
        if not os.path.exists(os.path.join(media, p['cover'])): print('blog: WARNING missing cover', p['cover'])
        for m in re.finditer(r'\{\{POST:([a-z0-9-]+)\}\}', p['body']):
            if m.group(1) not in slugs: print('blog: WARNING %s links to unknown post %s' % (p['slug'], m.group(1)))
    counts = {'__all__': posts}
    for p in posts:
        for t in p['tags']: counts.setdefault(t, []).append(p)
    all_tags = sorted((t for t in counts if t != '__all__'), key=lambda t: (-len(counts[t]), t.lower()))

    for out_root, live, urls in ((pub, True, live_urls), (dist, False, demo_urls)):
        site = dict(urls) if live else {k: (v if k == 'CONTACT' else '../' + v) for k, v in urls.items()}
        T = Target(live, site, logo_svg); T.shared = shared_css
        bdir = os.path.join(out_root, 'blog'); os.makedirs(bdir, exist_ok=True)
        for n in os.listdir(bdir):  # clear stale outputs (renamed posts/tags)
            if n.endswith('.html'): os.remove(os.path.join(bdir, n))
        fix = (lambda s: s) if live else (lambda s: s.replace('{{BASE_URL}}', LIVE_DOMAIN))
        def w(path, s):
            with open(path, 'w', encoding='utf-8') as f: f.write(fix(s))
        w(os.path.join(bdir, 'index.html'), render_index(T, posts, all_tags, counts))
        for p in posts: w(os.path.join(bdir, p['slug'] + '.html'), render_post(T, p, posts))
        for t in all_tags: w(os.path.join(bdir, 'tag-%s.html' % tag_slug(t)), render_tag(T, t, posts, all_tags, counts))
        # dashboard feed (Learn): same data in public/ and dist/, live paths in both (the server or the demo maps them)
        LT = Target(True, live_urls, logo_svg)
        bd = os.path.join(bdir, '_body'); os.makedirs(bd, exist_ok=True)
        for n in os.listdir(bd):
            if n.endswith('.html'): os.remove(os.path.join(bd, n))
        for p in posts:
            html_, _ = body_html_for(LT, p, posts, cta=False)
            w(os.path.join(bd, p['slug'] + '.html'), BODY_DOC % {'title': p['title'].replace('--', '-'), 'slug': p['slug']} + html_ + '\n')
        feed = [{'slug': p['slug'], 'title': p['title'], 'description': p['description'], 'author': p['author'], 'date': p['date'], 'tags': p['tags'],
                 'cover': '/media/blog/' + p['cover'], 'reading_time': p['reading_time'], 'url': '/blog/' + p['slug']} for p in posts]
        w(os.path.join(bdir, 'posts.json'), json.dumps(feed, ensure_ascii=False, indent=1))
        w(os.path.join(out_root, 'sitemap.xml'), sitemap(posts, all_tags, counts))
        w(os.path.join(out_root, 'rss.xml'), rss(posts))
    return 'blog: %d posts, %d tags%s' % (len(posts), len(all_tags), (', drew covers: ' + ', '.join(drawn)) if drawn else '')
