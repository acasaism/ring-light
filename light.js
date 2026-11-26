// Shared by content script, popup, background, light window and tests. Loaded first everywhere.
// Chromium exposes the extension API only as `chrome` (promise-based in MV3); Firefox has `browser`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") globalThis.browser = chrome;

const DEFAULTS = { on: false, auto: false, frame: true, size: 15, warmth: 0, intensity: 100, meetBg: false };

// warmth: -100 (cool) .. 0 (white) .. 100 (warm); intensity: 30..100 (%).
function lightColor(warmth, intensity) {
  const target = warmth >= 0 ? [255, 214, 170] : [205, 225, 255];
  const t = Math.abs(warmth) / 100;
  const k = intensity / 100;
  const rgb = target.map((c) => Math.round((255 + (c - 255) * t) * k));
  return `rgb(${rgb.join(", ")})`;
}

// Zoom web client: /wc/<id>/join (join screen and call), /wc/<id>/start (host),
// /wc/join/<id> (redirects to the first). Served at both its hosts; the /j/<id> launcher page is not a call.
const ZOOM = { meeting: /^\/wc\/(\d+\/(join|start)|join\/\d+)(\/|$)/, meetBg: false };

// Supported video call apps, by hostname. Adding one: an entry here, its host permission and content script matches
// in manifest.json, and tests (see CONTRIBUTING.md). meeting: the paths of a call, not the app's home page;
// meetBg: whether "Light up Meet's background" applies (it looks for Meet's own dark areas).
const PLATFORMS = {
  // Meeting rooms (and their waiting room) live at /abc-defg-hij.
  "meet.google.com": { meeting: /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/, meetBg: true },
  // Any single name is a room (and its prejoin screen), dots included; files the site serves at the top are not.
  "meet.jit.si": {
    meeting:
      /^\/(?!(?:http-bind|xmpp-websocket)$)(?![^/]+\.(?:avif|css|gif|html|ico|jpe?g|js|json|map|mp3|ogg|png|svg|ttf|txt|wasm|wav|webmanifest|webp|woff2?|xml)$)[^/]+$/i,
    meetBg: false,
  },
  "app.zoom.us": ZOOM,
  "zoom.us": ZOOM,
};

// loc: window.location, or anything with hostname and pathname.
function isMeeting(loc) {
  const platform = PLATFORMS[loc.hostname];
  return !!platform && platform.meeting.test(loc.pathname);
}

// Opaque and dark, like Meet's call background. Translucent overlays are left alone.
function isDark(css) {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const [r, g, b, a = 1] = m[1].split(",").map(Number);
  return a > 0.9 && (r + g + b) / 3 < 60;
}

// Slider value under the pointer, like a native range: the thumb centre travels
// from left + thumb/2 to right - thumb/2. Clamped, so a pointer outside the popup still works.
function valueFromX(x, rect, min, max, step, thumb = 16) {
  const ratio = Math.min(1, Math.max(0, (x - rect.left - thumb / 2) / (rect.width - thumb)));
  const snapped = min + Math.round((ratio * (max - min)) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

if (typeof module !== "undefined") module.exports = { DEFAULTS, PLATFORMS, lightColor, isMeeting, isDark, valueFromX };
