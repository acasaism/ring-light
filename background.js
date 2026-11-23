// Keyboard shortcut toggle and on/off toolbar icon.
function updateIcon() {
  browser.storage.local.get(DEFAULTS).then((s) =>
    browser.action.setIcon({ path: s.on ? "icon.svg" : "icon-off.svg" })
  );
}

browser.commands.onCommand.addListener((command) => {
  if (command !== "toggle-light") return;
  browser.storage.local.get(DEFAULTS).then((s) => browser.storage.local.set({ on: !s.on }));
});

browser.storage.onChanged.addListener(updateIcon);
updateIcon();
