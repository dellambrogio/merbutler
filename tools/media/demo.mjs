// The README demo: records frames of a scripted session into $MEDIA_WORK (media.sh encodes them).
import { BASE, WORK, launch, sleep } from './lib.mjs';
import { demoKit } from './kit.mjs';
import { stageScript } from './stage.mjs';
import { join } from 'node:path';

const OUT = join(WORK, 'frames');
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

const { moveTo, click, rect, dockItem, key, type, record } = await demoKit(p);
const stop = await record(OUT, join(WORK, 'frames.txt'));
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

await stop();
console.log(await p.ev(`document.querySelector('.cm-content').innerText`));
p.close();
