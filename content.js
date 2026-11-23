// Shrinks the Meet page to the centre and fills the freed edges with light,
// so no Meet control is covered. Only inside a meeting, not on the landing page.
let settings = DEFAULTS;
let path = location.pathname;
let iconActive; // last state reported, so colour changes do not resend it

// The toolbar icon is lit only in the tab where the light is applied; background.js sets it per tab.
function reportActive(active) {
  if (active === iconActive) return;
  iconActive = active;
  browser.runtime.sendMessage({ lightActive: active }).catch(() => {}); // e.g. extension reloading
}

// Optional: repaint Meet's large dark areas with the light colour.
// shortcut: finds them by colour and size because Meet's class names are obfuscated; may need updating if Meet redesigns.
function paintMeetBackground(color) {
  // Any tag: Meet paints its call background on custom elements such as <c-wiz>.
  for (const n of document.querySelectorAll("body, body *")) {
    if (n.offsetWidth < innerWidth * 0.4 || n.offsetHeight < innerHeight * 0.3) continue;
    if (!("rlBg" in n.dataset)) {
      if (!isDark(getComputedStyle(n).backgroundColor)) continue;
      n.dataset.rlBg = n.style.backgroundColor; // remember Meet's own inline value
    }
    n.style.setProperty("background-color", color, "important");
  }
}

function clearMeetBackground() {
  for (const n of document.querySelectorAll("[data-rl-bg]")) {
    n.style.removeProperty("background-color");
    if (n.dataset.rlBg) n.style.setProperty("background-color", n.dataset.rlBg);
    delete n.dataset.rlBg;
  }
}

function render() {
  const s = settings;
  const html = document.documentElement.style;
  const body = document.body.style;
  if (!s.on || !isMeetingPath(location.pathname)) {
    html.background = body.transform = body.transformOrigin = body.clipPath = "";
    clearMeetBackground();
    reportActive(false);
    return;
  }
  reportActive(true);
  const color = lightColor(s.warmth, s.intensity);
  if (s.frame) {
    const scale = 1 - s.size / 100;
    html.background = color;
    body.transformOrigin = "center";
    // Clipping keeps Meet's off-screen side panels hidden; the 16px corner is divided by the scale so it shows at its real size.
    body.clipPath = `inset(0 round ${+(16 / scale).toFixed(2)}px)`;
    body.transform = `scale(${scale})`;
  } else {
    html.background = body.transform = body.transformOrigin = body.clipPath = ""; // frameless: light comes only from Meet's background
  }
  if (s.meetBg) paintMeetBackground(color);
  else clearMeetBackground();
}

function load() {
  browser.storage.local.get(DEFAULTS).then((s) => {
    settings = s;
    render();
  });
}

load();
browser.storage.onChanged.addListener(load);
// shortcut: polls the URL because Meet navigates without reloading; switch to the Navigation API once Firefox ships it everywhere.
setInterval(() => {
  if (location.pathname !== path) {
    path = location.pathname;
    render();
  } else if (settings.on && settings.meetBg && isMeetingPath(path)) {
    paintMeetBackground(lightColor(settings.warmth, settings.intensity)); // Meet re-renders its layout often
  }
}, 1000);
