// Keyboard shortcut toggle and on/off toolbar icon.
// Chromium runs this file alone as a service worker; Firefox loads light.js before it.
if (typeof DEFAULTS === "undefined") importScripts("light.js");

// PNG, not SVG: Chromium cannot use SVG toolbar icons.
const iconSet = (state) => Object.fromEntries([16, 32, 48].map((n) => [n, `icons/${state}-${n}.png`]));

// Lit only in tabs where Meet applies the light (switch on and inside a meeting), as content.js reports.
browser.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  if ("lightActive" in msg) browser.action.setIcon({ tabId: sender.tab.id, path: iconSet(msg.lightActive ? "on" : "off") });
  if ("camera" in msg) serially(msg.camera ? cameraStarted : cameraStopped);
});

browser.commands.onCommand.addListener((command) => {
  if (command !== "toggle-light") return;
  serially(() => browser.storage.local.get(DEFAULTS).then((s) => browser.storage.local.set({ on: !s.on })));
});

// "Turn on with the camera". The light is one global switch for all Meet tabs, so the decisions are made here, one at a
// time and from storage, never from a tab's possibly stale copy. "autoLit" (stored) means the camera turned the light on.
let queue = Promise.resolve();
function serially(step) {
  queue = queue.then(step).catch(() => {});
}

// A camera started in a Meet tab: a light that is off goes on, even one turned off by hand earlier.
function cameraStarted() {
  return browser.storage.local.get(DEFAULTS).then((s) => {
    if (s.auto && !s.on) return browser.storage.local.set({ on: true, autoLit: true });
  });
}

// A camera stopped (for 2 s) or a Meet tab closed: off only if the camera turned the light on and no Meet tab still has
// its camera on. Asking the tabs instead of keeping a list survives this service worker stopping; a tab that cannot
// answer (crashed, or left over from before an update) counts as no camera.
function cameraStopped() {
  return browser.storage.local.get({ ...DEFAULTS, autoLit: false }).then((s) => {
    if (!s.auto || !s.on || !s.autoLit) return;
    return browser.tabs.query({ url: "https://meet.google.com/*" })
      .then((tabs) => Promise.all(tabs.map((t) => browser.tabs.sendMessage(t.id, { cameraQuery: true }).catch(() => false))))
      .then((answers) => answers.includes(true) || browser.storage.local.set({ on: false, autoLit: false }));
  });
}

browser.tabs.onRemoved.addListener(() => serially(cameraStopped));

// Turned on or off by hand (panel, shortcut), or the option disabled: the camera no longer turns the light off.
browser.storage.onChanged.addListener((c) => {
  if ((c.on && c.on.newValue !== c.on.oldValue && !c.autoLit) || (c.auto && c.auto.newValue === false))
    serially(() => browser.storage.local.get({ autoLit: false }).then((s) => s.autoLit && browser.storage.local.set({ autoLit: false })));
});

browser.action.setIcon({ path: iconSet("off") }); // default for other tabs; clears a global "on" icon from earlier versions
