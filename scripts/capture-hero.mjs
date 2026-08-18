/**
 * Records the README hero animation: drives the demo in headless Chrome,
 * walks the cursor across the scene so a creature chases it, catches it and
 * morphs into the next species, and writes numbered PNG frames.
 *
 * No npm dependencies: it speaks the DevTools Protocol over Node's built-in
 * WebSocket (Node >= 22). Turn the frames into a GIF with ffmpeg; see
 * scripts/README.md.
 *
 *   node scripts/capture-hero.mjs <url> <out-dir> [species-id]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = process.argv[2] ?? 'http://localhost:9900/ocean/';
const OUT = process.argv[3] ?? 'hero-frames';
const SPECIES = process.argv[4] ?? 'sea-turtle';
// Capture wide, then crop the middle: the scene scales with the viewport, so
// a bigger viewport plus a centre crop is the only zoom lever the demo has.
const W = 1440, H = 810, FPS = 25, SECONDS = 3.2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9222 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  // the creatures are WebGL: without a software GL every frame comes out empty
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-first-run', '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'po-cap-')),
  'about:blank',
], { stdio: 'ignore' });

let ws;
for (let i = 0; i < 60 && !ws; i += 1) {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const sock = new WebSocket(webSocketDebuggerUrl);
    await new Promise((ok, fail) => {
      sock.addEventListener('open', ok, { once: true });
      sock.addEventListener('error', fail, { once: true });
    });
    ws = sock;
  } catch { await sleep(500); }
}
if (!ws) { chrome.kill(); throw new Error('cannot reach the devtools endpoint'); }

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { ok, fail } = pending.get(m.id); pending.delete(m.id);
    m.error ? fail(new Error(JSON.stringify(m.error))) : ok(m.result);
  }
});
const send = (method, params = {}, sessionId) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  return new Promise((ok, fail) => pending.set(i, { ok, fail }));
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
/**
 * Deterministic clock. Screenshots take an unpredictable 50 to 150 ms each,
 * so a capture loop that just grabs frames as fast as it can samples the
 * animation at uneven intervals: the motion inside the file stutters no
 * matter how many frames are in it. Stubbing rAF and the clocks makes every
 * captured frame advance the simulation by exactly one frame of wall time.
 */
const STEP = 1000 / FPS;
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    let t = 0;
    const queue = [];
    window.__advance = (n) => {
      for (let i = 0; i < n; i += 1) {
        t += ${STEP};
        const due = queue.splice(0);
        for (const fn of due) { try { fn(t); } catch {} }
      }
    };
    window.requestAnimationFrame = (fn) => queue.push(fn);
    window.cancelAnimationFrame = () => {};
    performance.now = () => t;
    Date.now = () => 1767225600000 + t;
  })();`,
}, sessionId);

await send('Page.navigate', { url: URL_ }, sessionId);
await sleep(6000);

const advance = (n = 1) => send('Runtime.evaluate', {
  expression: `window.__advance && window.__advance(${n})`,
}, sessionId);

const evaluate = async (expression) => {
  const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  return result.value;
};

// pick the species, then collapse the panel so the scene is the whole frame
await advance(30);
await evaluate(`(() => {
  const want = ${JSON.stringify(SPECIES)}.replace(/-/g, ' ');
  const b = [...document.querySelectorAll('button')]
    .find((x) => (x.textContent || '').trim().toLowerCase() === want);
  if (b) b.click();
  return b ? b.textContent.trim() : 'not found';
})()`);
await sleep(2500);
await evaluate(`(() => {
  const h = document.querySelector('button[aria-expanded="true"], button svg')?.closest('button');
  if (h) h.click();
  return true;
})()`);
await sleep(1200);

// hide the lab chrome: the hero should be the creature, not the controls
await evaluate(`(() => {
  // The overlays are the only elements the lab puts on z-10/z-20; the two
  // canvas layers underneath must stay, so hide by that stacking level only.
  const chrome = document.querySelectorAll('.z-10, .z-20');
  chrome.forEach((el) => { el.style.display = 'none'; });
  return chrome.length;
})()`);
await sleep(400);

// let the creature settle onto the cursor before the first frame
for (let i = 0; i < 90; i += 1) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W / 2, y: H / 2, button: 'none' }, sessionId);
  await advance(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const total = Math.round(FPS * SECONDS);
for (let f = 0; f < total; f += 1) {
  const t = f / total;
  // a lazy lissajous walk: the creature reads as hunting rather than as
  // following a straight line, and the loop closes where it started
  // A small, slow orbit. A wide or fast path makes the creature chase off the
  // edge of the crop, because it turns with inertia and overshoots.
  // one closed loop across the clip, so the GIF meets itself at the seam
  const x = W / 2 + 210 * Math.sin(t * Math.PI * 2);
  const y = H / 2 + 90 * Math.sin(t * Math.PI * 2 + 1.2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, sessionId);
  await advance(1);
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(OUT, `f${String(f).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
}

console.log(`captured ${total} frames into ${OUT}`);
chrome.kill();
process.exit(0);
