import { describe, expect, test } from 'vitest';
import { createDiagram, deleteDiagram, diagramKind, duplicateDiagram, suggestName, updateDiagram, type SavedDiagram } from '../src/core/library';

const flow = 'flowchart LR\n  a --> b\n';

describe('saved diagrams', () => {
  test('create, rename, change, duplicate, delete', () => {
    let list: SavedDiagram[] = [];
    const a = createDiagram(list, 'Plan', flow, 1);
    list = a.list;
    const b = createDiagram(list, 'Plan', 'sequenceDiagram\n  A->>B: hi\n', 2);
    list = b.list;
    // Names stay unique; the newest comes first.
    expect(list.map((d) => d.name)).toEqual(['Plan 2', 'Plan']);
    list = updateDiagram(list, a.diagram.id, { code: 'flowchart TB\n  x\n' }, 3);
    expect(list[0]).toMatchObject({ id: a.diagram.id, updated: 3, created: 1 });
    // Renaming to a taken name gets a number; an empty name is ignored.
    list = updateDiagram(list, a.diagram.id, { name: ' Plan 2 ' }, 4);
    expect(list.find((d) => d.id === a.diagram.id)?.name).toBe('Plan 3');
    expect(updateDiagram(list, a.diagram.id, { name: '  ' }, 5)).toEqual(list);
    const copy = duplicateDiagram(list, b.diagram.id, 6)!;
    expect(copy.diagram).toMatchObject({ name: 'Plan 2 copy', code: b.diagram.code });
    expect(duplicateDiagram(copy.list, copy.diagram.id, 7)!.diagram.name).toBe('Plan 2 copy 2');
    expect(deleteDiagram(copy.list, b.diagram.id).map((d) => d.id)).not.toContain(b.diagram.id);
  });

  test('names from the front matter title, and the diagram type', () => {
    expect(suggestName([], '---\ntitle: Checkout flow\n---\nflowchart LR\n  a\n')).toBe('Checkout flow');
    expect(suggestName(createDiagram([], 'Untitled', flow, 1).list, flow)).toBe('Untitled 2');
    expect(diagramKind('%% note\nsequenceDiagram\n  A->>B: hi\n')).toBe('Sequence diagram');
    expect(diagramKind(flow)).toBe('Flowchart');
    expect(diagramKind('nonsense')).toBeNull();
  });
});
