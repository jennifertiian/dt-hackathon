from PIL import Image
import math, random, sys

W, H = 480, 270
rng = random.Random(7)

def h(c, a=255):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)

# ---------------- palette (warm + sage, from reference 1) ----------------
OL   = h("#6e4a3c")   # warm brown outline
OLD  = h("#4f362e")
# wall / ceiling
WL0 = h("#fbf4e4"); WL1 = h("#f4e9d2"); WL2 = h("#e9dbbf"); WL3 = h("#d9c6a2")
CE0 = h("#efe3c9"); CE1 = h("#e3d3b2")
# wood
W1 = h("#a8714e"); W2 = h("#c9945f"); W3 = h("#ddb07a"); W4 = h("#ecca97"); W5 = h("#f6e0b8")
# sky
SK0 = h("#b9dfec"); SK1 = h("#cbe8ef"); SK2 = h("#dcf0ee"); SK3 = h("#ecf6e9")
CL0 = h("#ffffff"); CL1 = h("#e6f2f2"); CL2 = h("#cfe3e8")
# greens
G0 = h("#4c7547"); G1 = h("#64924f"); G2 = h("#84b25e"); G3 = h("#a9cd72"); G4 = h("#d3e595")
HL0 = h("#9cc0a6"); HL1 = h("#b6d3b4"); HL2 = h("#cfe2c2")    # distant hills
# blossom
P0 = h("#c46f8b"); P1 = h("#e595ab"); P2 = h("#f4b8c7"); P3 = h("#fbd9e1"); P4 = h("#fff0f3")
# trunk
T0 = h("#5e3f32"); T1 = h("#7f5640"); T2 = h("#9c6e50")
# misc
CU0 = h("#fffaf0"); CU1 = h("#f3e6cf"); CU2 = h("#e2cfae"); CUO = h("#c4a37f")
RB0 = h("#8a5a3c"); RB1 = h("#b07a52")
ST0 = h("#80869e"); ST1 = h("#a9afc4"); ST2 = h("#d5d9e5")
TC0 = h("#a85a45"); TC1 = h("#cf7a5a"); TC2 = h("#e8a07a"); TC3 = h("#f4c19c")
CAT0 = h("#b9783f"); CAT1 = h("#e8a65c"); CAT2 = h("#f7cf8f"); CAT3 = h("#fff1d8")

img = Image.new("RGBA", (W, H), WL1)
px = img.load()

def inb(x, y): return 0 <= x < W and 0 <= y < H
def p(x, y, c, im=None):
    q = (im or img).load() if im else px
    if inb(x, y): q[x, y] = c
def rect(x0, y0, x1, y1, c, im=None):
    q = im.load() if im else px
    for y in range(max(0, y0), min(H - 1, y1) + 1):
        for x in range(max(0, x0), min(W - 1, x1) + 1):
            q[x, y] = c
def hline(x0, x1, y, c, im=None): rect(x0, y, x1, y, c, im)
def vline(x, y0, y1, c, im=None): rect(x, y0, x, y1, c, im)
def blend(x, y, c, a, im=None):
    q = im.load() if im else px
    if not inb(x, y): return
    o = q[x, y]
    q[x, y] = tuple(int(o[i] * (1 - a) + c[i] * a) for i in range(3)) + (255,)
def disc(cx, cy, r):
    pts = []
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6:
                pts.append((x, y))
    return pts
def outline(mask, c, im=None):
    q = im.load() if im else px
    for (x, y) in list(mask):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in mask and inb(*n):
                q[n] = c

# =====================================================================
# OUTSIDE (drawn on its own layer, revealed through the glass)
# =====================================================================
out = Image.new("RGBA", (W, H), SK0)
op = out.load()
# sky gradient (banded, pixel-art style)
for y in range(H):
    c = SK0 if y < 62 else SK1 if y < 88 else SK2 if y < 108 else SK3
    for x in range(W): op[x, y] = c
# dithered band edges
for yb, ca in ((62, SK1), (88, SK2), (108, SK3)):
    for x in range(W):
        if x % 2 == 0: op[x, yb - 1] = ca

def cloud(cx, cy, s, im):
    q = im.load()
    blobs = [(cx, cy, 6 * s), (cx - 8 * s, cy + 2 * s, 5 * s), (cx + 9 * s, cy + 2 * s, 5 * s),
             (cx - 3 * s, cy - 3 * s, 5 * s), (cx + 15 * s, cy + 4 * s, 3.5 * s), (cx - 14 * s, cy + 4 * s, 3 * s)]
    m = set()
    for b in blobs: m.update(disc(*b))
    base = cy + 5 * s
    m = {pt for pt in m if pt[1] <= base}
    for (x, y) in m:
        if inb(x, y):
            q[x, y] = CL0 if y < cy + 1 * s else CL1 if y < base - 1 else CL2
    for (x, y) in m:
        if (x, y - 1) not in m and inb(x, y - 1): pass

cloud(50, 64, 0.9, out)
cloud(110, 76, 0.6, out)
cloud(410, 62, 0.9, out)
cloud(456, 80, 0.5, out)

# distant hills
for x in range(W):
    hy = int(122 + 6 * math.sin(x / 23.0) + 3 * math.sin(x / 9.0 + 1))
    for y in range(hy, H): op[x, y] = HL1
    op[x, hy] = HL2
    hy2 = int(132 + 4 * math.sin(x / 31.0 + 2) + 2 * math.sin(x / 7.0))
    for y in range(hy2, H): op[x, y] = HL0
    op[x, hy2] = HL1
# near meadow
for x in range(W):
    gy = int(142 + 2 * math.sin(x / 17.0))
    for y in range(gy, H):
        op[x, y] = G3 if y < gy + 6 else G2
    op[x, gy] = G4
# grass tufts + flowers
for i in range(160):
    x = rng.randrange(W); y = rng.randrange(150, 168)
    op[x, y] = G1;
    if inb(x - 1, y + 1): op[x - 1, y + 1] = G1
    if inb(x + 1, y + 1): op[x + 1, y + 1] = G1
for i in range(60):
    x = rng.randrange(W); y = rng.randrange(146, 168)
    op[x, y] = rng.choice([CL0, h("#f7d26e"), CL1, G4])

def canopy(blobs, cols, olc, im, speck=None):
    """layered blob shading: dark base, mid, light, highlight — classic pixel-art foliage"""
    q = im.load()
    dark, mid, light, hi = cols
    m = set()
    for (cx, cy, r) in blobs: m.update(disc(cx, cy, r))
    for (x, y) in m:
        if inb(x, y): q[x, y] = dark
    for (cx, cy, r) in blobs:
        for (x, y) in disc(cx - 1, cy - 2, r - 2):
            if (x, y) in m and inb(x, y): q[x, y] = mid
    for (cx, cy, r) in blobs:
        for (x, y) in disc(cx - 2, cy - 4, r - 5):
            if (x, y) in m and inb(x, y): q[x, y] = light
    # leaf clumps: little lit bumps with a shadow crescent underneath
    pts = sorted(m)
    for _ in range(len(m) // 22):
        x, y = rng.choice(pts)
        if not inb(x, y) or q[x, y] == dark: continue
        top = q[x, y]
        up = light if top == mid else hi
        for (dx, dy) in ((-1, 0), (0, 0), (1, 0), (0, -1)):
            if (x + dx, y + dy) in m and inb(x + dx, y + dy): q[x + dx, y + dy] = up
        for (dx, dy) in ((-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1)):
            if (x + dx, y + dy) in m and inb(x + dx, y + dy) and q[x + dx, y + dy] != up:
                q[x + dx, y + dy] = mid if top == light else dark
    if speck:
        for _ in range(len(m) // 32):
            x, y = rng.choice(list(m))
            if inb(x, y) and q[x, y] in (mid, light): q[x, y] = speck
    outline(m, olc, im)
    return m

def thick_line(x0, y0, x1, y1, w0, w1, im):
    q = im.load()
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
        w = w0 + (w1 - w0) * t
        for dx in range(-int(w // 2), int(w - w // 2)):
            xx = int(round(x)) + dx; yy = int(round(y))
            if inb(xx, yy): q[xx, yy] = T1 if dx > -int(w // 2) else T2
            if inb(xx, yy + 1) and dx == int(w - w // 2) - 1: q[xx, yy + 1] = T0

def tree_trunk(cx, ytop, ybot, w, forks, im):
    q = im.load()
    x0 = cx - w // 2
    for y in range(ytop, ybot + 1):
        flare = 2 if y > ybot - 3 else (1 if y > ybot - 7 else 0)
        for x in range(x0 - flare, x0 + w + flare):
            rel = x - (x0 - flare)
            if inb(x, y): q[x, y] = T2 if rel <= 1 else T1 if rel < w + 2 * flare - 1 else T0
        if inb(x0 - flare - 1, y): q[x0 - flare - 1, y] = T0
        if inb(x0 + w + flare, y): q[x0 + w + flare, y] = T0
    # bark marks
    for y in range(ytop + 4, ybot - 4, 7):
        if inb(cx, y): q[cx, y] = T0
        if inb(cx, y + 1): q[cx, y + 1] = T0
    # branches reaching up into the canopy
    for (sy, tx, ty) in forks:
        thick_line(cx, sy, tx, ty, 3, 2, im)

# =====================================================================
# ROOM
# =====================================================================
FLOOR_Y = 206
RAIL = FLOOR_Y - 42
# ceiling
rect(0, 0, W - 1, 9, CE0)
hline(0, W - 1, 9, CE1)
# crown molding
hline(0, W - 1, 10, W4); hline(0, W - 1, 11, W3); hline(0, W - 1, 12, W2); hline(0, W - 1, 13, OL)
hline(0, W - 1, 14, WL2)     # shade under molding
hline(0, W - 1, 15, WL2)
for x in range(0, W, 2): px[x, 16] = WL2

# wall texture — very sparse plaster flecks
for _ in range(500):
    x = rng.randrange(W); y = rng.randrange(17, RAIL - 6)
    px[x, y] = WL0 if rng.random() < 0.6 else WL2

# blocky wall texture: soft 16px courses with a 1px shade line, offset every row like stacked blocks
for row, y0 in enumerate(range(17, RAIL - 1, 16)):
    for x in range(W):
        blend(x, y0, WL2, 0.35)
    off = 0 if row % 2 == 0 else 16
    for x in range(off, W, 32):
        for y in range(y0, min(RAIL - 2, y0 + 16)):
            blend(x, y, WL2, 0.30)

# ---------------- windows ----------------
def window(x0, y0, x1, y1, open_gap=None):
    # recess / frame
    rect(x0, y0, x1, y1, OL)
    rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, W2)
    hline(x0 + 1, x1 - 1, y0 + 1, W4); vline(x0 + 1, y0 + 1, y1 - 1, W3)
    hline(x0 + 2, x1 - 1, y1 - 1, W1); vline(x1 - 1, y0 + 2, y1 - 1, W1)
    gx0, gy0, gx1, gy1 = x0 + 4, y0 + 4, x1 - 4, y1 - 4
    # reveal the landscape
    for y in range(gy0, gy1 + 1):
        for x in range(gx0, gx1 + 1):
            px[x, y] = op[x, min(H - 1, max(0, y - 2))]
    # inner frame shadow
    rect(gx0 - 1, gy0 - 1, gx1 + 1, gy0 - 1, OL)
    vline(gx0 - 1, gy0, gy1 + 1, OL); vline(gx1 + 1, gy0, gy1 + 1, OL); hline(gx0, gx1, gy1 + 1, OL)
    # transom bar
    ty = gy0 + 22
    rect(gx0, ty, gx1, ty + 3, W2); hline(gx0, gx1, ty, W4); hline(gx0, gx1, ty + 3, W1)
    hline(gx0, gx1, ty - 1, OL); hline(gx0, gx1, ty + 4, OL)
    # transom divider
    mx = (gx0 + gx1) // 2
    rect(mx - 1, gy0, mx + 1, ty - 1, W2); vline(mx - 1, gy0, ty - 1, W4); vline(mx + 1, gy0, ty - 1, W1)
    # lower sashes
    panes = []
    if open_gap:
        # left sash fixed, right sash slid left over it, gap open on the right
        sashes = [(gx0, mx + 1), (mx - open_gap + 1, gx1 - open_gap)]
    else:
        sashes = [(gx0, mx + 1), (mx, gx1)]
    for i, (sx0, sx1) in enumerate(sashes):
        sy0, sy1 = ty + 4, gy1
        for t in range(2):
            vline(sx0 + t, sy0, sy1, W3 if t == 0 else W2)
            vline(sx1 - t, sy0, sy1, W1 if t == 0 else W2)
        vline(sx0 - 1 if sx0 > gx0 else sx0, sy0, sy1, OL) if False else None
        vline(sx0 + 2, sy0, sy1, OL); vline(sx1 - 2, sy0, sy1, OL)
        # little handle on meeting rail
        hx = sx1 - 4 if i == 0 else sx0 + 4
        rect(hx - 1 if i == 0 else hx, sy0 + 34, hx if i == 0 else hx + 1, sy0 + 38, ST1)
        p(hx, sy0 + 34, ST2)
        panes.append((sx0 + 3, ty + 5, sx1 - 3, gy1))
    # glass reflections (soft diagonal streaks) on all glazed areas
    glazed = [(gx0, gy0, mx - 2, ty - 1), (mx + 2, gy0, gx1, ty - 1)] + panes
    for (a0, b0, a1, b1) in glazed:
        for y in range(b0, b1 + 1):
            for x in range(a0, a1 + 1):
                blend(x, y, CL0, 0.10)
                k = (x - a0) + (y - b0)
                if 14 <= k % 46 <= 16 or 20 <= k % 46 <= 20:
                    blend(x, y, CL0, 0.45)
    return mx, ty, gx0, gx1, gy0, gy1

LWIN = (12, 56, 124, 156)
RWIN = (356, 56, 468, 156)
lw = window(*LWIN, open_gap=22)
rw = window(*RWIN)

# ---------------- curtains ----------------
def curtain(xa, ytop, ybot, side):
    """side = -1 for a left-hand curtain (gathers toward the left), +1 for right"""
    tie = ytop + (ybot - ytop) // 2
    m = set()
    for y in range(ytop, ybot + 1):
        if y <= tie:
            wdt = int(14 - 7 * (y - ytop) / (tie - ytop))
        else:
            wdt = int(7 + 7 * min(1, (y - tie) / 40))
        for k in range(wdt):
            x = xa + k if side < 0 else xa - k
            m.add((x, y))
    for (x, y) in m:
        k = abs(x - xa)
        px[x, y] = CU0 if (k // 3) % 2 == 0 else CU1
        if k % 3 == 2: px[x, y] = CU2 if (k // 3) % 2 else CU1
    outline(m, CUO)
    # hem
    for (x, y) in m:
        if y == ybot: px[x, y] = CU2
    # ribbon tie
    if True:
        xs = sorted(x for (x, y) in m if y == tie)
        for x in range(xs[0] - 1, xs[-1] + 2):
            px[x, tie - 1] = RB0; px[x, tie] = RB1; px[x, tie + 1] = RB0
        bx = xs[-1] + 2 if side < 0 else xs[0] - 2
        for (dx, dy, c) in ((0, -2, RB0), (1, -2, RB1), (0, 2, RB0), (1, 2, RB1), (0, -1, RB1), (0, 1, RB1), (0, 0, RB0)):
            px[bx + dx * (-side if side > 0 else 1), tie + dy] = c

for (x0, y0, x1, y1) in (LWIN, RWIN):
    # rod
    hline(x0 - 8, x1 + 8, y0 - 3, OL); hline(x0 - 7, x1 + 7, y0 - 2, W3); hline(x0 - 8, x1 + 8, y0 - 1, OL)
    for kx in (x0 - 10, x1 + 9):
        rect(kx, y0 - 4, kx + 2, y0, OL); p(kx + 1, y0 - 3, W4); p(kx + 1, y0 - 2, W3)
    curtain(x0 - 4, y0 - 1, y1 + 2, -1)
    curtain(x1 + 4, y0 - 1, y1 + 2, +1)

# ---------------- window sills + little plants ----------------
for (x0, y0, x1, y1) in (LWIN, RWIN):
    sy = y1 + 1
    rect(x0 - 6, sy, x1 + 6, sy + 4, OL)
    hline(x0 - 5, x1 + 5, sy + 1, W5); hline(x0 - 5, x1 + 5, sy + 2, W3); hline(x0 - 5, x1 + 5, sy + 3, W2)
    hline(x0 - 4, x1 + 4, sy + 5, WL3)   # shadow on wall

def pot(cx, base, wdt=6, hgt=5):
    x0 = cx - wdt // 2
    rect(x0, base - hgt, x0 + wdt - 1, base, OL)
    rect(x0 + 1, base - hgt + 1, x0 + wdt - 2, base - 1, TC1)
    hline(x0 - 1, x0 + wdt, base - hgt, OL); hline(x0, x0 + wdt - 1, base - hgt + 1, TC2)
    vline(x0 + 1, base - hgt + 2, base - 1, TC2); vline(x0 + wdt - 2, base - hgt + 2, base - 1, TC0)
    return base - hgt

SILL_TOP = 156
t = pot(28, SILL_TOP, 7, 5)
m = set(); [m.update(disc(*b)) for b in ((28, t - 3, 3), (25, t - 2, 2.2), (31, t - 2, 2.2))]
for (x, y) in m: px[x, y] = G2 if y < t - 2 else G1
for (x, y) in m:
    if y <= t - 5: px[x, y] = G3
outline(m, G0)
t = pot(40, SILL_TOP, 5, 4)
for (x, y, c) in ((40, t - 1, G1), (40, t - 2, G1), (40, t - 3, G1), (39, t - 3, G2), (41, t - 4, G2),
                  (39, t - 5, G2), (40, t - 5, G3), (41, t - 6, G3), (38, t - 6, G1), (40, t - 6, G2), (40, t - 7, G3)):
    p(x, y, c)
# right sill: cactus + jar of blossom sprigs
t = pot(452, SILL_TOP, 6, 4)
rect(450, t - 8, 453, t - 1, G0); rect(451, t - 7, 452, t - 1, G2); vline(451, t - 7, t - 2, G3)
p(449, t - 5, G0); p(449, t - 4, G1); p(454, t - 6, G0); p(454, t - 5, G1)
rect(438, SILL_TOP - 6, 442, SILL_TOP, OL); rect(439, SILL_TOP - 5, 441, SILL_TOP - 1, h("#cfe8ec")); p(439, SILL_TOP - 5, CL0)
for (x, y, c) in ((440, SILL_TOP - 7, G1), (439, SILL_TOP - 8, G1), (441, SILL_TOP - 9, G1), (438, SILL_TOP - 10, G2),
                  (439, SILL_TOP - 10, G3), (441, SILL_TOP - 11, G2), (442, SILL_TOP - 10, G1), (440, SILL_TOP - 12, G3)):
    p(x, y, c)

# ---------------- wainscot ----------------
# (RAIL defined with FLOOR_Y)
hline(0, W - 1, RAIL - 1, OL)
hline(0, W - 1, RAIL, W5); hline(0, W - 1, RAIL + 1, W4); hline(0, W - 1, RAIL + 2, W2); hline(0, W - 1, RAIL + 3, OL)
rect(0, RAIL + 4, W - 1, FLOOR_Y - 7, W3)
hline(0, W - 1, RAIL + 4, W2)   # shadow under rail
# raised panels
PW, GAP = 36, 4
x = 2
while x < W:
    a0, a1, b0, b1 = x, x + PW - 1, RAIL + 8, FLOOR_Y - 11
    rect(a0, b0, a1, b1, W2)
    rect(a0 + 1, b0 + 1, a1 - 1, b1 - 1, W3)
    hline(a0 + 1, a1 - 1, b0 + 1, W4); vline(a0 + 1, b0 + 1, b1 - 1, W4)
    hline(a0 + 1, a1, b1, W5); vline(a1, b0 + 1, b1, W5)
    hline(a0, a1, b0, W1); vline(a0, b0, b1, W1)
    # wood grain
    for gy in (b0 + 6, b0 + 13, b0 + 19):
        gx = a0 + 4 + rng.randrange(8)
        hline(gx, min(a1 - 3, gx + 6 + rng.randrange(10)), gy, W2)
    x += PW + GAP
# baseboard
hline(0, W - 1, FLOOR_Y - 7, OL)
rect(0, FLOOR_Y - 6, W - 1, FLOOR_Y - 1, W1)
hline(0, W - 1, FLOOR_Y - 6, W2)
hline(0, W - 1, FLOOR_Y - 1, OLD)

# ---------------- floor ----------------
PH = 7
for row, y0 in enumerate(range(FLOOR_Y, H, PH)):
    off = (row * 23) % 60
    for y in range(y0, min(H, y0 + PH)):
        for x in range(W):
            c = W4 if y == y0 + 1 else (W3 if y < y0 + PH - 1 else W2)
            px[x, y] = c
        if y == y0:
            for x in range(W): px[x, y] = W1 if row else OLD
    for sx in range(-off, W, 60):
        if 0 <= sx < W:
            vline(sx, y0 + 1, min(H - 1, y0 + PH - 1), W1)
            if sx + 1 < W: vline(sx + 1, y0 + 1, min(H - 1, y0 + PH - 1), W5 if False else W4)
    # grain flecks
    for _ in range(18):
        gx = rng.randrange(W); gy = y0 + 2 + rng.randrange(max(1, PH - 3))
        if gy < H: hline(gx, min(W - 1, gx + 3 + rng.randrange(5)), gy, W2 if rng.random() < .7 else W4)

# sunlight pools from the windows (parallelograms sheared to the right)
def sunpool(x0, x1, mullions):
    for y in range(FLOOR_Y + 2, H):
        d = y - FLOOR_Y
        a = x0 + 10 + int(d * 0.9)
        b = x1 - 6 + int(d * 1.15)
        for x in range(a, b + 1):
            # mullion shadows
            inshadow = any(abs(x - (m + int(d * 1.0))) <= 1 for m in mullions)
            if not inshadow:
                blend(x, y, h("#fff6d8"), 0.42)
sunpool(LWIN[0], LWIN[2], [lw[0], lw[0] - 22 + 4])
sunpool(RWIN[0], RWIN[2], [rw[0]])

import os
if not os.environ.get("NOCLOCK"):
    # ---------------- wall clock (center top) ----------------
    CX, CY, R = 240, 23, 8
    m = set(disc(CX, CY, R))
    for (x, y) in m: px[x, y] = W2
    for (x, y) in disc(CX, CY, R - 2): px[x, y] = CU0
    for (x, y) in disc(CX + 1, CY + 1, R - 2):
        if (x, y) in set(disc(CX, CY, R - 2)) and (x - CX) + (y - CY) > 6: px[x, y] = CU1
    outline(m, OL)
    for (x, y) in m:
        if (x - CX) + (y - CY) < -8 and (x, y) not in set(disc(CX, CY, R - 2)): px[x, y] = W4
    for (dx, dy) in ((0, -5), (5, 0), (0, 5), (-5, 0)):
        p(CX + dx, CY + dy, OLD)
    # hands at ~10:10
    for i in range(1, 5): p(CX + i, CY - i // 2, OLD)
    for i in range(1, 4): p(CX - i, CY - i // 2, OLD)
    p(CX, CY, RB0)
    hline(CX - 1, CX + 1, CY + R + 2, WL2)   # shadow

# ---------------- chairs under the left window ----------------
def chair(cx, fy, book=None):
    # floor shadow
    for x in range(cx - 11, cx + 12):
        for y in (fy, fy + 1):
            d = (x - cx) / 11.0
            if d * d < 1: blend(x, y, h("#7a5a3a"), 0.28)
    # back legs (behind)
    vline(cx - 6, fy - 15, fy - 2, ST0); vline(cx + 5, fy - 15, fy - 2, ST0)
    # backrest supports
    for xx in (cx - 8, cx + 7):
        vline(xx, fy - 30, fy - 16, ST1); vline(xx + (1 if xx < cx else -1), fy - 30, fy - 16, ST0)
    # backrest panel
    rect(cx - 9, fy - 38, cx + 8, fy - 29, OL)
    rect(cx - 8, fy - 37, cx + 7, fy - 30, W3)
    hline(cx - 8, cx + 7, fy - 37, W4); hline(cx - 8, cx + 7, fy - 30, W2)
    hline(cx - 5, cx + 3, fy - 34, W2)
    # seat
    rect(cx - 10, fy - 19, cx + 9, fy - 14, OL)
    rect(cx - 9, fy - 18, cx + 8, fy - 17, W4)
    rect(cx - 9, fy - 16, cx + 8, fy - 15, W2)
    hline(cx - 9, cx + 8, fy - 18, W5)
    # front legs
    for xx in (cx - 8, cx + 7):
        vline(xx, fy - 13, fy, ST1); vline(xx + (1 if xx < cx else -1), fy - 13, fy, ST0)
        hline(xx - 1, xx + 1, fy, OLD)
    if book:
        rect(cx - 6, fy - 22, cx + 3, fy - 20, OL)
        hline(cx - 5, cx + 2, fy - 21, book); p(cx + 2, fy - 21, CU0)

chair(42, 226, book=h("#b5523b"))
chair(94, 226, book=h("#5a75bd"))

# ---------------- bench + sleepy cat under the right window ----------------
bx0, bx1, by = 372, 452, 224
for x in range(bx0 - 4, bx1 + 5):
    for y in (by, by + 1):
        d = (x - (bx0 + bx1) / 2) / ((bx1 - bx0) / 2 + 4)
        if d * d < 1: blend(x, y, h("#7a5a3a"), 0.28)
rect(bx0, by - 18, bx1, by - 12, OL)
rect(bx0 + 1, by - 17, bx1 - 1, by - 16, W4); hline(bx0 + 1, bx1 - 1, by - 17, W5)
rect(bx0 + 1, by - 15, bx1 - 1, by - 13, W2); hline(bx0 + 1, bx1 - 1, by - 13, W1)
for lx in (bx0 + 4, bx1 - 7):
    rect(lx, by - 12, lx + 3, by, OL)
    rect(lx + 1, by - 11, lx + 2, by - 1, W2); vline(lx + 1, by - 11, by - 1, W3)
rect(bx0 + 7, by - 7, bx1 - 7, by - 6, OL); hline(bx0 + 8, bx1 - 8, by - 7, W2)   # stretcher
# stack of books
for i, c in enumerate((h("#5a75bd"), h("#b5523b"), G1)):
    y = by - 20 - i * 3
    rect(bx0 + 8 + i, y - 1, bx0 + 22 - i, y + 1, OL)
    hline(bx0 + 9 + i, bx0 + 21 - i, y, c); p(bx0 + 21 - i, y, CU0)
# tea cup
rect(bx0 + 30, by - 23, bx0 + 35, by - 19, OL); rect(bx0 + 31, by - 22, bx0 + 34, by - 20, CU0)
hline(bx0 + 31, bx0 + 34, by - 22, h("#c98a5a")); p(bx0 + 36, by - 21, OL); p(bx0 + 36, by - 20, OL)
p(bx0 + 32, by - 25, CU1); p(bx0 + 33, by - 27, CU1)

# ---------------- locker bank shell (tiles drop into the 3x3 slots) ----------------
LB0 = h("#34385e"); LB1 = h("#44589a"); LB2 = h("#5a75bd"); LB3 = h("#7593d4"); LB4 = h("#97b3e8"); LB5 = h("#c4d9f6")
GX0, GY0, GX1, GY1 = 144, 30, 335, 221
# floor shadow
for x in range(GX0 - 8, GX1 + 9):
    for y in (228, 229, 230):
        d = (x - (GX0 + GX1) / 2) / ((GX1 - GX0) / 2 + 8)
        if d * d < 1 and not (y == 230 and d * d > 0.8): blend(x, y, h("#6a4e36"), 0.30 if y < 230 else 0.15)
# side panels
for sx0 in (GX0 - 4, GX1 + 1):
    rect(sx0, GY0 - 1, sx0 + 3, GY1, LB0)
    rect(sx0 + 1, GY0, sx0 + 2, GY1, LB2)
    vline(sx0 + 1, GY0, GY1, LB3 if sx0 < GX0 else LB1)
# empty slot interiors
rect(GX0, GY0, GX1, GY1, LB0)
for r in range(3):
    for c in range(3):
        rect(GX0 + c * 64 + 2, GY0 + r * 64 + 2, GX0 + c * 64 + 61, GY0 + r * 64 + 61, LB1)
# top cap with visible top surface
rect(GX0 - 6, 22, GX1 + 6, 29, LB0)
hline(GX0 - 5, GX1 + 5, 23, LB5)
hline(GX0 - 5, GX1 + 5, 24, LB4); hline(GX0 - 5, GX1 + 5, 25, LB4)
hline(GX0 - 5, GX1 + 5, 26, LB3); hline(GX0 - 5, GX1 + 5, 27, LB2); hline(GX0 - 5, GX1 + 5, 28, LB1)
hline(GX0 - 3, GX0 + 6, 23, CU0); p(GX1 - 3, 23, CU0); p(GX1 - 2, 23, CU0)
p(GX0 - 6, 22, WL2); p(GX1 + 6, 22, WL2)
# base plinth
rect(GX0 - 5, GY1 + 1, GX1 + 5, 227, LB0)
hline(GX0 - 4, GX1 + 4, GY1 + 2, LB3)
rect(GX0 - 4, GY1 + 3, GX1 + 4, 226, LB2)
rect(GX0 - 1, GY1 + 4, GX1 + 1, 226, LB1)
hline(GX0 - 1, GX1 + 1, 226, LB0)

# ---------------- potted floor plant (right corner) ----------------
px0, pbase = 462, 228
for x in range(px0 - 9, px0 + 10):
    for y in (pbase, pbase + 1):
        d = (x - px0) / 9.0
        if d * d < 1: blend(x, y, h("#7a5a3a"), 0.28)
leaves = [(px0 - 8, pbase - 30, 6), (px0 + 7, pbase - 33, 6), (px0, pbase - 40, 7), (px0 - 4, pbase - 22, 5),
          (px0 + 6, pbase - 21, 5), (px0 - 11, pbase - 40, 4.5), (px0 + 11, pbase - 44, 4.5), (px0 + 2, pbase - 28, 6)]
# stems
for (lx, ly, r) in leaves:
    n = max(abs(lx - px0), abs(ly - (pbase - 12)))
    for i in range(n + 1):
        sx = int(px0 + (lx - px0) * i / max(1, n)); sy = int(pbase - 12 + (ly - (pbase - 12)) * i / max(1, n))
        p(sx, sy, G0)
canopy(leaves, (G0, G1, G2, G3), G0, img)
# leaf veins
for (lx, ly, r) in leaves:
    for i in range(-int(r) + 2, int(r) - 1):
        p(lx + i // 2, ly + i, G1)
# pot
rect(px0 - 8, pbase - 13, px0 + 7, pbase, OL)
rect(px0 - 7, pbase - 12, px0 + 6, pbase - 1, TC1)
rect(px0 - 9, pbase - 14, px0 + 8, pbase - 11, OL); hline(px0 - 8, px0 + 7, pbase - 13, TC3); hline(px0 - 8, px0 + 7, pbase - 12, TC2)
vline(px0 - 7, pbase - 10, pbase - 1, TC2); vline(px0 + 6, pbase - 10, pbase - 1, TC0)
hline(px0 - 6, px0 + 5, pbase - 1, TC0)
p(px0 - 4, pbase - 7, TC2); p(px0 - 3, pbase - 7, TC3)

# ---------------- save ----------------
name = sys.argv[1]
img.save(name + "_native.png")
img.resize((W * 4, H * 4), Image.NEAREST).save(name + "_x4.png")
print("ok")
