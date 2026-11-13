import { Position } from '@xyflow/react';
import { describe, expect, test } from 'vitest';
import { MARKER_IDS } from '../src/EdgeMarkers';
import { layoutModel, SUBGRAPH_PADDING, type CanvasNode, type ShapeNode } from '../src/layout';
import { addNode, addSubgraph, connect, type FlowModel } from '../src/model';

function shape(node: CanvasNode): ShapeNode {
  if (node.type !== 'shape') throw new Error(`${node.id} is not a shape node`);
  return node;
}

const model: FlowModel = {
  direction: 'LR',
  nodes: [
    { id: 'a', label: 'Start', shape: 'rect', markdown: false, parent: null },
    { id: 'b', label: 'Check', shape: 'diamond', markdown: false, parent: null },
    { id: 'c', label: 'End', shape: 'circle', markdown: false, parent: null },
  ],
  subgraphs: [],
  edges: [
    { id: 'e1', source: 'a', target: 'b', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
    { id: 'e2', source: 'b', target: 'c', label: 'ok', markdown: false, stroke: 'dotted', end: 'none', bothEnds: false },
    { id: 'e3', source: 'b', target: 'c', label: 'again', markdown: false, stroke: 'thick', end: 'arrow', bothEnds: false },
  ],
};

describe('layoutModel', () => {
  test('places nodes along the direction and keeps every edge (also parallel edges)', () => {
    const { nodes, edges } = layoutModel(model);
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.position.x]));
    expect(x.a).toBeLessThan(x.b);
    expect(x.b).toBeLessThan(x.c);
    expect(edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(shape(nodes[0]).data.sourcePosition).toBe(Position.Right);
    expect(shape(nodes[0]).data.targetPosition).toBe(Position.Left);
  });

  test('maps stroke and arrow to edge style', () => {
    const { edges } = layoutModel(model);
    expect(edges[0].markerEnd).toBeDefined();
    expect(edges[1].markerEnd).toBeUndefined();
    expect(edges[1].style?.strokeDasharray).toBe('5 5');
    expect(edges[2].style?.strokeWidth).toBeGreaterThan(edges[0].style?.strokeWidth as number);
  });

  test('maps circle, cross and both-ends markers', () => {
    const edges = (end: 'circle' | 'cross' | 'arrow', bothEnds: boolean) =>
      layoutModel({ ...model, edges: [{ ...model.edges[0], end, bothEnds }] }).edges[0];
    expect(edges('circle', false).markerEnd).toBe(MARKER_IDS.circle);
    expect(edges('circle', false).markerStart).toBeUndefined();
    expect(edges('cross', true).markerStart).toBe(MARKER_IDS.cross);
    expect(edges('cross', true).markerEnd).toBe(MARKER_IDS.cross);
    expect(edges('arrow', true).markerStart).toEqual(edges('arrow', true).markerEnd);
  });

  test('TB places nodes top to bottom', () => {
    const { nodes } = layoutModel({ ...model, direction: 'TB' });
    expect(nodes[0].position.y).toBeLessThan(nodes[2].position.y);
    expect(shape(nodes[0]).data.sourcePosition).toBe(Position.Bottom);
  });
});

describe('layoutModel with subgraphs', () => {
  // top-level x -> (s1: a, (s2: b)) and an empty subgraph s3.
  let m: FlowModel = { direction: 'TB', nodes: [], subgraphs: [], edges: [] };
  m = addSubgraph(m, 'Outer group');
  m = addSubgraph(m, 'Inner', 's1');
  m = addSubgraph(m, 'Empty');
  m = addNode(m, 'x');
  m = addNode(m, 'a', 'rect', 's1');
  m = addNode(m, 'b', 'circle', 's2');
  m = connect(connect(m, 'n1', 'n2'), 'n2', 'n3');

  const { nodes } = layoutModel(m);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /** Absolute position: add the positions of all parents. */
  const abs = (id: string): { x: number; y: number; w: number; h: number } => {
    const n = byId.get(id) as CanvasNode;
    const p = n.parentId ? abs(n.parentId) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y, w: n.width as number, h: n.height as number };
  };
  const inside = (child: string, parent: string): boolean => {
    const c = abs(child);
    const p = abs(parent);
    return c.x >= p.x && c.y >= p.y + SUBGRAPH_PADDING.top - 1 && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h;
  };

  test('sets parentId and lists each parent before its children', () => {
    expect(byId.get('n2')?.parentId).toBe('s1');
    expect(byId.get('s2')?.parentId).toBe('s1');
    expect(byId.get('n3')?.parentId).toBe('s2');
    expect(byId.get('n1')?.parentId).toBeUndefined();
    const index = (id: string): number => nodes.findIndex((n) => n.id === id);
    expect(index('s1')).toBeLessThan(index('n2'));
    expect(index('s1')).toBeLessThan(index('s2'));
    expect(index('s2')).toBeLessThan(index('n3'));
  });

  test('children are inside the subgraph box, below the title', () => {
    expect(inside('n2', 's1')).toBe(true);
    expect(inside('s2', 's1')).toBe(true);
    expect(inside('n3', 's2')).toBe(true);
    expect(inside('n1', 's1')).toBe(false);
  });

  test('an empty subgraph gets a visible box', () => {
    const box = abs('s3');
    expect(box.w).toBeGreaterThan(50);
    expect(box.h).toBeGreaterThan(30);
  });
});

describe('layoutModel with subgraph direction and subgraph edges', () => {
  const base: FlowModel = {
    direction: 'LR',
    nodes: [
      { id: 'a1', label: 'fetch', shape: 'rect', markdown: false, parent: 'ingest' },
      { id: 'a2', label: 'parse', shape: 'rect', markdown: false, parent: 'ingest' },
      { id: 'b1', label: 'db', shape: 'cylinder', markdown: false, parent: 'store' },
    ],
    subgraphs: [
      { id: 'ingest', label: 'Ingestion', markdown: false, parent: null, direction: 'TB' },
      { id: 'store', label: 'Storage', markdown: false, parent: null, direction: null },
    ],
    edges: [
      { id: 'e1', source: 'a1', target: 'a2', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
      { id: 'e2', source: 'ingest', target: 'store', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
    ],
  };
  const absolute = (nodes: CanvasNode[], id: string): { x: number; y: number; w: number; h: number } => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const n = byId.get(id) as CanvasNode;
    const p = n.parentId ? absolute(nodes, n.parentId) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y, w: n.width as number, h: n.height as number };
  };

  test('an isolated subgraph uses its own direction', () => {
    const { nodes } = layoutModel(base);
    const a1 = absolute(nodes, 'a1');
    const a2 = absolute(nodes, 'a2');
    expect(a2.y).toBeGreaterThan(a1.y + a1.h - 1); // TB inside
    expect(Math.abs(a1.x + a1.w / 2 - (a2.x + a2.w / 2))).toBeLessThan(1);
    expect(shape(nodes.find((n) => n.id === 'a1') as CanvasNode).data.sourcePosition).toBe(Position.Bottom);
    // The main flow is still LR: ingest is left of store.
    const ingest = absolute(nodes, 'ingest');
    const store = absolute(nodes, 'store');
    expect(ingest.x + ingest.w).toBeLessThan(store.x);
    // Children stay inside their subgraph box.
    for (const id of ['a1', 'a2']) {
      const c = absolute(nodes, id);
      expect(c.x).toBeGreaterThanOrEqual(ingest.x);
      expect(c.x + c.w).toBeLessThanOrEqual(ingest.x + ingest.w);
      expect(c.y).toBeGreaterThanOrEqual(ingest.y + SUBGRAPH_PADDING.top - 1);
      expect(c.y + c.h).toBeLessThanOrEqual(ingest.y + ingest.h);
    }
  });

  test('the direction is ignored when an edge crosses the subgraph border', () => {
    const crossing: FlowModel = {
      ...base,
      edges: [...base.edges, { id: 'e3', source: 'a2', target: 'b1', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false }],
    };
    const { nodes } = layoutModel(crossing);
    const a1 = absolute(nodes, 'a1');
    const a2 = absolute(nodes, 'a2');
    expect(a2.x).toBeGreaterThan(a1.x + a1.w - 1); // LR, the main direction
    expect(shape(nodes.find((n) => n.id === 'a1') as CanvasNode).data.sourcePosition).toBe(Position.Right);
  });

  test('edges to subgraphs connect to the subgraph box, with handles', () => {
    const { nodes, edges } = layoutModel(base);
    expect(edges.find((e) => e.id === 'e2')).toMatchObject({ source: 'ingest', target: 'store' });
    const ingest = nodes.find((n) => n.id === 'ingest');
    expect(ingest?.type).toBe('subgraph');
    expect(ingest?.data.sourcePosition).toBe(Position.Right);
  });

  test('an edge to a cluster subgraph (not isolated) does not break the layout', () => {
    const model: FlowModel = {
      ...base,
      edges: [
        ...base.edges,
        { id: 'e3', source: 'a2', target: 'b1', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
        { id: 'e4', source: 'store', target: 'ingest', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
      ],
    };
    const { nodes } = layoutModel(model);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x) && Number.isFinite(n.position.y)).toBe(true);
    }
  });

  test('nested subgraphs each use their own direction', () => {
    const model: FlowModel = {
      direction: 'LR',
      nodes: [
        { id: 'x', label: 'x', shape: 'rect', markdown: false, parent: 'outer' },
        { id: 'y', label: 'y', shape: 'rect', markdown: false, parent: 'outer' },
        { id: 'p', label: 'p', shape: 'rect', markdown: false, parent: 'inner' },
        { id: 'q', label: 'q', shape: 'rect', markdown: false, parent: 'inner' },
      ],
      subgraphs: [
        { id: 'outer', label: 'Outer', markdown: false, parent: null, direction: 'TB' },
        { id: 'inner', label: 'Inner', markdown: false, parent: 'outer', direction: 'LR' },
      ],
      edges: [
        { id: 'e1', source: 'x', target: 'y', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
        { id: 'e2', source: 'p', target: 'q', label: '', markdown: false, stroke: 'normal', end: 'arrow', bothEnds: false },
      ],
    };
    const { nodes } = layoutModel(model);
    const x = absolute(nodes, 'x');
    const y = absolute(nodes, 'y');
    const p = absolute(nodes, 'p');
    const q = absolute(nodes, 'q');
    expect(y.y).toBeGreaterThan(x.y); // outer: TB
    expect(q.x).toBeGreaterThan(p.x); // inner: LR
    expect(Math.abs(p.y - q.y)).toBeLessThan(1);
    const inner = absolute(nodes, 'inner');
    const outer = absolute(nodes, 'outer');
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w);
  });
});
