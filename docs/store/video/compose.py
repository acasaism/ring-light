# Final promo video: the recorded interactive session, the light window scene and the end card.
import os, sys, glob
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make as m

W = m.WORK
rec = sorted(glob.glob(f"{W}/rec/*.png"))
FPS, FADE = m.FPS, 0.3  # each clip fades through the card background at its edges

def still(img, seconds, text=None):
    return [(lambda i, img=img, text=text: m.caption(img, text) if text else img)] * round(seconds * FPS)

clips = [
    ("rec", [lambda i, f=f: Image.open(f).convert("RGB") for f in rec], (False, True)),
    ("window", [lambda i: m.window_frame(i / FPS)] * round(m.WINDOW_SECONDS * FPS), (True, True)),
    ("end", still(m.end, 4.0), (True, False)),
]
os.makedirs(f"{W}/final", exist_ok=True)
n = 0
for name, frames, (fade_in, fade_out) in clips:
    k = round(FADE * FPS)
    for i, render in enumerate(frames):
        img = render(i)
        if fade_in and i < k:
            img = Image.blend(m.BLANK, img, m.ease((i + 1) / k))
        if fade_out and i >= len(frames) - k:
            img = Image.blend(img, m.BLANK, m.ease((i - (len(frames) - k) + 1) / k))
        img.save(f"{W}/final/{n:04d}.png", compress_level=1)
        n += 1
print("frames", n, "seconds", n / FPS)
