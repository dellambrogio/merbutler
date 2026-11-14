import { describe, expect, test } from 'vitest';
import { layoutModel, type CanvasNode } from '../src/canvas/layout';
import { layoutCanvas } from '../src/canvas/layoutEngine';
import { diagramLayout, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

/** Absolute boxes by id (React Flow child positions are relative to the parent). */
function absolute(nodes: CanvasNode[]): Map<string, { x: number; y: number; w: number; h: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = (n: CanvasNode): { x: number; y: number } => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const p = parent ? pos(parent) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  return new Map(nodes.map((n) => [n.id, { ...pos(n), w: n.width ?? 0, h: n.height ?? 0 }]));
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout engine', () => {
  test.each([
    ['flowchart LR\n  a', 'elk'],
    ['---\nconfig:\n  layout: dagre\n---\nflowchart LR\n  a', 'dagre'],
    ['---\nconfig:\n  layout: elk\n---\nflowchart LR\n  a', 'elk'],
    ['%%{init: {"layout": "dagre"}}%%\nflowchart LR\n  a', 'dagre'],
  ])('%j uses %s', async (text, engine) => {
    expect(diagramLayout(await parseOk(text))).toBe(engine);
  });

  test('layout: dagre gives the dagre layout', async () => {
    const model = await parseOk('---\nconfig:\n  layout: dagre\n---\nflowchart LR\n  a --> b --> c\n');
    expect(await layoutCanvas(model)).toEqual(layoutModel(model));
  });

  test('ELK: nodes in the flow direction, inside their subgraphs, without overlaps', async () => {
    const model = await parseOk(
      'flowchart LR\n  start --> a1\n  subgraph one [One]\n    a1 --> a2\n  end\n  subgraph two [Two]\n    b1 --> b2\n  end\n  a2 --> b1\n  b2 -->|done| finish\n',
    );
    const { nodes, edges } = await layoutCanvas(model);
    const box = absolute(nodes);
    expect([...box.keys()].sort()).toEqual(['a1', 'a2', 'b1', 'b2', 'finish', 'one', 'start', 'two']);
    expect(edges).toHaveLength(5);
    // Left to right.
    expect(box.get('start')!.x).toBeLessThan(box.get('a1')!.x);
    expect(box.get('a2')!.x).toBeLessThan(box.get('b1')!.x);
    // Children inside their subgraph, below its title.
    for (const [child, parent] of [['a1', 'one'], ['a2', 'one'], ['b1', 'two'], ['b2', 'two']]) {
      const c = box.get(child)!;
      const p = box.get(parent)!;
      expect(c.x).toBeGreaterThanOrEqual(p.x);
      expect(c.x + c.w).toBeLessThanOrEqual(p.x + p.w);
      expect(c.y).toBeGreaterThanOrEqual(p.y + 20);
      expect(c.y + c.h).toBeLessThanOrEqual(p.y + p.h);
    }
    const top = ['start', 'one', 'two', 'finish'].map((id) => box.get(id)!);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) expect(overlap(top[i], top[j])).toBe(false);
  });

  test('ELK: an isolated subgraph uses its own direction', async () => {
    const model = await parseOk('flowchart LR\n  x --> s\n  subgraph s\n    direction TB\n    p --> q\n  end\n');
    const box = absolute((await layoutCanvas(model)).nodes);
    expect(box.get('q')!.y).toBeGreaterThan(box.get('p')!.y + box.get('p')!.h - 1);
    expect(Math.abs(box.get('q')!.x - box.get('p')!.x)).toBeLessThan(5);
  });

  test('ELK: an edge from inside a subgraph to the subgraph itself does not break the layout', async () => {
    const model = await parseOk('flowchart LR\n  subgraph s\n    a\n  end\n  a --> s\n  b --> s\n');
    const { nodes, edges } = await layoutCanvas(model);
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 's']);
    expect(edges).toHaveLength(2);
  });

  test('ELK: collapsed subgraphs are one box', async () => {
    const model = await parseOk('flowchart LR\n  x --> a1\n  subgraph one\n    a1 --> a2\n  end\n  one@{ view: collapsed }\n');
    const { nodes, edges } = await layoutCanvas(model);
    expect(nodes.map((n) => n.id).sort()).toEqual(['one', 'x']);
    expect(edges.map((e) => [e.source, e.target])).toEqual([['x', 'one']]);
  });
});

describe('ELK edge routes', () => {
  test('start and end on the node borders, in absolute coordinates, also inside subgraphs', async () => {
    const model = await parseOk('flowchart TB\n  a --> s1\n  subgraph s\n    s1 -->|go| s2\n  end\n  s2 --> b\n');
    const { nodes, edges } = await layoutCanvas(model);
    const box = absolute(nodes);
    const near = (v: number, lo: number, hi: number): boolean => v >= lo - 1.5 && v <= hi + 1.5;
    for (const e of edges) {
      const route = e.data?.route;
      expect(route, e.id).toBeDefined();
      const [first, last] = [route!.points[0], route!.points.at(-1)!];
      for (const [p, id] of [[first, e.source], [last, e.target]] as const) {
        const b = box.get(id)!;
        expect(near(p.x, b.x, b.x + b.w) && near(p.y, b.y, b.y + b.h), `${e.id} ${id}`).toBe(true);
      }
    }
    // The label sits where ELK left room for it.
    expect(edges.find((e) => e.data?.label === 'go')?.data?.route?.label).toBeDefined();
  });

  test('dagre gives no routes', async () => {
    const model = await parseOk('---\nconfig:\n  layout: dagre\n---\nflowchart TB\n  a --> b\n');
    expect((await layoutCanvas(model)).edges[0].data?.route).toBeUndefined();
  });
});
