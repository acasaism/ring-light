// Run: node test.js
const assert = require("node:assert");
const fs = require("node:fs");
const { DEFAULTS, PLATFORMS, lightColor, isMeeting, isDark, valueFromX } = require("./light.js");

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
    runtime: { onMessage: { addListener() {} }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    storage: { local: { get: async (d) => d }, onChanged: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } },
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
// Every video call app in the platform table gets its host permission and both content scripts, and nothing else does
const platformHosts = Object.keys(PLATFORMS).map((h) => `https://${h}/*`);
assert.ok(platformHosts.includes("https://meet.jit.si/*"), "Jitsi Meet is a supported platform");
// Zoom serves its web client both at app.zoom.us and at zoom.us (/wc/<id>/join answers 200 there, no redirect)
assert.ok(platformHosts.includes("https://app.zoom.us/*") && platformHosts.includes("https://zoom.us/*"), "Zoom web client is a supported platform");
// Teams: work and school accounts (teams.microsoft.com, which redirects to teams.cloud.microsoft from 2026) and personal (teams.live.com)
for (const host of ["teams.microsoft.com", "teams.cloud.microsoft", "teams.live.com"])
  assert.ok(platformHosts.includes(`https://${host}/*`), `Microsoft Teams is a supported platform: ${host}`);
assert.deepStrictEqual(manifest.host_permissions, platformHosts, "host permission for every platform");
assert.deepStrictEqual(manifest.content_scripts.find((c) => c.js.includes("content.js")).matches, platformHosts, "content.js on every platform");
assert.deepStrictEqual(cameraScript.matches, platformHosts, "camera.js on every platform");
assert.strictEqual(cameraScript.all_frames, true, "camera.js also in Meet's own frames, which may open the camera");
assert.deepStrictEqual(manifest.permissions, ["storage"], "no new permissions");
// The store zip lists its files one by one: every script the manifest loads must be in it
const zipped = fs.readFileSync(__dirname + "/scripts/build.sh", "utf8").match(/^zip .*$/m)[0].split(/\s+/);
for (const f of manifest.content_scripts.flatMap((c) => c.js)) assert.ok(zipped.includes(f), `build.sh packages ${f}`);
for (const p of [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])
  assert.ok(p.endsWith(".png") && fs.existsSync(__dirname + "/" + p), `PNG icon exists: ${p}`);

// isMeeting: the platform table, by hostname. Meet keeps its rule.
const at = (hostname) => (pathname) => ({ hostname, pathname });
const meetAt = at("meet.google.com"), jitsiAt = at("meet.jit.si");
assert.ok(isMeeting(meetAt("/abc-defg-hij")), "Meet meeting");
assert.ok(isMeeting(meetAt("/abc-defg-hij/")), "Meet meeting with trailing slash");
assert.ok(!isMeeting(meetAt("/")), "Meet landing page");
assert.ok(!isMeeting(meetAt("/landing")), "other Meet page");
assert.ok(!isMeeting(meetAt("/abc-defg-hijk")), "not a Meet meeting code");
assert.ok(isMeeting(jitsiAt("/MyTeamStandup")), "Jitsi room");
// meet.jit.si (2026-11) serves its app for any single name, dots included; a trailing slash is a 404
assert.ok(isMeeting(jitsiAt("/team.sync-2026")), "Jitsi room with a dot");
assert.ok(isMeeting(jitsiAt("/release.notes")) && isMeeting(jitsiAt("/v2.0")), "Jitsi rooms with dots that are not file types");
assert.ok(isMeeting(jitsiAt("/static")), "Jitsi room named like a folder (meet.jit.si opens it as a room)");
assert.ok(!isMeeting(jitsiAt("/")), "Jitsi home page");
for (const p of ["/MyTeamStandup/", "/static/close.html", "/static/close3.html", "/libs/app.bundle.min.js", "/sounds/ring.mp3",
  "/images/", "/config.js", "/interface_config.js", "/robots.txt", "/favicon.ico", "/manifest.json", "/title.html",
  "/http-bind", "/xmpp-websocket", "/apple-touch-icon.png", "/favicon.svg", "/sitemap.xml", "/manifest.webmanifest",
  "/libs/lib-jitsi-meet.wasm", "/app.wasm", "/logo.JPG", "/bg.webp", "/fonts.woff2", "/app.js.map", "/ring.mp3"])
  assert.ok(!isMeeting(jitsiAt(p)), `not a Jitsi room: ${p}`);
// Zoom web client: /wc/<id>/join (join screen and call), /wc/<id>/start (host);
// /wc/join/<id> redirects to /wc/<id>/join. The /j/<id> launcher page only offers to open the app.
for (const host of ["app.zoom.us", "zoom.us"]) {
  const zoomAt = at(host);
  for (const p of ["/wc/123456789/join", "/wc/12345678901/start", "/wc/join/1234567890", "/wc/123456789/join/"])
    assert.ok(isMeeting(zoomAt(p)), `Zoom meeting: ${host}${p}`);
  for (const p of ["/", "/wc", "/wc/", "/wc/join", "/wc/home", "/wc/123456789", "/wc/123456789/joined", "/wc/abc/join",
    "/j/123456789", "/s/123456789", "/signin", "/profile", "/meeting", "/wc/join/abc"])
    assert.ok(!isMeeting(zoomAt(p)), `not a Zoom meeting: ${host}${p}`);
}
assert.ok(!isMeeting(at("us02web.zoom.us")("/wc/123456789/join")), "Zoom company subdomains are not covered");
// Teams (NOT VERIFIED in a real meeting): the address does not change in a call, so a call is the page holding a connected
// call connection (isMeeting's second argument, from camera.js), wherever it is
for (const host of ["teams.microsoft.com", "teams.cloud.microsoft", "teams.live.com"]) {
  for (const p of ["/v2/", "/", "/l/meetup-join/19%3ameeting_abc%40thread.v2/0"]) {
    assert.ok(!isMeeting(at(host)(p)), `Teams without a call connection is not a call: ${host}${p}`);
    assert.ok(isMeeting(at(host)(p), true), `Teams with a call connection is a call: ${host}${p}`);
  }
}
assert.ok(!isMeeting(meetAt("/"), true) && !isMeeting(jitsiAt("/"), true) && !isMeeting(at("app.zoom.us")("/wc/home"), true),
  "a call connection does not make a call on the apps detected by address");
assert.ok(!isMeeting(at("example.com")("/"), true), "nor on unknown sites");
assert.ok(!isMeeting(meetAt("/MyTeamStandup")), "Jitsi rooms are not Meet meetings");
assert.ok(!isMeeting(at("example.com")("/abc-defg-hij")), "unknown site");

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
global.PLATFORMS = PLATFORMS;
global.isMeeting = isMeeting;
global.location = { hostname: "meet.google.com", pathname: "/abc-defg-hij", origin: "https://meet.google.com" };
global.addEventListener = () => {}; // camera messages and pagehide: tested below, across tabs
let poll;
const sent = [];
global.setInterval = (fn) => (poll = fn);
global.browser = {
  runtime: { sendMessage: async (m) => sent.push(m), onMessage: { addListener() {} } },
  storage: {
    local: { get: async (d) => ({ ...d, ...stored }) },
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
  assert.strictEqual(body.style.transform + body.style.clipPath + html.style.background, "", "Meet: frame off leaves no frame (no fallback)");
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

  // Jitsi Meet: the same frame; "Light up Meet's background" is tuned for Meet, so Jitsi's own background stays as it is
  Object.assign(location, { hostname: "meet.jit.si", pathname: "/MyTeamStandup", origin: "https://meet.jit.si" });
  stored = { ...stored, on: true, frame: true, meetBg: true, warmth: 0 };
  listener(); await tick();
  assert.strictEqual(body.style.transform, "scale(0.8)", "frame in a Jitsi room");
  assert.strictEqual(html.style.background, "rgb(255, 255, 255)", "light around a Jitsi room");
  assert.deepStrictEqual(sent.at(-1), { lightActive: true }, "Jitsi room: icon on");
  poll();
  assert.strictEqual(stage.style.backgroundColor, "", "no background painting on Jitsi, even with the option on");
  // Frame off with the background option on: Jitsi has no background to light, so the frame is drawn instead
  stored = { ...stored, frame: false };
  listener(); await tick();
  assert.strictEqual(body.style.transform, "scale(0.8)", "Jitsi, frame off + background on: frame drawn as fallback");
  assert.strictEqual(html.style.background, "rgb(255, 255, 255)", "fallback frame is lit");
  assert.deepStrictEqual(sent.at(-1), { lightActive: true }, "fallback: icon on, and the light is visible");
  poll();
  assert.strictEqual(stage.style.backgroundColor, "", "still no background painting on Jitsi");
  stored = { ...stored, meetBg: false };
  listener(); await tick();
  assert.strictEqual(body.style.transform + body.style.clipPath + html.style.background, "", "Jitsi, frame and background off: no frame");
  stored = { ...stored, frame: true, meetBg: true };
  listener(); await tick();
  location.pathname = "/";
  poll();
  assert.strictEqual(body.style.transform, "", "no light on the Jitsi home page");
  assert.deepStrictEqual(sent.at(-1), { lightActive: false }, "Jitsi home page: icon off");
  // Zoom web client: the frame in a meeting, nothing on its other pages, and no background painting
  Object.assign(location, { hostname: "app.zoom.us", pathname: "/wc/123456789/join", origin: "https://app.zoom.us" });
  poll();
  assert.strictEqual(body.style.transform, "scale(0.8)", "frame in a Zoom web client meeting");
  assert.deepStrictEqual(sent.at(-1), { lightActive: true }, "Zoom meeting: icon on");
  assert.strictEqual(stage.style.backgroundColor, "", "no background painting on Zoom");
  location.pathname = "/wc/home";
  poll();
  assert.strictEqual(body.style.transform, "", "no light on Zoom's home page");
  assert.deepStrictEqual(sent.at(-1), { lightActive: false }, "Zoom home page: icon off");
  Object.assign(location, { hostname: "meet.google.com", pathname: "/abc-defg-hij", origin: "https://meet.google.com" });
  stored = { ...stored, on: false, meetBg: false };
  listener(); await tick();

  // "Turn on with the camera" across the extension: Meet tabs (light.js + content.js, each in its own page),
  // background.js and one shared storage, wired like the browser
  function extension() {
    let storage = { ...DEFAULTS };
    let clock = 1e6, onBackgroundMessage, onCommand;
    const lifecycle = { onStartup: [], onInstalled: [] };
    const changeListeners = [], removedListeners = [], tabs = new Map();
    const local = {
      get: async (d) => ({ ...d, ...storage }),
      // like the browser: every listener gets what changed
      set: async (v) => {
        const changes = Object.fromEntries(Object.entries(v).map(([k, newValue]) => [k, { oldValue: storage[k], newValue }]));
        storage = { ...storage, ...v };
        for (const fn of changeListeners) fn(changes, "local");
      },
      remove: async (k) => {
        const { [k]: oldValue, ...rest } = storage;
        storage = rest;
        for (const fn of changeListeners) fn({ [k]: { oldValue } }, "local");
      },
    };
    const onChanged = { addListener: (fn) => changeListeners.push(fn) };
    const run = (ctx, file) => vm.runInContext(fs.readFileSync(__dirname + "/" + file, "utf8"), ctx);
    const bg = vm.createContext({
      browser: {
        commands: { onCommand: { addListener: (fn) => (onCommand = fn) } },
        action: { setIcon() {} },
        runtime: {
          onMessage: { addListener: (fn) => (onBackgroundMessage = fn) },
          onStartup: { addListener: (fn) => lifecycle.onStartup.push(fn) },
          onInstalled: { addListener: (fn) => lifecycle.onInstalled.push(fn) },
        },
        storage: { local, onChanged },
        tabs: {
          // like the browser: only tabs whose page matches one of the patterns
          query: async (q) => {
            const urls = [].concat(q.url);
            assert.ok(urls.every((u) => manifest.host_permissions.includes(u)), "asks only tabs it has host permission for (no tabs permission)");
            return [...tabs.values()].filter((t) => urls.includes(`https://${t.location.hostname}/*`)).map((t) => ({ id: t.id }));
          },
          // a tab without a listener (crashed, or loaded before the extension) cannot answer
          sendMessage: (id, msg) => new Promise((resolve, reject) => {
            const t = tabs.get(id);
            if (!t || !t.onMessage) return reject(new Error("Could not establish connection. Receiving end does not exist."));
            let answered = false;
            t.onMessage(msg, {}, (r) => { answered = true; resolve(r); });
            if (!answered) resolve(undefined);
          }),
          onRemoved: { addListener: (fn) => removedListeners.push(fn) },
        },
      },
    });
    run(bg, "light.js");
    run(bg, "background.js");
    return {
      get storage() { return storage; },
      user: async (v) => { await local.set(v); await tick(); }, // the panel
      shortcut: () => onCommand("toggle-light"),
      fire: async (event) => { for (const fn of lifecycle[event]) fn({}); await tick(); },
      // in 1 s steps, like the pages' timers
      wait: async (ms) => {
        for (let left = ms; left > 0; left -= 1000) {
          clock += Math.min(left, 1000);
          for (const t of tabs.values()) { t.heartbeat(); t.poll(); }
          await tick();
        }
      },
      skip: (ms) => (clock += ms), // time passes before the tabs' timers run (e.g. a throttled background tab)
      tab(id, hostname = "meet.google.com", pathname = "/abc-defg-hij") {
        const t = { id, events: {}, body: { style: {} }, location: { hostname, pathname, origin: `https://${hostname}` } };
        const gone = () => Promise.reject(new Error("Extension context invalidated."));
        const ctx = vm.createContext({
          document: { documentElement: { style: {} }, body: t.body, querySelectorAll: () => [] },
          location: t.location,
          addEventListener: (type, fn) => (t.events[type] = fn),
          setInterval: (fn) => (t.poll = fn),
          now: () => clock,
          browser: {
            runtime: {
              sendMessage: (m) => (t.orphaned ? gone() : Promise.resolve().then(() => onBackgroundMessage(m, { tab: { id } }))),
              onMessage: { addListener: (fn) => (t.onMessage = fn) },
            },
            storage: {
              local: { get: (d) => (t.orphaned ? gone() : local.get(d)), set: (v) => (t.orphaned ? gone() : local.set(v)) },
              onChanged: { addListener: (fn) => changeListeners.push((c) => t.orphaned || fn(c)) },
            },
          },
        });
        vm.runInContext("Date.now = now", ctx);
        run(ctx, "light.js");
        run(ctx, "content.js");
        tabs.set(id, t);
        const send = (ringLight) => t.events.message((t.last = { origin: t.location.origin, data: { ringLight } }));
        t.camera = (on) => send({ camera: on });
        // camera.js on Teams also says whether a call connection is connected
        t.call = (camera, call) => send({ camera, call });
        // the frame holding the tracks is removed, navigates or is frozen before camera.js says they stopped
        t.silence = () => (t.silent = true);
        // camera.js repeats its last report every second while it watches something (see wait)
        t.heartbeat = () => t.last && !t.silent && t.events.message(t.last);
        // the extension was updated or reloaded: this old content script can no longer reach it
        t.orphan = () => { t.orphaned = true; t.onMessage = null; };
        t.close = async () => {
          t.events.pagehide();
          await tick();
          tabs.delete(id);
          for (const fn of removedListeners) fn(id);
          await tick();
        };
        return t;
      },
    };
  }

  // One Meet tab
  {
    const ext = extension();
    const a = ext.tab(1);
    await tick();
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, false, "option off (default): the camera does not touch the light");
    a.camera(false); await tick();

    await ext.user({ auto: true });
    assert.strictEqual(ext.storage.on, false, "enabling the option without a camera changes nothing");
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts in a meeting: light on");
    assert.strictEqual(a.body.style.transform, "scale(0.85)", "with the current settings");
    a.camera(true); await tick(); // heartbeat while the camera stays on
    assert.strictEqual(ext.storage.on, true, "stays on while the camera is on");
    a.camera(false); await tick();
    await ext.wait(1000);
    assert.strictEqual(ext.storage.on, true, "camera off for 1 s: still on (Meet may be restarting the camera)");
    a.camera(true); await tick();
    await ext.wait(1500);
    a.camera(false); await tick();
    await ext.wait(1000);
    assert.strictEqual(ext.storage.on, true, "short gaps do not add up");
    await ext.wait(1000);
    assert.strictEqual(ext.storage.on, false, "camera off for 2 s: light off");
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, false, "stays off");

    // Turned off by hand during the call: stays off until the camera starts again
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts again: light on");
    await ext.user({ on: false }); // panel or shortcut
    a.camera(true); await tick();
    await ext.wait(1000);
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, false, "manual off sticks while the camera stays on");
    // Meet restarting the track is not a new start, so it does not relight a light turned off by hand
    a.camera(false); await tick();
    await ext.wait(1000);
    a.camera(true); await tick();
    await ext.wait(1000);
    assert.strictEqual(ext.storage.on, false, "manual off sticks through a short camera restart");
    a.camera(false); await tick();
    await ext.wait(3000);
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts again: light on again");
    a.camera(false); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "and off with the camera");

    // The camera decides at each start and stop, however the light was switched before
    await ext.user({ on: true });
    a.camera(true); await tick();
    a.camera(false); await tick();
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, false, "light turned on by hand before the camera: off when the camera stops");
    // Alt+Shift+L just as the camera starts
    ext.shortcut();
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "shortcut and camera at once: light on");
    a.camera(false); await tick();
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, false, "and off when the camera stops");
    // Turned on by hand while the camera is off: stays on until the camera changes
    await ext.user({ on: true });
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, true, "turned on by hand with the camera off: stays on");
    await ext.user({ on: false });

    // Only inside a meeting
    a.location.pathname = "/";
    a.poll();
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, false, "camera on the Meet home page: light stays off");
    a.location.pathname = "/abc-defg-hij";
    a.poll(); await tick();
    assert.strictEqual(ext.storage.on, true, "joining the meeting with the camera on: light on");
    a.camera(false); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "off again with the camera");

    // Enabling the option with the camera already on turns the light on; disabling it leaves the light alone
    await ext.user({ auto: false });
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, false, "option off: camera ignored");
    await ext.user({ auto: true });
    assert.strictEqual(ext.storage.on, true, "enabling the option with the camera on: light on");
    await ext.user({ auto: false });
    assert.strictEqual(ext.storage.on, true, "disabling the option leaves the light on");
    a.camera(false); await tick();
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, true, "and the camera no longer turns it off");
    await ext.user({ auto: true });
    assert.strictEqual(ext.storage.on, true, "enabling the option again with the camera off changes nothing");
    await ext.tab(9).close(); // any other tab closing
    assert.strictEqual(ext.storage.on, true, "closing another tab does not turn off a light the camera is not using");
    a.camera(true); await tick();
    a.camera(false); await tick();
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, false, "after enabling the option again, the camera turns the light off");

    // Leaving the page while the camera had turned the light on (best effort)
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera on: light on");
    a.events.pagehide();
    await tick();
    assert.strictEqual(ext.storage.on, false, "closing the tab turns off the light the camera turned on");
    a.camera(false); await tick();
    await ext.user({ on: true });
    a.events.pagehide();
    await tick();
    assert.strictEqual(ext.storage.on, true, "closing the tab leaves a light turned on by hand");
    await ext.user({ on: false });

    // Messages come from the page: only well-formed ones from Meet itself count
    for (const msg of [
      { origin: "https://evil.example", data: { ringLight: { camera: true } } },
      { origin: "https://meet.google.com", data: { ringLight: { camera: "yes" } } },
      { origin: "https://meet.google.com", data: { ringLight: {} } },
      { origin: "https://meet.google.com", data: { ringLight: null } },
      { origin: "https://meet.google.com", data: { camera: true } },
      { origin: "https://meet.google.com", data: "ringLight" },
      { origin: "https://meet.google.com", data: null },
    ]) {
      a.events.message(msg); await tick();
      assert.strictEqual(ext.storage.on, false, `ignored: ${JSON.stringify(msg)}`);
    }
  }

  // Several Meet tabs: the light is global, so the camera turns it off only when no tab still has its camera on
  {
    const ext = extension();
    const a = ext.tab(1), b = ext.tab(2);
    await ext.user({ auto: true });
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts in tab A: light on");
    b.camera(true); await tick();
    a.camera(false); await tick();
    await ext.wait(3000);
    assert.strictEqual(ext.storage.on, true, "A's camera stops while B's is on: light stays on");
    b.camera(false); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "the last camera stops: light off, although B did not turn it on");

    a.camera(true); b.camera(true); await tick();
    await a.close();
    assert.strictEqual(ext.storage.on, true, "closing a tab while another still has its camera on: light stays on");
    await b.close();
    assert.strictEqual(ext.storage.on, false, "closing the last tab with the camera: light off");

    const c = ext.tab(3), d = ext.tab(4);
    c.camera(true); d.camera(true); await tick();
    await ext.user({ on: false });
    c.camera(false); await tick();
    await ext.wait(1000);
    c.camera(true); d.camera(true); await tick();
    assert.strictEqual(ext.storage.on, false, "manual off sticks in every tab while the cameras stay on");
    c.camera(false); d.camera(false); await tick();
    await ext.wait(2000);
    await ext.user({ on: true });
    c.camera(true); d.camera(true); await tick();
    c.camera(false); d.camera(false); await tick();
    await ext.wait(5000);
    assert.strictEqual(ext.storage.on, false, "light turned on by hand: off when the last camera stops");

    // A Meet tab left over from before an extension update cannot answer and is not counted
    const old = ext.tab(5);
    old.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts: light on");
    old.orphan();
    const unhandled = [];
    const track = (e) => unhandled.push(e);
    process.on("unhandledRejection", track);
    old.camera(false); await tick();
    await ext.wait(2000);
    await tick();
    process.off("unhandledRejection", track);
    assert.deepStrictEqual(unhandled, [], "an orphaned content script fails quietly");
    c.camera(true); await tick();
    c.camera(false); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "the orphaned tab does not keep the light on");

    // A camera that can no longer report its stop (browser quit or crashed mid-call, extension updated) is forgotten,
    // so closing an unrelated tab later does not turn off a light switched on by hand
    for (const event of ["onStartup", "onInstalled"]) {
      const lost = ext.tab(10);
      lost.camera(true); await tick();
      lost.orphan();
      await ext.fire(event);
      await ext.user({ on: false });
      await ext.user({ on: true });
      await ext.tab(11).close();
      assert.strictEqual(ext.storage.on, true, `${event}: a lost camera does not turn off a light switched on by hand`);
      await ext.user({ on: false });
    }
  }

  // Jitsi Meet tabs follow the camera too, and count alongside Meet tabs
  {
    const ext = extension();
    const home = ext.tab(1, "meet.jit.si", "/");
    await ext.user({ auto: true });
    home.camera(true); await tick();
    assert.strictEqual(ext.storage.on, false, "camera on the Jitsi home page: light stays off");
    home.camera(false); await tick();
    const jitsi = ext.tab(2, "meet.jit.si", "/MyTeamStandup"), meet = ext.tab(3);
    jitsi.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts in a Jitsi room (or its prejoin screen): light on");
    assert.strictEqual(jitsi.body.style.transform, "scale(0.85)", "frame in the Jitsi room");
    meet.camera(true); await tick();
    meet.camera(false); await tick();
    await ext.wait(3000);
    assert.strictEqual(ext.storage.on, true, "Meet's camera stops while Jitsi's is on: light stays on");
    jitsi.camera(false); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "Jitsi's camera stops: light off");

    // Zoom web client tabs are asked too (background.js queries every host in the table)
    const zoom = ext.tab(4, "zoom.us", "/wc/123456789/join");
    zoom.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts in a Zoom web client meeting: light on");
    jitsi.camera(true); await tick();
    jitsi.camera(false); await tick();
    await ext.wait(3000);
    assert.strictEqual(ext.storage.on, true, "Jitsi's camera stops while Zoom's is on: light stays on");
    zoom.camera(false); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "Zoom's camera stops: light off");
  }

  // Microsoft Teams (NOT VERIFIED in a real meeting): the light applies while the page has a connected call connection
  {
    const ext = extension();
    const teams = ext.tab(1, "teams.microsoft.com", "/v2/");
    await ext.user({ on: true });
    teams.poll();
    assert.strictEqual(teams.body.style.transform, "", "Teams without a call: no light, although the switch is on");
    teams.call(false, true); await tick();
    assert.strictEqual(teams.body.style.transform, "scale(0.85)", "call connected (camera off): in a call, light applied at once");
    teams.call(false, true); await tick(); // heartbeat
    teams.call(true, true); await tick();
    assert.strictEqual(teams.body.style.transform, "scale(0.85)", "camera on too: still applied");
    teams.call(false, false); await tick();
    await ext.wait(1000);
    assert.strictEqual(teams.body.style.transform, "scale(0.85)", "connection closed for 1 s: still a call (reconnecting)");
    teams.call(false, true); await tick();
    await ext.wait(1500);
    teams.call(false, false); await tick();
    await ext.wait(1000);
    assert.strictEqual(teams.body.style.transform, "scale(0.85)", "short gaps do not add up");
    await ext.wait(1000);
    assert.strictEqual(teams.body.style.transform, "", "connection closed for 2 s: the call is over, light removed");
    // Page messages are untrusted: a call flag that is not a boolean is ignored, and so is the whole message
    teams.events.message({ origin: "https://teams.microsoft.com", data: { ringLight: { camera: false, call: "yes" } } });
    teams.events.message({ origin: "https://evil.example", data: { ringLight: { camera: false, call: true } } });
    await ext.wait(1000);
    assert.strictEqual(teams.body.style.transform, "", "malformed or foreign call messages ignored");
    await ext.user({ on: false });

    // Turn on with the camera: the camera starts in a Teams call, and the light follows it like on Meet
    await ext.user({ auto: true });
    teams.call(true, true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts in a Teams call: light on");
    teams.call(false, true); await tick();
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "camera off while the call goes on: light off after 2 s");
    teams.call(true, true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera on again: light on");
    // background.js asks every Teams tab too: one with its camera on keeps the light on when a Meet camera stops
    const meet = ext.tab(2);
    meet.camera(true); await tick();
    meet.camera(false); await tick();
    await ext.wait(3000);
    assert.strictEqual(ext.storage.on, true, "Meet's camera stops while Teams' is on: light stays on");
    teams.call(false, false); await tick(); // leaves the call
    await ext.wait(2000);
    assert.strictEqual(ext.storage.on, false, "leaving the Teams call: light off");
    assert.strictEqual(teams.body.style.transform, "", "and no frame left on Teams");

    // The frame holding the call goes away (removed, navigates, frozen) before camera.js says it ended: camera.js repeats
    // its report every second, so silence ends the call and the camera
    teams.call(true, true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera starts in a Teams call again: light on");
    teams.silence();
    await ext.wait(2000);
    assert.strictEqual(teams.body.style.transform, "scale(0.85)", "silent for 2 s: still a call (a report may be late)");
    await ext.wait(1000);
    assert.strictEqual(ext.storage.on, false, "silent for 3 s without a final false: the camera counts as stopped, light off");
    await ext.user({ on: true });
    assert.strictEqual(teams.body.style.transform, "", "and the call counts as over: no frame, although the switch is on");
    await ext.user({ on: false });

    // On Meet, a call flag means nothing: Meet's calls are found by address and camera.js sends none there
    meet.location.pathname = "/";
    meet.poll();
    await ext.user({ on: true });
    meet.call(false, true); await tick();
    meet.poll();
    assert.strictEqual(meet.body.style.transform, "", "a call message on Meet's home page does not make it a call");
  }

  // background.js asks a tab whose camera.js went silent: it answers no once the last report is over 2.5 s old, even
  // before the tab's own timer notices (e.g. a throttled background tab)
  {
    const ext = extension();
    const a = ext.tab(1);
    await ext.user({ auto: true });
    a.camera(true); await tick();
    assert.strictEqual(ext.storage.on, true, "camera on: light on");
    a.silence();
    const ask = () => new Promise((answer) => a.onMessage({ cameraQuery: true }, {}, answer));
    ext.skip(2000);
    assert.strictEqual(await ask(), true, "last report 2 s old: still the camera");
    ext.skip(1000);
    assert.strictEqual(await ask(), false, "last report 3 s old, no final false: no camera");
  }

  // camera.js runs in Meet's own world: it wraps getUserMedia and track and stream clones, and polls the camera tracks
  // (stop() fires no "ended" event and turning a track off fires nothing)
  class FakeTrack {
    constructor(kind) { Object.assign(this, { kind, readyState: "live", enabled: true, muted: false }); }
    stop() { this.readyState = "ended"; }
    clone() { return new FakeTrack(this.kind); }
  }
  // like browsers, a stream clone copies its tracks without calling MediaStreamTrack.prototype.clone
  class FakeStream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    clone() { return new FakeStream(this.tracks.map((t) => new FakeTrack(t.kind))); }
  }
  class FakeMediaDevices {
    async getUserMedia(c) {
      return new FakeStream([c.video && new FakeTrack("video"), c.audio && new FakeTrack("audio")].filter(Boolean));
    }
  }
  const posted = [];
  let cameraTick = null; // the running 1 s timer, if any
  vm.runInContext(fs.readFileSync(__dirname + "/camera.js", "utf8"), vm.createContext({
    MediaDevices: FakeMediaDevices,
    MediaStreamTrack: FakeTrack,
    MediaStream: FakeStream,
    setInterval: (fn, ms) => { assert.strictEqual(ms, 1000, "polls every second"); cameraTick = fn; return 1; },
    clearInterval: (id) => { assert.strictEqual(id, 1, "stops its own timer"); cameraTick = null; },
    // only a same-origin top page may hear it: on a site embedding meet.jit.si, `top` is that site
    location: { hostname: "meet.jit.si", origin: "https://meet.jit.si" },
    top: { postMessage: (m, target) => posted.push({ ...m.ringLight, target }) },
  }));
  const report = () => {
    posted.length = 0;
    cameraTick?.();
    for (const m of posted) assert.strictEqual(m.target, "https://meet.jit.si", "posted to the frame's own origin, never \"*\"");
    return posted[0];
  };
  assert.strictEqual(cameraTick, null, "no timer before the page uses the camera");
  const devices = new FakeMediaDevices();
  const mic = await devices.getUserMedia({ audio: true });
  assert.strictEqual(cameraTick, null, "microphone only: no timer, no messages");
  mic.getTracks()[0].stop();
  const stream = await devices.getUserMedia({ video: true, audio: true });
  const [video, audio] = stream.getTracks();
  assert.strictEqual(video.kind, "video", "the page still gets its stream");
  assert.deepStrictEqual(report(), { camera: true, target: "https://meet.jit.si" }, "camera on reported, nothing else");
  assert.deepStrictEqual(report(), { camera: true, target: "https://meet.jit.si" }, "repeated every second while a camera track exists");
  // Meet may turn the camera off by disabling the track...
  video.enabled = false;
  assert.deepStrictEqual(report(), { camera: false, target: "https://meet.jit.si" }, "disabled camera track: camera off");
  video.enabled = true;
  assert.strictEqual(report().camera, true, "enabled again: camera on");
  video.muted = true;
  assert.strictEqual(report().camera, false, "muted camera track (no frames): camera off");
  video.muted = false;
  // ...or by stopping it
  const copy = video.clone();
  const effects = stream.clone(); // e.g. Meet's effects path
  video.stop();
  assert.strictEqual(report().camera, true, "a live clone of the camera track keeps the camera on");
  copy.stop();
  assert.strictEqual(report().camera, true, "a live copy made by cloning the camera's stream keeps the camera on");
  for (const t of effects.getTracks()) t.stop();
  assert.deepStrictEqual(report(), { camera: false, target: "https://meet.jit.si" }, "every camera track stopped: camera off, reported once");
  assert.strictEqual(cameraTick, null, "then the timer stops, although the microphone is still live");
  audio.stop();
  new FakeTrack("video").clone(); // e.g. a canvas track the page made itself
  new FakeStream([new FakeTrack("video")]).clone();
  assert.strictEqual(cameraTick, null, "clones of tracks and streams not from getUserMedia are ignored");
  const again = await devices.getUserMedia({ video: true });
  assert.strictEqual(report().camera, true, "camera started again");
  again.getTracks()[0].stop();
  assert.strictEqual(report().camera, false, "and stopped");

  // camera.js in each app's page (fresh fakes, as every page has its own world). Only where the app is detected by its
  // call connection (Teams) does it also watch the page's RTCPeerConnections and report "call"; elsewhere only the camera.
  function cameraPage(hostname) {
    class Track {
      constructor(kind) { Object.assign(this, { kind, readyState: "live", enabled: true, muted: false }); }
      stop() { this.readyState = "ended"; }
      clone() { return new Track(this.kind); }
    }
    class Stream {
      constructor(tracks) { this.tracks = tracks; }
      getTracks() { return this.tracks; }
      clone() { return new Stream(this.tracks.map((t) => new Track(t.kind))); }
    }
    class Devices {
      async getUserMedia(c) { return new Stream([c.video && new Track("video"), c.audio && new Track("audio")].filter(Boolean)); }
    }
    class PeerConnection {
      constructor(config) { Object.assign(this, { config, connectionState: "new", iceConnectionState: "new", signalingState: "stable" }); }
      close() { Object.assign(this, { connectionState: "closed", iceConnectionState: "closed", signalingState: "closed" }); }
      static generateCertificate() { return "certificate"; }
    }
    const page = { posted: [], timer: null, devices: new Devices(), PeerConnection };
    page.window = vm.createContext({
      MediaDevices: Devices, MediaStreamTrack: Track, MediaStream: Stream,
      RTCPeerConnection: PeerConnection, webkitRTCPeerConnection: PeerConnection, // Chromium still has the prefixed name
      setInterval: (fn) => ((page.timer = fn), 1),
      clearInterval: () => (page.timer = null),
      location: { hostname, origin: `https://${hostname}` },
      top: { postMessage: (m, target) => page.posted.push({ ...m.ringLight, target }) },
    });
    vm.runInContext(fs.readFileSync(__dirname + "/camera.js", "utf8"), page.window);
    page.report = () => {
      page.posted.length = 0;
      page.timer?.();
      for (const m of page.posted) assert.strictEqual(m.target, `https://${hostname}`, "posted to the page's own origin");
      const { target, ...m } = page.posted[0] || {};
      return page.posted[0] && m;
    };
    return page;
  }
  for (const [host, platform] of Object.entries(PLATFORMS)) {
    const page = cameraPage(host);
    const teams = platform.meeting === "call";
    // e.g. recording a Teams voice message, or testing the microphone in its settings: not a call
    const mic = await page.devices.getUserMedia({ audio: true });
    assert.strictEqual(page.timer, null, `${host}: microphone only, no timer and no messages`);
    mic.getTracks()[0].stop();
    // e.g. the camera preview in Teams' settings: the camera, but not a call
    const cam = await page.devices.getUserMedia({ video: true });
    assert.deepStrictEqual(page.report(), teams ? { camera: true, call: false } : { camera: true },
      `${host}: camera reported${teams ? ", no call without a connection" : ", nothing else"}`);
    cam.getTracks()[0].stop();
    if (!teams) {
      assert.strictEqual(page.window.RTCPeerConnection, page.PeerConnection, `${host}: RTCPeerConnection left alone`);
      assert.strictEqual(page.window.webkitRTCPeerConnection, page.PeerConnection, `${host}: webkitRTCPeerConnection left alone`);
    }
  }
  {
    const page = cameraPage("teams.live.com");
    const { RTCPeerConnection, webkitRTCPeerConnection } = page.window;
    // Teams' own code keeps working with the watched constructor
    const config = { iceServers: [] };
    const pc = new RTCPeerConnection(config);
    assert.ok(pc instanceof page.PeerConnection && pc instanceof RTCPeerConnection, "Teams: still a real RTCPeerConnection");
    assert.strictEqual(pc.config, config, "Teams: its configuration reaches the browser's constructor");
    assert.strictEqual(RTCPeerConnection.prototype, page.PeerConnection.prototype, "Teams: same prototype");
    assert.strictEqual(RTCPeerConnection.generateCertificate(), "certificate", "Teams: static methods still there");
    class Subclass extends RTCPeerConnection {}
    const sub = new Subclass();
    assert.ok(sub instanceof Subclass, "Teams: subclasses still work");
    assert.strictEqual(webkitRTCPeerConnection, RTCPeerConnection, "Teams: the prefixed name is watched too");
    assert.throws(() => RTCPeerConnection(), TypeError, "Teams: calling it without new still fails, like the browser's");

    assert.deepStrictEqual(page.report(), { camera: false, call: false }, "Teams: connections not connected yet, no call");
    pc.connectionState = "connected";
    assert.deepStrictEqual(page.report(), { camera: false, call: true },
      "Teams: a connected connection is a call, even joined without microphone or camera");
    const cam = await page.devices.getUserMedia({ video: true });
    assert.deepStrictEqual(page.report(), { camera: true, call: true }, "Teams: camera on in the call");
    cam.getTracks()[0].stop();
    assert.deepStrictEqual(page.report(), { camera: false, call: true }, "Teams: camera off, still in the call");
    pc.connectionState = "disconnected";
    assert.deepStrictEqual(page.report(), { camera: false, call: false }, "Teams: connection lost, no call");
    pc.connectionState = "connected";
    assert.deepStrictEqual(page.report(), { camera: false, call: true }, "Teams: reconnected");
    for (const other of [new RTCPeerConnection(), sub]) other.close(); // e.g. Teams' own connection checks
    pc.close();
    assert.deepStrictEqual(page.report(), { camera: false, call: false }, "Teams: every connection closed, reported once");
    assert.strictEqual(page.timer, null, "Teams: then the timer stops");

    // A browser without connectionState: the ICE state says it
    const old = new webkitRTCPeerConnection();
    delete old.connectionState;
    old.iceConnectionState = "checking";
    assert.deepStrictEqual(page.report(), { camera: false, call: false }, "Teams, ICE checking: no call yet");
    old.iceConnectionState = "completed";
    assert.deepStrictEqual(page.report(), { camera: false, call: true }, "Teams, ICE completed: a call");
    old.iceConnectionState = "connected";
    assert.deepStrictEqual(page.report(), { camera: false, call: true }, "Teams, ICE connected: a call");
    old.iceConnectionState = "closed";
    assert.deepStrictEqual(page.report(), { camera: false, call: false }, "Teams, ICE closed: the call is over");
    assert.strictEqual(page.timer, null, "Teams: and the timer stops");
  }

  // background.js: shortcut toggles the light; the icon is lit per tab, where Meet applies the light
  let command, storageListener, icon, messageListener;
  const tabIcons = {};
  global.browser = {
    commands: { onCommand: { addListener: (fn) => (command = fn) } },
    action: { setIcon: ({ path, tabId }) => (tabId === undefined ? (icon = path) : (tabIcons[tabId] = path)) },
    runtime: { onMessage: { addListener: (fn) => (messageListener = fn) }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } },
    storage: {
      local: {
        get: async (d) => ({ ...d, ...stored }),
        set: async (v) => {
          const changes = Object.fromEntries(Object.entries(v).map(([k, newValue]) => [k, { oldValue: stored[k], newValue }]));
          stored = { ...stored, ...v };
          storageListener?.(changes);
        },
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
  assert.strictEqual(enMessages.sectionMeet.message, "In the call", "section named after the call, not Meet");
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

  // Defaults saved before the camera switch existed have no "auto": Reset leaves the switch as it is
  const currentDefaults = stored.userDefaults;
  stored.userDefaults = { frame: true, meetBg: false, size: 15, warmth: 40, intensity: 70 };
  nodes.auto.checked = true;
  nodes.auto.fire("input");
  nodes.reset.fire("click");
  await tick();
  assert.strictEqual(saved.auto, true, "reset with older saved defaults keeps the camera switch on");
  assert.strictEqual(saved.warmth, 40, "and still restores the saved warmth");
  nodes.auto.checked = false;
  nodes.auto.fire("input");
  nodes.reset.fire("click");
  await tick();
  assert.strictEqual(saved.auto, false, "and keeps it off");
  stored.userDefaults = currentDefaults;

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
