"""Erzeugt alle Pixel-Art-Grafiken (SVG) fuer Nordlicht Reisen."""
import math
import os
import random
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def th(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16


class Img:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = [[None] * w for _ in range(h)]

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.p[y][x]
        return None

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.set(xx, yy, c)

    def sprite(self, x, y, rows, pal):
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in pal:
                    self.set(x + dx, y + dy, pal[ch])

    def save(self, name, title):
        by_color = {}
        for y, row in enumerate(self.p):
            x = 0
            while x < self.w:
                c = row[x]
                if c is None:
                    x += 1
                    continue
                x2 = x
                while x2 + 1 < self.w and row[x2 + 1] == c:
                    x2 += 1
                by_color.setdefault(c, []).append(f"M{x} {y}h{x2 - x + 1}v1H{x}z")
                x = x2 + 1
        paths = "".join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in by_color.items())
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" '
            f'width="{self.w * 10}" height="{self.h * 10}" shape-rendering="crispEdges" '
            f'role="img">{"<title>"+title+"</title>" if title else ""}{paths}</svg>'
        )
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(svg)


# ---------- Bausteine ----------
def sky(img, stops, y0, y1):
    n = len(stops) - 1
    for y in range(y0, y1):
        p = (y - y0) / max(1, (y1 - y0 - 1)) * n
        i = min(int(p), n - 1)
        t = p - i
        for x in range(img.w):
            img.set(x, y, stops[i + 1] if t > th(x, y) else stops[i])


def stars(img, n, y1, seed, cols=("#ffffff", "#fff4c2", "#cfe3ff")):
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randrange(img.w), r.randrange(y1)
        c = r.choice(cols)
        img.set(x, y, c)
        if r.random() < 0.12:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                img.set(x + dx, y + dy, "#8fa8d8")


def aurora(img, base, amp, length, cols, phase=0.0, freq=0.07, density=0.95):
    for x in range(img.w):
        cy = base + amp * math.sin(x * freq + phase) + amp * 0.5 * math.sin(x * freq * 2.3 + phase * 1.7)
        L = length * (0.55 + 0.45 * math.sin(x * 0.19 + phase * 3) ** 2)
        cy = int(cy)
        for dy in range(int(L)):
            y = cy - dy
            f = dy / L
            inten = (1 - f) ** 1.3
            if inten * density > th(x, y):
                c = cols[0] if f < 0.12 else cols[1] if f < 0.55 else cols[2]
                img.set(x, y, c)


def mountains(img, peaks, ground, light, dark, snow=None, snow_dark=None, snowline=999, seed=1):
    r = random.Random(seed)
    jag = [r.choice((0, 0, 0, 1, -1)) for _ in range(img.w)]
    for x in range(img.w):
        best = None
        for px, ph, slope in peaks:
            h = ph - abs(x - px) * slope
            if best is None or h > best[0]:
                best = (h, px)
        h, px = best
        h += jag[x]
        if h <= 0:
            continue
        top = int(ground - h)
        for y in range(top, ground):
            hy = ground - y
            left = x <= px
            c = light if left else dark
            if snow and hy > snowline + jag[(x + 3) % img.w] * 2:
                c = snow if left else (snow_dark or snow)
            img.set(x, y, c)


def water(img, y0, stops, highlights, seed, n=40):
    sky(img, stops, y0, img.h)
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randrange(img.w), r.randrange(y0 + 1, img.h)
        w = r.randint(2, 6)
        c = r.choice(highlights)
        for i in range(w):
            img.set(x + i, y, c)


def gable_house(img, x, ground, w, h, wall, roof, window="#f8f4e8", frame=None, door=None):
    img.rect(x, ground - h, w, h, wall)
    half = (w + 1) // 2
    for i in range(half):
        k = half - 1 - i
        img.rect(x + k, ground - h - half + i, w - 2 * k, 1, roof)
    # Fenster
    for wy in range(ground - h + 2, ground - 3, 4):
        for wx in range(x + 2, x + w - 2, 3):
            img.set(wx, wy, window)
            img.set(wx, wy + 1, window)
    if door:
        img.rect(x + w // 2 - 1, ground - 3, 2, 3, door)


def pine(img, x, ground, h, col, snow):
    img.rect(x, ground - 2, 1, 2, "#3b2a20")
    for i in range(h):
        y = ground - 2 - i
        half = (h - i) // 2
        if i % 3 == 0 and half > 0:
            half += 1
        img.rect(x - half, y, 2 * half + 1, 1, col)
        if i % 3 == 0:
            img.set(x - half, y, snow)
            img.set(x + half, y, snow)
    img.set(x, ground - 2 - h, snow)


SHIP = [
    "........rr.......",
    "........kk.......",
    "....wwwwwwwww....",
    "....wbwbwbwbw....",
    "..wwwwwwwwwwwww..",
    "kkkkkkkkkkkkkkkkkk",
    ".kkkkkkkkkkkkkkkk",
    "..rrrrrrrrrrrrrr.",
]
SHIP_PAL = {"k": "#1b1b2a", "r": "#d23c3c", "w": "#f4f4f0", "b": "#ffd27a"}

# ---------- Szenen ----------
W, H = 96, 64


def kopenhagen():
    img = Img(W, H)
    sky(img, ["#6fbfee", "#a4daf5", "#d9f0fb"], 0, 32)
    for cx, cy, cw in ((12, 6, 10), (60, 4, 14), (80, 10, 8)):
        img.rect(cx, cy, cw, 2, "#ffffff")
        img.rect(cx + 2, cy - 1, cw - 4, 1, "#ffffff")
    cols = ["#e8574a", "#f2b134", "#3f8fd2", "#f28c3c", "#5bb36b", "#e3d7b8", "#c94f7c", "#f2d34a", "#4cb3b0"]
    r = random.Random(4)
    x = -2
    i = 0
    while x < W:
        w = r.choice((9, 10, 11, 12))
        h = r.randint(16, 23)
        gable_house(img, x, 40, w, h, cols[i % len(cols)], "#6a3328", door="#3a2a2a")
        x += w
        i += 1
    img.rect(0, 40, W, 3, "#6b6f7a")
    img.rect(0, 40, W, 1, "#8d92a0")
    water(img, 43, ["#2f78a8", "#1d4f78"], ["#7fb8de", "#e8574a", "#f2b134", "#5bb36b"], 7, 50)
    # Boote
    for bx, by in ((14, 47), (52, 51)):
        img.rect(bx, by, 14, 2, "#8a4b2a")
        img.rect(bx + 1, by + 2, 12, 1, "#5a2f1a")
        img.rect(bx + 6, by - 12, 1, 12, "#4a3528")
        for i in range(6):
            img.rect(bx + 7, by - 11 + i, 6 - i, 1, "#f7f1e1")
    img.save("reiseziel-kopenhagen.svg", "Pixel-Art: bunte Giebelhäuser am Kanal Nyhavn in Kopenhagen mit Segelbooten")


def stockholm():
    img = Img(W, H)
    sky(img, ["#2b2a5c", "#6e3d7a", "#d9685a", "#f6b26b"], 0, 42)
    # Sonne
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            if dx * dx + dy * dy <= 25:
                img.set(70 + dx, 34 + dy, "#ffd98a")
    cols = ["#c9853a", "#b5533c", "#d9a55b", "#8f4a3a", "#a86a3c"]
    r = random.Random(9)
    x = 0
    i = 0
    while x < W:
        w = r.randint(5, 9)
        h = r.randint(8, 15)
        img.rect(x, 42 - h, w, h, cols[i % 5])
        img.rect(x, 42 - h, w, 1, "#5a2f2a")
        for wy in range(42 - h + 2, 40, 3):
            for wx in range(x + 1, x + w - 1, 2):
                if r.random() < 0.6:
                    img.set(wx, wy, "#ffd27a")
        x += w
        i += 1
    # Kirchturm (Riddarholmskyrkan)
    img.rect(24, 22, 5, 16, "#5a3a3a")
    for k in range(10):
        img.rect(26 - k // 4, 12 + k, 1 + 2 * (k // 4), 1, "#2f2a3a")
    # Stadshuset-Turm mit Goldspitze
    img.rect(80, 20, 7, 22, "#a8452f")
    img.rect(79, 19, 9, 2, "#7a2f22")
    img.rect(82, 15, 3, 4, "#7a2f22")
    img.rect(83, 11, 1, 4, "#ffd24a")
    img.set(82, 12, "#ffd24a"); img.set(84, 12, "#ffd24a")
    water(img, 42, ["#4a3466", "#1e1b3a"], ["#f6b26b", "#ffd98a", "#d9685a"], 3, 60)
    # Schaerenboot
    img.sprite(10, 48, SHIP[:], SHIP_PAL)
    img.save("reiseziel-stockholm.svg", "Pixel-Art: Altstadt Gamla Stan in Stockholm bei Sonnenuntergang mit Kirchturm und Rathausturm")


def oslo():
    img = Img(W, H)
    sky(img, ["#ef8a8f", "#fbab7a", "#ffd79a"], 0, 36)
    sun(img, 46, 30, 8)
    mountains(img, [(20, 16, 0.5), (60, 14, 0.4), (90, 18, 0.6)], 36, "#b06582", "#9a5674", seed=5)
    img.rect(0, 36, W, 10, "#c77a8c")
    img.rect(0, 44, W, 2, "#8f5a74")
    r = random.Random(11)
    # Barcode-Hochhaeuser
    x = 60
    while x < 94:
        w = r.randint(3, 5)
        h = r.randint(14, 26)
        c = r.choice(("#7a4a68", "#8f5a74", "#6a3f5e", "#a06a7e"))
        img.rect(x, 42 - h, w, h, c)
        for wy in range(42 - h + 1, 41, 2):
            for wx in range(x, x + w):
                if r.random() < 0.35:
                    img.set(wx, wy, "#ffe08a")
        x += w + 1
    # Opernhaus: schraege Marmorflaeche
    for xx in range(4, 58):
        if xx < 30:
            top = 44 - int((xx - 4) * 0.45)
        else:
            top = 32
        img.rect(xx, top, 1, 46 - top, "#fff6ee" if xx < 30 else "#f6dcd6")
    img.rect(30, 26, 14, 6, "#f0d0cc")
    img.rect(32, 28, 10, 3, "#7a4a68")
    img.rect(30, 34, 28, 8, "#7a4a68")
    for wx in range(31, 57, 2):
        for wy in range(35, 41, 2):
            if (wx + wy) % 3:
                img.set(wx, wy, "#ffd98a")
    water(img, 46, ["#e88a88", "#b8607e"], ["#ffd98a", "#fff3c4", "#f7b2b7"], 8, 45)
    img.save("reiseziel-oslo.svg", "Pixel-Art: das weiße Opernhaus von Oslo am Wasser im Abendrot mit Hochhäusern")


def lofoten():
    img = Img(W, H)
    sky(img, ["#5aa4e6", "#9ccdf2", "#e0f2fb"], 0, 44)
    mountains(img, [(14, 34, 1.8), (40, 40, 1.5), (70, 30, 1.7), (92, 36, 2.0)], 44,
              "#6f8f7c", "#4f6b5e", "#f4f8fa", "#c9d6de", snowline=26, seed=3)
    img.rect(0, 42, W, 3, "#4c8a4a")
    water(img, 45, ["#2e86a8", "#195a7a"], ["#9fd5ea", "#e0f2fb"], 12, 45)
    # Rorbuer (rote Fischerhuetten auf Stelzen)
    for hx in (18, 30, 44, 58):
        gable_house(img, hx, 46, 9, 7, "#b8322a", "#3a2a2a", window="#f7f1e1")
        for sx in range(hx, hx + 9, 4):
            img.rect(sx, 46, 1, 4, "#3a2a20")
    img.rect(16, 46, 52, 1, "#5a3e2a")
    img.save("reiseziel-lofoten.svg", "Pixel-Art: rote Fischerhütten auf Stelzen vor schroffen Bergen der Lofoten")


def lappland():
    img = Img(W, H)
    sky(img, ["#6a3a78", "#a2508a", "#e07a8e", "#ffb47e"], 0, 46)
    stars(img, 14, 18, 21, cols=("#fff3e0", "#ffe0f0"))
    aurora(img, 24, 5, 18, ["#e8fff2", "#9fe8c4", "#f3a6d6"], phase=0.5, density=0.8)
    mountains(img, [(20, 8, 0.4), (70, 10, 0.35)], 46, "#8a4a78", "#7a3f6a", seed=8)
    sky(img, ["#fff0ea", "#f8d6d6", "#e8b8c8"], 46, H)
    for tx, th_ in ((6, 16), (14, 12), (80, 18), (88, 13), (73, 10)):
        pine(img, tx, 50, th_, "#4a3a5a", "#fff6f2")
    # Huette
    gable_house(img, 34, 52, 13, 8, "#a3322a", "#e6eef8", window="#ffcf5a", door="#3a2020")
    img.rect(42, 39, 2, 4, "#3a2020")
    for gx, gy in ((37, 53), (38, 54), (40, 53), (41, 54)):
        img.set(gx, gy, "#ffc65c")
    img.save("reiseziel-lappland.svg", "Pixel-Art: sanftes Nordlicht am rosa Dämmerungshimmel über einer roten Hütte im verschneiten Lappland")


def geiranger():
    img = Img(W, H)
    sky(img, ["#7cc0ee", "#b9e0f7", "#eef8fd"], 0, 46)
    mountains(img, [(48, 18, 0.6)], 46, "#7f9fb8", "#6a8aa5", "#f4f8fa", "#d6e2ea", snowline=12, seed=2)
    mountains(img, [(-6, 60, 1.3), (102, 58, 1.25)], 46, "#3f6650", "#2f5240", "#e9f1f4", "#c9d6de", snowline=44, seed=6)
    # Wasserfall (Sieben Schwestern)
    for wx in (14, 17, 20):
        for wy in range(14, 46):
            if img.get(wx, wy) in ("#3f6650", "#2f5240", "#e9f1f4", "#c9d6de"):
                img.set(wx, wy, "#eaf7ff" if (wy + wx) % 3 else "#a8d8f0")
    water(img, 46, ["#1f6b73", "#123f47"], ["#7fc8cf", "#eaf7ff"], 4, 40)
    img.sprite(52, 46, SHIP, SHIP_PAL)
    for i in range(10):
        img.set(50 - i * 2, 54 + (i % 2), "#bfe6ea")
    img.save("reiseziel-geiranger.svg", "Pixel-Art: steiler Geirangerfjord mit Wasserfall und einem Schiff auf dem Wasser")


def sun(img, cx, cy, r, core="#fff3c4", ring="#ffe08a", stripes=True):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = dx * dx + dy * dy
            if d <= r * r:
                y = cy + dy
                if stripes and dy > 2 and (y % 4 == 0 or (dy > r * 0.6 and y % 4 == 1)):
                    continue
                img.set(cx + dx, y, core if d < (r - 3) ** 2 else ring)


def clouds(img, items):
    for x, y, w, body, light in items:
        img.rect(x, y, w, 2, body)
        img.rect(x + 3, y - 1, w - 6, 1, light)
        img.rect(x + 6, y - 2, max(2, w - 14), 1, light)


def hero():
    img = Img(192, 108)
    sky(img, ["#e46f8c", "#f4857a", "#fc9f6c", "#ffbf72", "#ffe09a"], 0, 80)
    sun(img, 132, 54, 17)
    clouds(img, [(10, 18, 34, "#f6a1b4", "#ffd2c2"), (60, 30, 26, "#f7a8a8", "#ffd8bf"),
                 (120, 14, 40, "#f39bb0", "#ffd2c2"), (150, 40, 22, "#fbb59c", "#ffe2c2")])
    mountains(img, [(70, 26, 0.7), (120, 32, 0.8), (165, 22, 0.6)], 80, "#c96c8b", "#b35c7d",
              "#ffd9c8", "#f2bdb3", snowline=22, seed=13)
    mountains(img, [(-10, 70, 1.4), (205, 66, 1.3)], 80, "#83426b", "#6f355c", "#f0b3ad", "#d9959c", snowline=56, seed=14)
    water(img, 80, ["#f59c7e", "#dc768a", "#bb5e84"], ["#ffe09a", "#fff3c4", "#f7b2b7"], 31, 90)
    r = random.Random(5)
    for y in range(81, 108):
        half = max(2, 16 - (y - 81) // 3)
        for _ in range(2):
            x = 132 + r.randint(-half, half)
            img.rect(x, y, r.randint(2, 6), 1, r.choice(("#fff3c4", "#ffe09a")))
    img.save("hero.svg", "Pixel-Art: Sonnenuntergang über einem Fjord in Norwegen mit rosa Bergen und goldenem Wasser")


def logo():
    img = Img(16, 16)
    img.rect(1, 0, 14, 16, "#3a1f35")
    img.rect(0, 1, 16, 14, "#3a1f35")
    sun(img, 8, 9, 6, core="#ffe08a", ring="#ffc65c", stripes=False)
    for i in range(6):
        img.rect(7 - i, 8 + i, 1 + 2 * i, 1, "#fff3c4" if i < 2 else "#ff8a5c")
    img.rect(1, 14, 14, 1, "#ffb08a")
    img.save("logo.svg", "Logo Nordlicht Reisen: Sonne hinter einem Berg")


def avatar(name, title, bg, skin, hair, shirt, style):
    img = Img(32, 32)
    img.rect(0, 0, 32, 32, bg)
    # Schultern / Pullover
    img.rect(6, 25, 20, 7, shirt)
    img.rect(8, 24, 16, 1, shirt)
    # Norweger-Muster
    for x in range(7, 26, 2):
        img.set(x, 28, "#f4f4f0")
    img.rect(14, 21, 4, 4, skin)
    # Kopf
    img.rect(10, 9, 12, 13, skin)
    img.rect(11, 8, 10, 1, skin)
    img.rect(11, 22, 10, 1, skin)
    # Haare
    if style == "lang":
        img.rect(9, 6, 14, 4, hair)
        img.rect(8, 8, 3, 17, hair)
        img.rect(21, 8, 3, 17, hair)
    elif style == "kurz":
        img.rect(10, 6, 12, 4, hair)
        img.rect(9, 8, 2, 5, hair)
        img.rect(21, 8, 2, 5, hair)
    elif style == "mutze":
        img.rect(9, 5, 14, 5, "#d23c3c")
        img.rect(9, 9, 14, 1, "#f4f4f0")
        img.rect(15, 3, 2, 2, "#f4f4f0")
        img.rect(9, 10, 2, 4, hair)
        img.rect(21, 10, 2, 4, hair)
    if style in ("kurz",):
        pass
    # Augen, Wangen, Mund
    img.rect(13, 14, 2, 2, "#1b1b2a")
    img.rect(18, 14, 2, 2, "#1b1b2a")
    img.set(12, 17, "#f2a0a0"); img.set(21, 17, "#f2a0a0")
    img.rect(15, 18, 3, 1, "#7a3b3b")
    img.set(14, 17, "#7a3b3b"); img.set(18, 17, "#7a3b3b")
    if name == "team-lars":
        img.rect(11, 18, 11, 4, hair)
        img.rect(15, 19, 3, 1, "#7a3b3b")
    img.save(f"{name}.svg", title)


ICONS = {
    "icon-kompass": (["...aaaa...", "..a....a..", ".a...r..a.", "a...rr...a", "a..rrww..a", "a..wwbb..a", "a...bb...a",
                      ".a..b...a.", "..a....a..", "...aaaa..."], {"a": "#3a1f35", "r": "#e8573a", "w": "#ffc65c", "b": "#b35c7d"}),
    "icon-herz": ([".rr..rr.", "rRRrrRRr", "rRRRRRRr", "rRRRRRRr", ".rRRRRr.", "..rRRr..", "...rr..."],
                  {"r": "#a3322a", "R": "#e8574a"}),
    "icon-blatt": (["......gg", "....ggGg", "..ggGGGg", ".gGGGGg.", ".gGGGg..", "gGGgg...", "g.g.....", "g......."],
                   {"g": "#2f7a4a", "G": "#5bb36b"}),
    "icon-schiff": (["....r....", "....k....", "..wwwww..", "..wbwbw..", "wwwwwwwww", "kkkkkkkkk", ".kkkkkkk.", "..bbbbb.."],
                    {"k": "#3a1f35", "r": "#e8573a", "w": "#ffb08a", "b": "#ffc65c"}),
}

if __name__ == "__main__":
    kopenhagen(); stockholm(); oslo(); lofoten(); lappland(); geiranger(); hero(); logo()
    avatar("team-ingrid", "Pixel-Porträt von Ingrid Solberg mit langen blonden Haaren", "#cfe3ff", "#f6d2b5", "#f2d34a", "#3f8fd2", "lang")
    avatar("team-lars", "Pixel-Porträt von Lars Nyström mit Bart", "#d6f5e5", "#e9c09a", "#8a4b2a", "#2f7a4a", "kurz")
    avatar("team-freya", "Pixel-Porträt von Freya Lund mit roter Mütze", "#eadcff", "#c98e64", "#2a1a14", "#6e3d7a", "mutze")
    for name, (rows, pal) in ICONS.items():
        w = max(len(r) for r in rows)
        img = Img(w + 2, len(rows) + 2)
        img.sprite(1, 1, rows, pal)
        img.save(f"{name}.svg", "")
    print("ok")
