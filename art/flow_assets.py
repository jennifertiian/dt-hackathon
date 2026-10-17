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
