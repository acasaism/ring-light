document.documentElement.lang = browser.i18n.getUILanguage();
for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = browser.i18n.getMessage(n.dataset.i18n);
// Spoken name when the visible text alone is ambiguous (it still contains the visible text, WCAG 2.5.3).
for (const n of document.querySelectorAll("[data-i18n-label]")) n.setAttribute("aria-label", browser.i18n.getMessage(n.dataset.i18nLabel));

const switches = ["on", "auto", "frame", "meetBg"];
const sliders = ["size", "warmth", "intensity"];
const fields = [...switches, ...sliders];
const el = Object.fromEntries(fields.map((f) => [f, document.getElementById(f)]));
const preview = document.getElementById("preview");
const frameOptions = document.getElementById("frameOptions");
const meetOptions = document.getElementById("meetOptions");

// Preview colour; Meet options only while the light is on, and the frame's own slider only while the frame is on.
function show(s) {
  preview.style.background = lightColor(s.warmth, s.intensity);
  el.size.style.setProperty("--p", String((s.size - el.size.min) / (el.size.max - el.size.min))); // filled part of the track
  // Screen readers would otherwise read bare numbers such as "-40".
  const msg = browser.i18n.getMessage;
  const w = Math.abs(s.warmth);
  el.warmth.setAttribute("aria-valuetext", s.warmth === 0 ? msg("neutral") : `${msg(s.warmth > 0 ? "warm" : "cool")} ${w} %`);
  el.intensity.setAttribute("aria-valuetext", `${s.intensity} %`);
  el.size.setAttribute("aria-valuetext", `${s.size} %`);
  meetOptions.hidden = !s.on;
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

// Only "on" can change from outside (keyboard shortcut, camera); re-rendering sliders here would make them jump mid-drag.
browser.storage.onChanged.addListener((changes) => {
  if (changes.lightWindows) refreshLightWindows();
  if (!changes.on) return;
  el.on.checked = changes.on.newValue;
  show(read());
});

// Opens a movable window filled with the light, e.g. for a second screen.
// Then closes this panel, as Firefox already does: Chrome would leave it drawn but inactive,
// and the next click on it would only dismiss it.
const lightWindowButton = document.getElementById("lightWindow");
lightWindowButton.addEventListener("click", () => {
  browser.windows.create({ url: browser.runtime.getURL("light.html"), type: "popup", width: 800, height: 600 })
    .then(() => window.close());
});

// Open light windows, so they can be closed from here even when lost behind other windows.
// Each window registers its own id (the popup may close as soon as a window opens);
// ids of windows closed by hand are skipped instead of tracked.
const openWindows = document.getElementById("openWindows");
const openCount = document.getElementById("openCount");

function liveLightWindows() {
  return browser.storage.local.get({ lightWindows: [] })
    .then(({ lightWindows }) => Promise.all(lightWindows.map((id) => browser.windows.get(id).then(() => id, () => null))))
    .then((ids) => ids.filter((id) => id !== null));
}

function refreshLightWindows() {
  return liveLightWindows().then((ids) => {
    openWindows.hidden = !ids.length;
    openCount.textContent = browser.i18n.getMessage(ids.length === 1 ? "openWindowsOne" : "openWindowsMany", [ids.length]);
  });
}

refreshLightWindows();
browser.windows.onRemoved.addListener(refreshLightWindows);

document.getElementById("closeWindows").addEventListener("click", () =>
  liveLightWindows()
    .then((ids) => Promise.all(ids.map((id) => browser.windows.remove(id).catch(() => {}))))
    .then(() => {
      browser.storage.local.set({ lightWindows: [] });
      openWindows.hidden = true;
      status.textContent = browser.i18n.getMessage("statusWindowsClosed");
      lightWindowButton.focus(); // the close button is gone; keep keyboard focus in the panel
    }));

// Save, Reset and Factory each overwrite something, so instead of asking for confirmation
// they offer Undo, which puts back the settings and saved defaults from before the click.
// No time limit (WCAG 2.2.1): it stays until another setting changes or the popup closes.
const saveDefaults = document.getElementById("saveDefaults");
const factory = document.getElementById("factory"); // shown only once defaults are saved: Reset gives factory values otherwise
const undo = document.getElementById("undo");
const status = document.getElementById("status"); // live region: screen readers announce what a button did
let before = null;

browser.storage.local.get({ userDefaults: null }).then(({ userDefaults }) => (factory.hidden = !userDefaults));

function undoable(statusKey, action) {
  return () => browser.storage.local.get({ userDefaults: null }).then(({ userDefaults }) => {
    before = { settings: read(), userDefaults };
    action(userDefaults);
    undo.hidden = false;
    status.textContent = browser.i18n.getMessage(statusKey);
  });
}

function apply(s) {
  render(s);
  browser.storage.local.set(s);
}

// Back to the user's saved defaults (factory values if none), keeping the light on/off as it is.
// Defaults saved before the camera switch existed have no "auto": that switch stays as it is.
document.getElementById("reset").addEventListener("click", undoable("statusReset", (userDefaults) =>
  apply({ ...DEFAULTS, ...(userDefaults && { auto: el.auto.checked }), ...userDefaults, on: el.on.checked })));

factory.addEventListener("click", undoable("statusFactory", () => apply({ ...DEFAULTS, on: el.on.checked })));

// Saves the current settings as what Reset goes back to, so trying things out is safe.
saveDefaults.addEventListener("click", undoable("statusSaved", () => {
  const { on, ...userDefaults } = read();
  browser.storage.local.set({ userDefaults });
  factory.hidden = false;
  saveDefaults.textContent = browser.i18n.getMessage("saved");
  setTimeout(() => (saveDefaults.textContent = browser.i18n.getMessage("saveDefaults")), 1500);
}));

undo.addEventListener("click", () => {
  const { settings, userDefaults } = before;
  render(settings);
  if (userDefaults) browser.storage.local.set({ ...settings, userDefaults });
  else browser.storage.local.set(settings).then(() => browser.storage.local.remove("userDefaults"));
  factory.hidden = !userDefaults;
  undo.hidden = true;
  status.textContent = browser.i18n.getMessage("statusUndone");
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
    undo.hidden = true; // a new change makes the pre-click snapshot stale
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
