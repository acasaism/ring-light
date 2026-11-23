// Keyboard shortcut toggle and on/off toolbar icon.
// Chromium runs this file alone as a service worker; Firefox loads light.js before it.
if (typeof DEFAULTS === "undefined") importScripts("light.js");

// PNG, not SVG: Chromium cannot use SVG toolbar icons.
const iconSet = (state) => Object.fromEntries([16, 32, 48].map((n) => [n, `icons/${state}-${n}.png`]));

// Lit only in tabs where Meet applies the light (switch on and inside a meeting), as content.js reports.
browser.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab || !("lightActive" in msg)) return;
  browser.action.setIcon({ tabId: sender.tab.id, path: iconSet(msg.lightActive ? "on" : "off") });
});

browser.commands.onCommand.addListener((command) => {
  if (command !== "toggle-light") return;
  browser.storage.local.get(DEFAULTS).then((s) => browser.storage.local.set({ on: !s.on }));
});

browser.action.setIcon({ path: iconSet("off") }); // default for other tabs; clears a global "on" icon from earlier versions
