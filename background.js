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
// time and from storage, never from a tab's possibly stale copy. The camera decides at each start and stop; switching
// the light by hand lasts until the next one. "cameraOn" (stored) means a Meet tab has reported its camera on.
let queue = Promise.resolve();
function serially(step) {
  queue = queue.then(step).catch(() => {});
}

// A camera started in a Meet tab: the light goes on.
function cameraStarted() {
  return browser.storage.local.get(DEFAULTS).then((s) => {
    if (s.auto) return browser.storage.local.set({ cameraOn: true, ...(!s.on && { on: true }) });
  });
}

// A camera stopped (for 2 s), the option was disabled, or a tab closed: once no Meet tab still has its camera on, the
// light goes off (left as it is if the option is now off). Asking the tabs instead of keeping a list survives this
// service worker stopping; a tab that cannot answer (crashed, or left over from before an update) counts as no camera.
function cameraStopped() {
  return browser.storage.local.get({ ...DEFAULTS, cameraOn: false }).then((s) => {
    if (!s.cameraOn) return; // no camera was on: e.g. an unrelated tab closed
    return browser.tabs.query({ url: "https://meet.google.com/*" })
      .then((tabs) => Promise.all(tabs.map((t) => browser.tabs.sendMessage(t.id, { cameraQuery: true }).catch(() => false))))
      .then((answers) => answers.includes(true) || browser.storage.local.set({ cameraOn: false, ...(s.auto && { on: false }) }));
  });
}

browser.tabs.onRemoved.addListener(() => serially(cameraStopped));

// Browser started, or extension installed or updated: no Meet tab from before can report its camera stopping any more.
const forgetCamera = () => serially(() => browser.storage.local.remove("cameraOn"));
browser.runtime.onStartup.addListener(forgetCamera);
browser.runtime.onInstalled.addListener(forgetCamera);

browser.action.setIcon({ path: iconSet("off") }); // default for other tabs; clears a global "on" icon from earlier versions
