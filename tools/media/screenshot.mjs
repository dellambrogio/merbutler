// The README screenshot: node screenshot.mjs light|dark [scale] [out.png]
import { BASE, launch, sleep } from './lib.mjs';
import { stageScript, CODE } from './stage.mjs';
const dark = process.argv[2] === 'dark';
const dsf = Number(process.argv[3] || 1);
const out = process.argv[4] || `screenshot-${dark ? 'dark' : 'light'}.png`;
const p = await launch({ dark, dsf, port: 9361 + (dark ? 1 : 0) });
await p.nav(BASE, 1500);
await p.ev(`${stageScript(CODE, { galleryFamilies: [] })} location.replace(${JSON.stringify(BASE)}); 1`);
await sleep(6000);
console.log(await p.ev(`document.querySelectorAll('.react-flow__node').length + ' nodes; thumbs ' + document.querySelectorAll('.gallery-thumb svg').length`));
await p.shot(out);
p.close();
