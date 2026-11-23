// Shared by content script, popup and tests.
const DEFAULTS = { on: false, frame: true, size: 15, warmth: 0, intensity: 100, meetBg: false };

// warmth: -100 (cool) .. 0 (white) .. 100 (warm); intensity: 30..100 (%).
function lightColor(warmth, intensity) {
  const target = warmth >= 0 ? [255, 214, 170] : [205, 225, 255];
  const t = Math.abs(warmth) / 100;
  const k = intensity / 100;
  const rgb = target.map((c) => Math.round((255 + (c - 255) * t) * k));
  return `rgb(${rgb.join(", ")})`;
}

// Meeting rooms (and their waiting room) live at /abc-defg-hij.
function isMeetingPath(path) {
  return /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(path);
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

if (typeof module !== "undefined") module.exports = { DEFAULTS, lightColor, isMeetingPath, isDark, valueFromX };
