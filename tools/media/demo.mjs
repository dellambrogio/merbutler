// The README demo: records frames of a scripted session into $MEDIA_WORK (media.sh encodes them).
import { BASE, WORK, launch, sleep } from './lib.mjs';
import { stageScript } from './stage.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(WORK, 'frames');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const p = await launch({ port: 9343 });
const code = `flowchart TB
  start([Customer])
  cart[Shopping cart]
  check{In stock?}
  pay[[Payment]]
  wait[/Backorder/]
  start --> cart
  cart --> check
  check -->|yes| pay
  check -->|no| wait
`;
await p.nav(BASE, 1500);
await p.ev(`${stageScript(code, { galleryFamilies: [], heights: { explorer: 112 } })} location.replace(${JSON.stringify(BASE)}); 1`);
await sleep(3000);

// Visible mouse pointer.
const installCursor = () => p.ev(`(() => {
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
await installCursor();

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
async function drag(x0, y0, x1, y1, dur = 1000) {
  await moveTo(x0, y0, 600);
  await ring(true);
  await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
  await sleep(120);
  await moveTo(x1, y1, dur, 1);
  await sleep(150);
  await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
  await ring(false);
}
const rect = (sel) => p.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && {x: r.x + r.width/2, y: r.y + r.height/2, l: r.x, r: r.right, t: r.y, b: r.bottom}; })()`);
const buttonRect = (text, scope = 'document') => p.ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
const key = async (k, code, vk, modifiers = 0) => { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); };
async function type(text, delay = 70) { for (const ch of text) { await p.send('Input.insertText', { text: ch }); await sleep(delay); } }

// Start recording.
const frames = [];
p.listeners.push((d) => {
  if (d.method !== 'Page.screencastFrame') return;
  const n = frames.length;
  const file = `${OUT}/f${String(n).padStart(5, '0')}.jpg`;
  writeFileSync(file, Buffer.from(d.params.data, 'base64'));
  frames.push({ file, ts: d.params.metadata.timestamp });
  p.send('Page.screencastFrameAck', { sessionId: d.params.sessionId });
});
await p.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
// Heartbeat so idle periods still produce frames.
const beat = setInterval(() => p.ev(`document.getElementById('demo-ring').style.outline = (Date.now() % 2 ? '0px' : '0.01px') + ' solid transparent'`), 200);
await sleep(1200);

// 1. Type code: a new edge and node.
const lines = await p.ev(`(() => { const r = document.querySelector('.cm-line').getBoundingClientRect(); return {x: r.x + 120, y: r.y + r.height/2}; })()`);
await click(lines.x + 4, lines.y);
await sleep(300);
await key('End', 'End', 35, 2); // Ctrl+End
await type('  pay --> ship>Ship order]', 85);
await sleep(1800);

// 2. Rename a node on the canvas.
let r = await rect('.react-flow__node[data-id="cart"]');
await click(r.x, r.y, { count: 2, dur: 900 });
await sleep(400);
await key('a', 'KeyA', 65, 2);
await type('Basket', 110);
await sleep(300);
await key('Enter', 'Enter', 13);
await sleep(1600);

// 3. Change a shape from the context menu.
r = await rect('.react-flow__node[data-id="wait"]');
await click(r.x, r.y, { button: 'right', dur: 800 });
await sleep(700);
let item = await p.ev(`(() => { const b = [...document.querySelectorAll('.context-menu-item')].find(b => b.textContent.startsWith('Shape')); const r = b.getBoundingClientRect(); return {x: r.x + 40, y: r.y + r.height/2, r: r.right}; })()`);
await moveTo(item.x, item.y, 500);
await sleep(500);
const sub = await p.ev(`(() => { const s = document.querySelector('.context-menu-sub'); const it = s.querySelector('.context-menu-item'); const r = it.getBoundingClientRect(); return {x: r.x + 40, y: r.y + r.height/2}; })()`);
await moveTo(sub.x, item.y, 400);
item = await p.ev(`(() => { const b = [...document.querySelectorAll('.context-menu-sub .context-menu-item')].find(b => b.textContent.includes('Stadium')); const r = b.getBoundingClientRect(); return {x: r.x + 40, y: r.y + r.height/2}; })()`);
await moveTo(item.x, item.y, 500);
await sleep(300);
await click(item.x, item.y, { dur: 100 });
await sleep(1600);

// 4. Add a connected node from the context menu, and name it.
r = await rect('.react-flow__node[data-id="wait"]');
await click(r.x, r.y, { button: 'right', dur: 800 });
await sleep(700);
item = await p.ev(`(() => { const b = [...document.querySelectorAll('.context-menu-item')].find(b => b.textContent.startsWith('Add connected node')); const r = b.getBoundingClientRect(); return {x: r.x + 50, y: r.y + r.height/2}; })()`);
await click(item.x, item.y, { dur: 600 });
await sleep(1200);
const newId = await p.ev(`[...document.querySelectorAll('.react-flow__node')].map(n => n.dataset.id).find(id => !['start','cart','check','pay','wait','ship'].includes(id))`);
r = await rect(`.react-flow__node[data-id="${newId}"]`);
await click(r.x, r.y, { count: 2, dur: 700 });
await sleep(400);
await key('a', 'KeyA', 65, 2);
await type('Notify customer', 80);
await key('Enter', 'Enter', 13);
await sleep(1800);
const dockItem = (label) => p.ev(`(() => { const b = [...document.querySelectorAll('.dock-item')].find(b => (b.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)})); const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
let b;

// Deselect: a click on the empty canvas closes the Node panel.
await click(620, 330, { dur: 800 });
await sleep(900);

// 5. Flip the direction from the dock's Diagram panel.
b = await dockItem('Diagram');
await click(b.x, b.y, { dur: 900 });
await sleep(900);
r = await p.ev(`(() => { const b = document.querySelector('.direction-choices [title^="Left to right"]'); const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
await click(r.x, r.y, { dur: 800 });
await sleep(2000);
b = await dockItem('Diagram');
await click(b.x, b.y, { dur: 800 });
await sleep(1000);

// 6. Undo and redo from the Code toolbar.
r = await rect('.code-toolbar [aria-label="Undo"]');
await click(r.x, r.y, { dur: 1000 });
await sleep(1600);
r = await rect('.code-toolbar [aria-label="Redo"]');
await click(r.x, r.y, { dur: 500 });
await sleep(1800);

// 7. The gallery, from the sidebar: open a family, show a type, close it again.
const row = (text) => p.ev(`(() => { const b = [...document.querySelectorAll('.gallery-row')].find(b => b.textContent.includes(${JSON.stringify(text)})); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return {x: r.x + 60, y: r.y + r.height/2}; })()`);
r = await row('Charts & data');
await click(r.x, r.y, { dur: 1000 });
await sleep(2500);
r = await row('Pie Chart');
await click(r.x + 60, r.y, { dur: 800 });
await sleep(3000);
r = await row('XY Chart');
await click(r.x + 60, r.y, { dur: 700 });
await sleep(3000);
await click(r.x + 60, r.y, { dur: 300 });
await sleep(1800);

clearInterval(beat);
await p.send('Page.stopScreencast');
await sleep(300);
const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.ts ?? f.ts + 0.5) - f.ts).toFixed(4)}`).join('\n');
writeFileSync(join(WORK, 'frames.txt'), `ffconcat version 1.0\n${list}\nfile '${frames[frames.length - 1].file}'\n`);
console.log('frames', frames.length, 'span', (frames[frames.length - 1].ts - frames[0].ts).toFixed(2), 'wall', (Date.now() / 1000 - t0).toFixed(2));
console.log(await p.ev(`document.querySelector('.cm-content').innerText`));
p.close();
