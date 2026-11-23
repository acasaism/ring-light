document.documentElement.lang = browser.i18n.getUILanguage();
for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = browser.i18n.getMessage(n.dataset.i18n);

const switches = ["on", "frame", "meetBg"];
const sliders = ["size", "warmth", "intensity"];
const fields = [...switches, ...sliders];
const el = Object.fromEntries(fields.map((f) => [f, document.getElementById(f)]));
const preview = document.getElementById("preview");
const frameOptions = document.getElementById("frameOptions");

// Preview colour, and the frame's own sliders only while the frame is on.
function show(s) {
  preview.style.background = lightColor(s.warmth, s.intensity);
  frameOptions.hidden = !s.frame;
}

function read() {
  const s = {};
  for (const f of switches) s[f] = el[f].checked;
  for (const f of sliders) s[f] = +el[f].value;
  return s;
}

function render(s) {
  for (const f of switches) el[f].checked = s[f];
  for (const f of sliders) el[f].value = s[f];
  show(s);
}

browser.storage.local.get(DEFAULTS).then(render);

// Only "on" can change from outside (keyboard shortcut); re-rendering sliders here would make them jump mid-drag.
browser.storage.onChanged.addListener((changes) => {
  if (changes.on) el.on.checked = changes.on.newValue;
});

// Opens a movable window filled with the light, e.g. for a second screen.
document.getElementById("lightWindow").addEventListener("click", () => {
  browser.windows.create({ url: browser.runtime.getURL("light.html"), type: "popup", width: 800, height: 600 });
});

// Restores the sliders but keeps the light on/off as it is.
document.getElementById("reset").addEventListener("click", () => {
  const s = { ...DEFAULTS, on: el.on.checked };
  render(s);
  browser.storage.local.set(s);
});

let drag = null; // { slider, value, endedAt } for the popup-driven pointer drag

for (const f of fields) {
  el[f].addEventListener("input", (e) => {
    // Firefox cancels its native drag when the pointer leaves the popup and fires a trusted
    // "input" with the pre-drag value, during or just after our drag; our own events are untrusted.
    const guarded = drag && drag.slider === el[f] && (!drag.endedAt || Date.now() - drag.endedAt < 500);
    if (guarded && e.isTrusted) {
      el[f].value = drag.value;
      return;
    }
    const s = read();
    show(s);
    browser.storage.local.set(s);
  });
}

// Pointer drags are handled here instead of natively: Firefox cancels a native drag
// released outside the popup and snaps the slider (and the light) back. Keyboard stays native.
// Moves are tracked on the whole document, not the slider: a fast drag leaves the 16px-tall slider at once.
for (const f of sliders) {
  const s = el[f];
  function end() {
    if (drag) drag.endedAt = Date.now();
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
  }
  function move(e) {
    if (!(e.buttons & 1)) return end(); // button was released outside the popup
    s.value = drag.value = valueFromX(e.clientX, s.getBoundingClientRect(), +s.min, +s.max, +s.step);
    s.dispatchEvent(new Event("input"));
  }
  // Firefox starts its native range drag on mousedown, not pointerdown.
  s.addEventListener("mousedown", (e) => e.button === 0 && e.preventDefault());
  s.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    s.focus();
    try { s.setPointerCapture(e.pointerId); } catch {} // keeps moves coming when the pointer leaves the popup, if supported
    drag = { slider: s, value: +s.value };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    move(e);
  });
}
