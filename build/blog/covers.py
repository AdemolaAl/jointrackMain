#!/usr/bin/env python3
"""Original blog cover illustrations for the Joinvoo blog, drawn with Pillow.

Every cover is 1200x630 (the Open Graph size), drawn at 2x and downsampled for clean edges, and saved as
WebP (shown on the site) and JPG (og:image / RSS, for platforms that don't read WebP).
Palette: violet #5b3df5, lilac, deep ink-violet, lime #c8f169 sparks, white. Abstract shapes only:
no real logos, no real people.

    python3 build/blog/covers.py            # draw any missing covers
    python3 build/blog/covers.py --force    # redraw all
"""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, S = 1200, 630, 2
VIOLET = (91, 61, 245); VIOLET2 = (143, 123, 255); DEEP = (27, 16, 74); INK = (17, 12, 44)
LILAC = (239, 235, 255); LILAC2 = (201, 191, 255); LIME = (200, 241, 105); WHITE = (255, 255, 255)
ROSE = (255, 107, 107); MINT = (79, 212, 164)

FONT_PATHS = ['/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf', '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',
              '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']


def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size * S)
    return ImageFont.load_default()


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


class C:
    """A 1200x630 canvas in logical px; everything is drawn at S x and downsampled on save."""

    def __init__(self, top, bottom, angle=0):
        self.im = Image.new('RGBA', (W * S, H * S))
        # diagonal two-stop gradient
        g = Image.linear_gradient('L').resize((W * S, H * S)).rotate(angle, expand=False, fillcolor=128) if angle else Image.linear_gradient('L').resize((W * S, H * S))
        a = Image.new('RGBA', (W * S, H * S), rgba(top)); b = Image.new('RGBA', (W * S, H * S), rgba(bottom))
        self.im = Image.composite(b, a, g)
        self.d = ImageDraw.Draw(self.im)

    def s(self, *v):
        return [x * S for x in v]

    def layer(self):
        return Image.new('RGBA', self.im.size, (0, 0, 0, 0))

    def paste(self, lay, blur=0):
        if blur: lay = lay.filter(ImageFilter.GaussianBlur(blur * S))
        self.im.alpha_composite(lay); self.d = ImageDraw.Draw(self.im)

    def glow(self, x, y, r, color, a=150, blur=70):
        l = self.layer(); ImageDraw.Draw(l).ellipse(self.s(x - r, y - r, x + r, y + r), fill=rgba(color, a)); self.paste(l, blur)

    def dots(self, color=WHITE, a=26, step=28, r=1.6, box=None):
        l = self.layer(); d = ImageDraw.Draw(l)
        x0, y0, x1, y1 = box or (0, 0, W, H)
        y = y0 + step / 2
        while y < y1:
            x = x0 + step / 2
            while x < x1:
                d.ellipse(self.s(x - r, y - r, x + r, y + r), fill=rgba(color, a)); x += step
            y += step
        self.paste(l)

    def grid(self, color=WHITE, a=16, step=60, w=1):
        l = self.layer(); d = ImageDraw.Draw(l)
        for x in range(0, W + 1, step): d.line(self.s(x, 0, x, H), fill=rgba(color, a), width=w * S)
        for y in range(0, H + 1, step): d.line(self.s(0, y, W, y), fill=rgba(color, a), width=w * S)
        self.paste(l)

    def shadow(self, x, y, w, h, r=24, a=90, blur=22, dy=18, color=INK):
        l = self.layer(); ImageDraw.Draw(l).rounded_rectangle(self.s(x, y + dy, x + w, y + h + dy), radius=r * S, fill=rgba(color, a)); self.paste(l, blur)

    def card(self, x, y, w, h, r=24, fill=WHITE, a=255, outline=None, ow=2, shadow=True):
        if shadow: self.shadow(x, y, w, h, r)
        l = self.layer(); ImageDraw.Draw(l).rounded_rectangle(self.s(x, y, x + w, y + h), radius=r * S, fill=rgba(fill, a),
                                                             outline=rgba(outline) if outline else None, width=ow * S)
        self.paste(l)

    def rr(self, x, y, w, h, r, fill, a=255):
        l = self.layer(); ImageDraw.Draw(l).rounded_rectangle(self.s(x, y, x + w, y + h), radius=r * S, fill=rgba(fill, a)); self.paste(l)

    def circle(self, x, y, r, fill=None, a=255, outline=None, ow=2, oa=255):
        l = self.layer(); ImageDraw.Draw(l).ellipse(self.s(x - r, y - r, x + r, y + r), fill=rgba(fill, a) if fill else None,
                                                    outline=rgba(outline, oa) if outline else None, width=ow * S)
        self.paste(l)

    def line(self, pts, color, w=4, a=255, dash=None):
        l = self.layer(); d = ImageDraw.Draw(l)
        P = [(x * S, y * S) for x, y in pts]
        if dash:
            on, off = dash
            for (x0, y0), (x1, y1) in zip(P, P[1:]):
                L = math.hypot(x1 - x0, y1 - y0); t = 0
                while t < L:
                    t2 = min(L, t + on * S)
                    d.line([(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L), (x0 + (x1 - x0) * t2 / L, y0 + (y1 - y0) * t2 / L)], fill=rgba(color, a), width=w * S)
                    t += (on + off) * S
        else:
            d.line(P, fill=rgba(color, a), width=w * S, joint='curve')
            for x, y in (P[0], P[-1]): d.ellipse((x - w * S / 2, y - w * S / 2, x + w * S / 2, y + w * S / 2), fill=rgba(color, a))
        self.paste(l)

    def poly(self, pts, fill, a=255, outline=None, ow=2):
        l = self.layer(); ImageDraw.Draw(l).polygon([(x * S, y * S) for x, y in pts], fill=rgba(fill, a), outline=rgba(outline) if outline else None, width=ow * S); self.paste(l)

    def text(self, x, y, s, size, fill=WHITE, a=255, anchor='la'):
        l = self.layer(); ImageDraw.Draw(l).text((x * S, y * S), s, font=font(size), fill=rgba(fill, a), anchor=anchor); self.paste(l)

    # ---- motifs ----
    def spark(self, x, y, r, fill=LIME, a=255):
        k = r * .28
        self.poly([(x, y - r), (x + k, y - k), (x + r, y), (x + k, y + k), (x, y + r), (x - k, y + k), (x - r, y), (x - k, y - k)], fill, a)

    def plane(self, x, y, s, fill=WHITE, rot=0, a=255, fold=None):
        """A generic folded paper plane (pointing right before rotation)."""
        pts = [(1.0, 0.0), (-0.9, -0.62), (-0.42, 0.04), (-0.62, 0.62)]
        c, sn = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        T = lambda p: (x + (p[0] * c - p[1] * sn) * s, y + (p[0] * sn + p[1] * c) * s)
        self.poly([T(p) for p in pts], fill, a)
        self.poly([T(p) for p in [(1.0, 0.0), (-0.42, 0.04), (-0.62, 0.62)]], fold or LILAC2, a)

    def bot(self, x, y, s, body=ROSE, face=WHITE, zapped=False):
        """A little fake-lead robot head."""
        self.line([(x, y - s * .62), (x, y - s * .95)], body, w=max(3, int(s * .07)))
        self.circle(x, y - s * 1.0, s * .11, body)
        self.card(x - s * .62, y - s * .62, s * 1.24, s * 1.05, r=s * .3, fill=body, shadow=False)
        self.rr(x - s * .45, y - s * .42, s * .9, s * .55, s * .2, face)
        if zapped:
            for ex in (-.2, .2):
                cx, cy = x + ex * s, y - s * .15; k = s * .08
                self.line([(cx - k, cy - k), (cx + k, cy + k)], body, w=max(3, int(s * .05)))
                self.line([(cx - k, cy + k), (cx + k, cy - k)], body, w=max(3, int(s * .05)))
        else:
            for ex in (-.2, .2): self.circle(x + ex * s, y - s * .15, s * .07, body)

    def bolt(self, x, y, s, fill=LIME, a=255):
        pts = [(.15, -1), (-.45, .1), (-.02, .1), (-.2, 1), (.48, -.22), (.05, -.22), (.32, -1)]
        self.poly([(x + px * s, y + py * s) for px, py in pts], fill, a)

    def person(self, x, y, s, fill=WHITE, a=255, ring=None):
        """Abstract avatar: a circle with a head-and-shoulders silhouette."""
        self.circle(x, y, s, ring or LILAC, a)
        l = self.layer(); d = ImageDraw.Draw(l)
        d.ellipse(self.s(x - s * .32, y - s * .55, x + s * .32, y + s * .08), fill=rgba(fill, a))
        d.pieslice(self.s(x - s * .62, y + s * .18, x + s * .62, y + s * 1.3), 180, 360, fill=rgba(fill, a))
        mask = Image.new('L', l.size, 0); ImageDraw.Draw(mask).ellipse(self.s(x - s, y - s, x + s, y + s), fill=255)
        l.putalpha(Image.composite(l.getchannel('A'), Image.new('L', l.size, 0), mask)); self.paste(l)

    def check(self, x, y, r, bg=MINT, fg=WHITE):
        self.circle(x, y, r, bg); self.line([(x - r * .42, y + r * .02), (x - r * .1, y + r * .34), (x + r * .45, y - r * .3)], fg, w=max(3, int(r * .22)))

    def chip(self, x, y, label, fill=WHITE, a=40, fg=WHITE, size=17):
        f = font(size); tw = f.getlength(label) / S
        self.rr(x, y, tw + 34, size + 20, (size + 20) / 2, fill, a)
        self.text(x + 17, y + (size + 20) / 2, label, size, fg, anchor='lm')
        return tw + 34

    def brand(self, dark=False):
        """Small 'joinvoo / blog' wordmark top-left, using the two-ring mark."""
        fg = INK if dark else WHITE
        self.rr(48, 44, 40, 40, 12, VIOLET if dark else WHITE, 255 if dark else 40)
        self.circle(62, 64, 9, None, outline=WHITE, ow=3); self.circle(74, 64, 9, None, outline=LILAC2, ow=3)
        self.text(100, 64, 'joinvoo', 24, fg, anchor='lm')
        self.text(100 + font(24).getlength('joinvoo') / S + 8, 64, '/ blog', 24, fg, a=150, anchor='lm')

    def save(self, base):
        out = self.im.resize((W, H), Image.LANCZOS).convert('RGB')
        out.save(base + '.webp', 'WEBP', quality=84, method=6)
        out.save(base + '.jpg', 'JPEG', quality=84, optimize=True, progressive=True)


def bars(c, x, y, w, h, vals, color, gap=12, r=8, a=255):
    n = len(vals); bw = (w - gap * (n - 1)) / n
    for i, v in enumerate(vals):
        bh = h * v; c.rr(x + i * (bw + gap), y + h - bh, bw, bh, r, color if not isinstance(color, list) else color[i], a)


def smooth(pts, n=12):
    out = []
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        for t in range(n):
            u = t / n; e = (1 - math.cos(u * math.pi)) / 2
            out.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * e))
    out.append(pts[-1]); return out


# ------------------------------------------------------------------ scenes

def meta_joins(c):
    """Ad card -> dotted path -> phone with channel; joins pop out as checked avatars."""
    c.glow(950, 120, 260, VIOLET2, 160); c.glow(200, 560, 220, LIME, 60, 90); c.dots()
    c.brand()
    # ad card
    c.card(80, 170, 330, 330, 30)
    c.rr(104, 194, 282, 170, 20, LILAC)
    c.circle(245, 279, 46, VIOLET); c.poly([(232, 255), (232, 303), (272, 279)], WHITE)
    c.rr(104, 384, 200, 18, 9, LILAC2); c.rr(104, 414, 140, 14, 7, LILAC)
    c.rr(104, 446, 282, 38, 19, VIOLET); c.text(245, 465, 'Join now', 17, WHITE, anchor='mm')
    # path
    c.line(smooth([(410, 465), (520, 330), (640, 400), (720, 290)]), LIME, w=5, dash=(12, 12))
    c.plane(575, 352, 30, LIME, rot=-30, fold=(150, 190, 60))
    # phone
    c.card(740, 120, 290, 470, 44, INK, outline=(70, 56, 150), ow=3)
    c.rr(756, 136, 258, 438, 34, WHITE)
    c.rr(756, 136, 258, 74, 34, LILAC); c.rr(756, 176, 258, 34, 0, LILAC)
    c.circle(796, 173, 22, VIOLET); c.plane(797, 173, 13, WHITE, rot=-20)
    c.rr(830, 160, 120, 14, 7, VIOLET, 200); c.rr(830, 182, 80, 10, 5, LILAC2)
    for i, yy in enumerate((250, 330, 410, 490)):
        c.person(800, yy, 26, WHITE, ring=[VIOLET, VIOLET2, (124, 98, 255), VIOLET][i])
        c.rr(838, yy - 14, [130, 100, 120, 90][i], 12, 6, (225, 220, 245)); c.rr(838, yy + 6, 70, 9, 5, (238, 236, 245))
        c.check(986, yy, 15)
    c.chip(990, 92, '+1 join', LIME, 255, INK, 18)
    c.spark(1110, 230, 22); c.spark(690, 170, 14, WHITE); c.spark(1080, 520, 12)


def capi(c):
    """A server block beaming signal packets to a target ring."""
    c.grid(); c.glow(860, 320, 300, VIOLET, 170, 90); c.glow(200, 200, 200, VIOLET2, 90)
    c.brand()
    # server stack
    for i in range(3):
        y = 190 + i * 102
        c.card(100, y, 300, 84, 22, WHITE if i != 1 else LILAC)
        for k in range(3): c.circle(136 + k * 26, y + 42, 7, [MINT, LIME, VIOLET2][k])
        c.rr(230, y + 30, 140, 10, 5, LILAC2); c.rr(230, y + 48, 90, 8, 4, (225, 220, 245))
    c.text(250, 530, 'server → server', 20, WHITE, 170, anchor='mm')
    # beams
    for k, (dy, col) in enumerate(((-60, LIME), (0, WHITE), (60, LILAC2))):
        c.line(smooth([(410, 330 + dy), (560, 330 + dy * .6), (760, 320)], 18), col, w=4, a=200, dash=(18, 10))
    for k, (x, y) in enumerate(((500, 286), (600, 330), (520, 384))):
        c.rr(x - 26, y - 17, 52, 34, 9, [LIME, WHITE, LILAC2][k]); c.rr(x - 15, y - 3, 30, 6, 3, VIOLET)
    # target rings
    for r, a in ((190, 60), (140, 110), (92, 180)): c.circle(880, 320, r, None, outline=WHITE, ow=3, oa=a)
    c.circle(880, 320, 52, LIME); c.circle(880, 320, 20, INK)
    c.spark(1060, 150, 22); c.spark(1100, 470, 14, WHITE); c.spark(700, 520, 12)
    c.chip(760, 548, 'event_id · hashed · deduped', WHITE, 36, WHITE, 17)


def fake_joins(c):
    """A crowd of joiners; the robot impostors get zapped by lime bolts."""
    c.glow(600, 330, 340, VIOLET2, 120, 100); c.dots(a=22)
    c.brand()
    rnd = random.Random(7)
    spots = [(150, 230), (290, 190), (430, 250), (580, 190), (730, 240), (880, 180), (1030, 240),
             (210, 400), (360, 450), (510, 400), (670, 460), (820, 400), (980, 450), (1100, 380)]
    botset = {2, 5, 8, 12}
    for i, (x, y) in enumerate(spots):
        if i in botset:
            c.glow(x, y, 80, LIME, 110, 30)
            c.bot(x, y + 10, 52, ROSE, WHITE, zapped=True)
            c.bolt(x + 46, y - 66, 34)
        else:
            c.person(x, y, 44, WHITE, ring=[VIOLET, (110, 86, 250), (128, 106, 255)][i % 3])
    c.chip(48, 540, 'real', WHITE, 255, VIOLET, 18); c.chip(130, 540, 'fake → not sent', ROSE, 255, WHITE, 18)
    c.spark(1110, 110, 20); c.spark(470, 120, 12, WHITE)


def tiktok(c):
    """A vertical video phone with a play button feeding a pipe into a paper plane."""
    c.glow(330, 300, 260, (254, 70, 120), 70, 110); c.glow(900, 330, 280, VIOLET2, 140); c.dots()
    c.brand()
    c.card(170, 110, 280, 490, 44, INK, outline=(70, 56, 150), ow=3)
    c.rr(186, 126, 248, 458, 34, VIOLET)
    c.glow(310, 330, 120, VIOLET2, 160, 40)
    c.circle(310, 330, 54, WHITE, 235); c.poly([(296, 304), (296, 356), (338, 330)], VIOLET)
    for i in range(3): c.circle(400, 400 + i * 56, 18, WHITE, 70)
    c.rr(208, 500, 150, 14, 7, WHITE, 200); c.rr(208, 524, 100, 10, 5, WHITE, 120)
    for i in range(18): c.rr(208 + i * 11, 556, 7, 8 + (i * 7 % 14), 3, LIME, 220)
    # pipe
    c.line(smooth([(450, 330), (600, 330), (660, 250), (790, 250)], 16), WHITE, w=26, a=40)
    c.line(smooth([(450, 330), (600, 330), (660, 250), (790, 250)], 16), LIME, w=6, dash=(16, 10))
    c.card(790, 150, 300, 200, 30)
    c.circle(860, 222, 34, VIOLET); c.plane(862, 222, 20, WHITE, rot=-18)
    c.rr(910, 202, 150, 16, 8, INK, 220); c.rr(910, 230, 110, 12, 6, LILAC2)
    c.rr(816, 290, 248, 38, 19, LIME); c.text(940, 309, 'ttclid matched', 17, INK, anchor='mm')
    c.card(830, 390, 240, 150, 26, WHITE, 255)
    bars(c, 856, 412, 190, 100, [.35, .5, .42, .7, .9], [LILAC2, LILAC2, LILAC2, VIOLET2, VIOLET])
    c.spark(1120, 120, 22); c.spark(740, 470, 14)


def snapchat(c):
    """Story frames (segmented progress bars) with a shutter ring and a join card."""
    c.im = Image.new('RGBA', (W * S, H * S), rgba(LILAC)); c.d = ImageDraw.Draw(c.im)
    c.glow(900, 120, 260, (255, 245, 130), 120, 100); c.glow(250, 560, 260, VIOLET2, 110, 100)
    c.dots(VIOLET, 30)
    c.brand(dark=True)
    for k, (x, rot_a) in enumerate(((120, 120), (330, 255), (540, 140))):
        y = 130 if k == 1 else 160
        c.card(x, y, 190, 340, 30, VIOLET if k == 1 else WHITE)
        for i in range(4): c.rr(x + 14 + i * 42, y + 14, 36, 6, 3, (WHITE if k == 1 else VIOLET), 255 if i <= k else 80)
        if k == 1:
            c.circle(x + 95, y + 170, 46, None, outline=WHITE, ow=6)
            c.circle(x + 95, y + 170, 30, LIME)
            c.rr(x + 30, y + 270, 130, 36, 18, WHITE); c.text(x + 95, y + 288, 'Swipe up', 16, VIOLET, anchor='mm')
        else:
            c.rr(x + 20, y + 60, 150, 150, 20, LILAC)
            c.spark(x + 95, y + 135, 40, VIOLET2 if k == 0 else LIME)
            c.rr(x + 20, y + 236, 120, 12, 6, LILAC2); c.rr(x + 20, y + 258, 80, 10, 5, LILAC)
    c.line(smooth([(735, 300), (800, 300), (840, 260), (880, 260)], 10), VIOLET, w=5, dash=(12, 9))
    c.card(880, 170, 260, 300, 30)
    c.circle(1010, 240, 40, VIOLET); c.plane(1012, 240, 24, WHITE, rot=-18)
    c.rr(930, 300, 160, 14, 7, INK, 220); c.rr(950, 324, 120, 10, 5, LILAC2)
    c.rr(910, 390, 200, 46, 23, VIOLET); c.text(1010, 413, 'Join channel', 17, WHITE, anchor='mm')
    c.spark(860, 520, 18, VIOLET); c.spark(1150, 130, 14, VIOLET2)


def cost_ftd(c):
    """A balance scale: a pile of join tokens vs one glowing deposit coin, and the coin wins."""
    c.glow(600, 260, 320, VIOLET2, 130, 100); c.grid(a=12)
    c.brand()
    cx, top = 600, 160
    c.poly([(cx - 70, 560), (cx + 70, 560), (cx + 16, 200), (cx - 16, 200)], WHITE, 230)
    c.circle(cx, top + 30, 20, LIME)
    # beam tilted: right side lower (heavier)
    ang = math.radians(9); L = 360
    lx, ly = cx - L * math.cos(ang), top + 30 - L * math.sin(ang); rx, ry = cx + L * math.cos(ang), top + 30 + L * math.sin(ang)
    c.line([(lx, ly), (rx, ry)], WHITE, w=12)
    for (px, py), heavy in (((lx, ly), False), ((rx, ry), True)):
        c.line([(px, py), (px - 90, py + 150)], WHITE, w=3, a=180); c.line([(px, py), (px + 90, py + 150)], WHITE, w=3, a=180)
        c.rr(px - 120, py + 150, 240, 22, 11, WHITE)
        if heavy:
            c.glow(px, py + 90, 90, LIME, 150, 30)
            c.circle(px, py + 92, 58, LIME); c.circle(px, py + 92, 44, None, outline=(150, 190, 60), ow=4)
            c.text(px, py + 92, '$', 50, INK, anchor='mm')
        else:
            for i, (ox, oy) in enumerate([(-80, 0), (-28, 0), (24, 0), (76, 0), (-54, -42), (0, -42), (52, -42), (-26, -84), (26, -84)]):
                c.person(px + ox, py + 124 + oy, 22, WHITE, ring=[VIOLET2, (124, 98, 255)][i % 2])
    c.chip(lx - 110, 590 - 40, 'cost per join', WHITE, 40, WHITE, 17); c.chip(rx - 80, 590 - 40, 'cost per FTD', LIME, 255, INK, 17)
    c.spark(1110, 140, 22); c.spark(110, 220, 14, WHITE)


def postbacks(c):
    """Two nodes (tracker, network) linked by a looping return arrow carrying packets."""
    c.glow(300, 200, 260, VIOLET2, 130, 100); c.glow(950, 480, 240, LIME, 50, 100); c.dots()
    c.brand()
    c.card(90, 210, 300, 220, 30)
    c.circle(160, 280, 32, VIOLET); c.circle(152, 280, 13, None, outline=WHITE, ow=4); c.circle(168, 280, 13, None, outline=LILAC2, ow=4)
    c.rr(210, 266, 150, 14, 7, INK, 220); c.rr(210, 290, 100, 10, 5, LILAC2)
    c.rr(114, 340, 252, 64, 16, LILAC); c.text(132, 372, 'sub1 = {id}', 19, VIOLET, anchor='lm')
    c.card(810, 210, 300, 220, 30)
    c.rr(840, 248, 64, 64, 18, LIME); c.text(872, 280, '$', 32, INK, anchor='mm')
    c.rr(930, 262, 150, 14, 7, INK, 220); c.rr(930, 286, 90, 10, 5, LILAC2)
    c.rr(834, 340, 252, 64, 16, LILAC); c.text(852, 372, 'status = ftd', 19, VIOLET, anchor='lm')
    # outbound (top) and the postback loop (bottom)
    c.line(smooth([(390, 260), (600, 160), (810, 260)], 20), WHITE, w=4, a=170, dash=(14, 10))
    c.poly([(810, 260), (786, 238), (782, 266)], WHITE, 200)
    c.line(smooth([(810, 390), (600, 520), (390, 390)], 20), LIME, w=7)
    c.poly([(384, 386), (414, 392), (398, 418)], LIME)
    for t, (x, y) in enumerate(((520, 482), (600, 515), (680, 482))):
        c.rr(x - 30, y - 20, 60, 40, 10, WHITE); c.poly([(x - 30, y - 18), (x, y + 4), (x + 30, y - 18)], LILAC2)
    c.chip(520, 128, 'click', WHITE, 40, WHITE, 17); c.chip(510, 560, 'postback', LIME, 255, INK, 17)
    c.spark(1120, 120, 20); c.spark(80, 520, 14, WHITE)


def utm(c):
    """Neat stacked parameter tags snapping into a tidy ordered column."""
    c.glow(950, 300, 300, VIOLET2, 140, 100); c.grid(a=12)
    c.brand()
    rows = [('utm_source', 'meta', LIME), ('utm_campaign', 'geo1_broad_v3', WHITE), ('utm_term', 'adset_lal2', WHITE), ('utm_content', 'vid07_hookB', WHITE)]
    for i, (k, v, col) in enumerate(rows):
        y = 150 + i * 104; x = 110 + (i % 2) * 26
        c.card(x, y, 560, 80, 22, WHITE)
        c.rr(x + 18, y + 18, 190, 44, 14, LILAC); c.text(x + 34, y + 40, k, 19, VIOLET, anchor='lm')
        c.text(x + 228, y + 40, '=', 22, (180, 175, 200), anchor='lm')
        c.rr(x + 256, y + 18, 280, 44, 14, col if col == LIME else (245, 243, 255)); c.text(x + 274, y + 40, v, 19, INK, anchor='lm')
    # loose tags on the right being sorted
    for i, (x, y, rot) in enumerate(((840, 160, 0), (920, 280, 0), (820, 400, 0), (980, 470, 0))):
        c.card(x, y, 200, 64, 32, [LILAC2, WHITE, LIME, WHITE][i], shadow=True)
        c.circle(x + 32, y + 32, 12, VIOLET); c.rr(x + 56, y + 26, 110, 12, 6, VIOLET, 140)
    c.line(smooth([(830, 200), (740, 230), (700, 250)], 10), WHITE, w=3, a=150, dash=(10, 8))
    c.spark(1120, 120, 22); c.spark(760, 560, 14)


def scaling(c):
    """Rising stepped bars with a smooth rocket-like trend arrow and a speedometer."""
    c.glow(900, 200, 300, VIOLET2, 140, 100); c.glow(200, 600, 260, LIME, 50, 90); c.dots()
    c.brand()
    c.card(90, 150, 640, 420, 34)
    vals = [.18, .26, .3, .42, .5, .64, .78, .92]
    bars(c, 130, 210, 560, 310, vals, [LILAC2] * 5 + [VIOLET2, VIOLET, VIOLET], gap=16, r=12)
    pts = [(130 + i * 72 + 28, 210 + 310 - v * 310 - 30) for i, v in enumerate(vals)]
    c.line(smooth(pts, 10), LIME, w=7)
    c.circle(*pts[-1], 14, LIME); c.circle(*pts[-1], 6, INK)
    c.rr(130, 176, 140, 14, 7, INK, 200)
    # gauge
    c.card(790, 180, 320, 300, 34, INK)
    gx, gy, R = 950, 380, 110
    l = c.layer(); d = ImageDraw.Draw(l)
    d.arc(c.s(gx - R, gy - R, gx + R, gy + R), 180, 360, fill=rgba((60, 50, 120)), width=22 * S)
    d.arc(c.s(gx - R, gy - R, gx + R, gy + R), 180, 300, fill=rgba(LIME), width=22 * S); c.paste(l)
    a = math.radians(300); c.line([(gx, gy), (gx + (R - 30) * math.cos(a), gy + (R - 30) * math.sin(a))], WHITE, w=6)
    c.circle(gx, gy, 12, WHITE)
    c.text(950, 430, '+20% steps', 20, WHITE, anchor='mm')
    c.spark(1120, 120, 22); c.spark(760, 560, 14, WHITE)


def bot_vs_channel(c):
    """Two funnels side by side: chat bubbles on the left, broadcast waves on the right."""
    c.glow(330, 330, 260, VIOLET2, 120, 100); c.glow(880, 330, 260, LIME, 60, 100); c.dots(a=22)
    c.brand()
    for k, cx in enumerate((330, 880)):
        top, bot = 190, 520
        c.shadow(cx - 220, top, 440, 60, 30)
        c.poly([(cx - 220, top), (cx + 220, top), (cx + 50, top + 230), (cx + 50, bot), (cx - 50, bot), (cx - 50, top + 230)], WHITE, 235)
        c.poly([(cx - 220, top), (cx + 220, top), (cx + 190, top + 34), (cx - 190, top + 34)], LILAC2)
        c.rr(cx - 50, bot - 20, 100, 20, 10, LIME)
        if k == 0:
            # chat bubbles
            c.rr(cx - 160, 92, 180, 56, 22, WHITE); c.rr(cx - 140, 110, 120, 10, 5, VIOLET, 160); c.rr(cx - 140, 128, 80, 8, 4, LILAC2)
            c.rr(cx + 10, 128, 150, 48, 20, VIOLET); c.rr(cx + 28, 146, 100, 10, 5, WHITE, 200)
            c.rr(cx - 60, 280, 120, 46, 23, VIOLET); c.text(cx, 303, '/start', 19, WHITE, anchor='mm')
            c.text(cx, 590, 'BOT', 24, WHITE, anchor='mm')
        else:
            for r, a in ((70, 200), (110, 120), (150, 60)):
                l = c.layer(); ImageDraw.Draw(l).arc(c.s(cx - r, 130 - r, cx + r, 130 + r), 200, 340, fill=rgba(WHITE, a), width=5 * S); c.paste(l)
            c.circle(cx, 130, 26, VIOLET); c.plane(cx + 1, 130, 15, WHITE, rot=-18)
            c.rr(cx - 60, 280, 120, 46, 23, VIOLET); c.text(cx, 303, 'Join', 19, WHITE, anchor='mm')
            c.text(cx, 590, 'CHANNEL', 24, WHITE, anchor='mm')
    c.text(605, 360, 'vs', 40, LIME, anchor='mm')
    c.spark(1130, 120, 20); c.spark(70, 480, 14, WHITE)


def backup(c):
    """A shield in front of stacked channel cards, one card cracked and one ready."""
    c.glow(600, 320, 330, VIOLET2, 140, 100); c.grid(a=12)
    c.brand()
    # stacked cards behind
    for i, (x, y, col, a) in enumerate(((180, 170, WHITE, 120), (820, 170, WHITE, 255))):
        c.card(x, y, 220, 300, 30, col, a)
        c.circle(x + 110, y + 80, 40, VIOLET if i else (170, 160, 210)); c.plane(x + 112, y + 80, 24, WHITE, rot=-18)
        c.rr(x + 40, y + 150, 140, 14, 7, INK if i else (190, 185, 210), 200); c.rr(x + 60, y + 176, 100, 10, 5, LILAC2)
        if i == 0:
            c.line([(x + 30, y + 40), (x + 90, y + 120), (x + 70, y + 170), (x + 140, y + 260)], ROSE, w=6)
            c.rr(x + 40, y + 226, 140, 40, 20, ROSE); c.text(x + 110, y + 246, 'banned', 17, WHITE, anchor='mm')
        else:
            c.rr(x + 40, y + 226, 140, 40, 20, LIME); c.text(x + 110, y + 246, 'backup', 17, INK, anchor='mm')
    # shield
    sx, sy = 600, 320
    c.shadow(sx - 140, sy - 170, 280, 330, 60, a=120)
    c.poly([(sx, sy - 180), (sx + 140, sy - 130), (sx + 130, sy + 40), (sx, sy + 170), (sx - 130, sy + 40), (sx - 140, sy - 130)], VIOLET)
    c.poly([(sx, sy - 150), (sx + 112, sy - 110), (sx + 104, sy + 30), (sx, sy + 136), (sx - 104, sy + 30), (sx - 112, sy - 110)], VIOLET2)
    c.line([(sx - 50, sy), (sx - 12, sy + 40), (sx + 56, sy - 40)], LIME, w=16)
    # redirect arrow
    c.line(smooth([(420, 520), (600, 580), (800, 520)], 16), LIME, w=6, dash=(14, 10))
    c.poly([(812, 512), (786, 504), (796, 532)], LIME)
    c.spark(1120, 110, 22); c.spark(110, 560, 14, WHITE)


def numbers(c):
    """A dashboard card: KPI tiles, a donut, a line chart."""
    c.glow(300, 120, 280, VIOLET2, 130, 100); c.glow(1000, 560, 240, LIME, 60, 100); c.dots()
    c.brand()
    c.card(80, 120, 1040, 460, 36, WHITE)
    for i, (lab, col) in enumerate((('ROAS', LIME), ('CPL', LILAC), ('FTD rate', LILAC))):
        x = 116 + i * 196
        c.rr(x, 156, 176, 110, 22, col)
        c.text(x + 20, 186, lab, 18, VIOLET if col != LIME else INK, anchor='lm')
        c.rr(x + 20, 214, [110, 90, 100][i], 22, 8, INK, 220)
        c.rr(x + 20, 246, 60, 8, 4, VIOLET, 120)
    # line chart
    c.rr(116, 296, 568, 250, 22, (247, 246, 252))
    for gy in (340, 400, 460, 520): c.line([(140, gy), (660, gy)], (225, 222, 238), w=2)
    p1 = [(140, 500), (220, 470), (300, 480), (380, 420), (460, 430), (540, 370), (660, 330)]
    p2 = [(140, 520), (220, 510), (300, 500), (380, 490), (460, 470), (540, 470), (660, 450)]
    c.line(smooth(p2, 10), LILAC2, w=5); c.line(smooth(p1, 10), VIOLET, w=6); c.circle(660, 330, 10, LIME, outline=VIOLET, ow=4)
    # donut
    dx, dy, R = 880, 360, 130
    l = c.layer(); d = ImageDraw.Draw(l)
    d.pieslice(c.s(dx - R, dy - R, dx + R, dy + R), -90, 130, fill=rgba(VIOLET)); d.pieslice(c.s(dx - R, dy - R, dx + R, dy + R), 130, 220, fill=rgba(VIOLET2))
    d.pieslice(c.s(dx - R, dy - R, dx + R, dy + R), 220, 270, fill=rgba(LIME)); d.ellipse(c.s(dx - 74, dy - 74, dx + 74, dy + 74), fill=rgba(WHITE)); c.paste(l)
    c.text(dx, dy, '$ ÷ $', 26, INK, anchor='mm')
    c.rr(760, 520, 240, 12, 6, LILAC2)
    c.spark(1130, 100, 22); c.spark(60, 420, 14, WHITE)


SCENES = {
    'meta_joins': (meta_joins, VIOLET, DEEP), 'capi': (capi, DEEP, VIOLET), 'fake_joins': (fake_joins, INK, VIOLET),
    'tiktok': (tiktok, DEEP, (60, 30, 140)), 'snapchat': (snapchat, LILAC, LILAC), 'cost_ftd': (cost_ftd, VIOLET, INK),
    'postbacks': (postbacks, (70, 44, 210), DEEP), 'utm': (utm, DEEP, (76, 50, 220)), 'scaling': (scaling, (80, 52, 230), INK),
    'bot_vs_channel': (bot_vs_channel, INK, (70, 44, 210)), 'backup': (backup, DEEP, (88, 58, 240)), 'numbers': (numbers, VIOLET, (40, 24, 110)),
}


# cover file stem (= post slug) -> scene
COVERS = {
    'how-to-track-telegram-channel-joins-from-meta-ads': 'meta_joins',
    'conversions-api-for-telegram-funnels-explained': 'capi',
    'why-your-cost-per-subscriber-lies': 'fake_joins',
    'tiktok-ads-to-telegram-full-setup': 'tiktok',
    'snapchat-ads-for-telegram-channels': 'snapchat',
    'cost-per-ftd-vs-cost-per-join': 'cost_ftd',
    'postbacks-101-for-media-buyers': 'postbacks',
    'utm-naming-conventions-that-survive-scale': 'utm',
    'scale-a-winning-ad-set-without-killing-it': 'scaling',
    'bot-vs-channel-funnels': 'bot_vs_channel',
    'backup-channels-ban-proof-telegram-funnel': 'backup',
    'reading-your-numbers-roas-cpl-ftd-rate': 'numbers',
}


def ensure(out_dir, stems, force=False):
    """Draw the cover for each stem whose files are missing (or all, with force). Returns the stems drawn."""
    os.makedirs(out_dir, exist_ok=True); done = []
    me = os.path.getmtime(os.path.abspath(__file__))
    for stem in stems:
        scene = COVERS.get(stem)
        if not scene: continue
        base = os.path.join(out_dir, stem)
        if force or not all(os.path.exists(base + e) and os.path.getmtime(base + e) >= me for e in ('.webp', '.jpg')):
            draw(scene, base); done.append(stem)
    lp = os.path.join(out_dir, 'joinvoo-logo.png')
    if force or not os.path.exists(lp) or os.path.getmtime(lp) < me: logo(lp)
    return done


def draw(scene, base):
    fn, top, bottom = SCENES[scene]
    c = C(top, bottom, angle=0)
    fn(c); c.save(base)


def logo(path):
    """Square publisher logo for JSON-LD (512px)."""
    n = 512 * S; im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, n, n), radius=120 * S, fill=rgba(VIOLET))
    for cx, col in ((196, WHITE), (316, LILAC2)):
        d.ellipse(((cx - 112) * S, (256 - 112) * S, (cx + 112) * S, (256 + 112) * S), outline=rgba(col), width=46 * S)
    im.resize((512, 512), Image.LANCZOS).save(path)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public', 'media', 'blog')
    print('drew', ensure(out, COVERS, force='--force' in sys.argv))
