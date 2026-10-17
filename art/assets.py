"""Pixel assets for the Homeroom prototype. Everything drawn at 1 art px = 1 stage px."""
from PIL import Image
import math, os, random

OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUTDIR, exist_ok=True)
rng = random.Random(11)

def h(c, a=255):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)
CLEAR = (0, 0, 0, 0)

class S:
    def __init__(self, w, hgt):
        self.w, self.h = w, hgt
        self.im = Image.new("RGBA", (w, hgt), CLEAR)
        self.px = self.im.load()
    def ok(self, x, y): return 0 <= x < self.w and 0 <= y < self.h
    def p(self, x, y, c):
        if self.ok(x, y): self.px[x, y] = c
    def get(self, x, y): return self.px[x, y] if self.ok(x, y) else CLEAR
    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.p(x, y, c)
    def hl(self, x0, x1, y, c): self.rect(x0, y, x1, y, c)
    def vl(self, x, y0, y1, c): self.rect(x, y0, x, y1, c)
    def fill(self, mask, c):
        for (x, y) in mask: self.p(x, y, c)
    def outline(self, mask, c):
        for (x, y) in list(mask):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in mask: self.p(*n, c)
    def save(self, name):
        self.im.save(os.path.join(OUTDIR, name + ".png"))

def disc(cx, cy, r):
    return {(x, y) for y in range(int(cy - r) - 1, int(cy + r) + 2)
            for x in range(int(cx - r) - 1, int(cx + r) + 2)
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.5}
def ellipse(cx, cy, rx, ry):
    return {(x, y) for y in range(int(cy - ry) - 1, int(cy + ry) + 2)
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2)
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.08}
def poly(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    out = set()
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            px, py = x + .5, y + .5
            ins = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]; xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi: ins = not ins
                j = i
            if ins: out.add((x, y))
    return out

# ---------------- shared palette ----------------
OL = h("#6e4a3c"); OLD = h("#4f362e")
CU0 = h("#fffaf0"); CU1 = h("#f3e6cf"); CU2 = h("#e2cfae"); CUO = h("#c4a37f")
W1 = h("#a8714e"); W2 = h("#c9945f"); W3 = h("#ddb07a"); W4 = h("#ecca97"); W5 = h("#f6e0b8")
# accent ramp: muted brick red (was pink)
P0 = h("#8e3a2a"); P1 = h("#c4583d"); P2 = h("#e08a6a"); P3 = h("#f0b79a"); P4 = h("#f9dccb")
# masking tape
TP1 = h("#e6d3a3"); TP2 = h("#d3bb85")
G0 = h("#4c7547"); G1 = h("#64924f"); G2 = h("#84b25e"); G3 = h("#a9cd72"); G4 = h("#d3e595")
TC0 = h("#a85a45"); TC1 = h("#cf7a5a"); TC2 = h("#e8a07a"); TC3 = h("#f4c19c")
ST0 = h("#80869e"); ST1 = h("#a9afc4"); ST2 = h("#d5d9e5"); WHT = h("#ffffff")
GO = h("#6b3f2a"); GD1 = h("#c97a3c"); GD2 = h("#e9a849"); GD3 = h("#f7d26e"); GD4 = h("#fff1b8")
SKY = h("#bfe3ee"); SEA = h("#5fb2c9"); SAND = h("#f3d9a4"); YEL = h("#ffe08a")

SKINS = {
    "blue":     ["#34385e", "#44589a", "#5a75bd", "#7593d4", "#97b3e8", "#c4d9f6"],
    "pink":     ["#5e3448", "#a35274", "#c96f92", "#e595ad", "#f4b8c9", "#fde0e8"],
    "mint":     ["#2f5048", "#4a8573", "#61a58e", "#82c4a8", "#a8dcc2", "#d4f1e2"],
    "butter":   ["#5e4a2e", "#b98b3a", "#d6a84c", "#ecc66a", "#f7de97", "#fdf1c9"],
    "lavender": ["#43385e", "#6f5a9e", "#8c76c0", "#a996d8", "#c6b8ea", "#e5dcf7"],
}
def ramp(name): return [h(c) for c in SKINS[name]]

# =================================================================
# padlock (k = pixel scale)
# =================================================================
def padlock(s, ox, oy, R, k=1):
    OUT, B1, B2, B3 = R[0], R[1], R[2], R[3]
    def P(x, y, c):
        for dy in range(k):
            for dx in range(k): s.p(ox + x * k + dx, oy + y * k + dy, c)
    def RC(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): P(x, y, c)
    # local coords mirror the 64px tile lock (tab at x0..9, shackle 2..7, body 1..8)
    RC(0, 3, 9, 3, OUT); RC(0, 5, 9, 5, OUT); P(0, 4, OUT); P(9, 4, OUT)
    RC(1, 4, 8, 4, ST1); P(1, 4, ST2); P(8, 4, ST0)
    RC(3, 0, 6, 0, OUT)
    for y in range(1, 6): P(2, y, OUT); P(7, y, OUT)
    RC(3, 1, 6, 1, ST2); P(6, 1, ST1); RC(4, 2, 5, 2, OUT)
    for y in range(2, 6): P(3, y, ST1); P(6, y, ST0)
    P(3, 2, ST2); RC(4, 3, 5, 5, ST0); RC(4, 3, 5, 3, OUT); RC(4, 5, 5, 5, OUT)
    RC(1, 6, 8, 12, GO); RC(2, 7, 7, 11, GD2)
    RC(2, 7, 7, 7, GD3); RC(2, 7, 2, 11, GD3); RC(2, 11, 7, 11, GD1); RC(7, 8, 7, 11, GD1)
    P(3, 7, GD4); P(2, 8, GD4)
    P(1, 6, B3); P(8, 6, B3); P(1, 12, B3); P(8, 12, B2)
    RC(4, 8, 5, 8, GO); RC(4, 9, 5, 9, GD1)
    RC(2, 13, 8, 13, B2)

def slit(s, y, x0, x1, R):
    OUT, B1, B2, B3, B4, B5 = R
    s.hl(x0 + 1, x1 - 1, y - 1, B2); s.hl(x0, x1, y, OUT)
    s.hl(x0 + 1, x1 - 1, y + 1, B4); s.p(x0 + 1, y + 1, B5); s.p(x0 + 2, y + 1, B5)

# =================================================================
# 64px tiles in every skin (seamless, for the hallway bank)
# =================================================================
def tile(skin):
    R = ramp(skin); OUT, B1, B2, B3, B4, B5 = R
    s = S(64, 64)
    s.rect(0, 0, 63, 63, OUT); s.rect(1, 1, 62, 62, B2)
    s.hl(1, 62, 1, B4); s.vl(1, 2, 62, B3); s.vl(62, 2, 62, B1); s.hl(2, 62, 62, B1)
    dL, dT, dR, dB = 6, 5, 57, 58
    s.hl(dL - 1, dR, dT - 1, B1); s.vl(dL - 1, dT - 1, dB, B1)
    s.rect(dL, dT, dR, dB, OUT); s.rect(dL + 1, dT + 1, dR - 1, dB - 1, B3)
    s.hl(dL + 1, dR - 1, dT + 1, B5); s.vl(dL + 1, dT + 1, dB - 1, B4)
    s.hl(dL + 1, dR - 1, dB - 1, B2); s.vl(dR - 1, dT + 2, dB - 1, B2)
    s.p(dL + 2, dT + 2, CU0); s.p(dL + 3, dT + 2, B5); s.p(dL + 2, dT + 3, B5)
    for hy in (dT + 5, dB - 7):
        s.vl(dL - 2, hy, hy + 2, OUT); s.p(dL - 1, hy, ST2); s.p(dL - 1, hy + 1, ST1); s.p(dL - 1, hy + 2, ST0)
    for y in (11, 14, 17): slit(s, y, 13, 50, R)
    for y in (46, 49, 52): slit(s, y, 13, 50, R)
    padlock(s, 45, 28, R, 1)
    s.save("tile_" + skin)

for k in SKINS: tile(k)

# =================================================================
# big door — front (closed) and back (inside, holds the profile card)
# =================================================================
DW, DH = 176, 152
def door_front(skin):
    R = ramp(skin); OUT, B1, B2, B3, B4, B5 = R
    s = S(DW, DH)
    s.rect(0, 0, DW - 1, DH - 1, OUT); s.rect(1, 1, DW - 2, DH - 2, B3)
    s.hl(1, DW - 2, 1, B5); s.hl(1, DW - 2, 2, B4); s.vl(1, 1, DH - 2, B4); s.vl(2, 2, DH - 2, B4)
    s.hl(2, DW - 2, DH - 2, B2); s.hl(3, DW - 2, DH - 3, B2); s.vl(DW - 2, 2, DH - 2, B2); s.vl(DW - 3, 3, DH - 3, B2)
    s.rect(4, 4, 6, 4, CU0); s.p(4, 5, CU0)
    for y in (18, 24, 30): slit(s, y, 34, 141, R)
    for y in (122, 128, 134): slit(s, y, 34, 141, R)
    for hy in (16, DH - 26):
        s.rect(0, hy, 2, hy + 9, OUT); s.vl(1, hy + 1, hy + 8, ST1); s.p(1, hy + 1, ST2)
    padlock(s, 140, 58, R, 2)
    s.save("doorfront_" + skin)

def door_back(skin):
    R = ramp(skin); OUT, B1, B2, B3, B4, B5 = R
    s = S(DW, DH)
    s.rect(0, 0, DW - 1, DH - 1, OUT); s.rect(1, 1, DW - 2, DH - 2, B2)
    s.hl(1, DW - 2, 1, B4); s.vl(1, 1, DH - 2, B3); s.vl(DW - 2, 2, DH - 2, B1); s.hl(2, DW - 2, DH - 2, B1)
    # recessed inner panel
    s.rect(8, 8, DW - 9, DH - 9, B1); s.rect(9, 9, DW - 9, DH - 9, B3)
    s.hl(9, DW - 10, DH - 10, B4); s.vl(DW - 10, 10, DH - 10, B4)
    # hinges on the right (hinge side once the door has swung open)
    for hy in (16, DH - 26):
        s.rect(DW - 3, hy, DW - 1, hy + 9, OUT); s.vl(DW - 2, hy + 1, hy + 8, ST1); s.p(DW - 2, hy + 1, ST2)
    # cream profile card, pinned with washi tape
    cx0, cy0, cx1, cy1 = 15, 13, DW - 16, DH - 15
    s.rect(cx0 + 2, cy0 + 2, cx1 + 2, cy1 + 2, B1)            # card shadow
    s.rect(cx0, cy0, cx1, cy1, CUO); s.rect(cx0 + 1, cy0 + 1, cx1 - 1, cy1 - 1, CU0)
    s.hl(cx0 + 1, cx1 - 1, cy1 - 1, CU1); s.vl(cx1 - 1, cy0 + 1, cy1 - 1, CU1)
    for (tx, ang) in ((cx0 - 4, 1), (cx1 - 13, -1)):
        for i in range(16):
            for j in range(5):
                x = tx + i; y = cy0 - 3 + j + (i // 4) * ang + (0 if ang > 0 else 3)
                c = TP1 if (i + j) % 6 < 3 else TP2
                s.p(x, y, c)
    s.save("doorback_" + skin)

for k in SKINS: door_front(k); door_back(k)

# =================================================================
# interior shell with wallpaper (190 x 166)
# =================================================================
IW, IH = 190, 166
O = (7, 7, 182, 158)          # opening
BW = (29, 22, 160, 132)       # back wall
SHELF_BACK, SHELF_FRONT = 92, 101

def wallpaper(kind, x, y):
    if kind == "gingham":
        a = (x // 5) % 2; b = (y // 5) % 2
        return h("#fde6ec") if a + b == 0 else h("#f8cbd7") if a + b == 2 else h("#fbd8e1")
    if kind == "stripes":
        return h("#e2ecfa") if (x // 4) % 2 else h("#d1e0f6")
    if kind == "dots":
        base = h("#e4f4e8")
        return h("#bfe3c9") if (x % 8 in (2, 3) and y % 8 in (2, 3)) or ((x + 4) % 8 in (2, 3) and (y + 4) % 8 in (2, 3)) else base
    if kind == "checker":
        return h("#fdf3d2") if ((x // 6) + (y // 6)) % 2 else h("#f7e4a8")
    if kind == "floral":
        base = h("#fbf2df")
        gx, gy = x % 12, y % 12
        off = (y // 12) % 2 * 6
        gx = (x + off) % 12
        if (gx, gy) in ((5, 4), (7, 4), (6, 3), (6, 5)): return h("#e08a6a")
        if (gx, gy) == (6, 4): return h("#f7d26e")
        if (gx, gy) in ((4, 6), (3, 7)): return h("#a9cd72")
        return base
    if kind == "stars":
        base = h("#ece4f7")
        gx, gy = (x + (y // 10) % 2 * 5) % 10, y % 10
        if (gx, gy) in ((4, 3), (3, 4), (4, 4), (5, 4), (4, 5)): return h("#fff6c9")
        return base
    if kind == "leaves":
        base = h("#e9f2dc")
        gx, gy = (x + (y // 9) % 2 * 4) % 9, y % 9
        if (gx, gy) in ((3, 3), (4, 3), (4, 4), (5, 4), (5, 5)): return h("#a9cd72")
        if (gx, gy) == (3, 4): return h("#84b25e")
        return base
    return h("#f4e9d2")

def mix(c, d, t):
    return tuple(int(c[i] * (1 - t) + d[i] * t) for i in range(3)) + (255,)

def interior(name, skin, paper):
    R = ramp(skin); OUT, B1, B2, B3, B4, B5 = R
    s = S(IW, IH)
    # locker body around the opening
    s.rect(0, 0, IW - 1, IH - 1, OUT); s.rect(1, 1, IW - 2, IH - 2, B2)
    s.hl(1, IW - 2, 1, B5); s.hl(1, IW - 2, 2, B4); s.vl(1, 3, IH - 2, B3); s.vl(IW - 2, 3, IH - 2, B1); s.hl(2, IW - 2, IH - 2, B1)
    s.rect(O[0] - 1, O[1] - 1, O[2] + 1, O[3] + 1, OUT)
    for y in range(O[1], O[3] + 1):
        for x in range(O[0], O[2] + 1):
            u = (x - O[0]) / (BW[0] - O[0]); ur = (O[2] - x) / (O[2] - BW[2])
            vt = (y - O[1]) / (BW[1] - O[1]); vb = (O[3] - y) / (O[3] - BW[3])
            if min(u, ur, vt, vb) >= 1:
                c = wallpaper(paper, x, y)
                # gentle depth: darker toward the edges of the back wall
                ed = min(x - BW[0], BW[2] - x, y - BW[1], BW[3] - y)
                if ed < 2: c = mix(c, B1, 0.35)
                elif ed < 4: c = mix(c, B1, 0.15)
            else:
                m = min(u, ur, vt, vb)
                if m == vt: c = OUT if m > 0.8 else B1
                elif m == u: c = B2 if m < 0.5 else B1
                elif m == ur: c = B1 if m < 0.5 else OUT
                else: c = B3 if m < 0.5 else B2
            s.p(x, y, c)
    # corner seams
    for (ax, ay, bx, by) in ((O[0], O[1], BW[0], BW[1]), (O[2], O[1], BW[2], BW[1]), (O[0], O[3], BW[0], BW[3]), (O[2], O[3], BW[2], BW[3])):
        n = max(abs(bx - ax), abs(by - ay))
        for i in range(n + 1):
            s.p(round(ax + (bx - ax) * i / n), round(ay + (by - ay) * i / n), OUT)
    # side-wall vents
    for k in range(4):
        y = 54 + k * 6
        for x in range(O[0] + 6, BW[0] - 4):
            s.p(x, y + (x - O[0]) // 6, OUT)
        for x in range(BW[2] + 4, O[2] - 5):
            s.p(x, y + (O[2] - x) // 6, OUT)
    # shelf: top surface trapezoid + front lip
    for y in range(SHELF_BACK, SHELF_FRONT + 1):
        t = (y - SHELF_BACK) / (SHELF_FRONT - SHELF_BACK)
        xa = round(BW[0] + (O[0] - BW[0]) * t * 0.55); xb = round(BW[2] + (O[2] - BW[2]) * t * 0.55)
        s.hl(xa, xb, y, B4 if y > SHELF_BACK else B5)
    xa = round(BW[0] + (O[0] - BW[0]) * 0.55); xb = round(BW[2] + (O[2] - BW[2]) * 0.55)
    s.hl(xa, xb, SHELF_FRONT + 1, B3); s.hl(xa, xb, SHELF_FRONT + 2, B2); s.hl(xa, xb, SHELF_FRONT + 3, OUT)
    s.hl(BW[0], BW[2], SHELF_BACK - 1, B1)
    # shadow under the shelf on the back wall
    for y in range(SHELF_FRONT + 4, SHELF_FRONT + 12):
        for x in range(BW[0], BW[2] + 1):
            if (x, y) and BW[1] <= y <= BW[3]:
                c = s.get(x, y)
                s.p(x, y, mix(c, B1, 0.35 - (y - SHELF_FRONT - 4) * 0.04))
    # coat hook under the shelf
    s.save("interior_" + name)

# =================================================================
# items
# =================================================================
def polaroid(name, pic):
    s = S(20, 24)
    s.rect(0, 1, 19, 23, OL); s.rect(1, 2, 18, 22, CU0); s.hl(1, 18, 22, CU1); s.vl(18, 2, 22, CU1)
    sub = S(16, 15); pic(sub)
    for y in range(15):
        for x in range(16):
            c = sub.px[x, y]
            if c[3]: s.p(2 + x, 3 + y, c)
    s.hl(2, 17, 18, CU2)
    # washi tape
    for x in range(6, 14):
        s.p(x, 0, TP2); s.p(x, 1, TP1 if x % 2 else TP2); s.p(x, 2, TP2)
    s.save(name)

def pic_sunset(t):
    for y in range(15):
        c = h("#f9d29c") if y < 3 else h("#f6b19a") if y < 6 else h("#ee98a8") if y < 9 else h("#d888b5")
        t.hl(0, 15, y, c)
    t.fill(disc(10, 9, 3), YEL)
    t.rect(0, 10, 15, 14, h("#6b4a6e"))
    for x in range(16): t.p(x, 10 - (1 if 3 < x < 9 else 0), h("#6b4a6e"))
    t.vl(4, 3, 10, h("#4f3550")); t.vl(5, 4, 10, h("#4f3550")); t.p(4, 2, h("#4f3550"))
    t.hl(9, 13, 12, h("#8a6488"))

def pic_cat(t):
    t.rect(0, 0, 15, 14, h("#fbd9e1"))
    face = disc(8, 9, 5.2)
    t.fill(face, h("#e8a65c"))
    for (x, y) in face:
        if y > 11: t.p(x, y, h("#f7cf8f"))
    for (x, y) in ((3, 4), (4, 3), (4, 4), (5, 4), (12, 4), (11, 3), (11, 4), (13, 4)): t.p(x, y, h("#e8a65c"))
    t.p(4, 4, h("#e08a6a")); t.p(12, 4, h("#e08a6a"))
    t.p(6, 9, OLD); t.p(10, 9, OLD); t.p(8, 11, h("#c4583d"))
    t.p(5, 11, h("#e08a6a")); t.p(11, 11, h("#e08a6a"))
    t.hl(6, 10, 6, h("#b9783f"))

def pic_beach(t):
    t.rect(0, 0, 15, 7, SKY); t.rect(0, 8, 15, 10, SEA); t.rect(0, 11, 15, 14, SAND)
    t.fill(disc(12, 3, 2), YEL)
    for x in (2, 3, 8, 9, 13): t.p(x, 9, WHT)
    t.hl(0, 15, 11, h("#fbeccb"))
    t.p(4, 13, h("#c4583d")); t.p(5, 13, h("#c4583d")); t.p(4, 12, h("#c4583d"))

def pic_ramen(t):
    t.rect(0, 0, 15, 14, h("#f6e3c4"))
    bowl = {(x, y) for (x, y) in ellipse(8, 8, 7, 5) if y >= 8}
    t.fill(bowl, h("#c0504a"))
    t.hl(1, 15, 8, h("#8e3a37"))
    t.fill(ellipse(8, 7, 6, 1.6), h("#f2c27a"))
    t.fill(disc(6, 7, 1.3), WHT); t.p(6, 7, h("#f7c548"))
    t.rect(9, 5, 11, 7, h("#3f5a3a")); t.p(12, 7, h("#e08a6a"))
    for i in range(9): t.p(9 + i // 2, 4 - i // 3, h("#a8714e")); t.p(11 + i // 2, 5 - i // 3, h("#a8714e"))

def pic_mountains(t):
    t.rect(0, 0, 15, 14, h("#cfe8ef"))
    t.fill(poly([(0, 11), (6, 3), (12, 11)]), h("#8fa3c7"))
    t.fill(poly([(5, 11), (11, 5), (17, 11)]), h("#7b8fb8"))
    t.fill(poly([(5, 5), (6, 3), (7.5, 5)]), WHT); t.fill(poly([(10, 7), (11, 5), (12.5, 7)]), WHT)
    t.rect(0, 11, 15, 14, G2)
    for x in (2, 13):
        t.vl(x, 8, 12, G0); t.hl(x - 1, x + 1, 10, G0); t.hl(x - 1, x + 1, 11, G1)

def pic_friends(t):
    t.rect(0, 0, 15, 9, SKY); t.rect(0, 10, 15, 14, G3)
    for (cx, hair) in ((3, h("#3b2a24")), (8, h("#c27a3a")), (13, h("#1f2238"))):
        t.fill(disc(cx, 8, 2.2), h("#f2c9a5") if cx != 13 else h("#a8714e"))
        t.hl(cx - 2, cx + 2, 6, hair); t.hl(cx - 1, cx + 1, 5, hair)
        t.p(cx - 1, 8, OLD); t.p(cx + 1, 8, OLD)
        t.rect(cx - 2, 11, cx + 2, 14, [P1, h("#97b3e8"), G1][cx // 5])

polaroid("polaroid_sunset", pic_sunset)
polaroid("polaroid_cat", pic_cat)
polaroid("polaroid_beach", pic_beach)
polaroid("polaroid_ramen", pic_ramen)
polaroid("polaroid_mountains", pic_mountains)
polaroid("polaroid_friends", pic_friends)

def sticker(name, mask_fn, size, paint):
    s = S(size, size)
    m = mask_fn()
    # white die-cut border + soft drop shadow
    border = set()
    for (x, y) in m:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1): border.add((x + dx, y + dy))
    for (x, y) in border: s.p(x + 1, y + 1, h("#000000", 40))
    s.fill(border, WHT)
    paint(s, m)
    s.save(name)

def star_mask():
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = 5.2 if i % 2 == 0 else 2.3
        pts.append((6.5 + r * math.cos(a), 6.8 + r * math.sin(a)))
    return poly(pts)
def paint_star(s, m):
    s.fill(m, GD3)
    for (x, y) in m:
        if y >= 8: s.p(x, y, GD2)
    s.p(6, 4, GD4); s.p(5, 5, GD4)
sticker("sticker_star", star_mask, 15, paint_star)

def heart_mask():
    m = disc(4.2, 4.6, 3.3) | disc(9.8, 4.6, 3.3) | poly([(1.0, 5.6), (13.0, 5.6), (7.0, 12.6)])
    return {(x, y) for (x, y) in m if 0 <= x < 15 and 0 <= y < 14}
def paint_heart(s, m):
    s.fill(m, h("#d9573b"))
    for (x, y) in m:
        if y > 8: s.p(x, y, h("#d9708c"))
    s.p(4, 4, P4); s.p(4, 5, P3); s.p(5, 4, P3)
sticker("sticker_heart", heart_mask, 16, paint_heart)

def flower_mask():
    m = set()
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        m |= disc(7 + 3.2 * math.cos(a), 7 + 3.2 * math.sin(a), 2.4)
    return m
def paint_flower(s, m):
    s.fill(m, P2)
    for (x, y) in m:
        if y > 8: s.p(x, y, P1)
    s.fill(disc(7, 7, 1.5), GD3); s.p(6, 6, GD4)
sticker("sticker_flower", flower_mask, 15, paint_flower)

def bear_mask():
    return disc(7, 8, 4.6) | disc(3.5, 3.8, 1.9) | disc(10.5, 3.8, 1.9)
def paint_bear(s, m):
    s.fill(m, h("#c98a5a"))
    s.p(3, 4, h("#f4c19c")); s.p(10, 4, h("#f4c19c"))
    s.fill(ellipse(7, 10, 2.2, 1.5), h("#f6e0b8"))
    s.p(5, 7, OLD); s.p(9, 7, OLD); s.p(7, 9, OLD); s.p(4, 9, P2); s.p(10, 9, P2)
sticker("sticker_bear", bear_mask, 15, paint_bear)

# class schedule (weekly view)
s = S(30, 24)
s.rect(0, 2, 29, 23, OL); s.rect(1, 3, 28, 22, CU0); s.rect(1, 3, 28, 6, P1); s.hl(1, 28, 6, P0)
for x in (6, 23): s.rect(x, 0, x + 1, 3, ST0); s.p(x, 0, ST2)
cols = [h("#97b3e8"), h("#a9cd72"), h("#e08a6a"), h("#f7d26e"), h("#c6b8ea")]
for d in range(5):
    x0 = 3 + d * 5
    s.hl(x0, x0 + 3, 8, CU2)
    for (r0, r1, ci) in ((10, 12, (d * 2) % 5), (15, 18, (d + 3) % 5)):
        if (d + r0) % 3 != 1:
            s.rect(x0, r0, x0 + 3, r1, cols[ci]); s.hl(x0, x0 + 3, r0, WHT)
for y in (9, 14, 19): s.hl(2, 27, y, CU1)
s.save("schedule")

# mini whiteboard
s = S(32, 22)
s.rect(0, 0, 31, 19, ST0); s.rect(1, 1, 30, 18, h("#f6f9ff")); s.hl(1, 30, 1, WHT); s.hl(1, 30, 18, h("#dde4f2"))
small = {(x // 2 + 3, y // 2 + 3) for (x, y) in heart_mask()}
s.fill(small, h("#e08a6a")); s.outline(small, h("#d9573b"))
for (x0, y0, n, c) in ((14, 5, 13, h("#5a75bd")), (14, 9, 9, h("#5a75bd")), (4, 14, 22, h("#64924f"))):
    for i in range(n):
        if i % 5 != 4: s.p(x0 + i, y0 + (1 if i % 3 == 1 else 0), c)
s.rect(4, 19, 27, 21, ST1); s.hl(4, 27, 19, ST2); s.hl(4, 27, 21, ST0)
s.rect(8, 18, 12, 19, h("#d9573b")); s.rect(15, 18, 19, 19, h("#5a75bd"))
s.save("whiteboard")

# succulent
s = S(16, 18)
pot = poly([(2, 10), (14, 10), (12.5, 18), (3.5, 18)])
s.fill(pot, TC1); s.outline(pot, TC0)
s.hl(2, 13, 10, TC2); s.hl(1, 14, 10, TC0); s.hl(2, 13, 11, TC3)
leaves = disc(8, 7, 4) | disc(4.5, 8.5, 2.6) | disc(11.5, 8.5, 2.6) | disc(8, 3.5, 2.6)
s.fill(leaves, G2)
for (x, y) in leaves:
    if y > 8: s.p(x, y, G1)
s.fill(disc(7, 5, 1.5), G3); s.p(4, 8, G3); s.p(11, 8, G3); s.p(8, 2, P2)
s.outline(leaves, G0)
s.save("plant")

# stack of books
s = S(24, 16)
for (y, x0, x1, c, d) in ((11, 1, 22, h("#97b3e8"), h("#5a75bd")), (6, 3, 21, h("#e08a6a"), h("#8e3a2a")), (1, 2, 19, h("#a9cd72"), h("#64924f"))):
    s.rect(x0, y, x1, y + 4, OL); s.rect(x0 + 1, y + 1, x1 - 1, y + 3, c)
    s.vl(x1 - 2, y + 1, y + 3, CU0); s.vl(x1 - 3, y + 1, y + 3, CU1); s.hl(x0 + 1, x1 - 4, y + 3, d)
    s.hl(x0 + 3, x0 + 6, y + 2, GD3)
s.save("books")

# boba (milk tea + matcha variants)
def boba(name, tea, tea_d):
    s = S(12, 20)
    cup = poly([(1, 5), (11, 5), (9.5, 20), (2.5, 20)])
    s.fill(cup, h("#eef6f8"))
    for (x, y) in cup:
        if y >= 7: s.p(x, y, tea)
        if y >= 15: s.p(x, y, tea_d)
    for (x, y) in ((4, 17), (6, 18), (8, 17), (5, 16), (7, 16), (4, 18)): s.p(x, y, h("#3a2a2a"))
    s.outline(cup, h("#7c84a8"))
    s.hl(1, 10, 4, h("#7c84a8")); s.hl(2, 9, 3, WHT); s.hl(3, 8, 2, h("#7c84a8"))
    for i in range(7): s.p(8 - i // 3, 0 + i, h("#d9573b")); s.p(9 - i // 3, 0 + i, h("#d9573b"))
    s.vl(3, 8, 14, WHT)
    s.save(name)
boba("boba_milk", h("#e2b88f"), h("#d3a274"))
boba("boba_matcha", h("#bcd99a"), h("#a3c983"))

# headphones
s = S(18, 15)
band = {(x, y) for (x, y) in ellipse(9, 8, 7.5, 7) if y <= 8} - {(x, y) for (x, y) in ellipse(9, 8, 5.5, 5) if y <= 8}
s.fill(band, h("#a996d8")); s.outline(band, h("#43385e"))
for cx in (2, 15):
    cup = ellipse(cx, 10, 2.4, 3.6)
    s.fill(cup, h("#c6b8ea")); s.outline(cup, h("#43385e"))
    s.vl(cx - 1, 8, 11, h("#e5dcf7"))
s.save("headphones")

# bunny plush
s = S(16, 20)
ears = ellipse(5, 4.5, 1.8, 4.4) | ellipse(10.5, 4.5, 1.8, 4.4)
body = ellipse(8, 15.5, 6, 4) | disc(8, 10.5, 4.6)
m = ears | body
s.fill(m, h("#fbf6ee"))
for (x, y) in ellipse(5, 5, 0.7, 3): s.p(x, y, P2)
for (x, y) in ellipse(10.5, 5, 0.7, 3): s.p(x, y, P2)
for (x, y) in m:
    if y >= 17: s.p(x, y, CU1)
s.p(6, 10, OLD); s.p(10, 10, OLD); s.p(8, 11, P1); s.p(5, 11, P3); s.p(11, 11, P3)
s.outline(m, CUO)
s.hl(6, 10, 14, P2); s.p(8, 15, P1)
s.save("bunny")

# onigiri
s = S(13, 12)
m = poly([(6.5, 0), (13, 11), (0, 11)]) | disc(6.5, 7.5, 4)
m = {(x, y) for (x, y) in m if 0 <= x < 13 and y < 12}
s.fill(m, WHT); s.outline(m, ST0)
s.rect(4, 7, 8, 10, h("#2f4a35")); s.vl(5, 7, 10, h("#3f5a3a"))
s.p(3, 3, CU0)
s.save("onigiri")

# film camera
s = S(20, 14)
s.rect(0, 3, 19, 13, OLD); s.rect(1, 4, 18, 12, h("#f6e0b8")); s.rect(1, 7, 18, 10, h("#a8714e"))
s.rect(3, 1, 7, 3, OLD); s.rect(4, 2, 6, 3, ST1)
s.rect(14, 2, 16, 3, OLD)
lens = disc(10, 8.5, 3.6); s.fill(lens, h("#2c3254")); s.outline(lens, OLD)
s.fill(disc(10, 8.5, 1.8), h("#5a75bd")); s.p(9, 7, WHT)
s.rect(15, 5, 17, 6, YEL)
s.save("camera")

# volleyball
s = S(13, 13)
b = disc(6, 6, 5.5)
s.fill(b, WHT)
for (x, y) in b:
    if (x - 2) ** 2 + (y - 11) ** 2 < 30 and (x - 2) ** 2 + (y - 11) ** 2 > 14: s.p(x, y, h("#7593d4"))
    if (x - 12) ** 2 + (y - 4) ** 2 < 28 and (x - 12) ** 2 + (y - 4) ** 2 > 13: s.p(x, y, GD3)
s.outline(b, ST0); s.p(4, 3, CU0)
s.save("volleyball")

# sketchbook + pencil
s = S(18, 22)
s.rect(1, 2, 16, 21, OLD); s.rect(2, 3, 15, 20, h("#5f8f8a")); s.vl(2, 3, 20, h("#7fb0a8"))
for x in range(3, 16, 2): s.p(x, 1, ST0); s.p(x, 2, ST1)
s.vl(12, 3, 20, h("#c4583d"))
s.rect(4, 8, 10, 12, CU0); s.hl(5, 9, 10, CU2)
for i in range(13): s.p(16 - i // 4, 9 + i, GD3)
s.p(13, 21, OLD)
s.save("sketchbook")

# round mirror
s = S(16, 20)
fr = ellipse(8, 9, 7, 8.5); gl = ellipse(8, 9, 5, 6.5)
s.fill(fr, P1); s.outline(fr, P0)
s.fill(gl, h("#d9eef4"))
for (x, y) in gl:
    if 3 < x + (y - 9) * 0.6 < 5 or 6.5 < x + (y - 9) * 0.6 < 7.2: s.p(x, y, WHT)
for (x, y) in gl:
    if y > 13: s.p(x, y, h("#bfe0ea"))
s.rect(5, 18, 11, 19, P0)
s.save("mirror")

# bunting garland across the top of the back wall
s = S(128, 12)
for x in range(128):
    y = int(2 + 3 * math.sin(math.pi * x / 127))
    s.p(x, y, OL)
cols3 = [h("#e08a6a"), h("#a9cd72"), h("#97b3e8"), h("#f7d26e"), h("#c6b8ea")]
for i in range(8):
    x0 = 4 + i * 15
    y0 = int(2 + 3 * math.sin(math.pi * (x0 + 4) / 127)) + 1
    tri = poly([(x0, y0), (x0 + 10, y0), (x0 + 5, y0 + 8)])
    s.fill(tri, cols3[i % 5]); s.outline(tri, OL)
s.save("bunting")

# sticky note (for your own empty locker)
s = S(20, 20)
s.rect(1, 1, 19, 19, h("#000000", 30)); s.rect(0, 0, 18, 18, h("#e9c84f")); s.rect(0, 0, 17, 17, h("#fbe48a"))
s.hl(0, 17, 0, h("#fff1b8"))
for (y, n) in ((5, 12), (8, 9), (11, 11)): s.hl(3, 3 + n, y, h("#c9a33a"))
s.p(13, 13, h("#c4583d")); s.p(14, 12, h("#c4583d")); s.p(15, 13, h("#c4583d")); s.p(14, 14, h("#c4583d"))
s.save("sticky")

# =================================================================
# avatars (24x24)
# =================================================================
def avatar(name, bg, skin, hair, style, blush=P2):
    s = S(24, 24)
    c = disc(11.5, 11.5, 11)
    s.fill(c, bg)
    head = ellipse(11.5, 13, 6, 6.5)
    neck = {(x, y) for x in range(9, 15) for y in range(18, 24)}
    shirt = {(x, y) for (x, y) in ellipse(11.5, 26, 9, 6) if y < 24}
    s.fill(shirt & c, h("#fffaf0")); s.fill(neck & c, skin); s.fill(head, skin)
    hairm = set()
    if style == "bob":
        hairm = {(x, y) for (x, y) in ellipse(11.5, 11, 7.2, 7) if y <= 10 or x <= 5 or x >= 18} - {(x, y) for y in range(17, 24) for x in range(24)}
    elif style == "long":
        hairm = {(x, y) for (x, y) in ellipse(11.5, 12, 7.4, 8.5) if y <= 9 or x <= 5 or x >= 18}
    elif style == "short":
        hairm = {(x, y) for (x, y) in ellipse(11.5, 10, 6.6, 5) if y <= 9}
    elif style == "bun":
        hairm = {(x, y) for (x, y) in ellipse(11.5, 10.5, 6.6, 5.5) if y <= 9} | disc(11.5, 3.5, 2.6)
    elif style == "curly":
        hairm = set()
        for (cx, cy) in ((6, 8), (9, 5.5), (13, 5), (17, 7.5), (18, 11), (5, 11.5), (11.5, 5)):
            hairm |= disc(cx, cy, 2.8)
        hairm = {(x, y) for (x, y) in hairm if y <= 12}
    elif style == "spiky":
        hairm = {(x, y) for (x, y) in ellipse(11.5, 10, 6.6, 5) if y <= 9}
        for sx in (7, 10, 13, 16): hairm |= {(sx, 3), (sx, 4), (sx - 1, 4)}
    s.fill(hairm & c, hair)
    s.p(9, 14, OLD); s.p(14, 14, OLD); s.p(9, 13, OLD); s.p(14, 13, OLD)
    s.p(7, 16, blush); s.p(16, 16, blush); s.p(11, 17, h("#c46f6f")); s.p(12, 17, h("#c46f6f"))
    s.outline(c, OL)
    s.save("avatar_" + name)

SK = [h("#f6d7bd"), h("#efc7a2"), h("#d9a47c"), h("#b07a52"), h("#8a5a3c")]
avatar("mei", h("#fde0e8"), SK[0], h("#2a2026"), "bob")
avatar("haruto", h("#d4f1e2"), SK[1], h("#1f2238"), "spiky")
avatar("priya", h("#fdf1c9"), SK[3], h("#2a1a18"), "long")
avatar("diego", h("#c4d9f6"), SK[2], h("#3b2a24"), "short")
avatar("amara", h("#e5dcf7"), SK[4], h("#1d1414"), "curly")
avatar("sofia", h("#fde0e8"), SK[1], h("#3a2a30"), "bun")
avatar("kai", h("#e9f2dc"), SK[2], h("#c98a4a"), "short")
avatar("lena", h("#fdf1c9"), SK[0], h("#4a2e3a"), "long")
avatar("you", h("#fff1b8"), SK[1], h("#2a2026"), "bun")

# =================================================================
# UI icons
# =================================================================
s = S(13, 12); m = {(x - 1, y - 1) for (x, y) in heart_mask()}; m = {(x, y) for (x, y) in m if x < 13 and y < 12}
s.outline(m, h("#8e3a2a")); s.save("icon_heart_empty")
s = S(13, 12); s.fill(m, h("#d9573b")); s.outline(m, h("#8e3a2a")); s.p(3, 3, P4); s.p(4, 3, P3); s.save("icon_heart_full")

s = S(14, 11)
s.rect(0, 0, 13, 10, OL); s.rect(1, 1, 12, 9, CU0)
for i in range(6): s.p(1 + i, 1 + i * 2 // 3 + (1 if i > 2 else 0), OL); s.p(12 - i, 1 + i * 2 // 3 + (1 if i > 2 else 0), OL)
s.p(6, 5, OL); s.p(7, 5, OL)
s.save("icon_mail")

s = S(13, 13)
for i in range(10):
    s.p(2 + i, 10 - i, h("#e9a849")); s.p(3 + i, 10 - i, h("#f7d26e")); s.p(2 + i, 11 - i, h("#c97a3c"))
s.p(11, 1, h("#d9573b")); s.p(12, 1, h("#d9573b")); s.p(12, 2, h("#d9573b")); s.p(11, 2, h("#c4583d"))
s.p(1, 11, OLD); s.p(2, 11, h("#f6e0b8")); s.p(1, 10, h("#f6e0b8"))
s.save("icon_pencil")

s = S(13, 13)
hd = disc(6, 4, 3); s.fill(hd, h("#f6e0b8")); s.outline(hd, OL)
sh = {(x, y) for (x, y) in ellipse(6, 13.5, 5.5, 4.5) if y <= 12}
s.fill(sh, h("#97b3e8")); s.outline({(x, y) for (x, y) in sh}, OL)
s.p(5, 4, OLD); s.p(7, 4, OLD)
s.save("icon_person")

# envelope (open + closed) for the send animation
def envelope(closed):
    s = S(120, 80)
    s.rect(0, 20, 119, 79, OL); s.rect(1, 21, 118, 78, CU0)
    for i in range(60):
        y = 78 - int(i * 0.55)
        s.p(1 + i, y, CU2); s.p(118 - i, y, CU2)
    if closed:
        flap = poly([(0, 20), (120, 20), (60, 56)])
        s.fill(flap, CU1); s.outline({(x, y) for (x, y) in flap if y > 20}, OL)
        hm2 = {(x * 1 + 53, y * 1 + 49) for (x, y) in heart_mask()}
        s.fill(hm2, h("#d9573b")); s.outline(hm2, h("#8e3a2a"))
    else:
        flap = poly([(0, 21), (120, 21), (60, 0)])
        s.fill(flap, CU1); s.outline({(x, y) for (x, y) in flap if y < 21}, OL)
        s.hl(1, 118, 21, CU2)
    s.save("envelope_" + ("closed" if closed else "open"))
envelope(False); envelope(True)

print("assets:", len(os.listdir(OUTDIR)))

PEOPLE = {
    "mei": ("blue", "gingham"), "haruto": ("blue", "stripes"), "priya": ("mint", "dots"),
    "diego": ("blue", "checker"), "you": ("blue", "floral"), "amara": ("butter", "floral"),
    "sofia": ("lavender", "stars"), "kai": ("blue", "leaves"), "lena": ("pink", "gingham"),
}
for n, (sk, pp) in PEOPLE.items():
    interior(n, sk, pp)
print("interiors done")
