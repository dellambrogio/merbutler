// The README's free layout demo: snap a node into a row, Code from layout, then Mermaid's own layout.
// Records frames into $MEDIA_WORK/layout-frames (media.sh encodes them).
import { BASE, WORK, launch, sleep } from './lib.mjs';
import { demoKit } from './kit.mjs';
import { stageScript } from './stage.mjs';
import { join } from 'node:path';

const p = await launch({ port: 9344 });
// Mermaid stacks the apps; the free layout, off for now, keeps them almost in a row (Mobile app a little low).
const code = `flowchart LR
  subgraph Frontend
    web[Web app]
    mobile[Mobile app]
    admin[Admin console]
  end
  subgraph Backend
    api[API] --> db[(Database)]
    api --> queue[[Queue]]
  end
  Frontend --> api
%% merbutler-layout off web=0,0 mobile=190,34 admin=380,0 api=190,230 db=380,180 queue=380,290
`;
await p.nav(BASE, 1500);
await p.ev(`${stageScript(code, { galleryFamilies: [], heights: { explorer: 112 }, name: 'Services' })} location.replace(${JSON.stringify(BASE)}); 1`);
await sleep(3500);

const { click, drag, rect, dockItem, record } = await demoKit(p);
const stop = await record(join(WORK, 'layout-frames'), join(WORK, 'layout-frames.txt'));
await sleep(2500);

// 1. Free layout on: the apps go where they were placed.
let b = await dockItem('Free layout');
await click(b.x, b.y, { dur: 1000 });
await sleep(2000);
// Zoom out two steps and move the row left: the Node panel that a drag opens on the right leaves it in view.
const zoomOut = await rect('.react-flow__controls-zoomout');
await click(zoomOut.x, zoomOut.y, { dur: 900 });
await sleep(500);
await click(zoomOut.x, zoomOut.y, { dur: 200 });
await sleep(900);
const frontend = await rect('.react-flow__node[data-id="Frontend"]');
await drag(640, 640, 640 - (frontend.x - 750), 640, 900);
await sleep(1000);

// 2. Drag Mobile app up: it snaps into the row, and the guide shows the line.
const web = await rect('.react-flow__node[data-id="web"]');
const mobile = await rect('.react-flow__node[data-id="mobile"]');
await drag(mobile.x, mobile.y, mobile.x, web.y + 2, 1400, async () => {
  console.log('guides while dragging:', await p.ev(`document.querySelectorAll('.snap-guide').length`));
  await sleep(900);
});
await sleep(1200);
// A click on the empty canvas closes the Node panel the drag opened.
await click(620, 600, { dur: 700 });
await sleep(900);

// 3. Code from layout: a group for the row, and invisible links; the message says so.
b = await dockItem('Code from layout');
await click(b.x, b.y, { dur: 900 });
await sleep(800);
console.log('message:', await p.ev(`document.querySelector('.canvas-notice')?.textContent`));
await sleep(3500);

// 4. Free layout off: Mermaid's own layout keeps the apps in a row.
b = await dockItem('Free layout');
await click(b.x, b.y, { dur: 900 });
await sleep(3500);
const row = await p.ev(`['web', 'mobile', 'admin'].map((id) => Math.round(document.querySelector('.react-flow__node[data-id="' + id + '"]').getBoundingClientRect().y)).join(' ')`);
console.log('apps top edges after Mermaid layout:', row);

await stop();
console.log(await p.ev(`document.querySelector('.cm-content').innerText`));
p.close();
