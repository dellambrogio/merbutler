/**
 * What the recorded demos share: a visible mouse pointer that moves smoothly, clicks with a ring,
 * drags, keys and typing, and a screencast recorder that writes frames and an ffconcat list.
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from './lib.mjs';

export async function demoKit(p) {
  await p.ev(`(() => {
    if (document.getElementById('demo-cursor')) return 1;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(640px, 400px)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' });
    const ring = document.createElement('div');
    ring.id = 'demo-ring';
    Object.assign(ring.style, { position: 'fixed', left: '-14px', top: '-14px', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(37,99,235,.35)', zIndex: 2147483646, pointerEvents: 'none', opacity: '0', transition: 'opacity .25s' });
    document.body.append(ring, c);
    return 1;
  })()`);

  let cx = 640, cy = 400;
  const setCursor = (x, y) => p.ev(`(() => { const c = document.getElementById('demo-cursor'); c.style.transform = 'translate(${x - 2}px, ${y - 2}px)'; document.getElementById('demo-ring').style.transform = 'translate(${x}px, ${y}px)'; })()`);
  const mouse = (type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  async function moveTo(x, y, dur = 600, buttons = 0) {
    const steps = Math.max(1, Math.round(dur / 25));
    const x0 = cx, y0 = cy;
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      const nx = x0 + (x - x0) * t, ny = y0 + (y - y0) * t;
      await mouse('mouseMoved', nx, ny, buttons ? { button: 'left', buttons } : {});
      await setCursor(nx, ny);
      await sleep(dur / steps);
    }
    cx = x; cy = y;
  }
  const ring = (on) => p.ev(`document.getElementById('demo-ring').style.opacity = '${on ? 1 : 0}'`);
  async function click(x, y, { button = 'left', count = 1, dur = 600 } = {}) {
    await moveTo(x, y, dur);
    await ring(true);
    const buttons = button === 'right' ? 2 : 1;
    for (let i = 1; i <= count; i++) {
      await mouse('mousePressed', x, y, { button, buttons, clickCount: i });
      await sleep(60);
      await mouse('mouseReleased', x, y, { button, buttons: 0, clickCount: i });
      await sleep(70);
    }
    setTimeout(() => ring(false), 250);
  }
  /** Drags from one point to another. `between` runs while the button is still down, at the end. */
  async function drag(x0, y0, x1, y1, dur = 1000, between) {
    await moveTo(x0, y0, 600);
    await ring(true);
    await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
    await sleep(120);
    await moveTo(x1, y1, dur, 1);
    await sleep(150);
    if (between) await between();
    await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
    await ring(false);
  }
  const rect = (sel) => p.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && {x: r.x + r.width/2, y: r.y + r.height/2, l: r.x, r: r.right, t: r.y, b: r.bottom}; })()`);
  const dockItem = (label) => p.ev(`(() => { const b = [...document.querySelectorAll('.dock-item')].find(b => (b.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)})); const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
  const key = async (k, code, vk, modifiers = 0) => { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); };
  async function type(text, delay = 70) { for (const ch of text) { await p.send('Input.insertText', { text: ch }); await sleep(delay); } }

  /** Records the screen into `dir` (emptied first); `stop` writes `list` for ffmpeg's concat demuxer. */
  async function record(dir, list) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const frames = [];
    p.listeners.push((d) => {
      if (d.method !== 'Page.screencastFrame') return;
      const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(d.params.data, 'base64'));
      frames.push({ file, ts: d.params.metadata.timestamp });
      p.send('Page.screencastFrameAck', { sessionId: d.params.sessionId });
    });
    await p.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
    const t0 = Date.now() / 1000;
    // Heartbeat so idle periods still produce frames.
    const beat = setInterval(() => p.ev(`document.getElementById('demo-ring').style.outline = (Date.now() % 2 ? '0px' : '0.01px') + ' solid transparent'`), 200);
    return async function stop() {
      clearInterval(beat);
      await p.send('Page.stopScreencast');
      await sleep(300);
      const lines = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.ts ?? f.ts + 0.5) - f.ts).toFixed(4)}`).join('\n');
      writeFileSync(list, `ffconcat version 1.0\n${lines}\nfile '${frames[frames.length - 1].file}'\n`);
      console.log('frames', frames.length, 'span', (frames[frames.length - 1].ts - frames[0].ts).toFixed(2), 'wall', (Date.now() / 1000 - t0).toFixed(2));
    };
  }

  return { moveTo, click, drag, ring, rect, dockItem, key, type, record, mouse };
}
