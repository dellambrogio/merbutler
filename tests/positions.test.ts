import { describe, expect, test } from 'vitest';
import type { CanvasNode } from '../src/canvas/layout';
import { layoutCanvas } from '../src/canvas/layoutEngine';
import type { FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';
import { arrangeByPositions, extractPositions, inferDirection, isFreeLayout, readingOrder, toggleFreeLayout, withoutPositions, type Point } from '../src/core/positions';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

function absolute(nodes: CanvasNode[]): Map<string, { x: number; y: number; w: number; h: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = (n: CanvasNode): { x: number; y: number } => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const p = parent ? pos(parent) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  return new Map(nodes.map((n) => [n.id, { ...pos(n), w: n.width ?? 0, h: n.height ?? 0 }]));
}

const centers = (entries: Record<string, [number, number]>): Map<string, Point> => new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));

describe('free layout positions in the code', () => {
  test('the comment is read, taken out of the code, and written back at the end', async () => {
    const code = 'flowchart LR\n  a --> b\n%% merbutler-layout a=10,20 b=200,-5\n';
    expect(extractPositions(code)).toEqual({ text: 'flowchart LR\n  a --> b\n\n', positions: { a: { x: 10, y: 20 }, b: { x: 200, y: -5 } } });
    const model = await parseOk(code);
    expect(model.positions).toEqual({ a: { x: 10, y: 20 }, b: { x: 200, y: -5 } });
    expect(model.endComments).toBeUndefined();
    const out = serialize(model);
    expect(out).toBe('flowchart LR\n  a\n  b\n  a --> b\n%% merbutler-layout a=10,20 b=200,-5\n');
    expect(await parseOk(out)).toEqual(model);
  });

  test('ids with odd characters, long lists over several lines, removed elements left out', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `n${i}`);
    const model = await parseOk(`flowchart TB\n  ${ids.join(' --> ')}\n`);
    const positions = Object.fromEntries([...ids, 'gone'].map((id, i) => [id, { x: i * 10, y: 0 }]));
    const out = serialize({ ...model, positions });
    expect(out.match(/%% merbutler-layout/g)).toHaveLength(2);
    expect(out).not.toContain('gone');
    expect((await parseOk(out)).positions).toEqual(Object.fromEntries(ids.map((id, i) => [id, { x: i * 10, y: 0 }])));
    expect(extractPositions('%% merbutler-layout a%3Db=1,2').positions).toEqual({ 'a=b': { x: 1, y: 2 } });
  });

  test('a free layout with nothing placed stays on; without the comment it is off', async () => {
    const empty = await parseOk('flowchart LR\n%% merbutler-layout\n');
    expect(isFreeLayout(empty)).toBe(true);
    expect(serialize(empty)).toContain('%% merbutler-layout\n');
    expect(serialize(withoutPositions(empty))).not.toContain('merbutler-layout');
  });

  test('state diagrams and use case diagrams keep it too', async () => {
    const state = await parseOk('stateDiagram-v2\n  s1 --> s2\n%% merbutler-layout s1=0,0 s2=0,100\n');
    expect(state.positions).toEqual({ s1: { x: 0, y: 0 }, s2: { x: 0, y: 100 } });
    expect(serialize(state)).toContain('%% merbutler-layout s1=0,0 s2=0,100\n');
  });

  test('a swimlane keeps its lanes: no free layout', async () => {
    const model = await parseOk('swimlane-beta LR\n  subgraph L [Lane]\n    a\n  end\n%% merbutler-layout a=0,0\n');
    expect(isFreeLayout(model)).toBe(false);
  });
});

describe('the code follows the drawing', () => {
  test('the direction most edges point to', async () => {
    const model = await parseOk('flowchart TB\n  a --> b\n  a --> c\n');
    expect(inferDirection(model, centers({ a: [0, 0], b: [300, 20], c: [300, -20] }))).toBe('LR');
    expect(inferDirection(model, centers({ a: [300, 0], b: [0, 0], c: [0, 50] }))).toBe('RL');
    expect(inferDirection(model, centers({ a: [0, 300], b: [0, 0], c: [50, 0] }))).toBe('BT');
    // Nearly diagonal: the current direction stays.
    expect(inferDirection(model, centers({ a: [0, 0], b: [105, 100], c: [100, 100] }))).toBe('TB');
  });

  test('statements in reading order along the direction', async () => {
    const model = await parseOk('flowchart TB\n  c --> a\n  b --> a\n');
    const ordered = readingOrder(model, centers({ b: [0, 0], c: [200, 10], a: [100, 200] }));
    expect(ordered.nodes.map((n) => n.id)).toEqual(['b', 'c', 'a']);
    expect(ordered.edges.map((e) => e.source)).toEqual(['b', 'c']);
    const arranged = arrangeByPositions(model, { a: { x: 0, y: 0 } }, centers({ b: [0, 0], c: [0, 200], a: [300, 100] }));
    expect(arranged.direction).toBe('LR');
    expect(serialize(arranged)).toMatch(/^flowchart LR\n {2}b\n {2}c\n {2}a\n/);
  });
});

describe('free layout on the canvas', () => {
  test('nodes where they were put, subgraphs around them, new nodes next to a linked one, straight edges', async () => {
    const model = await parseOk(
      'flowchart LR\n  subgraph g [Group]\n    a\n    b\n  end\n  a --> b\n  b --> c\n%% merbutler-layout a=0,0 b=0,300\n',
    );
    const laid = await layoutCanvas(model);
    const box = absolute(laid.nodes);
    expect(box.get('a')).toMatchObject({ x: 0, y: 0 });
    expect(box.get('b')).toMatchObject({ x: 0, y: 300 });
    const g = box.get('g')!;
    expect(g.x).toBeLessThan(0);
    expect(g.y).toBeLessThan(0);
    expect(g.y + g.h).toBeGreaterThan(300 + box.get('b')!.h);
    // c is new: after b, along the direction (LR).
    const b = box.get('b')!;
    expect(box.get('c')!.x).toBeGreaterThanOrEqual(b.x + b.w);
    expect(laid.edges.every((e) => e.data?.floating && !e.data.route)).toBe(true);
  });
});

describe('turning the free layout on', () => {
  test('changes nothing on the canvas: same boxes, same edge routes; a moved node gets straight edges', async () => {
    const model = await parseOk(
      'flowchart TB\n  subgraph g1 [Frontend]\n    a[Login] --> b[Dashboard]\n  end\n  subgraph g2 [Backend]\n    c[(DB)]\n    d[API]\n  end\n  b --> d\n  d --> c\n  d --> e{OK?}\n  e -->|yes| b\n',
    );
    const auto = await layoutCanvas(model);
    const autoBox = absolute(auto.nodes);
    const leaves = ['a', 'b', 'c', 'd', 'e'];
    const positions = Object.fromEntries(leaves.map((id) => [id, { x: Math.round(autoBox.get(id)!.x), y: Math.round(autoBox.get(id)!.y) }]));
    const free = await layoutCanvas({ ...model, positions });
    const freeBox = absolute(free.nodes);
    for (const [id, b] of autoBox) {
      const f = freeBox.get(id)!;
      expect(Math.abs(f.x - b.x) + Math.abs(f.y - b.y) + Math.abs(f.w - b.w) + Math.abs(f.h - b.h), id).toBeLessThan(4);
    }
    expect(free.edges.map((e) => e.data?.route)).toEqual(auto.edges.map((e) => e.data?.route));
    expect(free.edges.some((e) => e.data?.floating)).toBe(false);

    const moved = await layoutCanvas({ ...model, positions: { ...positions, e: { x: positions.e.x + 300, y: positions.e.y } } });
    const floating = moved.edges.filter((e) => e.data?.floating).map((e) => `${e.source}-${e.target}`);
    expect(floating.sort()).toEqual(['d-e', 'e-b']);
  });
});

describe('switching the free layout off and on', () => {
  test('off keeps the positions in the code; on puts every node back, new ones get placed', async () => {
    const model = await parseOk('flowchart LR\n  a --> b\n%% merbutler-layout a=500,10 b=0,300\n');
    const snapshot = (): never => {
      throw new Error('no snapshot when positions are kept');
    };
    const off = toggleFreeLayout(model, snapshot);
    expect(isFreeLayout(off)).toBe(false);
    const code = serialize(off);
    expect(code).toContain('%% merbutler-layout off a=500,10 b=0,300\n');
    // Through the code (a reload, a link), it stays off with its positions.
    const reread = await parseOk(code);
    expect(reread.positionsOff).toBe(true);
    expect(isFreeLayout(reread)).toBe(false);
    // Mermaid's layout while off.
    expect(absolute((await layoutCanvas(reread)).nodes).get('a')!.x).toBeLessThan(absolute((await layoutCanvas(reread)).nodes).get('b')!.x);

    const added = { ...reread, nodes: [...reread.nodes, { ...reread.nodes[1], id: 'c', label: 'c' }], edges: [...reread.edges, { ...reread.edges[0], id: 'e9', source: 'b', target: 'c' }] };
    const on = toggleFreeLayout(added, snapshot);
    expect(isFreeLayout(on)).toBe(true);
    expect(serialize(on)).toContain('%% merbutler-layout a=500,10 b=0,300\n');
    const box = absolute((await layoutCanvas(on)).nodes);
    expect(box.get('a')).toMatchObject({ x: 500, y: 10 });
    expect(box.get('b')).toMatchObject({ x: 0, y: 300 });
    expect(box.get('c')!.x).toBeGreaterThan(box.get('b')!.x);
  });

  test('the first time, the positions are where Mermaid put everything', async () => {
    const model = await parseOk('flowchart LR\n  a --> b\n');
    const on = toggleFreeLayout(model, () => ({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }));
    expect(on.positions).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
  });
});
