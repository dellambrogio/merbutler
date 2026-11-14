/**
 * Outlines: the diagram types whose body is a tree written by indentation (mindmap, ishikawa,
 * treeView, treemap). Reads the body into a tree of lines and writes it back, so the outline
 * editor can add, move, indent and rename items. The text of each line is kept as written;
 * typed fields (a mindmap shape, a treemap value, a tree view annotation) are read from it.
 */
import { HEADER_LINE } from './diagramTypes';

export type OutlineType = 'Mindmap' | 'Ishikawa diagram' | 'TreeView' | 'Treemap' | 'Kanban' | 'Venn diagram';
/** Kanban is an outline too: columns, then their cards. Venn: sets and unions, then their texts. */
export const OUTLINE_TYPES: ReadonlySet<string> = new Set<OutlineType>(['Mindmap', 'Ishikawa diagram', 'TreeView', 'Treemap', 'Kanban', 'Venn diagram']);

export interface OutlineItem {
  /** The line without its indentation. */
  text: string;
  children: OutlineItem[];
  /** Mindmap lines that decorate the item above them (`::icon(…)`, `:::class`). */
  decorations: string[];
  /** `%%` comment lines above the item. */
  comments: string[];
}

export interface Outline {
  /** Front matter, directives and the header line, as written. */
  head: string;
  items: OutlineItem[];
  /** Lines after the tree (`classDef …`), as written. */
  tail: string;
  /** Indentation of the top level, and of each level below it. */
  base: string;
  unit: string;
}

const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const width = (indent: string): number => indent.replace(/\t/g, '    ').length;

/** Reads an outline. Returns null if the code has no header line. */
export function parseOutline(text: string): Outline | null {
  const front = FRONT_MATTER.exec(text)?.[0] ?? '';
  const lines = text.slice(front.length).split('\n');
  const header = lines.findIndex((l) => HEADER_LINE.test(l));
  if (header < 0) return null;
  const head = front + lines.slice(0, header + 1).join('\n');
  let body = lines.slice(header + 1);
  // The tail: from the first styling statement to the end.
  const tailStart = body.findIndex((l) => /^\s*(classDef|class|style)\b/.test(l));
  let tailLines: string[] = [];
  if (tailStart >= 0) {
    tailLines = body.slice(tailStart);
    body = body.slice(0, tailStart);
  }
  // Blank lines just before the tail belong to it.
  while (body.length > 0 && body[body.length - 1].trim() === '' && tailLines.length > 0) tailLines.unshift(body.pop()!);

  const items: OutlineItem[] = [];
  const stack: Array<{ width: number; item: OutlineItem }> = [];
  let pending: string[] = [];
  let last: OutlineItem | null = null;
  const widths: number[] = [];
  for (const line of body) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('%%')) {
      pending.push(trimmed);
      continue;
    }
    if (last && /^(::icon\(|:::)/.test(trimmed)) {
      last.decorations.push(trimmed);
      continue;
    }
    const w = width(/^\s*/.exec(line)![0]);
    widths.push(w);
    const item: OutlineItem = { text: trimmed, children: [], decorations: [], comments: pending };
    pending = [];
    while (stack.length > 0 && stack[stack.length - 1].width >= w) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].item.children : items).push(item);
    stack.push({ width: w, item });
    last = item;
  }
  if (pending.length > 0) tailLines.unshift(...pending);

  const sorted = [...new Set(widths)].sort((a, b) => a - b);
  const baseWidth = sorted[0] ?? 2;
  const steps = sorted.slice(1).map((w, i) => w - sorted[i]).filter((d) => d > 0);
  const unitWidth = steps.length > 0 ? Math.min(...steps) : 2;
  return { head, items, tail: tailLines.join('\n').replace(/\s+$/, ''), base: ' '.repeat(baseWidth), unit: ' '.repeat(unitWidth) };
}

/** Writes an outline back as code. */
export function serializeOutline(outline: Outline): string {
  const out = [outline.head];
  const write = (items: OutlineItem[], depth: number): void => {
    const pad = outline.base + outline.unit.repeat(depth);
    for (const item of items) {
      for (const c of item.comments) out.push(`${pad}${c}`);
      out.push(`${pad}${item.text}`);
      for (const d of item.decorations) out.push(`${pad}${outline.unit}${d}`);
      write(item.children, depth + 1);
    }
  };
  write(outline.items, 0);
  let text = out.join('\n');
  if (outline.tail.trim() !== '') text += `\n${outline.tail.replace(/\n+$/, '')}`;
  return `${text}\n`;
}

// ---------------------------------------------------------------------------------------------
// Editing. A path is the list of indexes from the top level down to an item.

export type Path = readonly number[];

function clone(items: OutlineItem[]): OutlineItem[] {
  return items.map((i) => ({ ...i, children: clone(i.children), decorations: [...i.decorations], comments: [...i.comments] }));
}

/** The list that holds the item at `path`, and its index there. */
function locate(items: OutlineItem[], path: Path): { list: OutlineItem[]; index: number } {
  let list = items;
  for (const i of path.slice(0, -1)) list = list[i].children;
  return { list, index: path[path.length - 1] };
}

export function itemAt(outline: Outline, path: Path): OutlineItem | undefined {
  let list = outline.items;
  let item: OutlineItem | undefined;
  for (const i of path) {
    item = list[i];
    if (!item) return undefined;
    list = item.children;
  }
  return item;
}

/** Applies an edit to a copy of the items. Returns the new outline and the path of the item to select. */
function change(outline: Outline, edit: (items: OutlineItem[]) => Path | null): { outline: Outline; path: Path | null } {
  const items = clone(outline.items);
  const path = edit(items);
  return { outline: { ...outline, items }, path };
}

export function setText(outline: Outline, path: Path, text: string): Outline {
  return change(outline, (items) => {
    const { list, index } = locate(items, path);
    list[index].text = text.trim() || list[index].text;
    return path;
  }).outline;
}

export function setDecorations(outline: Outline, path: Path, decorations: string[]): Outline {
  return change(outline, (items) => {
    const { list, index } = locate(items, path);
    list[index].decorations = decorations;
    return path;
  }).outline;
}

const newItem = (text: string): OutlineItem => ({ text, children: [], decorations: [], comments: [] });

/** Adds an item after the one at `path` (or at the end of the top level when `path` is null). */
export function addSibling(outline: Outline, path: Path | null, text: string): { outline: Outline; path: Path | null } {
  return change(outline, (items) => {
    if (!path || path.length === 0) {
      items.push(newItem(text));
      return [items.length - 1];
    }
    const { list, index } = locate(items, path);
    list.splice(index + 1, 0, newItem(text));
    return [...path.slice(0, -1), index + 1];
  });
}

export function addChild(outline: Outline, path: Path, text: string): { outline: Outline; path: Path | null } {
  return change(outline, (items) => {
    const { list, index } = locate(items, path);
    list[index].children.push(newItem(text));
    return [...path, list[index].children.length - 1];
  });
}

export function remove(outline: Outline, path: Path): { outline: Outline; path: Path | null } {
  return change(outline, (items) => {
    const { list, index } = locate(items, path);
    list.splice(index, 1);
    if (list.length === 0) return path.length > 1 ? path.slice(0, -1) : null;
    return [...path.slice(0, -1), Math.min(index, list.length - 1)];
  });
}

/** Moves an item up or down among its siblings. */
export function move(outline: Outline, path: Path, step: -1 | 1): { outline: Outline; path: Path | null } {
  return change(outline, (items) => {
    const { list, index } = locate(items, path);
    const to = index + step;
    if (to < 0 || to >= list.length) return path;
    [list[index], list[to]] = [list[to], list[index]];
    return [...path.slice(0, -1), to];
  });
}

/** Makes an item the last child of the sibling above it. */
export function indent(outline: Outline, path: Path): { outline: Outline; path: Path | null } {
  return change(outline, (items) => {
    const { list, index } = locate(items, path);
    if (index === 0) return path;
    const [item] = list.splice(index, 1);
    const parent = list[index - 1];
    parent.children.push(item);
    return [...path.slice(0, -1), index - 1, parent.children.length - 1];
  });
}

/** Makes an item the next sibling of its parent. Its later siblings stay with the parent. */
export function outdent(outline: Outline, path: Path): { outline: Outline; path: Path | null } {
  return change(outline, (items) => {
    if (path.length < 2) return path;
    const parentPath = path.slice(0, -1);
    const { list: parentList, index: parentIndex } = locate(items, parentPath);
    const parent = parentList[parentIndex];
    const [item] = parent.children.splice(path[path.length - 1], 1);
    parentList.splice(parentIndex + 1, 0, item);
    return [...parentPath.slice(0, -1), parentIndex + 1];
  });
}

// ---------------------------------------------------------------------------------------------
// Typed fields read from an item's text.

/** Mindmap node shapes: [open, close] brackets. */
export const MINDMAP_SHAPES: ReadonlyArray<{ name: string; open: string; close: string }> = [
  { name: 'Default', open: '', close: '' },
  { name: 'Square', open: '[', close: ']' },
  { name: 'Rounded', open: '(', close: ')' },
  { name: 'Circle', open: '((', close: '))' },
  { name: 'Bang', open: '))', close: '((' },
  { name: 'Cloud', open: ')', close: '(' },
  { name: 'Hexagon', open: '{{', close: '}}' },
];

export interface MindmapNode {
  id: string;
  label: string;
  shape: string;
}

/** `id((Label))`, `[Label]`, `Label`. Longer brackets are tried first. */
export function readMindmapNode(text: string): MindmapNode {
  const shapes = [...MINDMAP_SHAPES].filter((s) => s.open !== '').sort((a, b) => b.open.length - a.open.length);
  for (const s of shapes) {
    const open = text.indexOf(s.open);
    if (open < 0 || !text.endsWith(s.close)) continue;
    const id = text.slice(0, open);
    if (/[\s()[\]{}]/.test(id)) continue;
    const label = text.slice(open + s.open.length, text.length - s.close.length);
    if (label === '') continue;
    return { id, label, shape: s.name };
  }
  return { id: '', label: text, shape: 'Default' };
}

export function writeMindmapNode(node: MindmapNode, fallbackId: string): string {
  const shape = MINDMAP_SHAPES.find((s) => s.name === node.shape) ?? MINDMAP_SHAPES[0];
  if (shape.open === '') return node.label;
  return `${node.id || fallbackId}${shape.open}${node.label}${shape.close}`;
}

/** The icon of a mindmap item (`::icon(fa fa-book)`), or ''. */
export function mindmapIcon(item: OutlineItem): string {
  for (const d of item.decorations) {
    const m = /^::icon\((.*)\)$/.exec(d);
    if (m) return m[1];
  }
  return '';
}

export function withMindmapIcon(item: OutlineItem, icon: string): string[] {
  const rest = item.decorations.filter((d) => !d.startsWith('::icon('));
  return icon.trim() === '' ? rest : [`::icon(${icon.trim()})`, ...rest];
}

/** Treemap `"Label": 120 :::class` (a leaf) or `"Label"` (a section). */
export interface TreemapNode {
  label: string;
  value: string;
  /** `:::class` as written, or ''. */
  rest: string;
}

export function readTreemapNode(text: string): TreemapNode | null {
  const m = /^"((?:[^"\\]|\\.)*)"\s*(?::\s*(-?[\d.]+))?\s*(:::.*)?$/.exec(text);
  return m ? { label: m[1], value: m[2] ?? '', rest: m[3] ?? '' } : null;
}

export function writeTreemapNode(node: TreemapNode): string {
  const label = `"${node.label.replace(/"/g, "'")}"`;
  const value = node.value.trim() === '' ? '' : `: ${node.value.trim()}`;
  return `${label}${value}${node.rest ? ` ${node.rest}` : ''}`;
}

/** Kanban `id[Label]@{ assigned: 'x' }`, `[Label]` or `Label`. */
export interface KanbanNode {
  id: string;
  label: string;
  /** `@{ … }` as written, or ''. */
  meta: string;
}

export function readKanbanNode(text: string): KanbanNode {
  const metaAt = text.indexOf('@{');
  const main = metaAt >= 0 ? text.slice(0, metaAt) : text;
  const meta = metaAt >= 0 ? text.slice(metaAt) : '';
  const m = /^([^[\s]*)\[(.*)\]$/.exec(main.trim());
  return m ? { id: m[1], label: m[2], meta } : { id: '', label: main.trim(), meta };
}

export function writeKanbanNode(node: KanbanNode): string {
  const main = node.id ? `${node.id}[${node.label}]` : /[\s[\]]/.test(node.label) ? `[${node.label}]` : node.label;
  return `${main}${node.meta.trim()}`;
}

/** TreeView `name :::class icon(x) ## annotation`. */
export interface TreeViewNode {
  name: string;
  /** `:::class icon(…)` as written, or ''. */
  extra: string;
  annotation: string;
}

export function readTreeViewNode(text: string): TreeViewNode {
  const hash = text.indexOf(' ##');
  const main = hash >= 0 ? text.slice(0, hash) : text;
  const annotation = hash >= 0 ? text.slice(hash + 3).trim() : '';
  const extraAt = main.search(/\s(:::|icon\()/);
  return {
    name: (extraAt >= 0 ? main.slice(0, extraAt) : main).trim(),
    extra: extraAt >= 0 ? main.slice(extraAt).trim() : '',
    annotation,
  };
}

export function writeTreeViewNode(node: TreeViewNode): string {
  return [node.name.trim(), node.extra, node.annotation.trim() ? `## ${node.annotation.trim()}` : ''].filter((p) => p !== '').join(' ');
}
