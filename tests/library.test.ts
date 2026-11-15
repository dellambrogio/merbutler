import { describe, expect, test } from 'vitest';
import {
  allFolders,
  createDiagram,
  createFolder,
  deleteDiagram,
  deleteFolder,
  diagramKind,
  duplicateDiagram,
  moveDiagram,
  moveFolder,
  renameFolder,
  suggestName,
  updateDiagram,
  type SavedDiagram,
} from '../src/core/library';

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

  test('names are unique per folder', () => {
    let list = createDiagram([], 'Plan', flow, 1).list;
    const inWork = createDiagram(list, 'Plan', flow, 2, 'Work');
    expect(inWork.diagram).toMatchObject({ name: 'Plan', folder: 'Work' });
    list = inWork.list;
    expect(suggestName(list, flow, 'Plan', 'Work')).toBe('Plan 2');
    const copy = duplicateDiagram(list, inWork.diagram.id, 3)!;
    expect(copy.diagram).toMatchObject({ name: 'Plan copy', folder: 'Work' });
    // Moving into a folder where the name is taken adds a number, and keeps the change time.
    const top = list.find((d) => !d.folder)!;
    const moved = moveDiagram(list, top.id, 'Work').find((d) => d.id === top.id)!;
    expect(moved).toMatchObject({ name: 'Plan 2', folder: 'Work', updated: 1 });
    expect(moveDiagram(moveDiagram(list, top.id, 'Work'), top.id, '').find((d) => d.id === top.id)).not.toHaveProperty('folder');
  });

  test('folders: create, rename, move, delete', () => {
    const a = createDiagram([], 'Spec', flow, 1, 'Work/Specs');
    let lib = { diagrams: a.list, folders: [] as string[] };
    // Folders that hold a diagram exist without being stored.
    expect(allFolders(lib.diagrams, lib.folders)).toEqual(['Work', 'Work/Specs']);
    const made = createFolder(lib, 'Work', 'Specs');
    expect(made.path).toBe('Work/Specs 2');
    lib = made;
    const renamed = renameFolder(lib, 'Work', ' Job/2026 ');
    expect(renamed.path).toBe('Job-2026');
    expect(renamed.diagrams[0].folder).toBe('Job-2026/Specs');
    expect(renamed.folders).toEqual(['Job-2026', 'Job-2026/Specs', 'Job-2026/Specs 2']);
    lib = renamed;
    // Not into itself or a folder inside it.
    expect(moveFolder(lib, 'Job-2026', 'Job-2026/Specs')).toBeNull();
    const out = moveFolder(lib, 'Job-2026/Specs', '')!;
    expect(out.path).toBe('Specs');
    expect(out.diagrams[0].folder).toBe('Specs');
    expect(out.folders).toEqual(['Job-2026', 'Job-2026/Specs 2', 'Specs']);
    const gone = deleteFolder(out, 'Specs');
    expect(gone.diagrams).toEqual([]);
    expect(gone.folders).toEqual(['Job-2026', 'Job-2026/Specs 2']);
  });
});
