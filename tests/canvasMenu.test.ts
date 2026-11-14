import { describe, expect, test } from 'vitest';
import type { MenuItem } from '../src/canvas/ContextMenu';
import { menuFor, type MenuActions, type MenuTarget } from '../src/canvas/canvasMenu';
import { duplicateNode, reverseEdge, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

/** Runs the menu with recording actions. */
function open(model: FlowModel, target: MenuTarget, readOnly = false) {
  const log: { changed?: FlowModel; select?: string; renamed?: string; edgeLabel?: string } = {};
  const actions: MenuActions = {
    change: (next, select) => Object.assign(log, { changed: next, select }),
    rename: (id) => (log.renamed = id),
    editEdgeLabel: (id) => (log.edgeLabel = id),
    fit: () => {},
    relayout: () => {},
  };
  const menu = menuFor(model, target, readOnly, actions);
  /** Finds an entry by its path of labels and runs it. */
  const run = (...path: string[]): void => {
    let items: MenuItem[] = menu!.items;
    for (const [i, label] of path.entries()) {
      const item = items.find((x) => x.kind !== 'separator' && x.label === label);
      if (!item || item.kind === 'separator') throw new Error(`no entry ${path.join(' > ')}`);
      if (i === path.length - 1) {
        if (item.kind !== 'action') throw new Error('not an action');
        if (item.disabled) throw new Error(`${label} is disabled`);
        item.onSelect();
      } else if (item.kind === 'submenu') items = item.items;
    }
  };
  const labels = (items: MenuItem[] = menu?.items ?? []): string[] => items.flatMap((x) => (x.kind === 'separator' ? [] : [x.label]));
  const sub = (label: string): MenuItem[] => {
    const item = menu!.items.find((x) => x.kind === 'submenu' && x.label === label);
    return item?.kind === 'submenu' ? item.items : [];
  };
  return { menu, log, run, labels, sub };
}

describe('canvas context menu', () => {
  test('flowchart node: entries, connected node, duplicate, shape, move, delete', async () => {
    const model = await parseOk('flowchart LR\n  a[A] --> b[B]\n  subgraph s [Group]\n    c\n  end\n');
    const m = open(model, { kind: 'node', id: 'a' });
    expect(m.menu?.title).toBe('Node A (a)');
    expect(m.labels()).toEqual(['Rename', 'Add connected node', 'Duplicate', 'Shape', 'Move to subgraph', 'Delete']);

    m.run('Rename');
    expect(m.log.renamed).toBe('a');

    m.run('Add connected node');
    expect(serialize(m.log.changed!)).toContain('a --> n1');
    expect(m.log.select).toBe('n1');

    m.run('Duplicate');
    expect(m.log.changed!.nodes.map((n) => n.id)).toEqual(['a', 'n1', 'b', 'c']);

    m.run('Shape', 'Diamond');
    expect(m.log.changed!.nodes.find((n) => n.id === 'a')?.shape).toBe('diamond');

    m.run('Move to subgraph', 'Group (s)');
    expect(m.log.changed!.nodes.find((n) => n.id === 'a')?.parent).toBe('s');

    m.run('Delete');
    expect(m.log.changed!.nodes.some((n) => n.id === 'a')).toBe(false);
    expect(m.log.changed!.edges).toEqual([]);
  });

  test('flowchart edge: reverse, stroke, markers, label', async () => {
    const model = await parseOk('flowchart LR\n  a --> b\n');
    const m = open(model, { kind: 'edge', id: 'e1' });
    m.run('Reverse direction');
    expect(serialize(m.log.changed!)).toContain('b --> a');
    m.run('Stroke', 'Dotted');
    expect(serialize(m.log.changed!)).toContain('a -.-> b');
    m.run('End marker', 'Circle');
    expect(serialize(m.log.changed!)).toContain('a --o b');
    m.run('Marker at both ends');
    expect(serialize(m.log.changed!)).toContain('a <--> b');
    m.run('Edit label');
    expect(m.log.edgeLabel).toBe('e1');
  });

  test('subgraphs and lanes', async () => {
    const flow = await parseOk('flowchart LR\n  subgraph s [Group]\n    a\n  end\n');
    const m = open(flow, { kind: 'subgraph', id: 's' });
    expect(m.labels()).toContain('Collapse');
    m.run('Collapse');
    expect(serialize(m.log.changed!)).toContain('s@{ view: collapsed }');
    m.run('Add node inside');
    expect(m.log.changed!.nodes.find((n) => n.id === 'n1')?.parent).toBe('s');

    const swim = await parseOk('swimlane-beta LR\n  subgraph A\n    a\n  end\n');
    const lane = open(swim, { kind: 'subgraph', id: 'A' });
    expect(lane.menu?.title).toBe('Lane A');
    expect(lane.labels()).not.toContain('Collapse');
    expect(open(swim, { kind: 'pane' }).labels()).toContain('Add lane');
  });

  test('state diagrams: next state, type, note, [*]', async () => {
    const model = await parseOk('stateDiagram-v2\n  [*] --> A\n  A --> B\n  state C {\n    x\n  }\n');
    const m = open(model, { kind: 'node', id: 'A' });
    expect(m.labels()).toEqual(['Rename', 'Add next state', 'Type', 'Add note', 'Move into', 'Delete']);
    m.run('Type', 'Choice <<choice>>');
    expect(serialize(m.log.changed!)).toContain('state A <<choice>>');
    m.run('Add note');
    expect(serialize(m.log.changed!)).toContain('note right of A');
    m.run('Move into', 'C');
    expect(m.log.changed!.nodes.find((n) => n.id === 'A')?.parent).toBe('C');

    const start = open(model, { kind: 'node', id: 'root_start' });
    expect(start.menu?.title).toBe('[*] start');
    expect(start.labels()).toEqual(['Add next state', 'Delete']);

    // A transition into [*] start cannot be reversed.
    const fromStart = model.edges.find((e) => e.source === 'root_start')!;
    const edge = open(model, { kind: 'edge', id: fromStart.id });
    const reverse = edge.menu!.items.find((x) => x.kind === 'action' && x.label === 'Reverse direction');
    expect(reverse?.kind === 'action' && reverse.disabled).toBe(true);
    const pane = open(model, { kind: 'pane' });
    const startItem = pane.menu!.items.find((x) => x.kind === 'action' && x.label === 'Add [*] start');
    expect(startItem?.kind === 'action' && startItem.disabled).toBe(true);
  });

  test('use case diagrams: relations offered by kind of ends', async () => {
    const model = await parseOk('usecase-beta\nactor A("Alice")\nU("Use")\nV("Other")\nA --> U\nU --> V\n');
    expect(open(model, { kind: 'edge', id: 'e1' }).labels(open(model, { kind: 'edge', id: 'e1' }).sub('Relation'))).not.toContain('Include ..>:include');
    const m = open(model, { kind: 'edge', id: 'e2' });
    m.run('Relation', 'Include ..>:include');
    expect(serialize(m.log.changed!)).toContain('U ..>:include V');
    const actor = open(model, { kind: 'node', id: 'A' });
    actor.run('Add use case for this actor');
    expect(serialize(actor.log.changed!)).toContain('A --> n1');
  });

  test('read-only: only the view entries, on the canvas only', async () => {
    const model = await parseOk('flowchart LR\n  a --> b\n');
    expect(open(model, { kind: 'node', id: 'a' }, true).menu).toBeNull();
    expect(open(model, { kind: 'pane' }, true).labels()).toEqual(['Fit view', 'Re-layout']);
  });

  test('reverse and duplicate', async () => {
    const model = await parseOk('flowchart LR\n  a[Same] --> b\n  click a "https://x"\n');
    expect(reverseEdge(model, 'e1').edges[0]).toMatchObject({ source: 'b', target: 'a' });
    const copy = duplicateNode(model, 'b');
    // A label that is the id gets the new id; click and edges are not copied.
    expect(copy.model.nodes.find((n) => n.id === copy.id)).toMatchObject({ label: copy.id });
    expect(duplicateNode(model, 'a').model.nodes.find((n) => n.id === 'n1')?.click).toBeUndefined();
  });
});
