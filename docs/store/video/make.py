# Promo video helpers at 1920x1080: captions, the end card and the two-monitor light window scene.
import math, os
from PIL import Image, ImageDraw, ImageFont

S = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(S, "../../.."))
WORK = os.environ["RL_OUT"]  # frames and stills from record.mjs
W, H, FPS, K = 1920, 1080, 30, 1.5  # K: scale from the 1280x720 layout the harness is written in
FONT = "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf"

def font(size, weight):
    f = ImageFont.truetype(FONT, round(size * K))
    f.set_variation_by_name(weight)
    return f

def light_color(warmth, intensity):
    # Port of lightColor() in light.js (JS Math.round = floor(x + 0.5))
    target = (255, 214, 170) if warmth >= 0 else (205, 225, 255)
    t, k = abs(warmth) / 100, intensity / 100
    return tuple(math.floor((255 + (c - 255) * t) * k + 0.5) for c in target)

REF = [((-60, 100), (225, 237, 255)), ((0, 100), (255, 255, 255)), ((15, 100), (255, 249, 242)),
       ((60, 100), (255, 230, 204)), ((100, 50), (128, 107, 85))]
for (w, i), rgb in REF:
    assert light_color(w, i) == rgb, (w, i, light_color(w, i), rgb)

WARMTH_END = 30  # warmth the recording ends with
LIGHT = light_color(WARMTH_END, 100)
BLANK = Image.new("RGB", (W, H), LIGHT)  # transitions and backgrounds use the light colour itself

def ease(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)

def lerp(a, b, t):
    return a + (b - a) * t

CAPTION_FONT = font(23, "SemiBold")

def caption(img, text, alpha=1.0):
    # Same pill as #caption in the harness: centred, 44px from the top
    if not text or alpha <= 0:
        return img
    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    tw = d.textlength(text, font=CAPTION_FONT)
    pad, h = 20 * K, 44 * K
    x0, y0 = (W - tw) / 2 - pad, 44 * K
    d.rounded_rectangle((x0, y0, x0 + tw + 2 * pad, y0 + h), radius=h / 2, fill=(32, 33, 36, round(225 * alpha)))
    d.text((x0 + pad, y0 + 6 * K), text, font=CAPTION_FONT, fill=(255, 255, 255, round(255 * alpha)))
    return Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")

icon = Image.open(f"{REPO}/icons/on-128.png").convert("RGBA").resize((176, 176), Image.LANCZOS)

def card(lines):
    img = BLANK.copy()
    d = ImageDraw.Draw(img)
    y = 190 * K
    img.paste(icon, ((W - icon.width) // 2, round(y)), icon)
    y += 165 * K
    for text, size, weight, color in lines:
        f = font(size, weight)
        d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=color)
        y += size * 1.6 * K
    return img

end = card([("Ring Light for Google Meet", 46, "Bold", (31, 31, 31)),
            ("Add it free to Chrome or Firefox", 30, "SemiBold", (11, 87, 208)),
            ("Open source · github.com/acasaism/ring-light", 19, "Regular", (95, 99, 104))])

# --- light window scene: two monitors, the window is dragged to the second one and goes full screen ---
SW, SH = round(520 * K), round(520 * K * 9 / 16)
LEFT_X, RIGHT_X, SCREEN_Y = round(90 * K), round(670 * K), round(175 * K)
CURSOR = [(3, 2), (3, 21), (8, 16.5), (11.5, 24), (14.8, 22.6), (11.3, 15.3), (18, 15.3)]
NOTE_FONT = font(11, "Regular")
NOTE = "Simulated call · results depend on your screen and room"
# The left monitor shows the screen exactly as the recording ended, then with the extra light of the second screen
screen_a = Image.open(f"{WORK}/screen-a.png").convert("RGB").resize((SW, SH), Image.LANCZOS)
screen_b = Image.open(f"{WORK}/screen-b.png").convert("RGB").resize((SW, SH), Image.LANCZOS)

def monitor(d, x):
    b = 12 * K
    d.rounded_rectangle((x - b, SCREEN_Y - b, x + SW + b, SCREEN_Y + SH + b), radius=b, fill=(32, 33, 36))
    cx = x + SW // 2
    d.rectangle((cx - 14 * K, SCREEN_Y + SH + b, cx + 14 * K, SCREEN_Y + SH + 58 * K), fill=(60, 64, 67))
    d.rounded_rectangle((cx - 90 * K, SCREEN_Y + SH + 56 * K, cx + 90 * K, SCREEN_Y + SH + 66 * K), radius=5 * K, fill=(60, 64, 67))

def window_scene_at(t):
    img = BLANK.copy()
    d = ImageDraw.Draw(img)
    monitor(d, LEFT_X); monitor(d, RIGHT_X)
    img.paste(Image.blend(screen_a, screen_b, ease((t - 3.6) / 0.8)), (LEFT_X, SCREEN_Y))
    img.paste((40, 42, 46), (RIGHT_X, SCREEN_Y, RIGHT_X + SW, SCREEN_Y + SH))  # idle desktop
    ww, wh, bar = 190 * K, 130 * K, 18 * K
    start = (LEFT_X + 300 * K, SCREEN_Y + 120 * K)
    stop = (RIGHT_X + (SW - ww) / 2, SCREEN_Y + (SH - wh) / 2)
    move, grow = ease((t - 0.5) / 1.5), ease((t - 2.9) / 0.5)
    x, y = lerp(start[0], stop[0], move), lerp(start[1], stop[1], move)
    # full screen: the window grows to fill the second monitor and loses its title bar
    x0, y0 = lerp(x, RIGHT_X, grow), lerp(y, SCREEN_Y, grow)
    x1, y1 = lerp(x + ww, RIGHT_X + SW, grow), lerp(y + wh, SCREEN_Y + SH, grow)
    b = bar * (1 - grow)
    base, img = img, img.copy()  # the window is drawn on a layer and only shows on the two screens
    d = ImageDraw.Draw(img)
    if grow < 1:
        d.rectangle((x0 - 1, y0 - 1, x1, y1), outline=(95, 99, 104))
    if b >= 1:
        d.rectangle((x0, y0, x1 - 1, y0 + b), fill=(60, 64, 67))
        if grow == 0:
            f = font(11, "Regular")
            d.text((x0 + (ww - d.textlength("Ring light", font=f)) / 2, y0 + 2 * K), "Ring light", font=f, fill=(232, 234, 237))
    d.rectangle((x0, y0 + b, x1 - 1, y1 - 1), fill=LIGHT)
    for sx in (LEFT_X, RIGHT_X):
        box = (sx, SCREEN_Y, sx + SW, SCREEN_Y + SH)
        base.paste(img.crop(box), box[:2])
    img, d = base, ImageDraw.Draw(base)
    if t < 3.2:  # cursor holds the title bar while dragging, then double-clicks it
        cx, cy = x + ww / 2, y + 9 * K
        if 2.6 <= t < 3.0:
            p = (t - 2.6) / 0.4
            r = (10 + 30 * p) * K
            over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(over).ellipse((cx - r, cy - r, cx + r, cy + r), fill=(11, 87, 208, round(90 * (1 - p))))
            img = Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")
            d = ImageDraw.Draw(img)
        d.polygon([(cx + (px - 3) * K, cy + (py - 2) * K) for px, py in CURSOR], fill=(255, 255, 255), outline=(0, 0, 0), width=2)
    d.text((W - d.textlength(NOTE, font=NOTE_FONT) - 14 * K, H - 24 * K), NOTE, font=NOTE_FONT, fill=(95, 99, 104))
    return img

WINDOW_SECONDS = 6.2
WINDOW_CAPTIONS = [(0.0, "Move it to a second screen"), (2.1, "Double-click for full screen"), (3.6, "More light on your face")]

def window_frame(t):
    # one caption at a time: each fades out just before the next one fades in
    for i, (start, text) in enumerate(WINDOW_CAPTIONS):
        nxt = WINDOW_CAPTIONS[i + 1][0] if i + 1 < len(WINDOW_CAPTIONS) else None
        if t >= start and (nxt is None or t < nxt):
            alpha = 1 if i == 0 else min(1, (t - start) / 0.25)
            if nxt is not None and t > nxt - 0.2:
                alpha = (nxt - t) / 0.2
            return caption(window_scene_at(t), text, alpha)
