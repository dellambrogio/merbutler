import { describe, expect, test } from 'vitest';
import { moveTargets } from '../src/canvas/canvasMenu';
import { layoutModel, type CanvasNode } from '../src/canvas/layout';
import { layoutCanvas } from '../src/canvas/layoutEngine';
import { ALIGN_CLASS, alignGroups, canAlign, isAlignGroup, withoutAlignGroups } from '../src/core/alignGroups';
import { canonicalOrder, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import type { Point } from '../src/core/positions';
import { serialize } from '../src/core/serialize';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

const centers = (entries: Record<string, [number, number]>): Map<string, Point> => new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));

/** Centers of the elements as laid out by the canvas (Mermaid's rules), in absolute coordinates. */
function centersOf(nodes: CanvasNode[]): Map<string, Point> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = (n: CanvasNode): Point => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const p = parent ? pos(parent) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  return new Map(nodes.map((n) => [n.id, { x: pos(n).x + (n.width ?? 0) / 2, y: pos(n).y + (n.height ?? 0) / 2 }]));
}

/** The laid-out centers with ELK (the default) and with dagre, of the code written and read back. */
async function laidOut(model: FlowModel): Promise<{ elk: Map<string, Point>; dagre: Map<string, Point> }> {
  const read = await parseOk(serialize(model));
  return { elk: centersOf((await layoutCanvas(read)).nodes), dagre: centersOf(layoutModel(read).nodes) };
}

/** Whether the elements are in a row (left to right) or a column (top to bottom), in this order. */
function inLine(at: Map<string, Point>, ids: string[], row: boolean): boolean {
  const ps = ids.map((id) => at.get(id)!);
  return ps.every((p, i) => i === 0 || (row ? Math.abs(p.y - ps[0].y) < 2 && p.x > ps[i - 1].x : Math.abs(p.x - ps[0].x) < 2 && p.y > ps[i - 1].y));
}

/** The invisible links, as `a~~~b`. */
const invisible = (model: FlowModel): string[] => model.edges.filter((e) => e.stroke === 'invisible').map((e) => `${e.source}~~~${e.target}`);

const groupsOf = (model: FlowModel): [string, string | null, string[]][] =>
  model.subgraphs
    .filter(isAlignGroup)
    .map((g) => [g.id, g.direction, [...model.nodes, ...model.subgraphs].filter((x) => x.parent === g.id).map((x) => x.id)]);

describe('code from a free layout: Mermaid draws the lines', () => {
  test('a row of unlinked nodes becomes a chain of invisible links, and comes out as a row', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n');
    const before = await laidOut(model);
    expect(inLine(before.dagre, ['a', 'b', 'c'], true)).toBe(false);
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [0, 300] }));
    expect(groupsOf(next)).toEqual([['row1', 'LR', ['a', 'b', 'c']]]);
    expect(invisible(next)).toEqual(['a~~~b', 'b~~~c']);
    expect(next.direction).toBe('LR');
    const after = await laidOut(next);
    expect(inLine(after.elk, ['a', 'b', 'c'], true)).toBe(true);
    expect(inLine(after.dagre, ['a', 'b', 'c'], true)).toBe(true);
  });

  test('a chain drawn as a column gets the direction along it and no extra links', async () => {
    const model = await parseOk('flowchart LR\n  a --> b --> c\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [0, 150], c: [0, 300], x: [400, 0] }));
    expect(groupsOf(next)).toEqual([['col1', 'TB', ['a', 'b', 'c']]]);
    expect(invisible(next)).toEqual([]);
    const after = await laidOut(next);
    expect(inLine(after.elk, ['a', 'b', 'c'], false)).toBe(true);
    expect(inLine(after.dagre, ['a', 'b', 'c'], false)).toBe(true);
  });

  test('a chain whose links point back along the row gets RL', async () => {
    const model = await parseOk('flowchart TB\n  c --> b --> a\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], x: [0, 300] }));
    expect(groupsOf(next)).toEqual([['row1', 'RL', ['a', 'b', 'c']]]);
    const after = await laidOut(next);
    expect(inLine(after.dagre, ['a', 'b', 'c'], true)).toBe(true);
    expect(inLine(after.elk, ['a', 'b', 'c'], true)).toBe(true);
  });

  test('a row that goes back gets its invisible links in the flow direction', async () => {
    const model = await parseOk('flowchart TB\n  c --> b\n  a\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], x: [0, 300] }));
    expect(groupsOf(next)).toEqual([['row1', 'RL', ['a', 'b', 'c']]]);
    expect(invisible(next)).toEqual(['b~~~a']);
    expect(inLine((await laidOut(next)).dagre, ['a', 'b', 'c'], true)).toBe(true);
  });

  test('links and gaps mixed in one line: only the gaps get invisible links', async () => {
    const model = await parseOk('flowchart TB\n  a --> b\n  c\n  d\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [600, 0], x: [0, 400] }));
    expect(groupsOf(next)).toEqual([['row1', 'LR', ['a', 'b', 'c', 'd']]]);
    expect(invisible(next)).toEqual(['b~~~c', 'c~~~d']);
    const after = await laidOut(next);
    expect(inLine(after.dagre, ['a', 'b', 'c', 'd'], true)).toBe(true);
    expect(inLine(after.elk, ['a', 'b', 'c', 'd'], true)).toBe(true);
  });

  test('a link past a node in between: the gaps are chained, but the long link pushes the node between off the line', async () => {
    const model = await parseOk('flowchart TB\n  a --> c\n  b\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], x: [0, 400] }));
    expect(groupsOf(next)).toEqual([['row1', 'LR', ['a', 'b', 'c']]]);
    expect(invisible(next)).toEqual(['a~~~b', 'b~~~c']);
    // Both engines route a --> c through b's rank: known limit, the order along the row still holds.
    const { dagre } = await laidOut(next);
    expect(dagre.get('a')!.x < dagre.get('b')!.x && dagre.get('b')!.x < dagre.get('c')!.x).toBe(true);
  });

  test('a column drawn slightly askew keeps its order', async () => {
    // a is 2 px right of b: sorting by the diagram's rank bands would put b first.
    const model = await parseOk('flowchart LR\n  b\n  a\n  x\n');
    const next = alignGroups(model, centers({ a: [21, 0], b: [19, 100], x: [400, 400] }));
    expect(groupsOf(next)).toEqual([['col1', 'TB', ['a', 'b']]]);
    expect(serialize(next)).toContain('subgraph col1\n    direction TB\n    a\n    b\n  end');
    expect(inLine((await laidOut(next)).dagre, ['a', 'b'], false)).toBe(true);
  });
});

describe('code from a free layout: lines linked to the outside get no group', () => {
  test.each([
    ['across the direction around, unlinked', 'flowchart TB\n  a --> x\n  b --> x\n'],
    ['across the direction around, linked', 'flowchart TB\n  a --> b\n  b --> x\n'],
    // An invisible a ~~~ b would make a --> x skip b's rank: b would leave the row (tools/mermaid-check).
    ['along the direction around', 'flowchart LR\n  a --> x\n  b --> x\n'],
  ])('%s', async (_name, code) => {
    const model = await parseOk(code);
    expect(alignGroups(model, centers({ a: [0, 0], b: [200, 0], x: [100, 300] }))).toBe(model);
  });

  test('a fan-out drawn as a column with its fan-in gets no group: ELK would pull them apart', async () => {
    const model = await parseOk('flowchart TB\n  start --> b1\n  start --> b2\n  b1 --> done\n  b2 --> done\n');
    expect(alignGroups(model, centers({ start: [100, 0], b1: [0, 150], b2: [200, 150], done: [100, 300] }))).toBe(model);
  });

  test('elements of a line linked to the outside are free for another line', async () => {
    // Row a, b, x: x is linked to y outside it. Column a, c is not linked out.
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  x --> y\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], x: [400, 0], c: [0, 200], y: [600, 600] }));
    expect(groupsOf(next)).toEqual([['col1', 'TB', ['a', 'c']]]);
  });
});

describe('code from a free layout: scopes and directions', () => {
  test('a whole scope already a chain along its direction needs nothing', async () => {
    const chain = await parseOk('flowchart LR\n  a --> b --> c\n');
    expect(alignGroups(chain, centers({ a: [0, 0], b: [200, 0], c: [400, 0] }))).toBe(chain);
  });

  test("a whole scope of unlinked elements gets a group; the diagram's direction stays", async () => {
    const model = await parseOk('flowchart TB\n  a\n  b\n  c\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0] }));
    expect(next.direction).toBe('TB');
    expect(groupsOf(next)).toEqual([['row1', 'LR', ['a', 'b', 'c']]]);
    expect(inLine((await laidOut(next)).elk, ['a', 'b', 'c'], true)).toBe(true);
  });

  test("a subgraph's own direction is never changed; a group inside it does the work", async () => {
    const model = await parseOk('flowchart LR\n  subgraph s\n    a\n    b\n  end\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 300], b: [0, 450], s: [0, 375], x: [500, 0] }));
    expect(next.subgraphs.find((s) => s.id === 's')!.direction).toBeNull();
    expect(groupsOf(next)).toEqual([['col1', 'TB', ['a', 'b']]]);
    expect(next.subgraphs.find((s) => s.id === 'col1')!.parent).toBe('s');
  });

  test('a subgraph without a direction takes the one of the subgraph around it', async () => {
    const model = await parseOk('flowchart LR\n  subgraph outer\n    direction TB\n    subgraph inner\n      a --> b\n    end\n  end\n  x\n');
    // In TB, the chain a, b drawn as a column is already a column.
    expect(alignGroups(model, centers({ a: [0, 0], b: [0, 150], inner: [0, 75], outer: [0, 75], x: [600, 600] }))).toBe(model);
  });

  test('groups are made inside each subgraph, and a subgraph can be a member', async () => {
    const model = await parseOk('flowchart TB\n  subgraph s\n    a\n    b\n    c\n  end\n  x\n  y\n  z\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [150, 0], c: [75, 200], s: [75, 100], x: [400, 100], y: [600, 100], z: [0, 600] }));
    // Members as written: nodes first, then subgraphs; the invisible chain s, x, y gives the order.
    expect(Object.fromEntries(groupsOf(next).map(([id, , members]) => [id, members]))).toEqual({ row1: ['x', 'y', 's'], row2: ['a', 'b'] });
    expect(next.subgraphs.find((g) => g.id === 'row2')!.parent).toBe('s');
    expect(invisible(next).sort()).toEqual(['a~~~b', 's~~~x', 'x~~~y']);
  });
});

describe('code from a free layout: lines', () => {
  test('centers within 20 px are one line, further apart they are not', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n');
    expect(groupsOf(alignGroups(model, centers({ a: [0, 0], b: [200, 20], c: [400, 500] })))).toEqual([['row1', 'LR', ['a', 'b']]]);
    expect(alignGroups(model, centers({ a: [0, 0], b: [200, 21], c: [400, 500] }))).toBe(model);
  });

  test('a line is measured from its first element, so a slow drift does not chain', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 15], c: [400, 30], d: [600, 45] }));
    expect(groupsOf(next)).toEqual([
      ['row1', 'LR', ['a', 'b']],
      ['row2', 'LR', ['c', 'd']],
    ]);
  });

  test('the longest line wins; a node is in one group at most', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n  e\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [0, 200], e: [0, 400] }));
    const all = groupsOf(next).flatMap((g) => g[2]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('a line left with one element after the others are taken makes no group', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [400, 300] }));
    expect(groupsOf(next)).toEqual([['row1', 'LR', ['a', 'b', 'c']]]);
    expect(next.nodes.find((n) => n.id === 'd')!.parent).toBeNull();
  });

  test('elements without a center are left out', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], d: [100, 400] }));
    expect(Object.fromEntries(next.nodes.map((n) => [n.id, n.parent]))).toEqual({ a: 'row1', b: 'row1', c: null, d: null });
  });
});

describe('code from a free layout: groups made before', () => {
  test('making it again replaces the groups and their invisible links', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n');
    const first = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [0, 200] }));
    expect(groupsOf(first)).toEqual([['row1', 'LR', ['a', 'b']]]);
    expect(invisible(first)).toEqual(['a~~~b']);
    const moved = alignGroups(first, centers({ a: [0, 0], b: [0, 400], c: [0, 200] }));
    expect(groupsOf(moved)).toEqual([['col1', 'TB', ['a', 'c', 'b']]]);
    expect(invisible(moved)).toEqual(['a~~~c', 'c~~~b']);
    const none = alignGroups(first, centers({ a: [0, 0], b: [200, 100], c: [100, 200] }));
    expect(none.subgraphs).toEqual([]);
    expect(none.edges).toEqual([]);
    expect(none.classDefs).toBeUndefined();
  });

  test("the user's own invisible links stay; one to the outside means no group", async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n  a ~~~ x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [0, 200], d: [200, 200], x: [600, 600] }));
    // Row a, b links out through a; row c, d does not.
    expect(groupsOf(next)).toEqual([['row1', 'LR', ['c', 'd']]]);
    expect(invisible(next).sort()).toEqual(['a~~~x', 'c~~~d']);
  });

  test('the same drawing again returns the model itself: no undo step, no save', async () => {
    const model = await parseOk('flowchart TB\n  a --> b\n  c\n  c --> d\n  x\n');
    const at = centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [400, 200], x: [200, 400] });
    const once = alignGroups(model, at);
    expect(once).not.toBe(model);
    expect(alignGroups(once, at)).toBe(once);
    const read = await parseOk(serialize(once));
    expect(alignGroups(read, at)).toBe(read);
  });

  test('nothing lined up returns the model itself, statements in their order', async () => {
    const model = await parseOk('flowchart LR\n  c\n  a\n  b\n');
    expect(alignGroups(model, centers({ a: [0, 0], b: [100, 100], c: [200, 200] }))).toBe(model);
  });

  test('taking groups out puts nested contents back in the right parent and drops their positions', async () => {
    const model = await parseOk('flowchart LR\n  subgraph s\n    a\n    b\n    c\n  end\n  x\n');
    const grouped = alignGroups({ ...model, positions: { a: { x: 0, y: 0 } } }, centers({ a: [0, 0], b: [150, 0], c: [75, 300], s: [75, 150], x: [600, 900] }));
    const back = withoutAlignGroups({ ...grouped, positions: { ...grouped.positions, row1: { x: 1, y: 1 } } });
    expect(back.nodes.map((n) => [n.id, n.parent]).sort()).toEqual([['a', 's'], ['b', 's'], ['c', 's'], ['x', null]]);
    expect(back.subgraphs.map((s) => s.id)).toEqual(['s']);
    expect(back.edges).toEqual([]);
    expect(back.positions).toEqual({ a: { x: 0, y: 0 } });
  });

  test('a group inside a collapsed subgraph, or collapsed itself, is kept', async () => {
    const code = `flowchart LR\n  subgraph s\n    subgraph row1\n      a\n      b\n    end\n  end\n  s@{ view: collapsed }\n  x\n  a ~~~ b\n  class row1 ${ALIGN_CLASS}\n  classDef ${ALIGN_CLASS} fill:none\n`;
    const model = await parseOk(code);
    // a and b are hidden: no centers.
    const next = alignGroups(model, centers({ s: [0, 0], x: [300, 300] }));
    expect(next.subgraphs.map((s) => s.id).sort()).toEqual(['row1', 's']);
    expect(invisible(next)).toEqual(['a~~~b']);
    const collapsed = await parseOk(`flowchart LR\n  subgraph row1\n    a\n    b\n  end\n  row1@{ view: collapsed }\n  x\n  class row1 ${ALIGN_CLASS}\n`);
    expect(alignGroups(collapsed, centers({ row1: [0, 0], x: [300, 300] })).subgraphs.map((s) => s.id)).toEqual(['row1']);
  });

  test('a group with a link of its own is kept, and loses the class so its title shows', async () => {
    const model = await parseOk(`flowchart LR\n  subgraph row1\n    direction TB\n    a\n    b\n  end\n  row1 --> x\n  class row1 ${ALIGN_CLASS}\n`);
    const next = alignGroups(model, centers({ a: [0, 0], b: [0, 300], row1: [0, 150], x: [400, 900] }));
    expect(next.subgraphs.find((s) => s.id === 'row1')!.classes).toBeUndefined();
    expect(next.edges.filter((e) => e.stroke !== 'invisible').map((e) => [e.source, e.target])).toEqual([['row1', 'x']]);
  });

  test('a subgraph the user made is never taken out, even with the class', async () => {
    const model = await parseOk(`flowchart LR\n  subgraph mine\n    a\n    b\n  end\n  c\n  a ~~~ b\n  class mine ${ALIGN_CLASS}\n`);
    expect(isAlignGroup(model.subgraphs[0])).toBe(false);
    expect(withoutAlignGroups(model)).toBe(model);
  });

  test('group ids do not take ids already in use', async () => {
    const model = await parseOk('flowchart LR\n  row1\n  b\n  c\n');
    const next = alignGroups(model, centers({ row1: [0, 0], b: [200, 0], c: [0, 500] }));
    expect(groupsOf(next)).toEqual([['row2', 'LR', ['row1', 'b']]]);
  });
});

describe('code from a free layout: the code and the canvas', () => {
  test('the positions comment stays, and the code reads back the same', async () => {
    const model = await parseOk('flowchart LR\n  a\n  b\n  c\n  d\n%% merbutler-layout a=0,0 b=200,0 c=0,200 d=200,300\n');
    const next = alignGroups(model, centers({ a: [40, 20], b: [240, 20], c: [40, 220], d: [240, 320] }));
    const out = serialize(next);
    expect(out).toContain(`classDef ${ALIGN_CLASS} fill:none,stroke:none,color:transparent`);
    expect(out).toContain('a ~~~ b');
    const read = await parseOk(out);
    expect(read.positions).toEqual(model.positions);
    const written = (m: FlowModel): FlowModel => ({ ...canonicalOrder(m), edges: m.edges.map((e) => ({ ...e, id: '' })) });
    expect(written(read)).toEqual(written(next));
    expect(serialize(read)).toBe(out);
  });

  test('an existing layoutAlign classDef is kept as written', async () => {
    const model = await parseOk(`flowchart LR\n  a\n  b\n  c\n  classDef ${ALIGN_CLASS} fill:#eee\n`);
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [0, 400] }));
    expect(next.classDefs).toEqual([{ name: ALIGN_CLASS, styles: ['fill:#eee'] }]);
  });

  test('flowcharts only', async () => {
    const swimlane = await parseOk('swimlane-beta TB\n  subgraph l1\n    a\n    b\n  end\n');
    const state = await parseOk('stateDiagram-v2\n  a --> b\n');
    expect(canAlign(swimlane) || canAlign(state)).toBe(false);
    expect(alignGroups(swimlane, centers({ a: [0, 0], b: [200, 0], l1: [100, 0] }))).toBe(swimlane);
    expect(alignGroups(state, centers({ a: [0, 0], b: [100, 0] }))).toBe(state);
  });

  test('"Move to subgraph" and drops do not offer alignment groups', async () => {
    const model = alignGroups(await parseOk('flowchart LR\n  a\n  b\n  subgraph s\n    c\n  end\n'), centers({ a: [0, 0], b: [200, 0], s: [0, 300], c: [0, 300] }));
    expect(groupsOf(model)).toEqual([['row1', 'LR', ['a', 'b']]]);
    expect(moveTargets(model, 'c')).toEqual([null, 's']);
  });
});
