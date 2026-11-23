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


assert.ok(isMeetingPath("/abc-defg-hij"), "meeting code");
assert.ok(isMeetingPath("/abc-defg-hij/"), "meeting code with trailing slash");
assert.ok(!isMeetingPath("/"), "landing page");
assert.ok(!isMeetingPath("/landing"), "other Meet page");
assert.ok(!isMeetingPath("/abc-defg-hijk"), "not a meeting code");

assert.strictEqual(lightColor(0, 100), "rgb(255, 255, 255)", "neutral max is pure white");
assert.strictEqual(lightColor(100, 100), "rgb(255, 214, 170)", "full warm");
assert.strictEqual(lightColor(-100, 100), "rgb(205, 225, 255)", "full cool");
assert.strictEqual(lightColor(0, 50), "rgb(128, 128, 128)", "intensity dims");

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
global.location = { pathname: "/abc-defg-hij" };
let poll;
global.setInterval = (fn) => (poll = fn);
global.browser = {
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

  stored = { on: true, size: 20, warmth: 0, intensity: 100 };
  listener(); await tick();
  assert.strictEqual(body.style.transform, "scale(0.8)");
  // fixed 16px corner, compensated for the scale so it shows at 16px on screen
  assert.strictEqual(body.style.clipPath, "inset(0 round 20px)", "rounded corners");
  assert.strictEqual(html.style.background, "rgb(255, 255, 255)");

  // Meet is a single-page app: leaving the call to the landing page has no reload
  location.pathname = "/";
  poll();
  assert.strictEqual(body.style.transform, "", "no light outside a meeting");
  location.pathname = "/xyz-abcd-efg";
  poll();
  assert.strictEqual(body.style.transform, "scale(0.8)", "light back when joining another meeting");

  assert.strictEqual(stage.style.backgroundColor, "", "Meet background untouched unless enabled");

  stored = { ...stored, meetBg: true };
  listener(); await tick();
  assert.strictEqual(stage.style.backgroundColor, "rgb(255, 255, 255)", "big dark area lit");
  assert.strictEqual(button.style.backgroundColor, "", "small controls stay dark");
  assert.strictEqual(panel.style.backgroundColor, "", "light areas untouched");

  stored = { ...stored, warmth: 100 };
  listener(); await tick();
  assert.strictEqual(stage.style.backgroundColor, "rgb(255, 214, 170)", "follows light colour");

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

  // background.js: shortcut toggles the light, icon follows the state
  let command, storageListener, icon;
  global.browser = {
    commands: { onCommand: { addListener: (fn) => (command = fn) } },
    action: { setIcon: ({ path }) => (icon = path) },
    storage: {
      local: {
        get: async (d) => ({ ...d, ...stored }),
        set: async (v) => { stored = { ...stored, ...v }; storageListener(); },
      },
      onChanged: { addListener: (fn) => (storageListener = fn) },
    },
  };
  eval(fs.readFileSync(__dirname + "/background.js", "utf8"));
  await tick();
  assert.strictEqual(icon[32], "icons/off-32.png", "off icon at startup (PNG: Chrome has no SVG icons)");
  command("toggle-light"); await tick(); await tick();
  assert.strictEqual(stored.on, true, "shortcut turns light on");
  assert.strictEqual(icon[32], "icons/on-32.png", "on icon");
  command("other"); await tick();
  assert.strictEqual(stored.on, true, "unknown command ignored");
  command("toggle-light"); await tick(); await tick();
  assert.strictEqual(stored.on, false, "shortcut turns light off");
  assert.strictEqual(icon[32], "icons/off-32.png", "off icon again");

  // i18n: every locale has the same keys, and all keys used are defined
  const en = Object.keys(require("./_locales/en/messages.json")).sort();
  const es = Object.keys(require("./_locales/es/messages.json")).sort();
  assert.deepStrictEqual(es, en, "es and en define the same messages");
  const used = [
    ...fs.readFileSync(__dirname + "/popup.html", "utf8").matchAll(/data-i18n="(\w+)"/g),
    ...fs.readFileSync(__dirname + "/manifest.json", "utf8").matchAll(/__MSG_(\w+)__/g),
  ].map((m) => m[1]);
  for (const k of used) assert.ok(en.includes(k), `missing message: ${k}`);

  // popup.js: an open popup reflects a toggle made elsewhere (shortcut)
  const makeNode = () => ({
    style: {}, listeners: {}, min: "5", max: "35", step: "1", value: "15", focused: false,
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); },
    fire(type, props = {}) { this.dispatchEvent({ type, preventDefault: () => (this.prevented = true), ...props }); },
    getBoundingClientRect: () => ({ left: 0, width: 216 }),
    focus() { this.focused = true; },
    setPointerCapture() {},
  });
  const nodes = Object.fromEntries(
    ["on", "frame", "meetBg", "size", "warmth", "intensity", "preview", "reset", "frameOptions", "lightWindow"].map((id) => [id, makeNode()])
  );
  let popupListener, saved = {}, created = null;
  stored = { ...DEFAULTS, on: false };
  // the popup document is an event target too: fast drags move the pointer off the slider
  const popupDoc = makeNode();
  global.document = Object.assign(popupDoc, { documentElement: {}, getElementById: (id) => nodes[id], querySelectorAll: () => [] });
  global.browser = {
    i18n: { getUILanguage: () => "en", getMessage: () => "" },
    runtime: { getURL: (path) => "moz-extension://id/" + path },
    windows: { create: (opts) => (created = opts) },
    storage: {
      local: { get: async (d) => ({ ...d, ...stored }), set: async (v) => (saved = v) },
      onChanged: { addListener: (fn) => (popupListener = fn) },
    },
  };
  eval(fs.readFileSync(__dirname + "/popup.js", "utf8"));
  await tick();
  assert.strictEqual(nodes.on.checked, false, "popup starts unchecked");
  assert.ok(popupListener, "popup listens for storage changes");
  popupListener({ on: { oldValue: false, newValue: true } });
  assert.strictEqual(nodes.on.checked, true, "shortcut toggle updates open popup");

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
  global.browser = {
    i18n: { getMessage: (k) => k },
    storage: {
      local: { get: async (d) => ({ ...d, ...stored }) },
      onChanged: { addListener: (fn) => (windowListener = fn) },
    },
  };
  eval(fs.readFileSync(__dirname + "/light-window.js", "utf8"));
  await tick();
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
