#!/usr/bin/env python3
"""Build Joinvoo pages for the live server (public/) and the shareable demo (dist/).

build/*.html are page fragments (no doctype/head/body). The live server wraps public/*.html itself;
for the static demo in dist/ we wrap them here and add window.JP_DEMO where a page talks to the API.
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, 'build'); PUB = os.path.join(ROOT, 'public'); DIST = os.path.join(ROOT, 'dist')
SHARED = open(os.path.join(B, 'shared.css')).read()
STAGE = open(os.path.join(B, '_stage.html')).read()
SUPPORT = open(os.path.join(B, '_support.html')).read()
VOO = open(os.path.join(B, '_voo.html')).read()          # 'Continue with VooSquare' (login + signup), off unless /api/config voo.login says otherwise
VOOFOOT = open(os.path.join(B, '_voofoot.html')).read()  # 'Part of VooSquare' + more Zedapex apps, in every footer  # website support chat widget, shared by home and guide  # the cross-legged person + orbit badges, shared by home and login
LOGO = '<span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2" stroke="#c9bfff"/></svg></span>'
HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
DEMO_FLAG = '<script>window.JP_DEMO=true</script>'

DEMO = {'SIGNUP': 'signup.html', 'DEMO': 'app.html', 'LOGIN': 'login.html', 'HOME': 'index.html', 'APP': 'app.html', 'GUIDE': 'guide.html', 'TERMS': 'terms.html', 'PRIVACY': 'privacy.html', 'REFUNDS': 'refunds.html', 'AUP': 'acceptable-use.html', 'COOKIES': 'cookies.html', 'REFTERMS': 'referral-terms.html', 'BLOG': 'blog/index.html', 'CONTACT': 'the support link in your dashboard'}
LIVE = {'SIGNUP': '/signup', 'DEMO': '/demo', 'LOGIN': '/login', 'HOME': '/', 'APP': '/app', 'GUIDE': '/guide', 'TERMS': '/terms', 'PRIVACY': '/privacy', 'REFUNDS': '/refunds', 'AUP': '/acceptable-use', 'COOKIES': '/cookies', 'REFTERMS': '/referral-terms', 'BLOG': '/blog'}

def read(*p): return open(os.path.join(*p)).read()
def write(path, s):
    with open(path, 'w') as f: f.write(s)

def fill(s, urls):
    s = s.replace('{{VOOFOOT}}', VOOFOOT).replace('{{VOO}}', VOO).replace('{{SUPPORT}}', SUPPORT).replace('{{STAGE}}', STAGE).replace('/*SHARED*/', SHARED).replace('{{LOGO}}', LOGO)
    for k, v in urls.items(): s = s.replace('{{%s}}' % k, v)
    return s

os.makedirs(DIST, exist_ok=True); os.makedirs(PUB, exist_ok=True)

# legal pages are generated from one frame + a body each
frame = read(B, 'legal', '_frame.html')
LEGAL = [('terms', 'Terms of Service', 'TERMS'), ('privacy', 'Privacy Policy', 'PRIVACY'), ('refunds', 'Refund Policy', 'REFUNDS'),
         ('acceptable-use', 'Acceptable Use Policy', 'AUP'), ('cookies', 'Cookie Policy', 'COOKIES'), ('referral-terms', 'Referral Program Terms', 'REFTERMS')]
for name, title, key in LEGAL:
    hub = ''.join('<a href="{{%s}}"%s>%s</a>' % (k, ' aria-current="page"' if k == key else '', t) for _, t, k in LEGAL)
    write(os.path.join(B, name + '.html'), frame.replace('__TITLE__', title).replace('__HUB__', hub).replace('__BODY__', read(B, 'legal', name + '.body.html')))

# (source fragment, live output name, demo output name, demo needs JP_DEMO flag)
PAGES = [
    ('home.html',    'home.html',    'index.html',   True),
    ('login.html',   'login.html',   'login.html',   True),
    ('signup.html',  'signup.html',  'signup.html',  True),
    ('guide.html',   'guide.html',   'guide.html',   True),
    ('terms.html',   'terms.html',   'terms.html',   False),
    ('privacy.html', 'privacy.html', 'privacy.html', False),
    ('refunds.html', 'refunds.html', 'refunds.html', False),
    ('acceptable-use.html', 'acceptable-use.html', 'acceptable-use.html', False),
    ('cookies.html', 'cookies.html', 'cookies.html', False),
    ('referral-terms.html', 'referral-terms.html', 'referral-terms.html', False),
    ('admin.html',   'admin.html',   'admin.html',   True),
]
# email previews for the demo admin (rendered by the real server code with sample data)
import subprocess, tempfile, json
EMAILS_JS = ''
try:
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'emails.json')
        subprocess.run(['node', os.path.join(ROOT, 'server.js'), '--export-emails', out], cwd=ROOT, check=True, timeout=60,
                       env={**os.environ, 'DATA_DIR': td, 'BASE_URL': 'https://joinvoo.com', 'PORT': '0'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        EMAILS_JS = '<script>window.JP_EMAILS=' + open(out).read().replace('</', '<\\/') + '</script>'
except Exception as e:
    print('note: email previews not embedded in the demo:', e)

import sys, shutil; sys.path.insert(0, B); import i18n
EN = {}
COUNTRIES_JSON = open(os.path.join(PUB, 'countries.json')).read() if os.path.exists(os.path.join(PUB, 'countries.json')) else '[]'
def parts(s):
    s = s.replace('/*COUNTRIES*/[]', json.dumps(json.loads(COUNTRIES_JSON), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))  # signup country picker, inlined so it works offline
    return s.replace('{{VOOFOOT}}', VOOFOOT).replace('{{VOO}}', VOO).replace('{{SUPPORT}}', SUPPORT).replace('{{STAGE}}', STAGE).replace('/*SHARED*/', SHARED).replace('{{LOGO}}', LOGO)
for src, live, demo, flag in PAGES:
    s = read(B, src)
    if src != 'admin.html':  # website pages get keys for translation + the i18n runtime (admin is English-only)
        s, strs = i18n.mark(parts(s)); EN.update(strs); s = i18n.inject_runtime(s)
    write(os.path.join(PUB, live), fill(s, LIVE))
    write(os.path.join(DIST, demo), HEAD + (DEMO_FLAG if flag else '') + (EMAILS_JS if src == 'admin.html' else '') + '</head><body>' + fill(s, DEMO) + '</body></html>')

# dashboard: edited directly in public/app.html, copied into the demo with demo flags
app = read(PUB, 'app.html')
app_demo = app.replace('{{GUIDE_URL}}', 'guide.html').replace('{{APP_URL}}', 'app.html').replace('{{DEMO_URL}}', 'app.html').replace('{{HOME_URL}}', 'index.html').replace('{{SIGNUP_URL}}', 'signup.html')
write(os.path.join(DIST, 'app.html'), HEAD + DEMO_FLAG + '</head><body>' + app_demo + '</body></html>')

# website translations: public/i18n/web.<lang>.json (live links) + dist/i18n/ (demo links); other i18n files and joomoji.js are copied as-is
os.makedirs(os.path.join(PUB, 'i18n'), exist_ok=True); os.makedirs(os.path.join(DIST, 'i18n'), exist_ok=True)
def _fill_dict(d, urls):
    return {k: fill(v, urls) for k, v in d.items()}
write(os.path.join(B, 'i18n', 'en.source.json'), json.dumps(list(EN.values()), ensure_ascii=False, indent=0))  # for translators: every English string, page order
for lang in i18n.LANGS:
    if lang == 'en': d = EN
    else:
        srcp = os.path.join(B, 'i18n', lang + '.json')
        d = i18n.compile_lang(json.load(open(srcp)) if os.path.exists(srcp) else {}, EN)
        missing = len(set(EN) - set(d))
        if missing: print(f'i18n: {lang} missing {missing} of {len(EN)} strings (English shown for those)')
    for root, urls in ((PUB, LIVE), (DIST, DEMO)):
        write(os.path.join(root, 'i18n', 'web.%s.json' % lang), json.dumps(_fill_dict(d, urls), ensure_ascii=False, separators=(',', ':')))
for n in os.listdir(os.path.join(PUB, 'i18n')):
    if not n.startswith('web.'): shutil.copy2(os.path.join(PUB, 'i18n', n), os.path.join(DIST, 'i18n', n))
if os.path.exists(os.path.join(PUB, 'countries.json')): shutil.copy2(os.path.join(PUB, 'countries.json'), os.path.join(DIST, 'countries.json'))  # shared with the dashboard (GET /api/countries)
if os.path.exists(os.path.join(PUB, 'joomoji.js')): shutil.copy2(os.path.join(PUB, 'joomoji.js'), os.path.join(DIST, 'joomoji.js'))

# blog: build/blog/*.md -> public/blog/ + dist/blog/ (+ covers in public/media/blog/, sitemap.xml, rss.xml); see build/blog/blog.py
sys.path.insert(0, os.path.join(B, 'blog')); import blog
print(blog.build(ROOT, LIVE, DEMO, SHARED, LOGO))

# media (videos, posters) dropped into public/media/ ship with the demo too
import shutil
MEDIA = os.path.join(PUB, 'media')
if os.path.isdir(MEDIA) and os.listdir(MEDIA):
    os.makedirs(os.path.join(DIST, 'media'), exist_ok=True)
    for n in os.listdir(MEDIA):
        src = os.path.join(MEDIA, n)
        if os.path.isfile(src): shutil.copy2(src, os.path.join(DIST, 'media', n))
        elif os.path.isdir(src): shutil.copytree(src, os.path.join(DIST, 'media', n), dirs_exist_ok=True)  # logos/, team/

# clean up outputs of retired pages (homepage variants and the picker)
for d, names in [(PUB, ['index.html', 'home-classic.html', 'home-blind.html', 'home-leak.html', 'home-loud.html', 'picker.html']),
                 (DIST, ['home-classic.html', 'home-blind.html', 'home-leak.html', 'home-loud.html', 'picker.html'])]:
    for n in names:
        p = os.path.join(d, n)
        if os.path.exists(p): os.remove(p)
print('built', sorted(os.listdir(DIST)))
