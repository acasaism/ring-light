// Keyboard shortcut toggle and on/off toolbar icon.
// Chromium runs this file alone as a service worker; Firefox loads light.js before it.
if (typeof DEFAULTS === "undefined") importScripts("light.js");

// PNG, not SVG: Chromium cannot use SVG toolbar icons.
const iconSet = (state) => Object.fromEntries([16, 32, 48].map((n) => [n, `icons/${state}-${n}.png`]));

function updateIcon() {
  browser.storage.local.get(DEFAULTS).then((s) => browser.action.setIcon({ path: iconSet(s.on ? "on" : "off") }));
}

browser.commands.onCommand.addListener((command) => {
  if (command !== "toggle-light") return;
  browser.storage.local.get(DEFAULTS).then((s) => browser.storage.local.set({ on: !s.on }));
});

browser.storage.onChanged.addListener(updateIcon);
updateIcon();
