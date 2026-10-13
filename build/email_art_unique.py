#!/usr/bin/env python3
"""Email art for the Unique people announcement: public/media/email/unique_people.png (1200x520, shown at 600x260).

Same look as the other Joinvoo email art (white, soft lilac blob, white floating cards, sparkles).
Three overlapping funnel circles full of little people; the ones in more than one funnel glow lime.
A white card says how many different people that is, with a bar for joins vs people.

    python3 build/email_art_unique.py
"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, S = 1200, 520, 2
VIOLET = (91, 61, 245); VIOLET2 = (143, 123, 255); LILAC2 = (214, 205, 255)
LIME = (200, 241, 105); LIME_D = (122, 168, 30); WHITE = (255, 255, 255); INK = (34, 26, 84); MUTED = (120, 112, 160)
MINT = (79, 212, 164); MINT_D = (31, 150, 110)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def font(size, bold=True):
    names = ['/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf', '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'] if bold else \
        ['/usr/share/fonts/opentype/inter/Inter-Medium.otf', '/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf']
    for p in names + ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, size * S)
    return ImageFont.load_default()


class Cv:
    def __init__(self): self.im = Image.new('RGBA', (W * S, H * S), WHITE + (255,))
    def lay(self): return Image.new('RGBA', self.im.size, (0, 0, 0, 0))
    def draw(self, fn, blur=0):
        l = self.lay(); fn(ImageDraw.Draw(l))
        if blur: l = l.filter(ImageFilter.GaussianBlur(blur * S))
        self.im.alpha_composite(l)


P = lambda *v: [x * S for x in v]


def blob(c):
    pts = []
    for i in range(240):
        a = i / 240 * 2 * math.pi
        r = 1 + .06 * math.sin(3 * a + 1.1) + .04 * math.cos(5 * a + .3)
        pts.append((600 + 480 * r * math.cos(a), 262 + 208 * r * math.sin(a)))
    grad = Image.linear_gradient('L').rotate(-90).resize(c.im.size)
    fill = Image.composite(Image.new('RGBA', c.im.size, (232, 226, 255, 255)), Image.new('RGBA', c.im.size, (245, 242, 255, 255)), grad)
    mask = Image.new('L', c.im.size, 0); ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in pts], fill=255)
    c.im.paste(fill, (0, 0), mask)


def spark(d, x, y, r, col):
    k = r * .3
    d.polygon([(p[0] * S, p[1] * S) for p in [(x, y - r), (x + k, y - k), (x + r, y), (x + k, y + k), (x, y + r), (x - k, y + k), (x - r, y), (x - k, y - k)]], fill=col)


def person(d, x, y, col, s=1.0):
    """A tiny person: head + shoulders."""
    d.ellipse(P(x - 7 * s, y - 15 * s, x + 7 * s, y - 1 * s), fill=col)
    d.chord(P(x - 12 * s, y + 1 * s, x + 12 * s, y + 25 * s), 180, 360, fill=col)


def card(c, x, y, w, h, r=22):
    c.draw(lambda d: d.rounded_rectangle(P(x + 4, y + 14, x + w - 4, y + h + 10), radius=r * S, fill=(91, 61, 245, 55)), blur=14)
    c.draw(lambda d: d.rounded_rectangle(P(x, y, x + w, y + h), radius=r * S, fill=WHITE + (255,), outline=(236, 232, 252, 255), width=2 * S))


def main():
    c = Cv(); blob(c)
    # three funnels
    circles = [(330, 215, VIOLET2), (470, 215, MINT), (400, 335, LIME)]
    R = 118
    for x, y, col in circles:
        c.draw(lambda d, x=x, y=y, col=col: d.ellipse(P(x - R, y - R, x + R, y + R), fill=col + (52,), outline=col + (235,), width=4 * S))
    # people, placed on a jittered grid so nobody overlaps
    rnd = random.Random(7)
    spots = []
    for gy in range(110, 470, 34):
        for gx in range(200, 610, 32):
            x, y = gx + rnd.uniform(-6, 6) + (16 if (gy // 34) % 2 else 0), gy + rnd.uniform(-5, 5)
            n = sum((x - cx) ** 2 + (y - cy) ** 2 < (R - 18) ** 2 for cx, cy, _ in circles)
            if n and rnd.random() < .78: spots.append((x, y, n))
    def people(d):
        for x, y, n in spots:
            if n == 1: person(d, x, y, (255, 255, 255, 235), .82)
    c.draw(people)
    def glow(d):
        for x, y, n in spots:
            if n > 1: d.ellipse(P(x - 15, y - 15, x + 15, y + 17), fill=LIME + (150,))
    c.draw(glow, blur=5)
    def shared(d):
        for x, y, n in spots:
            if n > 1: person(d, x, y, INK + (255,), .9)
    c.draw(shared)
    # "x3" badge on the middle
    card(c, 368, 248, 66, 44, 16)
    c.draw(lambda d: d.text(P(401, 270), '×3', font=font(20), fill=VIOLET + (255,), anchor='mm'))
    # the unique people card
    card(c, 700, 96, 380, 196, 26)
    def ucard(d):
        d.text(P(732, 136), 'Unique people', font=font(21, False), fill=MUTED + (255,), anchor='lm')
        d.text(P(732, 190), '6,000', font=font(56), fill=INK + (255,), anchor='lm')
        d.rounded_rectangle(P(732, 236, 1048, 252), radius=8 * S, fill=(237, 233, 255, 255))
        d.rounded_rectangle(P(732, 236, 732 + int(316 * 6000 / 9500), 252), radius=8 * S, fill=MINT_D + (255,))
        d.text(P(732, 272), 'from 9,500 joins', font=font(17, False), fill=MUTED + (255,), anchor='lm')
    c.draw(ucard)
    # funnels per person mini chart
    card(c, 760, 324, 300, 120, 22)
    def bars(d):
        d.text(P(786, 350), 'Funnels per person', font=font(15, False), fill=MUTED + (255,), anchor='lm')
        for i, (h, col) in enumerate([(50, MINT_D), (30, VIOLET), (16, VIOLET), (8, VIOLET)]):
            x = 790 + i * 62
            d.rounded_rectangle(P(x, 420 - h, x + 40, 420), radius=7 * S, fill=col + (255,))
            d.text(P(x + 20, 432), str(i + 1) if i < 3 else '4+', font=font(12), fill=MUTED + (255,), anchor='mm')
    c.draw(bars)
    # sparkles and dots
    def deco(d):
        spark(d, 1120, 92, 16, VIOLET2 + (255,)); spark(d, 150, 380, 12, VIOLET2 + (200,)); spark(d, 660, 66, 13, LIME + (255,))
        spark(d, 640, 470, 9, LIME + (255,)); spark(d, 1110, 420, 10, VIOLET2 + (180,))
        d.ellipse(P(176, 118, 194, 136), fill=LILAC2 + (255,)); d.ellipse(P(1084, 470, 1098, 484), fill=LIME + (255,))
        d.ellipse(P(624, 40, 650, 66), outline=LIME + (255,), width=5 * S)
    c.draw(deco)
    out = c.im.resize((W, H), Image.LANCZOS).convert('RGB')
    p = os.path.join(ROOT, 'public', 'media', 'email', 'unique_people.png')
    out.save(p, optimize=True); print(p, os.path.getsize(p))


if __name__ == '__main__':
    main()
