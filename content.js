// Shrinks the call page (the apps in PLATFORMS, light.js) to the centre and fills the freed edges with light,
// so no control is covered. Only inside a meeting, not on the landing page.
let settings = DEFAULTS;
let path = location.pathname;
let meeting = false; // last rendered: inside a call
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

// Meet only: other platforms keep their own background.
const paintsBackground = () => settings.meetBg && PLATFORMS[location.hostname].meetBg;

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
  meeting = inMeeting();
  if (!s.on || !meeting) {
    html.background = body.transform = body.transformOrigin = body.clipPath = "";
    clearMeetBackground();
    reportActive(false);
    return;
  }
  reportActive(true);
  const color = lightColor(s.warmth, s.intensity);
  // Where the background option cannot apply (not Meet), it falls back to the frame, so the light is never invisible.
  if (s.frame || (s.meetBg && !PLATFORMS[location.hostname].meetBg)) {
    const scale = 1 - s.size / 100;
    html.background = color;
    body.transformOrigin = "center";
    // Clipping keeps Meet's off-screen side panels hidden; the 16px corner is divided by the scale so it shows at its real size.
    body.clipPath = `inset(0 round ${+(16 / scale).toFixed(2)}px)`;
    body.transform = `scale(${scale})`;
  } else {
    html.background = body.transform = body.transformOrigin = body.clipPath = ""; // frameless: light comes only from Meet's background
  }
  if (paintsBackground()) paintMeetBackground(color);
  else clearMeetBackground();
}

// "Turn on with the camera": camera.js reports the camera; this tab tells background.js when the camera starts or
// stops, and background.js switches the global "on" for all call tabs.
let camera = false; // camera.js last reported a live camera track
let cameraOffAt = 0;
let cameraWanted = false; // camera on (or off for under 2 s), option enabled and inside a meeting
let media = false; // Teams only: camera.js last reported a live microphone or camera track
let mediaOffAt = -Infinity;

// The same 2 s grace for "media": switching devices restarts the tracks without ending the call, and the camera's own
// grace would otherwise be cut short by the meeting ending at once.
const inMeeting = () => isMeeting(location, media || Date.now() - mediaOffAt < 2000);

function followCamera() {
  // 2 s grace: Meet restarting the track is neither a stop nor a new start (which would relight a light turned off by hand).
  const wanted = settings.auto && inMeeting() && (camera || (cameraWanted && Date.now() - cameraOffAt < 2000));
  if (wanted === cameraWanted) return;
  cameraWanted = wanted;
  browser.runtime.sendMessage({ camera: wanted }).catch(() => {}); // e.g. extension updated: this script is orphaned
}

// Messages come from the page's world, so anything on the page can send them: check the shape, trust only booleans.
addEventListener("message", (e) => {
  const r = e.data && e.data.ringLight;
  if (e.origin !== location.origin || !r || typeof r.camera !== "boolean" || typeof (r.media ?? false) !== "boolean") return;
  if (camera && !r.camera) cameraOffAt = Date.now();
  camera = r.camera;
  if (media && !r.media) mediaOffAt = Date.now();
  media = !!r.media;
  if (inMeeting() !== meeting) render();
  followCamera();
});

// background.js asks every call tab before the camera turns the light off.
browser.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.cameraQuery) respond(cameraWanted);
});

// Best effort: the tab may close before the camera is seen stopping (background.js also checks when a tab closes).
addEventListener("pagehide", () => {
  camera = false;
  cameraOffAt = 0; // gone for good: no 2 s grace
  followCamera();
});

function load() {
  browser.storage.local.get(DEFAULTS).then((s) => {
    settings = s;
    render();
    followCamera();
  });
}

load();
browser.storage.onChanged.addListener(load);
// shortcut: polls the URL because Meet navigates without reloading; switch to the Navigation API once Firefox ships it everywhere.
// Also ends a Teams call once its media grace runs out.
setInterval(() => {
  if (location.pathname !== path || inMeeting() !== meeting) {
    path = location.pathname;
    render();
  } else if (settings.on && meeting && paintsBackground()) {
    paintMeetBackground(lightColor(settings.warmth, settings.intensity)); // Meet re-renders its layout often
  }
  followCamera();
}, 1000);
