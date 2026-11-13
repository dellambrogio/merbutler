/**
 * FlowModel -> Mermaid text. The output is deterministic: header, then the nesting tree
 * (at each level nodes first, then subgraph blocks), then all edges.
 */
import {
  buildTree,
  keepsAtSyntax,
  normalizeNodeLabel,
  type EdgeEnd,
  type FlowEdge,
  type FlowModel,
  type FlowNode,
  type FlowSubgraph,
  type Shape,
  type Stroke,
  type TreeItem,
} from './model';
import { fromEditText } from './labels';

const SHAPE_BRACKETS: Record<Shape, readonly [string, string]> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  subroutine: ['[[', ']]'],
  cylinder: ['[(', ')]'],
  circle: ['((', '))'],
  'double-circle': ['(((', ')))'],
  flag: ['>', ']'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  'lean-right': ['[/', '/]'],
  'lean-left': ['[\\', '\\]'],
  trapezoid: ['[/', '\\]'],
  'inv-trapezoid': ['[\\', '/]'],
};

/**
 * Line without markers, and line body to put markers around, for an edge of length n.
 * Length 1: `---` / `--`, `-.-` / `-.-`, `===` / `==`. Each extra rank adds one `-`, `.` or `=`.
 */
const EDGE_LINES: Record<Stroke, (n: number) => { open: string; body: string }> = {
  normal: (n) => ({ open: '-'.repeat(n + 2), body: '-'.repeat(n + 1) }),
  dotted: (n) => ({ open: `-${'.'.repeat(n)}-`, body: `-${'.'.repeat(n)}-` }),
  thick: (n) => ({ open: '='.repeat(n + 2), body: '='.repeat(n + 1) }),
  // No markers: `~~~`, `~~~~`.
  invisible: (n) => ({ open: '~'.repeat(n + 2), body: '~'.repeat(n + 2) }),
};

const END_CHARS: Record<Exclude<EdgeEnd, 'none'>, { start: string; end: string }> = {
  arrow: { start: '<', end: '>' },
  circle: { start: 'o', end: 'o' },
  cross: { start: 'x', end: 'x' },
};

/** For example: `-->`, `-.-o`, `<==>`, `x--x`, `---`, `--->` (length 2). */
export function edgeOperator(edge: Pick<FlowEdge, 'stroke' | 'end' | 'bothEnds' | 'length'>): string {
  const line = EDGE_LINES[edge.stroke](edge.length ?? 1);
  if (edge.end === 'none' || edge.stroke === 'invisible') return line.open;
  const chars = END_CHARS[edge.end];
  return `${edge.bothEnds ? chars.start : ''}${line.body}${chars.end}`;
}

const INDENT = '  ';

/** Text that Mermaid accepts without quotes inside node brackets or edge pipes. */
const SAFE_TEXT = /^[\p{L}\p{N} _.,!?'+*:-]+$/u;

/**
 * Mermaid has no backslash escape. A double quote is written as the entity `#quot;`.
 * A literal `#` that looks like the start of an entity (`#word;`) is written as `#35;`.
 */
export function quoteText(text: string, markdown = false): string {
  if (!markdown && SAFE_TEXT.test(text) && text.trim() === text) return text;
  const escaped = text.replace(/#(?=\w+;)/g, '#35;').replaceAll('"', '#quot;');
  // A Markdown string is `…` inside the quotes. A backtick in the text would end it.
  return markdown ? `"\`${escaped.replaceAll('`', '#96;')}\`"` : `"${escaped}"`;
}

/**
 * A label in `@{ label: "…" }`. Mermaid reads it as a YAML string: `\\` and `\n` are escapes.
 * Entities work as in other labels.
 */
function atLabel(text: string): string {
  const escaped = text
    .replace(/#(?=\w+;)/g, '#35;')
    .replaceAll('"', '#quot;')
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n');
  return `"${escaped}"`;
}

function nodeLine(node: FlowNode): string {
  const label = normalizeNodeLabel(node.label, node.id, node.markdown);
  if (keepsAtSyntax(node)) {
    const fields = [`shape: ${node.shapeName}`];
    if (node.markdown) fields.push(`label: ${atLabel(label)}`);
    return `${node.id}@{ ${fields.join(', ')} }`;
  }
  if (node.shape === 'rect' && label === node.id && !node.markdown) return node.id;
  const [open, close] = SHAPE_BRACKETS[node.shape];
  return `${node.id}${open}${quoteText(label, node.markdown)}${close}`;
}

function subgraphHeader(subgraph: FlowSubgraph): string {
  const label = normalizeNodeLabel(subgraph.label, subgraph.id, subgraph.markdown);
  if (label === subgraph.id && !subgraph.markdown) return `subgraph ${subgraph.id}`;
  return `subgraph ${subgraph.id} [${quoteText(label, subgraph.markdown)}]`;
}

function edgeLine(edge: FlowEdge): string {
  const op = edgeOperator(edge);
  const text = fromEditText(edge.label, edge.markdown);
  const label = text === '' ? '' : `|${quoteText(text, edge.markdown)}|`;
  const ref = edge.ref ? `${edge.ref}@` : '';
  return `${edge.source} ${ref}${op}${label} ${edge.target}`;
}

/** `e1@{ animate: true, step: 2 }`, or null when the edge has no settings. */
function edgeOptionsLine(edge: FlowEdge): string | null {
  const options = edge.options;
  if (!edge.ref || !options) return null;
  const parts: string[] = [];
  if (options.animate !== undefined) parts.push(`animate: ${options.animate}`);
  if (options.animation !== undefined) parts.push(`animation: ${options.animation}`);
  if (options.step !== undefined) parts.push(`step: ${options.step}`);
  if (options.curve !== undefined) parts.push(`curve: ${options.curve}`);
  return parts.length > 0 ? `${edge.ref}@{ ${parts.join(', ')} }` : null;
}

function treeLines(items: TreeItem[], depth: number, out: string[]): void {
  const pad = INDENT.repeat(depth);
  for (const item of items) {
    if (item.kind === 'node') {
      out.push(`${pad}${nodeLine(item.node)}`);
      continue;
    }
    out.push(`${pad}${subgraphHeader(item.subgraph)}`);
    if (item.subgraph.direction) out.push(`${pad}${INDENT}direction ${item.subgraph.direction}`);
    treeLines(item.children, depth + 1, out);
    out.push(`${pad}end`);
  }
}

export function serialize(model: FlowModel): string {
  const lines = model.preamble ? [model.preamble] : [];
  lines.push(`flowchart ${model.direction}`);
  treeLines(buildTree(model), 1, lines);
  for (const edge of model.edges) lines.push(`${INDENT}${edgeLine(edge)}`);
  for (const edge of model.edges) {
    const options = edgeOptionsLine(edge);
    if (options) lines.push(`${INDENT}${options}`);
  }
  return `${lines.join('\n')}\n`;
}
