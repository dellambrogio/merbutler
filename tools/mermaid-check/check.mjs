/**
 * Checks Code from layout against Mermaid itself: for each case in cases.mjs, the app makes the
 * code (alignGroups) and Mermaid draws it in headless Chrome, once with dagre and once with ELK.
 * Each group's elements must come out in a line (centers within TOLERANCE px across it), in the
 * order they were drawn. "before" says whether they already did without the groups.
 *
 * Runs inside the app's dev server page, so it uses the app's own modules and Mermaid setup.
 * Writes each case's code and drawings to OUT. Exits with 1 if a case not marked `known` fails.
 *
 *   node check.mjs            (check.sh starts the dev server)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from '../media/lib.mjs';
import { CASES } from './cases.mjs';

const BASE = process.env.CHECK_BASE ?? 'http://localhost:5289/';
const OUT = process.env.CHECK_OUT ?? new URL('./out/', import.meta.url).pathname;
const TOLERANCE = 2;
const ENGINES = ['dagre', 'elk'];

/** Runs in the page: makes the code, draws it with Mermaid, and measures each group. */
async function runCase(c, engines, tolerance) {
  const { parse } = await import('/src/core/parse.ts');
  const { serialize } = await import('/src/core/serialize.ts');
  const { alignGroups, isAlignGroup } = await import('/src/core/alignGroups.ts');
  const { renderMermaid } = await import('/src/preview/render.ts');
  const parsed = await parse(c.code);
  if (!parsed.ok) return { error: parsed.error };
  const centers = new Map(Object.entries(c.at).map(([id, [x, y]]) => [id, { x, y }]));
  const model = alignGroups(parsed.model, centers);
  const code = serialize(model);
  const groups = model.subgraphs.filter(isAlignGroup).map((g) => {
    const row = g.id.startsWith('row');
    const members = [...model.nodes, ...model.subgraphs].filter((x) => x.parent === g.id).map((x) => x.id);
    // In the order drawn along the line.
    members.sort((p, q) => (row ? c.at[p][0] - c.at[q][0] : c.at[p][1] - c.at[q][1]));
    return { id: g.id, row, members };
  });

  const draw = async (text, engine) => {
    const r = await renderMermaid(`---\nconfig:\n  layout: ${engine}\n---\n${text}`);
    if ('error' in r) return { error: r.error };
    const host = document.createElement('div');
    host.innerHTML = r.svg;
    document.body.append(host);
    const svg = host.querySelector('svg');
    const prefix = svg.id;
    const boxOf = (id) => {
      const el = svg.querySelector(`g.node[id^="${prefix}-flowchart-${CSS.escape(id)}-"]`) ?? svg.querySelector(`g.cluster[id="${prefix}-${CSS.escape(id)}"]`);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const measured = groups.map((g) => {
      const ps = g.members.map(boxOf);
      if (ps.some((p) => p === null)) return { ...g, ok: false, why: 'element not found' };
      const across = ps.map((p) => (g.row ? p.y : p.x));
      const along = ps.map((p) => (g.row ? p.x : p.y));
      const off = Math.max(...across) - Math.min(...across);
      const ordered = along.every((v, i) => i === 0 || v > along[i - 1]);
      return { ...g, ok: off <= tolerance && ordered, why: [off > tolerance ? `${off.toFixed(1)} px off the line` : '', ordered ? '' : 'out of order'].filter(Boolean).join(', ') };
    });
    host.remove();
    return { svg: r.svg, measured };
  };

  const results = {};
  for (const engine of engines) results[engine] = { after: await draw(code, engine), before: await draw(c.code, engine) };
  return { code, groups, results };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const page = await launch({ port: 9381, width: 1600, height: 1200 });
await page.nav(BASE, 3000);

let failed = 0;
let known = 0;
for (const [i, c] of CASES.entries()) {
  const slug = `${String(i + 1).padStart(2, '0')}-${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const r = await page.ev(`(${runCase.toString()})(${JSON.stringify(c)}, ${JSON.stringify(ENGINES)}, ${TOLERANCE})`);
  if (!r || r.error) {
    console.log(`✗ ${c.name}: ${r?.error ?? 'no result'}`);
    failed++;
    continue;
  }
  writeFileSync(join(OUT, `${slug}.mmd`), r.code);
  const lines = [];
  let ok = true;
  for (const engine of ENGINES) {
    const { after, before } = r.results[engine];
    if (after.error) {
      ok = false;
      lines.push(`    ${engine}: Mermaid error: ${after.error}`);
      continue;
    }
    writeFileSync(join(OUT, `${slug}.${engine}.svg`), after.svg);
    if (!before.error) writeFileSync(join(OUT, `${slug}.${engine}.before.svg`), before.svg);
    for (const [k, g] of after.measured.entries()) {
      const was = before.measured?.[k]?.ok ? 'already in line before' : 'not in line before';
      if (!g.ok) ok = false;
      lines.push(`    ${engine}: ${g.id} [${g.members.join(', ')}] ${g.ok ? 'in line' : `NOT in line (${g.why})`}; ${was}`);
    }
  }
  if (r.groups.length === 0) lines.push('    no groups made');
  const mark = ok ? '✓' : c.known ? '~' : '✗';
  if (!ok && c.known) known++;
  else if (!ok) failed++;
  console.log(`${mark} ${c.name}${!ok && c.known ? ` (known: ${c.known})` : ''}`);
  for (const l of lines) console.log(l);
}
page.close();
console.log(`\n${CASES.length - failed - known} passed, ${known} known to fail, ${failed} failed. Code and drawings: ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
