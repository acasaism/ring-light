// Run: node test.js
const assert = require("node:assert");
const fs = require("node:fs");
const { DEFAULTS, lightColor, isMeetingPath, isDark, valueFromX } = require("./light.js");

// 216px track with a 16px thumb: usable range is x = 8..208
const track = { left: 0, width: 216 };
assert.strictEqual(valueFromX(8, track, 5, 35, 1), 5, "left end is min");
assert.strictEqual(valueFromX(208, track, 5, 35, 1), 35, "right end is max");
assert.strictEqual(valueFromX(108, track, 5, 35, 1), 20, "middle");
assert.strictEqual(valueFromX(-500, track, 5, 35, 1), 5, "far left clamps");
assert.strictEqual(valueFromX(900, track, 5, 35, 1), 35, "far right clamps (pointer outside popup)");
assert.strictEqual(valueFromX(118, track, -100, 100, 5), 10, "snaps to step");

assert.ok(isDark("rgb(32, 33, 36)"), "Meet dark grey");
assert.ok(!isDark("rgb(255, 255, 255)"), "white");
assert.ok(!isDark("rgba(0, 0, 0, 0)"), "transparent");
assert.ok(!isDark("rgba(32, 33, 36, 0.5)"), "translucent overlay");
assert.ok(!isDark(""), "no value");

// Chromium: no `browser` global, only `chrome`. light.js (loaded first everywhere) aliases it.
const vm = require("node:vm");
const chromeApi = { storage: {} };
const chromeCtx = vm.createContext({ chrome: chromeApi });
vm.runInContext(fs.readFileSync(__dirname + "/light.js", "utf8"), chromeCtx);
assert.strictEqual(vm.runInContext("browser", chromeCtx), chromeApi, "browser aliased to chrome on Chromium");
const firefoxApi = {};
const firefoxCtx = vm.createContext({ browser: firefoxApi, chrome: {} });
vm.runInContext(fs.readFileSync(__dirname + "/light.js", "utf8"), firefoxCtx);
assert.strictEqual(vm.runInContext("browser", firefoxCtx), firefoxApi, "Firefox keeps its own browser");

// Chromium runs background.js as a service worker, which must import light.js itself.
let imported = [];
const swCtx = vm.createContext({
  chrome: {
    commands: { onCommand: { addListener() {} } },
    action: { setIcon() {} },
    runtime: { onMessage: { addListener() {} } },
    storage: { local: { get: async (d) => d }, onChanged: { addListener() {} } },
  },
  importScripts: (...files) => {
    imported.push(...files);
    for (const f of files) vm.runInContext(fs.readFileSync(__dirname + "/" + f, "utf8"), swCtx);
  },
});
vm.runInContext(fs.readFileSync(__dirname + "/background.js", "utf8"), swCtx);
assert.deepStrictEqual(imported, ["light.js"], "service worker imports light.js");

// manifest: one file for both browsers
const manifest = require("./manifest.json");
assert.deepStrictEqual(manifest.background.scripts, ["light.js", "background.js"], "Firefox background scripts");
assert.strictEqual(manifest.background.service_worker, "background.js", "Chromium service worker");
// The Firefox ID can never change once published; the name is descriptive, not Google's brand
assert.strictEqual(manifest.browser_specific_settings.gecko.id, "ring-light@acasaism.github.io", "permanent Firefox ID");
assert.strictEqual(require("./_locales/en/messages.json").extName.message, "Ring Light for Google Meet", "store name");
// camera.js must run in the page's own world, before Meet asks for the camera, to see its tracks
const cameraScript = manifest.content_scripts.find((c) => c.js.includes("camera.js"));
assert.ok(cameraScript, "camera.js is a content script");
assert.deepStrictEqual(cameraScript.js, ["camera.js"], "camera.js in its own entry (the main world has no extension API)");
assert.strictEqual(cameraScript.world, "MAIN", "camera.js runs in the page's main world");
assert.strictEqual(cameraScript.run_at, "document_start", "camera.js runs before the page's scripts");
assert.deepStrictEqual(cameraScript.matches, ["https://meet.google.com/*"], "camera.js only on Meet");
assert.deepStrictEqual(manifest.permissions, ["storage"], "no new permissions");
// The store zip lists its files one by one: every script the manifest loads must be in it
const zipped = fs.readFileSync(__dirname + "/scripts/build.sh", "utf8").match(/^zip .*$/m)[0].split(/\s+/);
for (const f of manifest.content_scripts.flatMap((c) => c.js)) assert.ok(zipped.includes(f), `build.sh packages ${f}`);
for (const p of [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])
  assert.ok(p.endsWith(".png") && fs.existsSync(__dirname + "/" + p), `PNG icon exists: ${p}`);

assert.ok(isMeetingPath("/abc-defg-hij"), "meeting code");
assert.ok(isMeetingPath("/abc-defg-hij/"), "meeting code with trailing slash");
assert.ok(!isMeetingPath("/"), "landing page");
assert.ok(!isMeetingPath("/landing"), "other Meet page");
assert.ok(!isMeetingPath("/abc-defg-hijk"), "not a meeting code");

assert.strictEqual(lightColor(0, 100), "rgb(255, 255, 255)", "neutral max is pure white");
assert.strictEqual(lightColor(100, 100), "rgb(255, 214, 170)", "full warm");
assert.strictEqual(lightColor(-100, 100), "rgb(205, 225, 255)", "full cool");
assert.strictEqual(lightColor(0, 50), "rgb(128, 128, 128)", "intensity dims");

// Store listing sync (scripts/amo-listing.js): docs/store/listings.md is the source of the addons.mozilla.org texts.
{
  const { parseListings, amoPayload, jwt } = require("./scripts/amo-listing.js");
  const listings = parseListings(fs.readFileSync(__dirname + "/docs/store/listings.md", "utf8"));
  assert.deepStrictEqual(Object.keys(listings), ["English", "Spanish", "Catalan", "Galician", "Basque", "French", "German",
    "Italian", "Portuguese (Brazil)", "Portuguese (Portugal)", "Japanese", "Traditional Chinese"], "every language section is read");
  for (const [lang, l] of Object.entries(listings)) {
    assert.ok(l.name && l.summary && l.description, `${lang}: name, summary and description`);
    assert.ok(l.summary.length <= 132, `${lang}: summary fits the Chrome Web Store limit`);
    assert.ok(l.description.includes("https://youtu.be/ApHeht_c__s"), `${lang}: description links the video`);
    assert.ok(!l.description.includes("```"), `${lang}: no code fence leaks into the text`);
  }
  assert.strictEqual(listings.English.name, "Ring Light for Google Meet");
  const body = amoPayload(listings);
  const amoLocales = ["en-US", "es-ES", "fr", "de", "it", "pt-BR", "pt-PT", "ja", "zh-TW"];
  for (const field of ["name", "summary", "description"])
    assert.deepStrictEqual(Object.keys(body[field]).sort(), [...amoLocales].sort(), `${field}: only the languages AMO supports (no ca, gl, eu)`);
  assert.strictEqual(body.summary["es-ES"], listings.Spanish.summary, "Spanish goes to es-ES");
  assert.strictEqual(body.description["zh-TW"], listings["Traditional Chinese"].description, "Traditional Chinese goes to zh-TW");
  assert.deepStrictEqual(Object.keys(body).sort(), ["description", "name", "summary"], "nothing else is changed");

  const crypto = require("node:crypto");
  const token = jwt("user:1:2", "secret", 1000);
  const [h, p, sig] = token.split(".");
  const dec = (x) => JSON.parse(Buffer.from(x, "base64url"));
  assert.deepStrictEqual(dec(h), { alg: "HS256", typ: "JWT" });
  const claims = dec(p);
  assert.strictEqual(claims.iss, "user:1:2");
  assert.strictEqual(claims.iat, 1000);
  assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 300, "expires within AMO's five minutes");
  assert.ok(claims.jti && claims.jti !== dec(jwt("user:1:2", "secret", 1000).split(".")[1]).jti, "a new jti each time");
  assert.strictEqual(sig, crypto.createHmac("sha256", "secret").update(`${h}.${p}`).digest("base64url"), "signed with HMAC-SHA256");

  const run = (args, env) => require("node:child_process").spawnSync("node", [__dirname + "/scripts/amo-listing.js", ...args],
    { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
  const dry = run(["--dry-run"], {});
  assert.strictEqual(dry.status, 0, "dry run needs no credentials");
  assert.deepStrictEqual(JSON.parse(dry.stdout), body, "dry run prints the request body");
  const noKeys = run([], {});
  assert.strictEqual(noKeys.status, 1, "a real run without credentials fails");
  assert.match(noKeys.stderr, /AMO_API_KEY/, "and says which secret is missing");
  const typo = run(["--dryrun"], { AMO_API_KEY: "k", AMO_API_SECRET: "s" });
  assert.strictEqual(typo.status, 1, "a mistyped option never publishes");
  assert.match(typo.stderr, /Unknown argument: --dryrun/);
  const crlf = fs.readFileSync(__dirname + "/docs/store/listings.md", "utf8").replace(/\n/g, "\r\n");
  assert.deepStrictEqual(parseListings(crlf), listings, "Windows line endings read the same");
}
// Release workflow: a GitHub release is only submitted to the stores when its tag matches the manifest version
const { spawnSync } = require("node:child_process");
const checkTag = (tag) => spawnSync("sh", [__dirname + "/scripts/check-tag.sh", tag]);
assert.strictEqual(checkTag("v" + manifest.version).status, 0, "tag matching the manifest version passes");
const badTag = checkTag("v0.0.0");
assert.notStrictEqual(badTag.status, 0, "tag not matching the manifest version fails");
assert.match(badTag.stderr.toString(), /does not match/, "mismatch explained");

// content.js against a fake page and fake browser.storage
const html = { style: {} }, body = { style: {} };
let stored = { ...DEFAULTS }, listener;
const makeDiv = (bg, w, h, tag = "DIV") => ({
  tag, dataset: {}, offsetWidth: w, offsetHeight: h, bg,
  style: {
    props: {},
    setProperty(k, v) { this.props[k] = v; },
    removeProperty(k) { delete this.props[k]; },
    get backgroundColor() { return this.props["background-color"] || ""; },
  },
});
// Real Meet (Firefox, 2026-11): the dark call background is a <c-wiz>, rgb(19, 19, 20)
const stage = makeDiv("rgb(19, 19, 20)", 1600, 900, "C-WIZ");
const button = makeDiv("rgb(32, 33, 36)", 40, 40); // small dark control: must stay dark
const panel = makeDiv("rgb(255, 255, 255)", 1600, 900); // already light
const divs = [stage, button, panel];
global.innerWidth = 1920;
global.innerHeight = 1080;
global.getComputedStyle = (n) => ({ backgroundColor: n.style.props["background-color"] || n.bg });
global.document = {
  documentElement: html,
  body,
  // honours tag selectors so a too-narrow selector (e.g. only "div") fails the test
  querySelectorAll: (sel) =>
    sel === "[data-rl-bg]"
      ? divs.filter((d) => "rlBg" in d.dataset)
      : divs.filter((d) => sel.includes("*") || sel.split(",").map((s) => s.trim().toUpperCase()).includes(d.tag)),
};
global.DEFAULTS = DEFAULTS;
global.lightColor = lightColor;
global.isMeetingPath = isMeetingPath;
global.location = { pathname: "/abc-defg-hij", origin: "https://meet.google.com" };
const pageEvents = {}; // window listeners: messages from camera.js, pagehide
global.addEventListener = (type, fn) => (pageEvents[type] = fn);
let poll;
const sent = [];
global.setInterval = (fn) => (poll = fn);
global.browser = {
  runtime: { sendMessage: async (m) => sent.push(m) },
  storage: {
    local: {
      get: async (d) => ({ ...d, ...stored }),
      // like the browser: listeners get what changed
      set: async (v) => {
        const changes = Object.fromEntries(Object.entries(v).map(([k, newValue]) => [k, { oldValue: stored[k], newValue }]));
        stored = { ...stored, ...v };
        listener(changes);
      },
    },
    onChanged: { addListener: (fn) => (listener = fn) },
  },
};
eval(fs.readFileSync(__dirname + "/content.js", "utf8"));

const tick = () => new Promise((r) => setTimeout(r, 0));
(async () => {
  await tick();
  assert.strictEqual(body.style.transform, "", "off by default");
  // The toolbar icon is lit only in the tab where the light is actually applied
  assert.deepStrictEqual(sent.at(-1), { lightActive: false }, "tells the icon the light is not applied");

  stored = { on: true, size: 20, warmth: 0, intensity: 100 };
  listener(); await tick();
  assert.strictEqual(body.style.transform, "scale(0.8)");
  // fixed 16px corner, compensated for the scale so it shows at 16px on screen
  assert.strictEqual(body.style.clipPath, "inset(0 round 20px)", "rounded corners");
  assert.strictEqual(html.style.background, "rgb(255, 255, 255)");
  assert.deepStrictEqual(sent.at(-1), { lightActive: true }, "light applied in a meeting: icon on");

  // Meet is a single-page app: leaving the call to the landing page has no reload
  location.pathname = "/";
  poll();
  assert.strictEqual(body.style.transform, "", "no light outside a meeting");
  assert.deepStrictEqual(sent.at(-1), { lightActive: false }, "Meet landing page: icon off although the switch is on");
  location.pathname = "/xyz-abcd-efg";
  poll();
  assert.strictEqual(body.style.transform, "scale(0.8)", "light back when joining another meeting");
  assert.deepStrictEqual(sent.at(-1), { lightActive: true }, "icon on again in the new meeting");
  const sentBefore = sent.length;

  assert.strictEqual(stage.style.backgroundColor, "", "Meet background untouched unless enabled");

  stored = { ...stored, meetBg: true };
  listener(); await tick();
  assert.strictEqual(stage.style.backgroundColor, "rgb(255, 255, 255)", "big dark area lit");
  assert.strictEqual(button.style.backgroundColor, "", "small controls stay dark");
  assert.strictEqual(panel.style.backgroundColor, "", "light areas untouched");

  stored = { ...stored, warmth: 100 };
  listener(); await tick();
  assert.strictEqual(stage.style.backgroundColor, "rgb(255, 214, 170)", "follows light colour");
  assert.strictEqual(sent.length, sentBefore, "colour changes do not resend the icon state");

  // frame off: Meet full screen, light only from its background
  stored = { ...stored, frame: false };
  listener(); await tick();
  assert.strictEqual(body.style.transform + body.style.clipPath + html.style.background, "", "frame off leaves no frame");
  assert.strictEqual(stage.style.backgroundColor, "rgb(255, 214, 170)", "background still lit without frame");
  stored = { ...stored, frame: true };

  stored = { ...stored, meetBg: false };
  listener(); await tick();
  assert.strictEqual(stage.style.backgroundColor, "", "disabling restores Meet background");
  assert.ok(!("rlBg" in stage.dataset), "marker removed");

  stored = { ...stored, meetBg: true, on: false };
  listener(); await tick();
  assert.strictEqual(stage.style.backgroundColor, "", "light off leaves Meet background alone");

  stored = { ...stored, on: false };
  listener(); await tick();
  assert.strictEqual(body.style.transform + body.style.clipPath + html.style.background, "", "off restores page");
  assert.deepStrictEqual(sent.at(-1), { lightActive: false }, "switch off: icon off");

  // Turn on with the camera: camera.js (page world) reports the camera; content.js writes the global "on"
  const camera = (on, media = on) => pageEvents.message({ origin: "https://meet.google.com", data: { ringLight: { camera: on, media } } });
  const userSets = async (v) => { await browser.storage.local.set(v); await tick(); };
  const realNow = Date.now;
  let clock = 1e6;
  Date.now = () => clock;
  const wait = async (ms) => { clock += ms; poll(); await tick(); };
  stored = { ...DEFAULTS, on: false };
  listener(); await tick();
  camera(true); await tick();
  assert.strictEqual(stored.on, false, "option off (default): the camera does not touch the light");
  camera(false); await tick();

  await userSets({ auto: true });
  assert.strictEqual(stored.on, false, "enabling the option without a camera changes nothing");
  camera(true); await tick();
  assert.strictEqual(stored.on, true, "camera starts in a meeting: light on");
  assert.strictEqual(body.style.transform, "scale(0.85)", "with the current settings");
  camera(true); await tick(); // heartbeat while the camera stays on
  assert.strictEqual(stored.on, true, "stays on while the camera is on");
  camera(false); await tick();
  await wait(1000);
  assert.strictEqual(stored.on, true, "camera off for 1 s: still on (Meet may be restarting the camera)");
  camera(true); await tick();
  await wait(1500);
  camera(false); await tick();
  await wait(1000);
  assert.strictEqual(stored.on, true, "short gaps do not add up");
  await wait(1000);
  assert.strictEqual(stored.on, false, "camera off for 2 s: light off");
  await wait(5000);
  assert.strictEqual(stored.on, false, "stays off");

  // Turned off by hand during the call: stays off until the camera starts again
  camera(true); await tick();
  assert.strictEqual(stored.on, true, "camera starts again: light on");
  await userSets({ on: false }); // panel or shortcut
  camera(true); await tick();
  await wait(1000);
  camera(true); await tick();
  assert.strictEqual(stored.on, false, "manual off sticks while the camera stays on");
  camera(false); await tick();
  await wait(3000);
  camera(true); await tick();
  assert.strictEqual(stored.on, true, "camera starts again: light on again");
  camera(false); await tick();
  await wait(2000);
  assert.strictEqual(stored.on, false, "and off with the camera");

  // Turned on by hand: the camera never turns it off
  await userSets({ on: true });
  camera(true); await tick();
  camera(false); await tick();
  await wait(5000);
  assert.strictEqual(stored.on, true, "light turned on by hand stays on when the camera stops");
  await userSets({ on: false });

  // Only inside a meeting
  location.pathname = "/";
  poll();
  camera(true); await tick();
  assert.strictEqual(stored.on, false, "camera on the Meet home page: light stays off");
  location.pathname = "/abc-defg-hij";
  poll(); await tick();
  assert.strictEqual(stored.on, true, "joining the meeting with the camera on: light on");
  camera(false); await tick();
  await wait(2000);
  assert.strictEqual(stored.on, false, "off again with the camera");

  // Enabling the option with the camera already on turns the light on; disabling it leaves the light alone
  await userSets({ auto: false });
  camera(true); await tick();
  assert.strictEqual(stored.on, false, "option off: camera ignored");
  await userSets({ auto: true });
  assert.strictEqual(stored.on, true, "enabling the option with the camera on: light on");
  await userSets({ auto: false });
  assert.strictEqual(stored.on, true, "disabling the option leaves the light on");
  camera(false); await tick();
  await wait(5000);
  assert.strictEqual(stored.on, true, "and the camera no longer turns it off");
  await userSets({ on: false, auto: true });

  // Leaving the page while the camera had turned the light on (best effort)
  camera(true); await tick();
  assert.strictEqual(stored.on, true, "camera on: light on");
  pageEvents.pagehide();
  await tick();
  assert.strictEqual(stored.on, false, "closing the tab turns off the light the camera turned on");
  camera(false); await tick();
  await userSets({ on: true });
  pageEvents.pagehide();
  await tick();
  assert.strictEqual(stored.on, true, "closing the tab leaves a light turned on by hand");
  await userSets({ on: false });

  // Messages come from the page: only well-formed ones from Meet itself count
  for (const msg of [
    { origin: "https://evil.example", data: { ringLight: { camera: true, media: true } } },
    { origin: "https://meet.google.com", data: { ringLight: { camera: "yes", media: true } } },
    { origin: "https://meet.google.com", data: { ringLight: { camera: true } } },
    { origin: "https://meet.google.com", data: { ringLight: null } },
    { origin: "https://meet.google.com", data: { camera: true, media: true } },
    { origin: "https://meet.google.com", data: "ringLight" },
    { origin: "https://meet.google.com", data: null },
  ]) {
    pageEvents.message(msg); await tick();
    assert.strictEqual(stored.on, false, `ignored: ${JSON.stringify(msg)}`);
  }
  Date.now = realNow;
  stored = { ...DEFAULTS, on: false };
  listener(); await tick();

  // camera.js runs in Meet's own world: it wraps getUserMedia and track clones, and polls the tracks
  // (stop() fires no "ended" event and turning a track off fires nothing)
  class FakeTrack {
    constructor(kind) { Object.assign(this, { kind, readyState: "live", enabled: true, muted: false }); }
    stop() { this.readyState = "ended"; }
    clone() { return new FakeTrack(this.kind); }
  }
  class FakeMediaDevices {
    async getUserMedia(c) {
      const tracks = [c.video && new FakeTrack("video"), c.audio && new FakeTrack("audio")].filter(Boolean);
      return { getTracks: () => tracks };
    }
  }
  const posted = [];
  let cameraTick;
  vm.runInContext(fs.readFileSync(__dirname + "/camera.js", "utf8"), vm.createContext({
    MediaDevices: FakeMediaDevices,
    MediaStreamTrack: FakeTrack,
    setInterval: (fn, ms) => { assert.strictEqual(ms, 1000, "polls every second"); cameraTick = fn; },
    top: { postMessage: (m, target) => posted.push({ ...m.ringLight, target }) },
  }));
  const report = () => { posted.length = 0; cameraTick(); return posted[0]; };
  assert.strictEqual(report(), undefined, "no messages before the page uses the camera");
  const devices = new FakeMediaDevices();
  const stream = await devices.getUserMedia({ video: true, audio: true });
  const [video, audio] = stream.getTracks();
  assert.strictEqual(video.kind, "video", "the page still gets its stream");
  assert.deepStrictEqual(report(), { camera: true, media: true, target: "*" }, "camera on reported");
  assert.deepStrictEqual(report(), { camera: true, media: true, target: "*" }, "repeated every second while tracks exist");
  // Meet may turn the camera off by disabling the track...
  video.enabled = false;
  assert.deepStrictEqual(report(), { camera: false, media: true, target: "*" }, "disabled camera track: camera off");
  video.enabled = true;
  assert.strictEqual(report().camera, true, "enabled again: camera on");
  video.muted = true;
  assert.strictEqual(report().camera, false, "muted camera track (no frames): camera off");
  video.muted = false;
  // ...or by stopping it
  const copy = video.clone();
  video.stop();
  assert.strictEqual(report().camera, true, "a live clone of the camera track keeps the camera on");
  copy.stop();
  assert.deepStrictEqual(report(), { camera: false, media: true, target: "*" }, "stopped camera track: camera off, microphone still live");
  audio.stop();
  assert.deepStrictEqual(report(), { camera: false, media: false, target: "*" }, "everything stopped: reported once");
  assert.strictEqual(report(), undefined, "then silent");
  new FakeTrack("video").clone(); // e.g. a canvas track the page made itself
  assert.strictEqual(report(), undefined, "clones of tracks not from getUserMedia are ignored");
  const again = await devices.getUserMedia({ video: true });
  assert.strictEqual(report().camera, true, "camera started again");
  again.getTracks()[0].stop();
  assert.strictEqual(report().camera, false, "and stopped");

  // background.js: shortcut toggles the light; the icon is lit per tab, where Meet applies the light
  let command, storageListener, icon, messageListener;
  const tabIcons = {};
  global.browser = {
    commands: { onCommand: { addListener: (fn) => (command = fn) } },
    action: { setIcon: ({ path, tabId }) => (tabId === undefined ? (icon = path) : (tabIcons[tabId] = path)) },
    runtime: { onMessage: { addListener: (fn) => (messageListener = fn) } },
    storage: {
      local: {
        get: async (d) => ({ ...d, ...stored }),
        set: async (v) => { stored = { ...stored, ...v }; storageListener?.(); },
      },
      onChanged: { addListener: (fn) => (storageListener = fn) },
    },
  };
  eval(fs.readFileSync(__dirname + "/background.js", "utf8"));
  await tick();
  assert.strictEqual(icon[32], "icons/off-32.png", "off icon at startup (PNG: Chrome has no SVG icons)");
  command("toggle-light"); await tick(); await tick();
  assert.strictEqual(stored.on, true, "shortcut turns light on");
  assert.strictEqual(icon[32], "icons/off-32.png", "switch on alone does not light the icon everywhere");
  messageListener({ lightActive: true }, { tab: { id: 5 } });
  assert.strictEqual(tabIcons[5][32], "icons/on-32.png", "icon lit in the meeting tab only");
  messageListener({ lightActive: false }, { tab: { id: 5 } });
  assert.strictEqual(tabIcons[5][32], "icons/off-32.png", "icon off again in that tab");
  messageListener({ lightActive: true }, {}); // not from a tab
  assert.strictEqual(icon[32], "icons/off-32.png", "messages without a tab are ignored");
  command("other"); await tick();
  assert.strictEqual(stored.on, true, "unknown command ignored");
  command("toggle-light"); await tick(); await tick();
  assert.strictEqual(stored.on, false, "shortcut turns light off");

  // i18n: every locale has the same keys, and all keys used are defined
  const en = Object.keys(require("./_locales/en/messages.json")).sort();
  const es = Object.keys(require("./_locales/es/messages.json")).sort();
  assert.deepStrictEqual(es, en, "es and en define the same messages");
  // Chrome only accepts regional Portuguese and Chinese codes (pt_BR, pt_PT, zh_TW), not plain pt or zh
  const locales = fs.readdirSync(__dirname + "/_locales").sort();
  // gl works in Firefox only: Chrome ignores it (the Chrome Web Store does accept eu)
  assert.deepStrictEqual(locales, ["ca", "de", "en", "es", "eu", "fr", "gl", "it", "ja", "pt_BR", "pt_PT", "zh_TW"], "supported languages");
  for (const l of locales) {
    const m = require(`./_locales/${l}/messages.json`);
    assert.deepStrictEqual(Object.keys(m).sort(), en, `${l} defines the same messages as en`);
    for (const [k, v] of Object.entries(m)) assert.ok(v.message.trim(), `${l}: ${k} is not empty`);
    assert.deepStrictEqual(m.openWindowsMany.placeholders, { count: { content: "$1" } }, `${l}: window count placeholder`);
    assert.ok(m.openWindowsMany.message.includes("$COUNT$"), `${l}: window count shown`);
    // WCAG 2.5.3: the spoken name of the close button contains its visible text
    assert.ok(m.closeLightWindows.message.toLowerCase().includes(m.close.message.toLowerCase()), `${l}: close label contains visible text`);
  }
  const enMessages = require("./_locales/en/messages.json");
  assert.strictEqual(enMessages.auto.message, "Turn on with the camera", "camera switch label");
  assert.strictEqual(enMessages.autoHint.message, "The light turns off again when the camera stops.", "camera switch hint");
  const used = [
    ...fs.readFileSync(__dirname + "/popup.html", "utf8").matchAll(/data-i18n(?:-label)?="(\w+)"/g),
    ...fs.readFileSync(__dirname + "/manifest.json", "utf8").matchAll(/__MSG_(\w+)__/g),
    ...["popup.js", "light-window.js"].flatMap((f) =>
      [...fs.readFileSync(__dirname + "/" + f, "utf8").matchAll(/(?:getMessage|msg|undoable)\("(\w+)"/g)]),
  ].map((m) => m[1]);
  for (const k of used) assert.ok(en.includes(k), `missing message: ${k}`);

  // popup.js: an open popup reflects a toggle made elsewhere (shortcut)
  const makeNode = () => ({
    style: { setProperty(k, v) { this[k] = v; } }, attrs: {}, listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; }, min: "5", max: "35", step: "1", value: "15", focused: false,
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); },
    fire(type, props = {}) { this.dispatchEvent({ type, preventDefault: () => (this.prevented = true), ...props }); },
    getBoundingClientRect: () => ({ left: 0, width: 216 }),
    focus() { this.focused = true; },
    setPointerCapture() {},
  });
  const nodes = Object.fromEntries(
    ["on", "auto", "frame", "meetBg", "size", "warmth", "intensity", "preview", "reset", "saveDefaults", "factory", "undo", "status", "frameOptions", "meetOptions", "lightWindow", "openWindows", "openCount", "closeWindows"].map((id) => [id, makeNode()])
  );
  let popupListener, saved = {}, created = null, removed = null, removedListener;
  const openIds = new Set(), closedIds = [];
  let popupClosed = false;
  global.window = { close: () => (popupClosed = true) };
  stored = { ...DEFAULTS, on: false };
  // the popup document is an event target too: fast drags move the pointer off the slider
  const popupDoc = makeNode();
  global.document = Object.assign(popupDoc, { documentElement: {}, getElementById: (id) => nodes[id], querySelectorAll: () => [] });
  global.browser = {
    i18n: { getUILanguage: () => "en", getMessage: (k, subs) => (subs ? `${k}:${subs}` : k) },
    runtime: { getURL: (path) => "moz-extension://id/" + path },
    windows: {
      create: async (opts) => (created = opts),
      get: async (id) => { if (!openIds.has(id)) throw new Error("no window"); return { id }; },
      remove: async (id) => { openIds.delete(id); closedIds.push(id); },
      onRemoved: { addListener: (fn) => (removedListener = fn) },
    },
    storage: {
      local: { get: async (d) => ({ ...d, ...stored }), set: async (v) => (saved = v), remove: async (k) => (removed = k) },
      onChanged: { addListener: (fn) => (popupListener = fn) },
    },
  };
  eval(fs.readFileSync(__dirname + "/popup.js", "utf8"));
  await tick();
  assert.strictEqual(nodes.on.checked, false, "popup starts unchecked");
  assert.strictEqual(nodes.factory.hidden, true, "no factory link while nothing is saved (Reset already does it)");
  assert.match(fs.readFileSync(__dirname + "/popup.html", "utf8"), /<button id="undo"[^>]* hidden>/, "no undo link before any save or reset");
  // Meet-only options (frame, Meet background) do nothing while the light is off; colour and light window still apply
  assert.strictEqual(nodes.meetOptions.hidden, true, "Meet options hidden while light off");
  assert.ok(popupListener, "popup listens for storage changes");
  popupListener({ on: { oldValue: false, newValue: true } });
  assert.strictEqual(nodes.on.checked, true, "shortcut toggle updates open popup");
  assert.strictEqual(nodes.meetOptions.hidden, false, "shortcut on shows Meet options");
  nodes.on.checked = false;
  nodes.on.fire("input");
  assert.strictEqual(nodes.meetOptions.hidden, true, "switching off hides Meet options");
  nodes.on.checked = true;
  nodes.on.fire("input");
  assert.strictEqual(nodes.meetOptions.hidden, false, "switching on shows Meet options");

  // Turn on with the camera: a labelled switch right below "Light on", outside the Meet options, so it shows while the light is off
  const popupHtml = fs.readFileSync(__dirname + "/popup.html", "utf8");
  assert.match(popupHtml, /<label class="switch-row"><span data-i18n="auto"><\/span><input type="checkbox" role="switch" id="auto" aria-describedby="autoHint"><\/label>\s*<div class="hint" id="autoHint" data-i18n="autoHint"><\/div>/,
    "camera switch has a visible label and its hint as description");
  assert.ok(popupHtml.indexOf('id="on"') < popupHtml.indexOf('id="auto"') && popupHtml.indexOf('id="auto"') < popupHtml.indexOf('id="meetOptions"'),
    "camera switch between Light on and the Meet options");
  assert.strictEqual(nodes.auto.checked, false, "camera switch off by default");
  nodes.on.checked = false;
  nodes.on.fire("input");
  nodes.auto.checked = true;
  nodes.auto.fire("input");
  assert.strictEqual(saved.auto, true, "camera switch saved");
  assert.strictEqual(saved.on, false, "turning it on does not turn the light on from the panel");
  assert.strictEqual(nodes.auto.hidden, undefined, "camera switch never hidden");
  nodes.auto.checked = false;
  nodes.auto.fire("input");
  assert.strictEqual(saved.auto, false, "camera switch off saved");
  nodes.on.checked = true;
  nodes.on.fire("input");

  // Material 3 slider: the travelled part of the thickness track is filled; size 15 of 5..35 is a third of the way
  assert.strictEqual(nodes.size.style["--p"], String(1 / 3), "thickness fill follows the value on open");
  nodes.size.value = "35";
  nodes.size.fire("input");
  assert.strictEqual(nodes.size.style["--p"], "1", "thickness fill follows the slider");
  nodes.size.value = "15";
  nodes.size.fire("input");

  // Screen readers hear what a slider value means, not a bare number
  assert.strictEqual(nodes.warmth.attrs["aria-valuetext"], "neutral", "warmth 0 reads as neutral");
  nodes.warmth.value = "40";
  nodes.warmth.fire("input");
  assert.strictEqual(nodes.warmth.attrs["aria-valuetext"], "warm 40 %", "positive warmth reads as warm");
  nodes.warmth.value = "-20";
  nodes.warmth.fire("input");
  assert.strictEqual(nodes.warmth.attrs["aria-valuetext"], "cool 20 %", "negative warmth reads as cool");
  assert.strictEqual(nodes.intensity.attrs["aria-valuetext"], "100 %", "intensity reads as a percentage");
  nodes.warmth.value = "0";
  nodes.warmth.fire("input");

  // frame switch shows or hides its own slider (size)
  assert.strictEqual(nodes.frameOptions.hidden, false, "frame options shown when frame on");
  nodes.frame.checked = false;
  nodes.frame.fire("input");
  assert.strictEqual(nodes.frameOptions.hidden, true, "frame options hidden when frame off");
  assert.strictEqual(saved.frame, false, "frame off saved");
  nodes.frame.checked = true;
  nodes.frame.fire("input");
  assert.strictEqual(nodes.frameOptions.hidden, false, "frame options back when frame on");

  // light window button opens the extension's light page in its own movable window
  nodes.lightWindow.fire("click");
  assert.strictEqual(created && created.url, "moz-extension://id/light.html", "opens light page");
  assert.strictEqual(created.type, "popup", "as a separate window without browser UI");
  await tick();
  assert.ok(popupClosed, "panel closes once the window opens, like Firefox does, instead of staying drawn but unresponsive in Chrome");

  // Open light windows are listed so they can be closed from the panel, even when lost behind other windows
  assert.strictEqual(nodes.openWindows.hidden, true, "no open-windows row while none are open");
  openIds.add(7).add(9).add(11);
  stored.lightWindows = [7, 9, 11, 42]; // 42 was closed by hand earlier: not counted
  popupListener({ lightWindows: { newValue: stored.lightWindows } });
  await tick(); await tick();
  assert.strictEqual(nodes.openWindows.hidden, false, "row shown once a light window is open");
  assert.strictEqual(nodes.openCount.textContent, "openWindowsMany:3", "counts only windows that still exist");
  openIds.delete(9);
  openIds.delete(11);
  removedListener(9);
  await tick(); await tick();
  assert.strictEqual(nodes.openCount.textContent, "openWindowsOne:1", "closing one by hand updates the count");
  nodes.closeWindows.fire("click");
  await tick(); await tick(); await tick();
  assert.deepStrictEqual(closedIds, [7], "close button closes the open light windows");
  assert.deepStrictEqual(saved.lightWindows, [], "and forgets them");
  assert.strictEqual(nodes.openWindows.hidden, true, "row hidden once all are closed");
  assert.strictEqual(nodes.status.textContent, "statusWindowsClosed", "closing announced to screen readers");
  assert.ok(nodes.lightWindow.focused, "focus moves to the open button instead of getting lost");
  delete stored.lightWindows;

  // Reset goes back to the user's saved defaults, or to factory values if none were saved; the light stays as it is
  nodes.warmth.value = "40";
  nodes.warmth.fire("input");
  nodes.reset.fire("click");
  await tick();
  assert.strictEqual(saved.warmth, DEFAULTS.warmth, "reset without saved defaults: factory values");
  assert.strictEqual(saved.auto, false, "camera switch off in factory values");
  assert.strictEqual(saved.on, true, "reset keeps the light on");
  nodes.warmth.value = "40";
  nodes.intensity.value = "70";
  nodes.warmth.fire("input");
  nodes.auto.checked = true;
  nodes.auto.fire("input");
  nodes.saveDefaults.fire("click");
  await tick();
  assert.deepStrictEqual(saved.userDefaults, { auto: true, frame: true, meetBg: false, size: 15, warmth: 40, intensity: 70 },
    "save stores the current settings, camera switch included, without the on/off state");
  stored.userDefaults = saved.userDefaults;
  nodes.warmth.value = "-60";
  nodes.warmth.fire("input");
  nodes.reset.fire("click");
  await tick();
  assert.strictEqual(saved.warmth, 40, "reset restores the saved warmth");
  assert.strictEqual(saved.auto, true, "reset restores the saved camera switch");
  assert.strictEqual(nodes.auto.checked, true, "and shows it");
  assert.strictEqual(saved.intensity, 70, "reset restores the saved intensity");
  assert.strictEqual(+nodes.warmth.value, 40, "reset moves the slider back too");
  assert.strictEqual(saved.on, true, "reset still keeps the light on");
  // Factory values stay reachable once defaults are saved, without deleting them
  assert.strictEqual(nodes.factory.hidden, false, "factory link shown once defaults are saved");
  nodes.factory.fire("click");
  await tick();
  assert.strictEqual(saved.warmth, DEFAULTS.warmth, "factory link applies factory warmth");
  assert.strictEqual(saved.intensity, DEFAULTS.intensity, "factory link applies factory intensity");
  assert.strictEqual(saved.auto, false, "factory link turns the camera switch off (off by default)");
  assert.strictEqual(saved.on, true, "factory link keeps the light on");
  assert.strictEqual(saved.userDefaults, undefined, "factory link does not touch the saved defaults");

  // Undo: Save, Reset and Factory each lose something, so each can be undone instead of confirmed
  const savedDefaults = stored.userDefaults;
  nodes.warmth.value = "-60";
  nodes.warmth.fire("input");
  nodes.reset.fire("click");
  await tick();
  assert.strictEqual(saved.warmth, 40, "reset applied");
  assert.strictEqual(nodes.undo.hidden, false, "undo offered after reset");
  assert.strictEqual(nodes.status.textContent, "statusReset", "reset announced to screen readers");
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(nodes.undo.hidden, false, "undo has no time limit");
  nodes.undo.fire("click");
  await tick();
  assert.strictEqual(saved.warmth, -60, "undo brings back the settings being tried");
  assert.strictEqual(+nodes.warmth.value, -60, "undo moves the slider back too");
  assert.deepStrictEqual(saved.userDefaults, savedDefaults, "undo keeps the saved defaults");
  assert.strictEqual(saved.on, true, "undo keeps the light on");
  assert.strictEqual(nodes.undo.hidden, true, "undo link gone once used");
  assert.strictEqual(nodes.status.textContent, "statusUndone", "undo announced");

  nodes.factory.fire("click");
  await tick();
  nodes.undo.fire("click");
  await tick();
  assert.strictEqual(saved.warmth, -60, "undo after factory values");
  nodes.factory.fire("click");
  await tick();
  assert.strictEqual(nodes.status.textContent, "statusFactory", "factory values announced");
  nodes.warmth.value = "-60";
  nodes.warmth.fire("input");
  assert.strictEqual(nodes.undo.hidden, true, "changing a setting retires the undo link");

  nodes.saveDefaults.fire("click"); // overwrites the saved defaults (warmth 40) with warmth -60
  await tick();
  assert.strictEqual(saved.userDefaults.warmth, -60, "new defaults saved");
  assert.strictEqual(nodes.status.textContent, "statusSaved", "save announced");
  stored.userDefaults = saved.userDefaults;
  nodes.undo.fire("click");
  await tick();
  assert.deepStrictEqual(saved.userDefaults, savedDefaults, "undo after save restores the previous defaults");
  stored.userDefaults = savedDefaults;

  delete stored.userDefaults; // first save ever: undo removes the saved defaults again
  nodes.saveDefaults.fire("click");
  await tick();
  removed = null;
  nodes.undo.fire("click");
  await tick();
  assert.strictEqual(removed, "userDefaults", "undo of the first save removes the saved defaults");
  assert.strictEqual(nodes.factory.hidden, true, "factory link hidden again: nothing is saved");

  // Sliders: the popup drives the drag itself, because Firefox cancels a native
  // drag released outside the popup and reverts it (firing "input" with the old value).
  const size = nodes.size; // min 5, max 35, 216px wide
  size.fire("pointerdown", { button: 0, buttons: 1, clientX: 208, pointerId: 1 });
  assert.ok(size.prevented, "native drag suppressed");
  size.prevented = false;
  size.fire("mousedown", { button: 0 });
  assert.ok(size.prevented, "native drag suppressed on mousedown too (Firefox starts it there)");
  assert.ok(size.focused, "slider keeps keyboard focus");
  assert.strictEqual(+size.value, 35, "press at right end");
  assert.strictEqual(saved.size, 35, "press applies the light");
  popupDoc.fire("pointermove", { buttons: 1, clientX: 8 }); // fast drag: pointer is off the slider
  assert.strictEqual(saved.size, 5, "dragging applies live even off the slider");
  // Real trace (Firefox 160): on leaving the popup Firefox cancels its own native drag and
  // fires a trusted "input" with the pre-drag value. It must not undo the user's drag.
  size.value = "35";
  size.fire("input", { isTrusted: true });
  assert.strictEqual(+size.value, 5, "native revert ignored: slider keeps dragged value");
  assert.strictEqual(saved.size, 5, "native revert ignored: light keeps dragged value");
  // button released outside the popup: next move arrives with no button pressed
  popupDoc.fire("pointermove", { buttons: 0, clientX: 208 });
  assert.strictEqual(+size.value, 5, "value kept after releasing outside");
  assert.strictEqual(saved.size, 5, "light kept after releasing outside");
  // the native revert may also arrive just after our drag ended (button-less move first)
  size.value = "35";
  size.fire("input", { isTrusted: true });
  assert.strictEqual(saved.size, 5, "late native revert ignored too");
  popupDoc.fire("pointermove", { buttons: 1, clientX: 208 });
  assert.strictEqual(+size.value, 5, "drag ended: later moves ignored");

  // light-window.js: whole page is the light colour, follows the settings, double-click toggles full screen
  const page = makeNode();
  let windowListener, fullscreen = false;
  stored = { ...DEFAULTS, warmth: 0, intensity: 100 };
  global.document = Object.assign(page, {
    title: "",
    body: { style: {} },
    getElementById: () => ({ style: {}, textContent: "" }),
    exitFullscreen: async () => (fullscreen = false),
    documentElement: { requestFullscreen: async () => (fullscreen = true) },
  });
  Object.defineProperty(page, "fullscreenElement", { get: () => (fullscreen ? page : null) });
  global.setTimeout = (fn) => fn();
  let windowSaved = null;
  stored.lightWindows = [3];
  global.browser = {
    i18n: { getMessage: (k) => k },
    windows: { getCurrent: async () => ({ id: 7 }) },
    storage: {
      local: { get: async (d) => ({ ...d, ...stored }), set: async (v) => (windowSaved = v) },
      onChanged: { addListener: (fn) => (windowListener = fn) },
    },
  };
  eval(fs.readFileSync(__dirname + "/light-window.js", "utf8"));
  await tick(); await tick();
  assert.deepStrictEqual(windowSaved, { lightWindows: [3, 7] }, "light window registers itself, so the panel can close it");
  delete stored.lightWindows;
  assert.strictEqual(document.body.style.background, "rgb(255, 255, 255)", "window shows the light colour");
  stored = { ...stored, warmth: 100, intensity: 50 };
  windowListener(); await tick();
  assert.strictEqual(document.body.style.background, lightColor(100, 50), "window follows temperature and intensity");
  page.fire("dblclick");
  await tick();
  assert.strictEqual(fullscreen, true, "double-click enters full screen");
  page.fire("dblclick");
  await tick();
  assert.strictEqual(fullscreen, false, "double-click again leaves full screen");
  console.log("all tests passed");
})();
