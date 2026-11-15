import { describe, expect, test } from 'vitest';
import { ALIGN_CLASS, alignGroups, withoutAlignGroups } from '../src/core/alignGroups';
import type { FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import type { Point } from '../src/core/positions';
import { serialize } from '../src/core/serialize';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

const centers = (entries: Record<string, [number, number]>): Map<string, Point> => new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));

describe('code from a free layout', () => {
  test('a row and a column become invisible subgraphs with a direction', async () => {
    const model = await parseOk('flowchart TB\n  a --> b\n  a --> c\n  b --> d\n  d --> e\n');
    // a b c in a row; d, e in a column under b.
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 5], c: [400, -8], d: [205, 150], e: [195, 300] }));
    const groups = next.subgraphs.filter((s) => s.classes?.includes(ALIGN_CLASS));
    expect(groups.map((g) => [g.id, g.direction, next.nodes.filter((n) => n.parent === g.id).map((n) => n.id)])).toEqual([
      ['row1', 'LR', ['a', 'b', 'c']],
      ['col1', 'TB', ['d', 'e']],
    ]);
    expect(next.classDefs).toEqual([{ name: ALIGN_CLASS, styles: ['fill:none', 'stroke:none', 'color:transparent'] }]);
    const code = serialize(next);
    expect(code).toContain('subgraph row1\n    direction LR\n    a\n    b\n    c\n  end');
    expect(code).toContain(`classDef ${ALIGN_CLASS} fill:none,stroke:none,color:transparent`);
    expect(await parseOk(code)).toEqual(next);
  });

  test('making it again replaces the groups, and nothing lined up leaves no group or classDef', async () => {
    const model = await parseOk('flowchart TB\n  a --> b\n  b --> c\n');
    const first = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [0, 200] }));
    expect(first.subgraphs.map((s) => s.id)).toEqual(['row1']);
    const again = alignGroups(first, centers({ a: [0, 0], b: [200, 0], c: [0, 200] }));
    expect(again.subgraphs.map((s) => s.id)).toEqual(['row1']);
    const none = alignGroups(first, centers({ a: [0, 0], b: [200, 100], c: [100, 200] }));
    expect(none.subgraphs).toEqual([]);
    expect(none.classDefs).toBeUndefined();
    expect(withoutAlignGroups(first).nodes.every((n) => n.parent === null)).toBe(true);
  });

  test('a scope that is one line gets the direction instead of a group', async () => {
    const model = await parseOk('flowchart TB\n  subgraph s\n    a\n    b\n  end\n  s --> c\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [150, 0], s: [75, 0], c: [75, 200] }));
    expect(next.subgraphs.map((s) => [s.id, s.direction])).toEqual([['s', 'LR']]);
    expect(next.direction).toBe('TB');
  });

  test('state and use case diagrams are left as they are', async () => {
    const model = await parseOk('stateDiagram-v2\n  a --> b\n');
    expect(alignGroups(model, centers({ a: [0, 0], b: [100, 0] }))).toBe(model);
  });
});

describe('code from a free layout: lines', () => {
  test('centers within 20 px are one line, further apart they are not', async () => {
    const model = await parseOk('flowchart TB\n  a\n  b\n  c\n');
    const near = alignGroups(model, centers({ a: [0, 0], b: [200, 20], c: [400, 500] }));
    expect(near.nodes.filter((n) => n.parent === 'row1').map((n) => n.id)).toEqual(['a', 'b']);
    const far = alignGroups(model, centers({ a: [0, 0], b: [200, 21], c: [400, 500] }));
    expect(far.subgraphs).toEqual([]);
  });

  test('a line is measured from its first element, so a slow drift does not chain', async () => {
    const model = await parseOk('flowchart TB\n  a\n  b\n  c\n  d\n');
    // Each step is 15 px: a, b in one line, c, d in the next.
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 15], c: [400, 30], d: [600, 45] }));
    expect(next.subgraphs.map((s) => [s.id, next.nodes.filter((n) => n.parent === s.id).map((n) => n.id)])).toEqual([
      ['row1', ['a', 'b']],
      ['row2', ['c', 'd']],
    ]);
  });

  test('the longest line wins; a node is in one group at most', async () => {
    const model = await parseOk('flowchart TB\n  a\n  b\n  c\n  d\n  e\n');
    // Column a, d, e is longer than row a, b; the row keeps b, c.
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [0, 200], e: [0, 400] }));
    const members = (id: string): string[] => next.nodes.filter((n) => n.parent === id).map((n) => n.id);
    expect(next.subgraphs.map((s) => s.id).sort()).toEqual(['col1', 'row1']);
    const all = [...members('row1'), ...members('col1')];
    expect(new Set(all).size).toBe(all.length);
    expect(members('row1').length + members('col1').length).toBe(5);
  });

  test('a line left with one element after the others are taken makes no group', async () => {
    const model = await parseOk('flowchart TB\n  a\n  b\n  c\n  d\n');
    // Row a, b, c; column c, d would only keep d.
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [400, 300] }));
    expect(next.subgraphs.map((s) => s.id)).toEqual(['row1']);
    expect(next.nodes.find((n) => n.id === 'd')!.parent).toBeNull();
  });

  test('elements without a center are left out', async () => {
    const model = await parseOk('flowchart TB\n  a\n  b\n  c\n  d\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], d: [100, 400] }));
    const parents = Object.fromEntries(next.nodes.map((n) => [n.id, n.parent]));
    expect(parents).toEqual({ a: 'row1', b: 'row1', c: null, d: null });
  });

  test('members are written in reading order along their line', async () => {
    const model = await parseOk('flowchart TB\n  c\n  b\n  a\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0], x: [200, 300] }));
    expect(serialize(next)).toContain('subgraph row1\n    direction LR\n    a\n    b\n    c\n  end');
    const col = alignGroups(model, centers({ c: [0, 400], b: [0, 200], a: [0, 0], x: [300, 200] }));
    expect(serialize(col)).toContain('subgraph col1\n    direction TB\n    a\n    b\n    c\n  end');
  });
});

describe('code from a free layout: directions', () => {
  test.each([
    ['TB', 'LR', 'TB'],
    ['LR', 'LR', 'TB'],
    ['RL', 'RL', 'TB'],
    ['BT', 'LR', 'BT'],
  ] as const)('in a %s diagram a row is %s and a column is %s', async (dir, row, col) => {
    const model = await parseOk(`flowchart ${dir}\n  a\n  b\n  c\n  d\n  e\n`);
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 600], d: [800, 300], e: [800, 600 + 300] }));
    expect(Object.fromEntries(next.subgraphs.map((s) => [s.id, s.direction]))).toEqual({ row1: row, col1: col });
  });

  test('a whole diagram in one row turns the diagram, not a group', async () => {
    const model = await parseOk('flowchart TB\n  a --> b --> c\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [400, 0] }));
    expect(next.subgraphs).toEqual([]);
    expect(next.direction).toBe('LR');
    expect(next.classDefs).toBeUndefined();
  });

  test('a subgraph that is one column keeps a BT direction it already has', async () => {
    const model = await parseOk('flowchart LR\n  subgraph s\n    direction BT\n    a\n    b\n  end\n  c\n');
    const next = alignGroups(model, centers({ a: [0, 300], b: [0, 0], s: [0, 150], c: [400, 700] }));
    expect(next.subgraphs.find((s) => s.id === 's')!.direction).toBe('BT');
  });
});

describe('code from a free layout: subgraphs', () => {
  test('groups are made inside each subgraph, and a subgraph can be a member', async () => {
    const model = await parseOk('flowchart TB\n  subgraph s\n    a\n    b\n    c\n  end\n  x\n  y\n');
    const next = alignGroups(
      model,
      // In s: a, b in a row, c below. At the top: s, x, y in a row.
      centers({ a: [0, 0], b: [150, 0], c: [75, 200], s: [75, 100], x: [400, 100], y: [600, 100] }),
    );
    const parentOf = (id: string): string | null => [...next.nodes, ...next.subgraphs].find((e) => e.id === id)!.parent;
    expect(parentOf('a')).toBe(parentOf('b'));
    expect(next.subgraphs.find((g) => g.id === parentOf('a'))!.parent).toBe('s');
    expect(parentOf('c')).toBe('s');
    // s, x, y are the whole top level: the diagram turns.
    expect(next.direction).toBe('LR');
    expect(parentOf('s')).toBeNull();
  });

  test('nothing is grouped inside a collapsed subgraph', async () => {
    const model = await parseOk('flowchart TB\n  subgraph s\n    a\n    b\n    c\n  end\n  s@{ view: collapsed }\n  x\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [150, 0], c: [75, 300], s: [0, 0], x: [500, 500] }));
    expect(next.nodes.filter((n) => ['a', 'b', 'c'].includes(n.id)).every((n) => n.parent === 's')).toBe(true);
  });

  test('group ids do not take ids already in use', async () => {
    const model = await parseOk('flowchart TB\n  row1\n  b\n  c\n');
    const next = alignGroups(model, centers({ row1: [0, 0], b: [200, 0], c: [0, 500] }));
    expect(next.subgraphs.map((s) => s.id)).toEqual(['row2']);
    expect(next.nodes.find((n) => n.id === 'row1')!.parent).toBe('row2');
  });

  test('taking groups out puts nested contents back in the right parent and drops their positions', async () => {
    const model = await parseOk('flowchart TB\n  subgraph s\n    a\n    b\n    c\n  end\n  x\n');
    const grouped = alignGroups({ ...model, positions: { a: { x: 0, y: 0 } } }, centers({ a: [0, 0], b: [150, 0], c: [75, 300], s: [75, 150], x: [600, 900] }));
    const group = grouped.subgraphs.find((g) => g.classes?.includes(ALIGN_CLASS))!;
    const back = withoutAlignGroups({ ...grouped, positions: { ...grouped.positions, [group.id]: { x: 1, y: 1 } } });
    expect(back.nodes.map((n) => [n.id, n.parent]).sort()).toEqual([['a', 's'], ['b', 's'], ['c', 's'], ['x', null]]);
    expect(back.subgraphs.map((s) => s.id)).toEqual(['s']);
    expect(back.positions).toEqual({ a: { x: 0, y: 0 } });
  });

  test('a subgraph the user made is never taken out', async () => {
    const model = await parseOk('flowchart TB\n  subgraph mine\n    a\n    b\n  end\n  c\n');
    const next = alignGroups(model, centers({ a: [0, 0], b: [0, 600], mine: [0, 300], c: [400, 1000] }));
    expect(next.subgraphs.find((s) => s.id === 'mine')).toBeDefined();
    expect(withoutAlignGroups(next).subgraphs.map((s) => s.id)).toEqual(['mine']);
  });
});

describe('code from a free layout: the code', () => {
  test('the positions comment stays, and the code reads back the same', async () => {
    const code = 'flowchart TB\n  a --> b\n  a --> c\n  c --> d\n%% merbutler-layout a=0,0 b=200,0 c=0,200 d=200,200\n';
    const model = await parseOk(code);
    const next = alignGroups(model, centers({ a: [40, 20], b: [240, 20], c: [40, 220], d: [240, 220] }));
    const out = serialize(next);
    expect(out).toMatch(/%% merbutler-layout a=0,0 b=200,0 c=0,200 d=200,200\n$/);
    expect(await parseOk(out)).toEqual(next);
  });

  test('a second run on the same drawing gives the same code', async () => {
    const model = await parseOk('flowchart TB\n  a --> b\n  b --> c\n  c --> d\n  d --> e\n');
    const at = centers({ a: [0, 0], b: [200, 0], c: [400, 0], d: [400, 200], e: [400, 400] });
    const once = serialize(alignGroups(model, at));
    const twice = serialize(alignGroups(await parseOk(once), at));
    expect(twice).toBe(once);
  });

  test('an existing layoutAlign classDef is kept as written', async () => {
    const model = await parseOk(`flowchart TB\n  a\n  b\n  c\n  classDef ${ALIGN_CLASS} fill:#eee\n`);
    const next = alignGroups(model, centers({ a: [0, 0], b: [200, 0], c: [0, 400] }));
    expect(next.classDefs).toEqual([{ name: ALIGN_CLASS, styles: ['fill:#eee'] }]);
  });

  test('swimlane diagrams are left as they are', async () => {
    const model = await parseOk('swimlane-beta TB\n  subgraph l1\n    a\n    b\n  end\n');
    expect(alignGroups(model, centers({ a: [0, 0], b: [200, 0], l1: [100, 0] }))).toBe(model);
  });
});
