#!/usr/bin/env python3
"""Email art for the level_up email: public/media/email/level_up.png (1200x520) and level_up.gif (600x260).

Same look as rank_up.png: white background, soft lilac blob, white podium steps with coloured caps, sparkles, confetti.
A staircase of 7 hexagon badges (one per default level: sprout, bolt, target, fin, whale, kraken, crown). No level names
are printed because admins can rename levels. The GIF's first frame is the finished picture (for clients that only
show frame one); then the badges light up step by step, the crown pops and confetti falls.

    python3 build/email_art_level_up.py
"""
import math, os, random, shutil
from PIL import Image, ImageDraw, ImageFilter

W, H, S = 1200, 520, 2
VIOLET = (91, 61, 245); VIOLET2 = (143, 123, 255); LILAC = (239, 235, 255); LILAC2 = (214, 205, 255); LILAC3 = (226, 220, 255)
LIME = (200, 241, 105); WHITE = (255, 255, 255); INK = (54, 42, 120); GOLD = (247, 201, 72); GOLD2 = (232, 160, 40)
PINK = (255, 170, 190); CORAL = (255, 140, 120)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

N = 7
STEP_W, GAP, X0 = 128, 10, 108
TOP0, DTOP, BOTTOM = 432, 31, 470


def P(*v): return [x * S for x in v]


class Cv:
    def __init__(self):
        self.im = Image.new('RGBA', (W * S, H * S), WHITE + (255,))

    def lay(self): return Image.new('RGBA', self.im.size, (0, 0, 0, 0))

    def put(self, l, blur=0):
        if blur: l = l.filter(ImageFilter.GaussianBlur(blur * S))
        self.im.alpha_composite(l)

    def draw(self, fn, blur=0, alpha=255):
        l = self.lay(); fn(ImageDraw.Draw(l))
        if alpha < 255: l.putalpha(l.getchannel('A').point(lambda a: a * alpha // 255))
        self.put(l, blur)


def blob(c):
    pts = []
    for i in range(240):
        a = i / 240 * 2 * math.pi
        r = 1 + .06 * math.sin(3 * a + .6) + .04 * math.cos(5 * a)
        pts.append((600 + 470 * r * math.cos(a), 262 + 205 * r * math.sin(a)))
    grad = Image.linear_gradient('L').rotate(-90).resize(c.im.size)
    a = Image.new('RGBA', c.im.size, (244, 241, 255, 255)); b = Image.new('RGBA', c.im.size, (232, 226, 255, 255))
    fill = Image.composite(b, a, grad)
    mask = Image.new('L', c.im.size, 0); ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in pts], fill=255)
    c.im.paste(fill, (0, 0), mask)


def spark(d, x, y, r, col):
    k = r * .3
    d.polygon([(p[0] * S, p[1] * S) for p in [(x, y - r), (x + k, y - k), (x + r, y), (x + k, y + k), (x, y + r), (x - k, y + k), (x - r, y), (x - k, y - k)]], fill=col)


def hexagon(cx, cy, r, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + 60 * i)), cy + r * math.sin(math.radians(rot + 60 * i))) for i in range(6)]


def step_geom(i):
    x = X0 + i * (STEP_W + GAP); top = TOP0 - i * DTOP
    return x, top


CAPS = [(222, 160, 120), (200, 202, 214), (186, 176, 255), (160, 146, 255), (124, 104, 250), (102, 78, 246), (247, 201, 72)]


def steps(c):
    for i in range(N):
        x, top = step_geom(i)
        c.draw(lambda d: d.rounded_rectangle(P(x + 6, top + 22, x + STEP_W - 6, BOTTOM + 20), radius=26 * S, fill=(91, 61, 245, 60)), blur=14)
        c.draw(lambda d: d.rounded_rectangle(P(x, top, x + STEP_W, BOTTOM), radius=20 * S, fill=WHITE + (255,), outline=(236, 232, 252, 255), width=2 * S))
        cap = CAPS[i]
        c.draw(lambda d: d.rounded_rectangle(P(x, top - 4, x + STEP_W, top + 14), radius=9 * S, fill=cap + (255,)))
        # step number dots, quietly showing progress
        for k in range(i + 1):
            c.draw(lambda d: d.ellipse(P(x + 18 + k * 13 - 4, BOTTOM - 26, x + 18 + k * 13 + 4, BOTTOM - 18), fill=LILAC2 + (255,)))
    c.draw(lambda d: d.rounded_rectangle(P(X0 - 20, BOTTOM - 2, X0 + N * (STEP_W + GAP) + 10, BOTTOM + 10), radius=6 * S, fill=(221, 214, 255, 255)))


# ---------- level icons (white on the badge), drawn around (0,0) with size u ----------

def icon(d, kind, cx, cy, u, col):
    T = lambda pts: [((cx + px * u) * S, (cy + py * u) * S) for px, py in pts]
    E = lambda x0, y0, x1, y1: P(cx + x0 * u, cy + y0 * u, cx + x1 * u, cy + y1 * u)
    w = max(2, int(u * .16)) * S
    if kind == 'sprout':
        d.line(T([(0, .7), (0, -.1)]), fill=col, width=w)
        d.ellipse(E(-.75, -.55, -.02, -.05), fill=col); d.ellipse(E(.02, -.8, .7, -.25), fill=col)
    elif kind == 'bolt':
        d.polygon(T([(.15, -.9), (-.5, .12), (-.04, .12), (-.22, .9), (.5, -.2), (.06, -.2), (.3, -.9)]), fill=col)
    elif kind == 'target':
        d.ellipse(E(-.8, -.8, .8, .8), outline=col, width=w); d.ellipse(E(-.45, -.45, .45, .45), outline=col, width=w); d.ellipse(E(-.14, -.14, .14, .14), fill=col)
    elif kind == 'fin':
        d.polygon(T([(-.55, .35), (.05, -.85), (.15, -.3), (.55, .35)]), fill=col)
        d.line(T([(-.85, .55), (-.45, .4), (0, .55), (.45, .4), (.85, .55)]), fill=col, width=w, joint='curve')
    elif kind == 'whale':
        d.chord(E(-.95, -.45, .55, .75), 180, 360, fill=col); d.chord(E(-.95, -.05, .55, .45), 0, 180, fill=col)
        d.polygon(T([(.35, .05), (.62, -.12), (.7, .2), (.5, .3)]), fill=col)
        d.polygon(T([(.6, -.1), (.98, -.48), (.86, -.08)]), fill=col); d.polygon(T([(.6, -.1), (.62, -.6), (.8, -.2)]), fill=col)
        d.ellipse(E(-.62, -.02, -.46, .14), fill=VIOLET + (255,))
        d.arc(E(-.75, .02, -.1, .32), 20, 160, fill=VIOLET + (255,), width=max(2, int(u * .08)) * S)
        for sx, sy in ((-.35, -.55), (-.2, -.78), (-.05, -.55)): d.ellipse(E(sx - .09, sy - .09, sx + .09, sy + .09), fill=col)
    elif kind == 'kraken':
        d.ellipse(E(-.45, -.85, .45, .15), fill=col)
        for k in (-.6, -.2, .2, .6):
            d.line(T([(k * .7, 0), (k, .45), (k * 1.15, .8)]), fill=col, width=w, joint='curve')
    elif kind == 'crown':
        d.polygon(T([(-.85, .45), (-.85, -.35), (-.42, .02), (0, -.65), (.42, .02), (.85, -.35), (.85, .45)]), fill=col)
        for px, py in ((-.85, -.45), (0, -.78), (.85, -.45)): d.ellipse(E(px - .13, py - .13, px + .13, py + .13), fill=col)


KINDS = ['sprout', 'bolt', 'target', 'fin', 'whale', 'kraken', 'crown']


def badge(c, i, lit, scale=1.0, glow=0.0):
    x, top = step_geom(i)
    cx = x + STEP_W / 2
    top_badge = i == N - 1; whale = i == 4
    r = (56 if top_badge else 46 if whale else 34 + i * 1.5) * scale
    cy = top - (r + 22 if not top_badge else r + 34)
    if top_badge and lit:  # rays
        def rays(d):
            for k in range(12):
                a = math.radians(k * 30 + 8)
                d.polygon(P(cx, cy, cx + 112 * math.cos(a - .1), cy + 112 * math.sin(a - .1), cx + 112 * math.cos(a + .1), cy + 112 * math.sin(a + .1)), fill=(247, 201, 72, 60 if k % 2 else 34))
        c.draw(rays, blur=2)
    if glow:
        c.draw(lambda d: d.ellipse(P(cx - r * 1.6, cy - r * 1.6, cx + r * 1.6, cy + r * 1.6), fill=LIME + (int(170 * glow),)), blur=18)
    if top_badge and lit:  # ribbon tails
        c.draw(lambda d: (d.polygon(P(cx - 30, cy + 20, cx - 6, cy + 30, cx - 18, cy + r + 34, cx - 30, cy + r + 20, cx - 42, cy + r + 34), fill=VIOLET + (255,)),
                          d.polygon(P(cx + 6, cy + 30, cx + 30, cy + 20, cx + 42, cy + r + 34, cx + 30, cy + r + 20, cx + 18, cy + r + 34), fill=VIOLET2 + (255,))))
    c.draw(lambda d: d.polygon([(px * S, py * S) for px, py in hexagon(cx, cy + 10, r)], fill=(70, 40, 200, 70 if lit else 25)), blur=10)
    if lit:
        a, b = ((255, 220, 110), GOLD2) if top_badge else (VIOLET2, VIOLET)
    else:
        a, b = (LILAC3, LILAC2)
    # vertical gradient hexagon
    l = c.lay(); m = Image.new('L', l.size, 0); ImageDraw.Draw(m).polygon([(px * S, py * S) for px, py in hexagon(cx, cy, r)], fill=255)
    g = Image.linear_gradient('L').resize((int(2 * r * S) + 2, int(2 * r * S) + 2))
    tile = Image.composite(Image.new('RGBA', g.size, b + (255,)), Image.new('RGBA', g.size, a + (255,)), g)
    l.paste(tile, (int((cx - r) * S), int((cy - r) * S))); l.putalpha(m); c.put(l)
    c.draw(lambda d: d.polygon([(px * S, py * S) for px, py in hexagon(cx, cy, r * .8)], outline=(255, 255, 255, 120 if lit else 200), width=2 * S))
    if whale and lit:
        c.draw(lambda d: d.polygon([(px * S, py * S) for px, py in hexagon(cx, cy, r + 9)], outline=LIME + (255,), width=5 * S))
    col = (WHITE + (255,)) if lit else (182, 170, 240, 255)
    if top_badge and lit: col = (255, 255, 255, 255)
    c.draw(lambda d: icon(d, KINDS[i], cx, cy, r * .5, col))
    return cx, cy, r


rnd = random.Random(11)
CONF = [(rnd.uniform(-1, 1), rnd.uniform(.2, 1), rnd.choice([LIME, VIOLET2, GOLD, PINK, VIOLET, (125, 214, 255)]), rnd.uniform(0, 360), rnd.choice('rcs')) for _ in range(46)]


def confetti(c, cx, cy, t, a=255):
    """t in 0..1: burst outwards from the crown, then drift down."""
    def go(d):
        for k, (dx, sp, col, rot, kind) in enumerate(CONF):
            x = cx + dx * 420 * min(1, t * 1.6) * sp
            y = cy - 20 - 70 * sp * math.sin(min(1, t * 1.4) * math.pi * .9) + 260 * max(0, t - .35) ** 1.5 * sp + (k % 5) * 6
            if t >= 1: y = cy - 70 + (k * 37 % 280) - 20 * sp; x = cx + dx * 470 * sp
            rr = 5 + (k % 3) * 2
            ang = math.radians(rot + t * 400)
            if kind == 'r':
                pts = [(x + rr * 1.6 * math.cos(ang + q), y + rr * .8 * math.sin(ang + q)) for q in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
                d.polygon([(px * S, py * S) for px, py in [(x + rr * 1.6 * math.cos(ang), y + rr * 1.6 * math.sin(ang)), (x + rr * .7 * math.cos(ang + 1.57), y + rr * .7 * math.sin(ang + 1.57)), (x - rr * 1.6 * math.cos(ang), y - rr * 1.6 * math.sin(ang)), (x - rr * .7 * math.cos(ang + 1.57), y - rr * .7 * math.sin(ang + 1.57))]], fill=col + (a,))
            elif kind == 'c':
                d.ellipse(P(x - rr * .7, y - rr * .7, x + rr * .7, y + rr * .7), fill=col + (a,))
            else:
                d.arc(P(x - rr, y - rr, x + rr, y + rr), int(rot), int(rot) + 200, fill=col + (a,), width=3 * S)
    c.draw(go)


def decor(c):
    def go(d):
        spark(d, 120, 120, 14, (180, 168, 255, 255)); spark(d, 1110, 90, 10, (180, 168, 255, 255)); spark(d, 70, 300, 9, LIME + (255,))
        d.line(P(1120, 330, 1144, 330), fill=(200, 190, 255, 255), width=4 * S); d.line(P(1132, 318, 1132, 342), fill=(200, 190, 255, 255), width=4 * S)
        d.ellipse(P(1150, 420, 1166, 436), fill=(214, 205, 255, 255)); d.ellipse(P(300, 80, 312, 92), fill=LIME + (255,))
        for k in range(7):  # dotted climb trail
            a = k / 6
            x = 200 + a * 520; y = 300 - a * 150 - 40 * math.sin(a * math.pi)
            d.ellipse(P(x - 3, y - 3, x + 3, y + 3), fill=(190, 178, 255, 255))
    c.draw(go)


def frame(lit=N, crown_scale=1.0, conf=1.0, glow_i=None, glow=0.0):
    c = Cv(); blob(c); decor(c); steps(c)
    crown_pos = None
    for i in range(N):
        sc = crown_scale if i == N - 1 else 1.0
        pos = badge(c, i, i < lit, sc if i < lit else 1.0, glow if i == glow_i else 0)
        if i == N - 1: crown_pos = pos
    def sp(d):
        cx, cy, r = crown_pos
        if lit >= N:
            spark(d, cx + r + 26, cy - r - 4, 18, LIME + (255,)); spark(d, cx - r - 30, cy - r + 14, 11, GOLD + (255,)); spark(d, cx + r + 10, cy + r - 6, 9, VIOLET2 + (255,))
    c.draw(sp)
    if conf is not None and lit >= N:
        confetti(c, crown_pos[0], crown_pos[1], conf)
    return c.im.resize((W, H), Image.LANCZOS).convert('RGB')


def main():
    out = os.path.join(ROOT, 'public', 'media', 'email'); os.makedirs(out, exist_ok=True)
    final = frame()
    final.save(os.path.join(out, 'level_up.png'), optimize=True)
    small = lambda im: im.resize((600, 260), Image.LANCZOS)
    frames, durs = [small(final)], [1400]  # frame 1 = the finished picture
    frames.append(small(frame(lit=0, conf=None))); durs.append(160)
    for i in range(N - 1):  # climb: light badges one by one, each with a lime pulse
        frames.append(small(frame(lit=i + 1, conf=None, glow_i=i, glow=1.0))); durs.append(140)
        frames.append(small(frame(lit=i + 1, conf=None, glow_i=i, glow=.35))); durs.append(90)
    for k, sc in enumerate((.6, 1.18, .94, 1.04, 1.0)):  # crown pops in
        frames.append(small(frame(lit=N, crown_scale=sc, conf=None if k < 1 else (k - 1) * .12, glow_i=N - 1, glow=1 - k * .2))); durs.append(80)
    for t in (.6, .72, .84, .95):  # confetti falls
        frames.append(small(frame(lit=N, conf=t))); durs.append(90)
    frames.append(small(final)); durs.append(1800)
    # shared palette from the final frame keeps colours stable and the file small
    pal = frames[0].quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    pl = pal.getpalette()[:96 * 3]  # snap the lightest entry to pure white so backgrounds match the email body
    wi = max(range(96), key=lambda i: sum(pl[i * 3:i * 3 + 3])); pl[wi * 3:wi * 3 + 3] = [255, 255, 255]; pal.putpalette(pl)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    bg = q[0].getpixel((2, 2)); pl = q[0].getpalette(); pl[bg * 3:bg * 3 + 3] = [255, 255, 255]  # Pillow maps white to a near-white entry
    for f in q: f.putpalette(pl)
    gp = os.path.join(out, 'level_up.gif')
    q[0].save(gp, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=True, disposal=1)
    dist = os.path.join(ROOT, 'dist', 'media', 'email'); os.makedirs(dist, exist_ok=True)
    for n in ('level_up.png', 'level_up.gif'): shutil.copy2(os.path.join(out, n), os.path.join(dist, n))
    print('level_up.png', os.path.getsize(os.path.join(out, 'level_up.png')), 'level_up.gif', os.path.getsize(gp), len(q), 'frames')


if __name__ == '__main__':
    main()
