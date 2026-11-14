import { describe, expect, test } from 'vitest';
import { addLinkedNode, openSides, quickAddLink, NEW_NODE } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';
import { canTransition } from '../src/state/stateDiagram';

async function model(code: string) {
  const r = await parse(code);
  if (!r.ok) throw new Error(r.error);
  return r.model;
}

const edgesOf = (m: Awaited<ReturnType<typeof model>>): string[] => m.edges.map((e) => `${e.source}->${e.target}`);

describe('adding a node from a side of another', () => {
  test('open sides: no edge leaves (after) or arrives (before)', async () => {
    const m = await model('flowchart LR\n  A --> B\n  B --> C\n  D\n');
    expect(openSides(m, 'A')).toEqual({ after: false, before: true });
    expect(openSides(m, 'C')).toEqual({ after: true, before: false });
    expect(openSides(m, 'D')).toEqual({ after: true, before: true });
  });

  test('after, before and beside', async () => {
    const m = await model('flowchart LR\n  A --> B\n  B --> C\n');
    const after = addLinkedNode(m, 'C', 'after');
    expect(edgesOf(after.model)).toContain(`C->${after.id}`);
    const before = addLinkedNode(m, 'A', 'before');
    expect(edgesOf(before.model)).toContain(`${before.id}->A`);
    // Beside: shares the first predecessor; without one, the first successor.
    const beside = addLinkedNode(m, 'B', 'beside');
    expect(edgesOf(beside.model)).toContain(`A->${beside.id}`);
    expect(quickAddLink(m, 'A', 'beside')).toEqual({ source: NEW_NODE, target: 'B' });
    expect(quickAddLink(await model('flowchart LR\n  X\n'), 'X', 'beside')).toEqual({ source: 'X', target: NEW_NODE });
  });

  test('the new node goes into the same subgraph, and the code parses back the same', async () => {
    const m = await model('flowchart TB\n  subgraph S [Group]\n    A --> B\n  end\n');
    const added = addLinkedNode(m, 'B', 'after');
    expect(added.model.nodes.find((n) => n.id === added.id)?.parent).toBe('S');
    const again = await model(serialize(added.model));
    expect(again.nodes.find((n) => n.id === added.id)).toMatchObject({ label: 'New node', parent: 'S' });
    expect(edgesOf(again)).toContain(`B->${added.id}`);
  });

  test('state diagrams: the transition rules decide which sides are offered', async () => {
    const m = await model('stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]\n');
    const start = m.nodes.find((n) => n.state === 'start')!.id;
    const end = m.nodes.find((n) => n.state === 'end')!.id;
    const ok = (id: string, kind: 'after' | 'before') => {
      const l = quickAddLink(m, id, kind);
      return canTransition(m, l.source, l.target);
    };
    expect(ok(start, 'before')).toBe(false);
    expect(ok(end, 'after')).toBe(false);
    expect(ok(end, 'before')).toBe(true);
    const added = addLinkedNode(m, 'Idle', 'beside', 'New state', 'round');
    expect(edgesOf(added.model)).toContain(`${start}->${added.id}`);
    expect((await parse(serialize(added.model))).ok).toBe(true);
  });
});
