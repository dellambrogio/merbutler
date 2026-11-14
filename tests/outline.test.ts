import { describe, expect, test } from 'vitest';
import { MERMAID_EXAMPLES } from '../src/gallery/mermaidExamples';
import {
  addChild,
  addSibling,
  indent,
  itemAt,
  mindmapIcon,
  move,
  outdent,
  parseOutline,
  readKanbanNode,
  readMindmapNode,
  readTreemapNode,
  readTreeViewNode,
  remove,
  serializeOutline,
  setText,
  withMindmapIcon,
  writeKanbanNode,
  writeMindmapNode,
  writeTreemapNode,
  writeTreeViewNode,
  type Outline,
  type OutlineItem,
} from '../src/structured/outline';
import { parse } from '../src/core/parse';

const TREE_SECTIONS = ['mindmap', 'ishikawa-diagram', 'treeview', 'treemap', 'kanban-diagram', 'venn-diagram'];
const examples = MERMAID_EXAMPLES.filter((s) => TREE_SECTIONS.includes(s.id)).flatMap((s) => s.examples);

/** The tree as nested text, for comparing outlines. */
const shape = (items: OutlineItem[]): unknown => items.map((i) => [i.text, i.decorations, shape(i.children)]);

const ok = (o: Outline | null): Outline => {
  if (!o) throw new Error('no outline');
  return o;
};

describe('outlines', () => {
  test.each(examples.map((e) => [e.title, e.code]))('%s: written back, it is the same tree and Mermaid reads it', async (_t, code) => {
    const outline = ok(parseOutline(code));
    const written = serializeOutline(outline);
    const again = ok(parseOutline(written));
    expect(shape(again.items)).toEqual(shape(outline.items));
    expect(serializeOutline(again)).toBe(written);
    const result = await parse(written);
    expect(result.ok || result.preview !== undefined, result.ok ? '' : result.error).toBe(true);
  });

  test('head, tail and indentation are kept', () => {
    const code = '---\ntitle: x\n---\ntreemap-beta\n"A"\n    "B": 1\n\nclassDef warn fill:#f96;\n';
    const outline = ok(parseOutline(code));
    expect(outline.head).toBe('---\ntitle: x\n---\ntreemap-beta');
    expect(outline.tail).toBe('\nclassDef warn fill:#f96;');
    expect(outline.base).toBe('');
    expect(outline.unit).toBe('    ');
    expect(serializeOutline(outline)).toBe(code);
  });

  test('mindmap icons stay with their item', () => {
    const outline = ok(parseOutline('mindmap\n  root((A))\n    B\n    ::icon(fa fa-book)\n    C\n'));
    const b = itemAt(outline, [0, 0])!;
    expect(mindmapIcon(b)).toBe('fa fa-book');
    expect(withMindmapIcon(b, '')).toEqual([]);
    expect(itemAt(outline, [0, 1])!.text).toBe('C');
  });

  test('edits: add, indent, outdent, move, remove, rename', () => {
    let o = ok(parseOutline('mindmap\n  root\n    a\n    b\n'));
    let r = addSibling(o, [0, 1], 'c');
    o = r.outline;
    expect(r.path).toEqual([0, 2]);
    r = indent(o, [0, 2]);
    o = r.outline;
    expect(r.path).toEqual([0, 1, 0]);
    expect(serializeOutline(o)).toBe('mindmap\n  root\n    a\n    b\n      c\n');
    r = outdent(o, [0, 1, 0]);
    o = r.outline;
    expect(r.path).toEqual([0, 2]);
    r = move(o, [0, 2], -1);
    o = r.outline;
    expect(shape(o.items)).toEqual([['root', [], [['a', [], []], ['c', [], []], ['b', [], []]]]]);
    r = addChild(o, [0, 0], 'a1');
    o = r.outline;
    expect(r.path).toEqual([0, 0, 0]);
    o = setText(o, [0, 0, 0], 'A one');
    r = remove(o, [0, 1]);
    expect(serializeOutline(r.outline)).toBe('mindmap\n  root\n    a\n      A one\n    b\n');
  });

  test('typed fields', () => {
    expect(readMindmapNode('root((Summer Trip))')).toEqual({ id: 'root', label: 'Summer Trip', shape: 'Circle' });
    expect(readMindmapNode('reminder{{Sunscreen!}}')).toEqual({ id: 'reminder', label: 'Sunscreen!', shape: 'Hexagon' });
    expect(readMindmapNode('Plain text')).toEqual({ id: '', label: 'Plain text', shape: 'Default' });
    expect(readMindmapNode('b))Bang((')).toEqual({ id: 'b', label: 'Bang', shape: 'Bang' });
    expect(writeMindmapNode({ id: '', label: 'X', shape: 'Square' }, 'n3')).toBe('n3[X]');
    expect(readTreemapNode('"Rent": 1400')).toEqual({ label: 'Rent', value: '1400', rest: '' });
    expect(readTreemapNode('"Media":::warning')).toEqual({ label: 'Media', value: '', rest: ':::warning' });
    expect(writeTreemapNode({ label: 'Fuel', value: '150', rest: '' })).toBe('"Fuel": 150');
    expect(readTreeViewNode('App.tsx :::highlight icon(logos:react) ## main component')).toEqual({
      name: 'App.tsx',
      extra: ':::highlight icon(logos:react)',
      annotation: 'main component',
    });
    expect(readKanbanNode("blog[Write post]@{ priority: 'Low' }")).toEqual({ id: 'blog', label: 'Write post', meta: "@{ priority: 'Low' }" });
    expect(readKanbanNode('[Buy groceries]')).toEqual({ id: '', label: 'Buy groceries', meta: '' });
    expect(writeKanbanNode({ id: '', label: 'Two words', meta: '' })).toBe('[Two words]');
    expect(writeTreeViewNode({ name: 'index.js', extra: '', annotation: 'entry' })).toBe('index.js ## entry');
  });
});
