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
let cameraAt = 0; // when it last said so
let cameraOffAt = 0;
let cameraWanted = false; // camera on (or off for under 2 s), option enabled and inside a meeting
let call = false; // Teams only: camera.js last reported a connected call connection
let callAt = 0;
let callOffAt = -Infinity;

// The same 2 s grace for "call": a connection may drop and reconnect without ending the call, and the camera's own
// grace would otherwise be cut short by the meeting ending at once.
const inMeeting = () => isMeeting(location, call || Date.now() - callOffAt < 2000);

// camera.js repeats a yes every second. Silence for over 2.5 s means the frame holding the tracks or the connection was
// removed, navigated or frozen before it could say no: a no since the last yes (whose 2 s grace is then over).
function expire() {
  if (camera && Date.now() - cameraAt > 2500) [camera, cameraOffAt] = [false, cameraAt];
  if (call && Date.now() - callAt > 2500) [call, callOffAt] = [false, callAt];
}

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
  if (e.origin !== location.origin || !r || typeof r.camera !== "boolean" || typeof (r.call ?? false) !== "boolean") return;
  if (camera && !r.camera) cameraOffAt = Date.now();
  if (r.camera) cameraAt = Date.now();
  camera = r.camera;
  if (call && !r.call) callOffAt = Date.now();
  if (r.call) callAt = Date.now();
  call = !!r.call;
  if (inMeeting() !== meeting) render();
  followCamera();
});

// background.js asks every call tab before the camera turns the light off.
browser.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg.cameraQuery) return;
  expire(); // this tab's timer may not have run lately (throttled in the background)
  followCamera();
  respond(cameraWanted);
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
// Also ends a Teams call once its grace runs out, and whatever camera.js went silent about.
setInterval(() => {
  expire();
  if (location.pathname !== path || inMeeting() !== meeting) {
    path = location.pathname;
    render();
  } else if (settings.on && meeting && paintsBackground()) {
    paintMeetBackground(lightColor(settings.warmth, settings.intensity)); // Meet re-renders its layout often
  }
  followCamera();
}, 1000);
