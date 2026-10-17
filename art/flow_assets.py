"""Extra pixel assets for the onboarding / quiz / notes flows.

Reuses the drawing helpers and palette from assets.py (importing it re-renders the
original sprites deterministically), then adds:
  interior_x_<skin>_<paper>   every wallpaper on every locker color, for the locker editor
  wall_<paper>                12x12 wallpaper swatch for the theme picker
  icon_quiz                   13x13 clipboard icon for the "past quizzes" button
  note_peek                   a folded note poking out of a locker vent (hallway tile)
"""
import os
import assets as A
from assets import S, h, OL, OLD, CU0, CU1, CU2, P2, P3

# ---- more wallpapers (the lo-fi asks for ~20 interior options) ----
_base_wallpaper = A.wallpaper

def wallpaper(kind, x, y):
    if kind == "hearts":
        base = h("#fdeef2")
        gx, gy = (x + (y // 10) % 2 * 5) % 10, y % 10
        if (gx, gy) in ((3, 3), (5, 3), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4), (3, 5), (4, 5), (5, 5), (4, 6)):
            return h("#f4a9bc")
        return base
    if kind == "plaid":
        a = (x % 12) in (0, 1); b = (y % 12) in (0, 1)
        if a and b: return h("#c9945f")
        if a or b: return h("#e8c79d")
        return h("#f6e7cf") if (x + y) % 2 else h("#f3e1c4")
    if kind == "clouds":
        base = h("#d9ecf8")
        gx, gy = (x + (y // 14) % 2 * 9) % 18, y % 14
        if 3 <= gx <= 12 and 6 <= gy <= 8: return h("#ffffff")
        if 5 <= gx <= 9 and gy == 5: return h("#ffffff")
        if 4 <= gx <= 12 and gy == 9: return h("#eef6fb")
        return base
    if kind == "waves":
        base = h("#e3f1f4")
        gy = (y + [0, 1, 1, 0, -1, -1][(x // 2) % 6]) % 8
        return h("#b4dbe4") if gy == 0 else base
    if kind == "graph":
        if x % 6 == 0 or y % 6 == 0: return h("#cfe0ee")
        return h("#fbfdff")
    if kind == "sprinkles":
        base = h("#fff5e6")
        k = (x * 7 + y * 13) % 29
        if k == 0: return h("#ef8fa6")
        if k == 7: return h("#97b3e8")
        if k == 15: return h("#a9cd72")
        if k == 22: return h("#f7d26e")
        return base
    if kind == "plain":
        return h("#f6ecd9")
    return _base_wallpaper(kind, x, y)

A.wallpaper = wallpaper  # interior() looks wallpaper up at call time

PAPERS = ["floral", "gingham", "stripes", "dots", "checker", "stars", "leaves",
          "hearts", "plaid", "clouds", "waves", "graph", "sprinkles", "plain"]

for skin in A.SKINS:
    for paper in PAPERS:
        A.interior("x_%s_%s" % (skin, paper), skin, paper)

# swatches for the theme picker
for paper in PAPERS:
    s = S(12, 12)
    for y in range(12):
        for x in range(12):
            s.p(x, y, wallpaper(paper, x + 30, y + 30))
    s.save("wall_" + paper)

# ---- clipboard icon (past quizzes) ----
s = S(13, 13)
s.rect(1, 1, 11, 12, OL); s.rect(2, 2, 10, 11, CU0)
s.rect(4, 0, 8, 2, OL); s.rect(5, 1, 7, 1, h("#e9a849"))
for i, y in enumerate((4, 7, 10)):
    s.p(3, y, h("#ef8fa6") if i == 1 else h("#a9cd72")); s.p(4, y, h("#ef8fa6") if i == 1 else h("#a9cd72"))
    s.hl(6, 9, y, CU2)
s.save("icon_quiz")

# ---- a note poking out of a locker vent (sits on the hallway tile) ----
s = S(14, 11)
paper = A.poly([(1, 3), (12, 0), (13, 8), (2, 10)])
s.fill(paper, CU0)
s.outline(paper, OL)
for y in (4, 6):
    for x in range(4, 11): s.p(x, y - (x - 4) // 4, h("#d6e4ef"))
s.p(10, 7, P2); s.p(11, 7, P2); s.p(10, 8, P3)
s.save("note_peek")

print("flow assets done:", len([f for f in os.listdir(A.OUTDIR) if f.startswith(("interior_x_", "wall_"))]))

# =====================================================================
# v2 sprites: Mittens, the homeroom logo, a clearer pencil, chat icon,
# less-cutesy stickers and a note tucked into a locker slot
# =====================================================================
from assets import disc, ellipse, poly, sticker, WHT, CLEAR

def ascii_sprite(name, rows, pal, border=False):
    """paint from a little ASCII map; border=True gives the die-cut sticker look"""
    w = max(len(r) for r in rows); hgt = len(rows)
    if border:
        m = {(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch != '.'}
        def paint(s, mm):
            for y, r in enumerate(rows):
                for x, ch in enumerate(r):
                    if ch != '.': s.p(x + 1, y + 1, h(pal[ch]))
        size = max(w, hgt) + 3
        sticker(name, lambda: {(x + 1, y + 1) for (x, y) in m}, size, paint)
        return
    s = S(w, hgt)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.': s.p(x, y, h(pal[ch]))
    s.save(name)

GOLD = {"Y": "#f2c94c", "y": "#c98f1d", "h": "#fff1a8"}
ascii_sprite("sticker_star", [
    ".....h.....",
    "....hYY....",
    "....YYY....",
    "hhhYYYYYYYY",
    ".YYYYYYYYy.",
    "..YYYYYYy..",
    "...YYYYYy..",
    "...YYYyYY..",
    "..YYy..YYy.",
    "..Yy....yy.",
], GOLD, border=True)
ascii_sprite("sticker_heart", [
    ".RRR...RRR.",
    "RhhRR.RRRRR",
    "RhRRRRRRRRr",
    "RRRRRRRRRRr",
    "RRRRRRRRRRr",
    ".RRRRRRRRr.",
    "..RRRRRRr..",
    "...RRRRr...",
    "....RRr....",
    ".....r.....",
], {"R": "#c94a3a", "r": "#8e2f24", "h": "#f08a6a"}, border=True)
ascii_sprite("sticker_bolt", [
    "....YYYY.",
    "...hYYYy.",
    "...YYYy..",
    "..hYYy...",
    "..YYYYYYy",
    ".YYYYYYy.",
    "....YYy..",
    "...YYy...",
    "...Yy....",
    "..Yy.....",
    "..y......",
], GOLD, border=True)
ascii_sprite("sticker_pennant", [
    "s............",
    "sBB..........",
    "sBBBBB.......",
    "sGGGGGGGG....",
    "sBBBBBBBBBBB.",
    "sbbbbbbbb....",
    "sbbbbb.......",
    "sbb..........",
    "s............",
    "s............",
], {"s": "#7f5640", "B": "#3d5aa8", "b": "#2c4282", "G": "#e9b83f"}, border=True)
ascii_sprite("sticker_controller", [
    ".ggggggggggg.",
    "gggdgggggghgg",
    "ggdddggggbgrg",
    "gggdgggggghgg",
    "gggggGGGggggg",
    "gggg.....gggg",
    ".gg.......gg.",
], {"g": "#8a8fa0", "G": "#6b6f80", "d": "#3a3d4a", "r": "#c94a3a", "b": "#3d5aa8", "h": "#e9b83f"}, border=True)
ascii_sprite("sticker_pizza", [
    "ccccccccccc",
    "cCCCCCCCCCc",
    ".YYpYYYYpY.",
    ".YYYYYYYYY.",
    "..YYYpYYY..",
    "..YYYYYYY..",
    "...YpYYY...",
    "...YYYYY...",
    "....YYY....",
    "....YY.....",
    ".....Y.....",
], {"c": "#a8714e", "C": "#c9945f", "Y": "#f2c94c", "p": "#b5523b"}, border=True)
ascii_sprite("sticker_note", [
    "...nnnnnn",
    "...nnnnnn",
    "...n....n",
    "...n....n",
    "...n....n",
    "...n....n",
    "...n....n",
    ".nnn..nnn",
    "nnnn.nnnn",
    "nnnn.nnnn",
    ".nn...nn.",
], {"n": "#2e2a36"}, border=True)

# ---- clearer pencil (13x13): red eraser, metal band, yellow body, wood tip, graphite ----
ascii_sprite("icon_pencil", [
    ".........ooo.",
    "........orrro",
    ".......orrrro",
    "......osorro.",
    ".....oyysso..",
    "....oyyyyo...",
    "...oyyYyo....",
    "..oyyYyo.....",
    ".owyYyo......",
    "owwwyo.......",
    "owwwo........",
    "oggo.........",
    "ooo..........",
], {"o": "#3b2a24", "r": "#c94a3a", "s": "#a9afc4", "y": "#f2c94c", "Y": "#c98f1d", "w": "#e8c39a", "g": "#2e2a36"})

# ---- chat bubble (DMs) 14x12 ----
ascii_sprite("icon_chat", [
    ".oooooooooooo.",
    "occcccccccccco",
    "occcccccccccco",
    "occdccdccdccco",
    "occcccccccccco",
    "occcccccccccco",
    ".oooocooooooo.",
    "....oco.......",
    "....oo........",
], {"o": "#6e4a3c", "c": "#fffaf0", "d": "#6e4a3c"})

# ---- a note pushed into the top vent slot of a locker (16x11) ----
s = S(16, 11)
paper = poly([(2, 2), (13, 0), (15, 10.5), (1, 10.5)])
s.fill(paper, CU0); s.outline(paper, OL)
for y in (4, 6, 8):
    for x in range(4, 12): s.p(x, y - (x - 4) // 5, h("#cfdde8"))
s.p(11, 2, h("#c94a3a")); s.p(12, 2, h("#c94a3a")); s.p(12, 3, h("#8e2f24"))   # red wax dot
s.hl(0, 15, 10, h("#2a2440"))                                                     # the slot it disappears into
s.save("note_slot")

# ---- homeroom logo: a little locker mark + blocky wordmark with an extruded shadow ----
GLY = {
    "h": ["#....", "#....", "#.##.", "##..#", "#...#", "#...#", "#...#"],
    "o": [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
    "m": [".......", ".......", "##.##..", "#.#..#.", "#.#..#.", "#.#..#.", "#.#..#."],
    "e": [".....", ".....", ".###.", "#...#", "#####", "#....", ".####"],
    "r": [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
}
GLY["m"] = [".......", ".......", "##.##..", "#.#..#.", "#.#..#.", "#.#..#.", "#.#..#."]
GLY["m"] = [r[:6] for r in GLY["m"]]
GLY["m"] = [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"]
word = "homeroom"; SC = 2
cols = []
for ch in word:
    g = GLY[ch]
    for cx in range(len(g[0])): cols.append([g[r][cx] for r in range(7)])
    cols.append(['.'] * 7)
cols = cols[:-1]
LW, LH = len(cols) * SC + 4, 7 * SC + 5
lm = set()
for cx, col in enumerate(cols):
    for r, v in enumerate(col):
        if v == '#':
            for dx in range(SC):
                for dy in range(SC): lm.add((1 + cx * SC + dx, 1 + r * SC + dy))
s = S(LW, LH)
ext = {(x + 1, y + 2) for (x, y) in lm} | {(x + 1, y + 1) for (x, y) in lm} | {(x, y + 1) for (x, y) in lm}
s.fill(ext - lm, h("#8a5a3c"))
for (x, y) in lm:
    t = (y - 1) / (7 * SC)
    s.p(x, y, h("#fff1d0") if t < .45 else h("#f2c97a") if t < .75 else h("#e0a85a"))
s.outline(lm | ext, h("#3b2a24"))
s.save("logo_word")
# mark: a tiny locker with a name tag and a lock
ascii_sprite("logo_mark", [
    "oooooooooooo",
    "oBBBBBBBBBBo",
    "obbbbbbbbbbo",
    "oBddddddddBo",
    "oBBBBBBBBBBo",
    "oBddddddddBo",
    "oBBBBBBBBBBo",
    "oBccccccBBBo",
    "oBcnnnncBBBo",
    "oBccccccBgBo",
    "oBBBBBBBBGBo",
    "oBddddddddBo",
    "oBBBBBBBBBBo",
    "oBddddddddBo",
    "obbbbbbbbbbo",
    "oooooooooooo",
], {"o": "#34385e", "B": "#5a75bd", "b": "#44589a", "d": "#34385e", "c": "#fffaf0", "n": "#6e4a3c", "g": "#e9b83f", "G": "#c98f1d"})

# ---- Mittens: tuxedo cat with a red bandana ----
MO = h("#1c1820"); MK = h("#2e2a36"); MG = h("#4a4556"); MW = h("#f2eee6"); MWs = h("#cfc8bd")
MY = h("#d5e04a"); MN = h("#d98b7a"); MR = h("#c0392b"); MRd = h("#8e2a20")

def cat_sit(name, tail=0, blink=False, meow=False):
    s = S(26, 24)
    body = {(x, y) for (x, y) in ellipse(10, 15.5, 7, 6.5) if y <= 21}
    chest = ellipse(15.5, 14, 3.6, 6)
    head = ellipse(17.5, 8, 5, 4.4)
    ears = poly([(12.5, 7), (13.5, 0.5), (17, 4.5)]) | poly([(18, 4.5), (21.5, 0.5), (22, 7)])
    leg = {(x, y) for x in range(15, 18) for y in range(15, 22)}
    tip = [(4, 21), (3, 20), (2, 19), (2, 18), (2, 17), (2, 16), (3, 15), (3, 14)] if tail == 0 else \
          [(4, 21), (3, 20), (2, 19), (1, 18), (1, 17), (1, 16), (1, 15), (2, 14)]
    tailm = set()
    for (x, y) in tip: tailm |= {(x, y), (x + 1, y)}
    cat = body | chest | head | ears | leg | tailm
    s.fill(cat, MK)
    for (x, y) in body:
        if x < 9 and y < 14: s.p(x, y, MG)          # back highlight
    s.fill({(x, y) for (x, y) in ellipse(16, 14, 2, 4)}, MW)        # white chest
    s.fill({(x, y) for (x, y) in ellipse(20.5, 10, 2.2, 1.6)}, MW)   # muzzle
    for x in (15, 16, 17): s.p(x, 21, MW); s.p(x, 20, MW)            # white front paw ("mittens")
    for x in (6, 7, 8, 9): s.p(x, 21, MW)                           # back paw
    s.p(14, 3, MG); s.p(20, 3, MG)                                   # inner ears
    if blink: s.p(18, 7, MO); s.p(19, 7, MO)
    else: s.p(18, 7, MY); s.p(19, 7, MY); s.p(19, 6, MY)
    s.p(22, 9, MN)
    if meow: s.p(21, 11, MO); s.p(22, 11, MRd); s.p(21, 12, MRd)
    # bandana knotted at the neck
    for x in range(13, 20): s.p(x, 11, MR); s.p(x, 12, MR if x < 19 else MRd)
    for (x, y) in ((15, 13), (16, 13), (17, 13), (16, 14)): s.p(x, y, MRd if y == 14 else MR)
    s.outline(cat, MO)
    s.save(name)

def cat_walk(name, step):
    s = S(28, 20)
    body = ellipse(12, 10.5, 8.5, 4.3)
    head = ellipse(21, 6.5, 4.6, 4.2)
    ears = poly([(17, 5), (18, 0.5), (20.5, 3)]) | poly([(21.5, 3), (24.5, 0.5), (25, 5.5)])
    legs = set()
    lift = (0, 1, 0, 1) if step == 0 else (1, 0, 1, 0)
    for i, lx in enumerate((5, 8, 15, 18)):
        for y in range(13, 19 - lift[i]): legs |= {(lx, y), (lx + 1, y)}
    tailm = set()
    for (x, y) in ((4, 9), (3, 8), (2, 7), (2, 6), (2, 5), (2, 4), (3, 3)) if step == 0 else ((4, 9), (3, 8), (2, 7), (1, 6), (1, 5), (1, 4), (2, 3)):
        tailm |= {(x, y), (x + 1, y)}
    cat = body | head | ears | legs | tailm
    s.fill(cat, MK)
    for (x, y) in body:
        if y < 9 and x < 16: s.p(x, y, MG)
    s.fill({(x, y) for (x, y) in ellipse(24, 8.5, 2, 1.5)}, MW)
    s.fill({(x, y) for (x, y) in ellipse(17.5, 12, 2, 1.5)}, MW)
    for i, lx in enumerate((5, 8, 15, 18)):
        yb = 18 - lift[i]; s.p(lx, yb, MW); s.p(lx + 1, yb, MW)
    s.p(21, 5, MY); s.p(22, 5, MY); s.p(25, 7, MN)
    s.p(18, 2, MG); s.p(23, 2, MG)
    for y in (9, 10): s.p(17, y, MR); s.p(18, y, MR)
    s.p(17, 11, MRd)
    s.outline(cat, MO)
    s.save(name)

cat_sit("mittens_sit"); cat_sit("mittens_tail", tail=1); cat_sit("mittens_blink", blink=True); cat_sit("mittens_meow", meow=True)
cat_walk("mittens_walk0", 0); cat_walk("mittens_walk1", 1)

# portrait for the dialogue badge (24x24, front-facing)
s = S(24, 24)
head = ellipse(11.5, 13.5, 7.6, 6.4)
ears = poly([(4.5, 11), (5.5, 3.5), (10, 8)]) | poly([(13, 8), (17.5, 3.5), (18.5, 11)])
cat = head | ears
s.fill(cat, MK)
s.fill(ellipse(11.5, 16.5, 3.6, 2.4), MW)
for y in range(9, 15): s.p(11, y, MW); s.p(12, y, MW)
s.p(10, 9, MW); s.p(13, 9, MW)
for (x, y) in ((6, 6), (6, 7), (7, 7), (17, 6), (16, 7), (17, 7)): s.p(x, y, MG)
for (ex) in (7, 15):
    s.rect(ex, 12, ex + 1, 13, MY); s.p(ex + 1, 12, MO); s.p(ex + 1, 13, MO)
s.p(11, 15, MN); s.p(12, 15, MN)
s.p(10, 17, MO); s.p(13, 17, MO); s.p(11, 18, MO); s.p(12, 18, MO)
s.outline(cat, MO)
for x in range(5, 19):
    s.p(x, 20, MR); s.p(x, 21, MR if 6 < x < 17 else CLEAR); s.p(x, 22, MRd if 8 < x < 15 else CLEAR)
s.p(11, 23, MRd); s.p(12, 23, MRd)
s.save("mittens_face")
print("v2 sprites done")
