"""Website i18n for Joinvoo (home, signup, login, guide, legal chrome).

How it works
- At build time every translatable text block in a page gets a key: data-i18n="<hash>" (whole inner HTML),
  data-i18n-t="<hash>" (first text node only, for buttons that also hold an icon) or data-i18n-ph (placeholder).
  The hash is FNV-1a (32-bit, base36) of the English text with whitespace collapsed, so keys stay stable while the
  English stays the same, and a changed English string simply falls back to English until it's translated.
- Strings built in JavaScript are wrapped as _t('English') and collected from the page source.
- English is the source: public/i18n/web.en.json is generated. Translations live in build/i18n/<lang>.json as
  {"English text": "translation"} (readable, easy to edit) and are compiled to public/i18n/web.<lang>.json and
  dist/i18n/web.<lang>.json keyed by hash, with {{LINK}} placeholders filled for each target.
- The runtime (RUNTIME below) is prepended to every page. It picks the language (?lang= > saved jv_lang >
  browser language > en), loads the dictionary synchronously (small, cached) so page scripts can use _t(),
  translates static blocks just before each inline script runs (JVI()) and again on DOMContentLoaded,
  and renders the language switcher into every [data-lsw].
"""
import json, re
from html.parser import HTMLParser

LANGS = ['en', 'ru', 'fr', 'pt', 'es']

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def h(s):
    x = 2166136261
    for ch in norm(s):
        x ^= ord(ch); x = (x * 16777619) & 0xffffffff
    d = '0123456789abcdefghijklmnopqrstuvwxyz'; out = ''
    while True:
        x, r = divmod(x, 36); out = d[r] + out
        if not x: return out

INLINE = {'b', 'strong', 'em', 'span', 'br', 'code', 'u', 'a', 'small', 'sup', 'kbd'}
MARKABLE = {'h1', 'h2', 'h3', 'h4', 'p', 'li', 'a', 'button', 'span', 'b', 'small', 'summary', 'label', 'option', 'td', 'th',
            'figcaption', 'em', 'strong', 'div', 'dt', 'dd', 'title', 'legend', 'caption', 'i'}
SKIP_TAGS = {'script', 'style', 'svg', 'pre', 'textarea', 'select'}
SKIP_CLASS = {'code', 'code-sm', 'pb-url', 'tok', 'lnk', 'urlbar', 'mo', 'tg-av', 'av', 'av2', 'mark', 'logo', 'jr-btn-x'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
LETTERS = re.compile(r'[A-Za-z]{2,}')

class Node:
    __slots__ = ('tag', 'attrs', 'start', 'send', 'end', 'children', 'texts', 'bad', 'parent')
    def __init__(self, tag, attrs, start, send, parent):
        self.tag, self.attrs, self.start, self.send, self.parent = tag, dict(attrs), start, send, parent
        self.end = None; self.children = []; self.texts = []; self.bad = False

class P(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src; self.lines = [0]
        for m in re.finditer('\n', src): self.lines.append(m.end())
        self.root = Node('#root', [], 0, 0, None); self.stack = [self.root]; self.phs = []
    def pos(self):
        l, c = self.getpos(); return self.lines[l - 1] + c
    def handle_starttag(self, tag, attrs):
        start = self.pos(); raw = self.get_starttag_text(); n = Node(tag, attrs, start, start + len(raw), self.stack[-1])
        self.stack[-1].children.append(n)
        if tag in ('input', 'textarea') and dict(attrs).get('placeholder'): self.phs.append(n)
        if tag in VOID: n.end = n.send; return
        self.stack.append(n)
    def handle_startendtag(self, tag, attrs):
        start = self.pos(); raw = self.get_starttag_text(); n = Node(tag, attrs, start, start + len(raw), self.stack[-1]); n.end = n.send
        self.stack[-1].children.append(n)
        if tag == 'input' and dict(attrs).get('placeholder'): self.phs.append(n)
    def handle_endtag(self, tag):
        p = self.pos()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                for n in self.stack[i:]: n.end = n.end if n.end is not None else p
                del self.stack[i:]; return
    def handle_data(self, data):
        if data.strip(): self.stack[-1].texts.append((self.pos(), data))

def _classes(n):
    return set((n.attrs.get('class') or '').split())

def _compute_bad(n):
    """bad = this subtree contains something that isn't inline text markup."""
    bad = False
    for c in n.children:
        _compute_bad(c)
        if c.tag not in INLINE or c.bad or (_classes(c) & SKIP_CLASS) or c.tag in SKIP_TAGS: bad = True
    n.bad = bad

def mark(src, extra_skip=()):
    """Return (marked_src, {key: english}) for one page source (before link placeholders are filled)."""
    p = P(src); p.feed(src); p.close()
    for n in p.stack[1:]:
        if n.end is None: n.end = len(src)
    _compute_bad(p.root)
    ins, strings = [], {}
    def visit(n, skip):
        cls = _classes(n)
        if n.tag in SKIP_TAGS or (cls & SKIP_CLASS) or 'data-noi18n' in n.attrs or (cls & set(extra_skip)): skip = True
        if not skip and n.tag in MARKABLE and n.end is not None:
            inner = src[n.send:n.end]
            if not n.bad and LETTERS.search(re.sub(r'<[^>]+>', ' ', inner)) and '{{' not in re.sub(r'href="\{\{[A-Z_]+\}\}"', '', inner):
                en = norm(inner); k = h(en); strings[k] = en
                ins.append((n.start + 1 + len(n.tag), ' data-i18n="%s"' % k)); return
            if n.bad:
                for pos, t in n.texts:
                    if LETTERS.search(t) and '{{' not in t:
                        en = norm(t); k = h(en); strings[k] = en
                        ins.append((n.start + 1 + len(n.tag), ' data-i18n-t="%s"' % k)); break
        for c in n.children: visit(c, skip)
    visit(p.root, False)
    for n in p.phs:
        ph = n.attrs.get('placeholder') or ''
        if LETTERS.search(ph) and '${' not in ph:
            en = norm(ph); k = h(en); strings[k] = en
            ins.append((n.start + 1 + len(n.tag), ' data-i18n-ph="%s"' % k))
    for pos, txt in sorted(ins, reverse=True):
        src = src[:pos] + txt + src[pos:]
    # strings made in JavaScript: _t('English')
    for m in re.finditer(r"_t\('((?:[^'\\]|\\.)*)'\)", src):
        en = norm(m.group(1).replace("\\'", "'").replace('\\\\', '\\'))
        if LETTERS.search(en): strings[h(en)] = en
    return src, strings

def inject_runtime(s):
    """Run JVI() at the start of every inline script so text above it is translated before the script runs."""
    s = re.sub(r'<script>(?!JVI\(\))', '<script>JVI();', s)
    return RUNTIME + s

def compile_lang(tr, en_keys):
    """tr: {english: translation} → {key: translation} limited to strings the site uses."""
    out = {}
    for en, v in tr.items():
        k = h(en)
        if k in en_keys and v: out[k] = v
    return out

RUNTIME = r'''<script>
/* Joinvoo website i18n: ?lang= > saved choice > browser language > English. Dictionary: i18n/web.<lang>.json */
(function(){
  var L=['en','ru','fr','pt','es'], N={en:['🇬🇧','English'],ru:['🇷🇺','Русский'],fr:['🇫🇷','Français'],pt:['🇵🇹','Português'],es:['🇪🇸','Español']};
  function norm(s){ return String(s).replace(/\s+/g,' ').trim(); }
  function h(s){ s=norm(s); var x=2166136261; for(var i=0;i<s.length;i++){ var c=s.codePointAt(i); if(c>0xffff) i++; x=Math.imul((x^c)>>>0,16777619)>>>0; } return x.toString(36); }
  var q=null, saved=null; try{ q=new URLSearchParams(location.search).get('lang'); }catch(e){} try{ saved=localStorage.getItem('jv_lang'); }catch(e){}
  var nav=((navigator.languages&&navigator.languages[0])||navigator.language||'en').slice(0,2).toLowerCase();
  var lang=L.indexOf(q)>=0?q:L.indexOf(saved)>=0?saved:L.indexOf(nav)>=0?nav:'en';
  if(L.indexOf(q)>=0){ try{ localStorage.setItem('jv_lang',q); }catch(e){} }
  var D={};
  if(lang!=='en'){ try{ var x=new XMLHttpRequest(); x.open('GET','i18n/web.'+lang+'.json',false); x.send(); if(x.status===200) D=JSON.parse(x.responseText)||{}; }catch(e){ D={}; } }
  document.documentElement.lang=lang; window.JV_LANG=lang;
  window._t=function(en){ var k=h(en); return D[k]!=null?D[k]:en; };
  function apply(){ if(lang==='en') return; var i, el, v, a=document.querySelectorAll('[data-i18n]:not([data-i18n-ok])');
    for(i=0;i<a.length;i++){ el=a[i]; v=D[el.getAttribute('data-i18n')]; el.setAttribute('data-i18n-ok',''); if(v!=null) el.innerHTML=v; }
    a=document.querySelectorAll('[data-i18n-t]:not([data-i18n-ok])');
    for(i=0;i<a.length;i++){ el=a[i]; v=D[el.getAttribute('data-i18n-t')]; el.setAttribute('data-i18n-ok',''); if(v==null) continue;
      for(var n=el.firstChild;n;n=n.nextSibling){ if(n.nodeType===3&&/[A-Za-z]{2}/.test(n.nodeValue)){ var m=n.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/); n.nodeValue=m[1]+v+m[2]; break; } } }
    a=document.querySelectorAll('[data-i18n-ph]:not([data-i18n-ok])');
    for(i=0;i<a.length;i++){ el=a[i]; v=D[el.getAttribute('data-i18n-ph')]; el.setAttribute('data-i18n-ok',''); if(v!=null) el.setAttribute('placeholder',v); }
  }
  function switcher(){ var boxes=document.querySelectorAll('[data-lsw]:not([data-lsw-ok])'); for(var i=0;i<boxes.length;i++){ (function(box){ box.setAttribute('data-lsw-ok','');
      var cur=N[lang]; box.innerHTML='<button type="button" class="lsw-b" aria-haspopup="listbox" aria-expanded="false" aria-label="Language: '+cur[1]+'"><span class="lsw-f">'+cur[0]+'</span><span class="lsw-n">'+cur[1]+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button><ul class="lsw-m" role="listbox" hidden>'+L.map(function(k){ return '<li role="option" aria-selected="'+(k===lang)+'"><button type="button" data-l="'+k+'"><span class="lsw-f">'+N[k][0]+'</span>'+N[k][1]+(k===lang?'<i>✓</i>':'')+'</button></li>'; }).join('')+'</ul>';
      var b=box.querySelector('.lsw-b'), m=box.querySelector('.lsw-m');
      function open(o){ m.hidden=!o; b.setAttribute('aria-expanded',o); }
      b.onclick=function(e){ e.stopPropagation(); open(m.hidden); };
      document.addEventListener('click',function(){ open(false); }); document.addEventListener('keydown',function(e){ if(e.key==='Escape') open(false); });
      m.onclick=function(e){ var t=e.target.closest('button[data-l]'); if(!t) return; var l=t.getAttribute('data-l'); try{ localStorage.setItem('jv_lang',l); }catch(_){}
        try{ var u=new URL(location.href); u.searchParams.delete('lang'); if(l!=='en'&&!saved&&nav===l){} location.replace(u.pathname+u.search+u.hash); }catch(_){ location.reload(); } };
    })(boxes[i]); }
    if(lang!=='en'){ var n=document.querySelectorAll('[data-lnote]'); for(var j=0;j<n.length;j++) n[j].hidden=false; }
  }
  window.JVI=function(){ apply(); switcher(); };
  document.addEventListener('DOMContentLoaded',function(){ apply(); switcher(); });
})();
</script>
'''
