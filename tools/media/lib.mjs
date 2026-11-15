/**
 * Headless Chrome over the DevTools protocol: no Puppeteer or Playwright needed, only google-chrome
 * on the PATH and Node 22+ (fetch and WebSocket built in).
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The app under capture (media.sh starts a dev server there). */
export const BASE = process.env.MEDIA_BASE ?? 'http://localhost:5288/';
/** Where frames and the frame list go (media.sh makes a temporary folder). */
export const WORK = process.env.MEDIA_WORK ?? tmpdir();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch({ width = 1280, height = 720, dsf = 1, dark = false, port = 9341 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'merbutler-chrome-'));
  const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    for (const l of listeners) l(d);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.log('CONSOLE', d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
    else if (d.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  return {
    send, listeners,
    async nav(url, after = 2500) { await send('Page.navigate', { url }); await sleep(after); },
    async ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.log('EVALERR', r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; },
    async shot(file, fmt = 'png') { const r = await send('Page.captureScreenshot', { format: fmt }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    close() { ws.close(); chrome.kill(); },
  };
}
