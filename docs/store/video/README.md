# Promo video

Regenerates `docs/store/promo-video.mp4` and the README demo `docs/demo.gif`. Run it again when the panel or the light effect changes, so the video keeps showing the real extension.

## Quick path

1. Install the requirements below and download the music (see [Music](#music)).
2. From the repository root: `docs/store/video/make-video.sh path/to/happy-lofi-day.mp3`
3. Watch `docs/store/promo-video.mp4` before committing it.

## Requirements

| Tool | Used for |
|------|----------|
| Node.js 22 or later | `record.mjs`, which uses Node's built-in `WebSocket` |
| Google Chrome | Headless recording. Set `CHROME` to use another Chromium binary |
| Python 3 with [Pillow](https://python-pillow.org/) | `compose.py` and `make.py` |
| ffmpeg | Encoding the video and the GIF |
| Noto Sans | Captions and the end card (`/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf`; change `FONT` in `make.py` if it lives elsewhere) |

## How it works

| File | Role |
|------|------|
| `harness/index.html` | A 1280×720 page with a browser toolbar, the mock call and the real `popup.html` in frames, plus the caption, cursor and click ripple |
| `harness/call.html` | The mock Meet call. It runs the real `light.js` and `content.js`, and lights the "You" silhouette as an illustration of light reaching your face |
| `harness/stub.js` | A fake extension API (storage, messages, windows) shared by both frames, injected before their scripts run |
| `record.mjs` | Serves the repository root, drives the panel with real mouse events through the Chrome DevTools Protocol and captures 1920×1080 frames at 30 fps of video time. The timeline (captions, moves, clicks) is in this file |
| `make.py` | Captions, the two-monitor light window scene and the end card |
| `compose.py` | Joins the recording, the light window scene and the end card with short fades |
| `make-video.sh` | Runs everything in a temporary directory and encodes the result |

The call is a mock-up so no real face is shown. The video says so with a small note.

## Music

"Happy Lofi Day" by Tarush Singhal, released under CC0: <https://opengameart.org/content/happy-lofi-day>. It is not stored in the repository; download the MP3 from that page.
