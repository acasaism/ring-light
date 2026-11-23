// Records the interactive part of the promo video: real popup.js + content.js, driven with real mouse
// events through the Chrome DevTools Protocol, captured frame by frame at 30 fps of video time.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// RL_OUT: scratch directory for the frames and stills (make-video.sh creates and removes it).
const S = dirname(fileURLToPath(import.meta.url)), REPO = resolve(S, "../../..");
const WORK = process.env.RL_OUT, OUT = join(WORK, "rec");
const FPS = 30, PORT = 8765, DBG = 9333;
mkdirSync(OUT, { recursive: true });

const server = spawn("python3", ["-I", "-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" });
const profile = join(WORK, "chrome-profile");
const chrome = spawn(process.env.CHROME || "google-chrome", ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--hide-scrollbars", "--window-size=1280,720", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}: ${JSON.stringify(r.exceptionDetails)}`);
  return r.result.value;
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json();
      const page = pages.find((p) => p.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

// --- timeline -------------------------------------------------------------------------------
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const steps = [];
const at = { cursor: [700, 660], pressed: false, caption: null, captionSince: 0, panelSince: null, panelOpen: false, ripples: [] };
// Each step: { dur, start(state), frame(state, p) } — targets are resolved when the step starts,
// because the panel layout changes (e.g. Thickness hides when Frame is off).
const wait = (dur) => steps.push({ dur });
const caption = (text) => steps.push({ dur: 0, start: () => { at.caption = text; at.captionSince = at.time; } });
const moveTo = (target, dur) => steps.push({ dur, start: async (s) => { s.from = [...at.cursor]; s.to = await target(); },
  frame: (s, p) => { const e = ease(p); at.cursor = [s.from[0] + (s.to[0] - s.from[0]) * e, s.from[1] + (s.to[1] - s.from[1]) * e]; } });
const press = () => steps.push({ dur: 0, start: async () => { at.pressed = true; at.ripples.push({ x: at.cursor[0], y: at.cursor[1], t: at.time });
  await mouse("mousePressed"); } });
const release = () => steps.push({ dur: 0, start: async () => { at.pressed = false; await mouse("mouseReleased"); } });
const click = () => { press(); wait(0.12); release(); };
const point = (id, value) => () => evaluate(`ui.point(${JSON.stringify(id)}${value === undefined ? "" : ", " + value})`);
const openPanel = () => steps.push({ dur: 0, start: () => { at.panelSince = at.time; at.panelOpen = true; } });
const closePanel = () => steps.push({ dur: 0, start: () => { at.panelSince = at.time; at.panelOpen = false; } });

async function mouse(type) {
  const [x, y] = at.cursor;
  await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !at.pressed ? "none" : "left",
    buttons: at.pressed ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 });
}

const TOOLBAR_ICON = [1256, 18];
at.cursor = [1080, 260];
caption("No lamp in front of you?");
wait(0.6);
moveTo(async () => TOOLBAR_ICON, 0.6);
click(); openPanel(); caption("Open Ring Light from the toolbar");
wait(0.2);
moveTo(point("on"), 0.5);
click(); caption("Turn on the light");
wait(1.9);
caption("Warm or cool");
moveTo(point("warmth", 0), 0.4);
press(); moveTo(point("warmth", -80), 0.6); moveTo(point("warmth", 80), 0.9); moveTo(point("warmth", 30), 0.4); release();
wait(0.2);
caption("Brighter or softer");
moveTo(point("intensity", 100), 0.4);
press(); moveTo(point("intensity", 55), 0.6); moveTo(point("intensity", 100), 0.5); release();
wait(0.2);
caption("Thicker or thinner frame");
moveTo(point("size", 15), 0.4);
press(); moveTo(point("size", 30), 0.6); moveTo(point("size", 20), 0.4); release();
wait(0.2);
moveTo(async () => [640, 712], 0.6); // clicking the page closes the panel, as in the browser
click(); closePanel(); caption("Your face, well lit");
wait(2.2);
moveTo(async () => TOOLBAR_ICON, 0.7);
click(); openPanel();
wait(0.3);
caption("Light up Meet's background too");
moveTo(point("meetBg"), 0.6);
click();
wait(1.0);
caption("With or without the frame");
moveTo(point("frame"), 0.5);
click();
wait(1.2);
caption("Open a light window");
moveTo(point("lightWindow"), 0.6);
click();
wait(0.5);

// --- run ------------------------------------------------------------------------------------
try {
  ws = new WebSocket(await connect());
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = pending.get(d.id);
    if (p) { pending.delete(d.id); d.error ? p.reject(new Error(`${p.method}: ${d.error.message}`)) : p.resolve(d.result); } };
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
  await send("Page.enable");
  // The harness serves the repository root, so the panel and the call load the extension's own files
  await send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(join(S, "harness/stub.js"), "utf8") });
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/docs/store/video/harness/index.html` });
  await sleep(2500); // let both frames load and content.js read the fake storage

  let frameNo = 0;
  at.time = 0;
  for (const step of steps) {
    if (step.start) await step.start(step);
    const n = Math.round(step.dur * FPS);
    for (let i = 0; i < n || (n === 0 && false); i++) {
      if (step.frame) step.frame(step, (i + 1) / n);
      await mouse("mouseMoved");
      const capAlpha = Math.min(1, (at.time - at.captionSince) / 0.25);
      const panelP = at.panelSince === null ? 0 : at.panelOpen ? ease((at.time - at.panelSince) / 0.25) : 1 - ease((at.time - at.panelSince) / 0.2);
      const rip = at.ripples.find((r) => at.time - r.t < 0.45);
      await evaluate(`ui.cursor(${at.cursor[0]}, ${at.cursor[1]}); ui.caption(${JSON.stringify(at.caption)}, ${capAlpha}); ui.panel(${panelP}); ui.lit();
        ui.ripple(${rip ? rip.x : 0}, ${rip ? rip.y : 0}, ${rip ? (at.time - rip.t) / 0.45 : 1});
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(OUT, `${String(frameNo++).padStart(4, "0")}.png`), Buffer.from(shot.data, "base64"));
      at.time += 1 / FPS;
    }
  }
  console.log("frames", frameNo, "state", JSON.stringify(await evaluate("ui.state()")));
  // Clean stills of the final screen for the two-monitor scene: as recorded, and with the extra light of a second screen
  await evaluate("ui.clean(); for (let i = 0; i < 40; i++) ui.lit(); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  for (const [name, force] of [["screen-a", "undefined"], ["screen-b", "1"]]) {
    await evaluate(`ui.lit(${force}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    writeFileSync(join(WORK, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  }
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
}
