from PIL import Image
import sys

N = 64
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
px = img.load()

def h(c, a=255):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)

OUT  = h("#34385e"); B1 = h("#44589a"); B2 = h("#5a75bd"); B3 = h("#7593d4")
B4   = h("#97b3e8"); B5 = h("#c4d9f6"); CRM = h("#fff6e6"); SLT = h("#2c3254")
S1   = h("#7c84a8"); S2 = h("#aeb8d6"); S3 = h("#e2e8f4")
GO   = h("#6b3f2a"); G1 = h("#c97a3c"); G2 = h("#e9a849"); G3 = h("#f7d26e"); G4 = h("#fff1b8")
SHAD = h("#3a4a3a", 70)
CLEAR = (0, 0, 0, 0)

def p(x, y, c):
    if 0 <= x < N and 0 <= y < N:
        px[x, y] = c
def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            p(x, y, c)
def hline(x0, x1, y, c): rect(x0, y, x1, y, c)
def vline(x, y0, y1, c): rect(x, y0, x, y1, c)

# ground shadow
hline(4, 59, 59, SHAD)
hline(8, 55, 60, SHAD)

# cabinet
L, T, R, BOT = 3, 2, 60, 58
rect(L, T, R, BOT, OUT)
for (x, y) in [(L, T), (R, T), (L, BOT), (R, BOT)]:
    px[x, y] = CLEAR
rect(L + 1, T + 1, R - 1, BOT - 1, B2)

# top surface (seen from slightly above)
hline(L + 1, R - 1, T + 1, B5)
hline(L + 1, R - 1, T + 2, B4)
hline(L + 1, R - 1, T + 3, B4)
hline(L + 1, R - 1, T + 4, B1)
hline(L + 2, L + 8, T + 1, CRM)
p(R - 4, T + 1, CRM); p(R - 3, T + 1, CRM)

# frame bevels
vline(L + 1, T + 5, BOT - 1, B3)
vline(R - 1, T + 5, BOT - 1, B1)
vline(R - 2, T + 5, BOT - 1, B2)

# kick plate
hline(L + 1, R - 1, BOT - 2, B2)
hline(L + 1, R - 1, BOT - 1, B1)

# door
dL, dT, dR, dB = 8, 8, 55, 54
hline(dL - 1, dR, dT - 1, B1)
vline(dL - 1, dT - 1, dB, B1)
rect(dL, dT, dR, dB, OUT)
rect(dL + 1, dT + 1, dR - 1, dB - 1, B3)
hline(dL + 1, dR - 1, dT + 1, B5)
vline(dL + 1, dT + 1, dB - 1, B4)
hline(dL + 1, dR - 1, dB - 1, B2)
vline(dR - 1, dT + 2, dB - 1, B2)
p(dL + 1, dB - 1, B3); p(dR - 1, dT + 1, B4)
p(dL + 2, dT + 2, CRM); p(dL + 3, dT + 2, B5); p(dL + 2, dT + 3, B5)

# hinges (small)
for hy in (dT + 5, dB - 7):
    vline(dL - 2, hy, hy + 2, OUT)
    p(dL - 1, hy, S3); p(dL - 1, hy + 1, S2); p(dL - 1, hy + 2, S1)

# vent slits (thin)
def slit(y, x0, x1):
    hline(x0 + 1, x1 - 1, y - 1, B2)
    hline(x0, x1, y, SLT)
    p(x0, y, OUT); p(x1, y, OUT)
    hline(x0 + 1, x1 - 1, y + 1, B4)
    p(x0 + 1, y + 1, B5); p(x0 + 2, y + 1, B5)

for y in (14, 17, 20):
    slit(y, 15, 48)
for y in (45, 48, 51):
    slit(y, 15, 48)

# latch tab (behind shackle)
hline(43, 52, 31, OUT); hline(43, 52, 33, OUT)
p(43, 32, OUT); p(52, 32, OUT)
hline(44, 51, 32, S2); p(44, 32, S3); p(51, 32, S1)
p(52, 34, B3)

# shackle
hline(46, 49, 28, OUT)
for y in range(29, 34):
    p(45, y, OUT); p(50, y, OUT)
hline(46, 49, 29, S3); p(49, 29, S2)
hline(47, 48, 30, OUT)
for y in range(30, 34):
    p(46, y, S2); p(49, y, S1)
p(46, 30, S3)
rect(47, 31, 48, 33, S1)
hline(47, 48, 31, OUT); hline(47, 48, 33, OUT)

# lock body (small)
lx0, lx1, ly0, ly1 = 44, 51, 34, 40
rect(lx0, ly0, lx1, ly1, GO)
rect(lx0 + 1, ly0 + 1, lx1 - 1, ly1 - 1, G2)
hline(lx0 + 1, lx1 - 1, ly0 + 1, G3)
vline(lx0 + 1, ly0 + 1, ly1 - 1, G3)
hline(lx0 + 1, lx1 - 1, ly1 - 1, G1)
vline(lx1 - 1, ly0 + 2, ly1 - 1, G1)
p(lx0 + 2, ly0 + 1, G4); p(lx0 + 1, ly0 + 2, G4)
p(lx0, ly0, B3); p(lx1, ly0, B3); p(lx0, ly1, B3); p(lx1, ly1, B2)
hline(47, 48, 36, GO)
hline(47, 48, 37, G1)
hline(45, 51, 41, B2)

out = sys.argv[1]
img.save(out + "_64.png")
img.resize((N * 16, N * 16), Image.NEAREST).save(out + "_1024.png")
print("ok")
