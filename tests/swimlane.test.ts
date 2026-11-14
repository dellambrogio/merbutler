import { describe, expect, test } from 'vitest';
import type { CanvasNode, SubgraphNode } from '../src/layout';
import { layoutCanvas } from '../src/layoutEngine';
import { addSubgraph, lanesOf, type FlowModel } from '../src/model';
import { parse } from '../src/parse';
import { serialize } from '../src/serialize';

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

const SUPPORT = `swimlane-beta LR
  subgraph Customer
    request[Request service]
    receive[Receive update]
  end
  subgraph Support
    triage[Triage request]
    answer[Send answer]
  end
  subgraph Engineering
    investigate[Investigate issue]
    fix[Prepare fix]
  end
  request --> triage
  triage -->|Known issue| answer
  triage -->|Needs code change| investigate
  investigate --> fix --> answer
  answer --> receive
`;

describe('swimlanes', () => {
  test('parse as a swimlane model, with the lanes in order', async () => {
    const model = await parseOk(SUPPORT);
    expect(model.kind).toBe('swimlane');
    expect(model.direction).toBe('LR');
    expect(lanesOf(model).map((l) => l.id)).toEqual(['Customer', 'Support', 'Engineering']);
    expect(model.nodes.find((n) => n.id === 'fix')?.parent).toBe('Engineering');
  });

  test('a canvas edit writes swimlane-beta, and reads back the same', async () => {
    const model = await parseOk(SUPPORT);
    const text = serialize(model);
    expect(text.split('\n')[0]).toBe('swimlane-beta LR');
    const again = await parseOk(text);
    expect(again).toEqual(model);
    expect(serialize(again)).toBe(text);
  });

  test('flowcharts stay flowcharts', async () => {
    const model = await parseOk('flowchart LR\n  subgraph A\n    a\n  end\n');
    expect(model.kind).toBeUndefined();
    expect(lanesOf(model)).toEqual([]);
    expect(serialize(model).startsWith('flowchart LR')).toBe(true);
  });

  test('a new lane goes after the others', async () => {
    const model = addSubgraph(await parseOk(SUPPORT), 'Billing', null);
    const again = await parseOk(serialize(model));
    expect(lanesOf(again).map((l) => l.label)).toEqual(['Customer', 'Support', 'Engineering', 'Billing']);
  });

  test.each([
    ['LR', 'y'],
    ['TB', 'x'],
  ] as const)('%s: lanes are bands in order across the %s axis, each holding its nodes', async (direction, axis) => {
    const model = await parseOk(SUPPORT.replace('swimlane-beta LR', `swimlane-beta ${direction}`));
    const { nodes } = await layoutCanvas(model);
    const boxes = absolute(nodes);
    const size = axis === 'y' ? 'h' : 'w';
    const lanes = lanesOf(model).map((l) => boxes.get(l.id)!);
    for (let i = 1; i < lanes.length; i++) {
      // Neighbouring lanes touch and do not overlap.
      expect(lanes[i][axis]).toBeCloseTo(lanes[i - 1][axis] + lanes[i - 1][size], 3);
    }
    // All lanes span the same width (rows) or height (columns).
    const other = axis === 'y' ? 'w' : 'h';
    expect(new Set(lanes.map((l) => Math.round(l[other]))).size).toBe(1);
    for (const node of model.nodes) {
      const lane = boxes.get(node.parent!)!;
      const box = boxes.get(node.id)!;
      expect(box.x >= lane.x && box.x + box.w <= lane.x + lane.w && box.y >= lane.y && box.y + box.h <= lane.y + lane.h, node.id).toBe(true);
    }
    const laneNode = nodes.find((n) => n.id === 'Support') as SubgraphNode;
    expect(laneNode.data.lane).toEqual({ rows: direction === 'LR', index: 1 });
  });

  test('an empty lane keeps a band', async () => {
    const model = await parseOk('swimlane-beta LR\n  subgraph A\n    a\n  end\n  subgraph B\n  end\n  subgraph C\n    c\n  end\n  a --> c\n');
    const boxes = absolute((await layoutCanvas(model)).nodes);
    const [a, b, c] = ['A', 'B', 'C'].map((id) => boxes.get(id)!);
    expect(b.h).toBeGreaterThan(20);
    expect(a.y < b.y && b.y < c.y).toBe(true);
  });
});
