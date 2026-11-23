// A window filled with the light colour, to place on another screen as an extra light source.
document.title = browser.i18n.getMessage("lightWindowTitle");
const hint = document.getElementById("hint");
hint.textContent = browser.i18n.getMessage("lightWindowHint");
setTimeout(() => hint.classList?.add("hidden"), 4000);

function load() {
  browser.storage.local.get(DEFAULTS).then((s) => {
    document.body.style.background = lightColor(s.warmth, s.intensity);
  });
}

load();
browser.storage.onChanged.addListener(load);

// Registers this window so the extension panel can count and close it.
browser.windows.getCurrent().then(({ id }) =>
  browser.storage.local.get({ lightWindows: [] }).then(({ lightWindows }) =>
    browser.storage.local.set({ lightWindows: [...new Set([...lightWindows, id])] })));

document.addEventListener("dblclick", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});
