/**
 * Flowcharts and swimlane diagrams: FlowModel -> Mermaid text. The output is deterministic: header,
 * then the nesting tree (at each level nodes first, then subgraph blocks), then all edges, then
 * edge options, collapsed views, styling, clicks and comments.
 */
import {
  buildTree,
  keepsAtSyntax,
  sortClasses,
  normalizeNodeLabel,
  type EdgeEnd,
  type Asset,
  type FlowEdge,
  type FlowModel,
  type FlowNode,
  type FlowSubgraph,
  type Stroke,
  type TreeItem,
} from '../core/model';
import { fromEditText } from '../core/labels';
import { SHAPE_INFO } from './shapes';


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

/** `id@{ icon: "fa:user", form: "square", label: "…", pos: "t", h: 60 }`, fields in the order of the Mermaid docs. */
function assetLine(node: FlowNode, asset: Asset): string {
  const fields: string[] = asset.kind === 'icon' ? [`icon: ${atLabel(asset.icon)}`] : [`img: ${atLabel(asset.img)}`];
  if (asset.kind === 'icon' && asset.form !== undefined) fields.push(`form: ${atLabel(asset.form)}`);
  if (node.label !== '') fields.push(`label: ${atLabel(node.label)}`);
  if (asset.pos !== undefined) fields.push(`pos: ${atLabel(asset.pos)}`);
  if (asset.kind === 'image' && asset.w !== undefined) fields.push(`w: ${asset.w}`);
  if (asset.h !== undefined) fields.push(`h: ${asset.h}`);
  if (asset.kind === 'image' && asset.constraint !== undefined) fields.push(`constraint: ${atLabel(asset.constraint)}`);
  return `${node.id}@{ ${fields.join(', ')} }`;
}

function nodeLine(node: FlowNode): string {
  if (node.asset) return assetLine(node, node.asset);
  const label = normalizeNodeLabel(node.label, node.id, node.markdown);
  if (keepsAtSyntax(node)) {
    const fields = [`shape: ${node.shapeName}`];
    if (node.markdown) fields.push(`label: ${atLabel(label)}`);
    return `${node.id}@{ ${fields.join(', ')} }`;
  }
  if (node.shape === 'rect' && label === node.id && !node.markdown) return node.id;
  const [open, close] = SHAPE_INFO[node.shape].brackets ?? ['[', ']'];
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
  const options = edge.options ?? {};
  if (!edge.ref) return null;
  const parts: string[] = [];
  if (options.animate !== undefined) parts.push(`animate: ${options.animate}`);
  if (options.animation !== undefined) parts.push(`animation: ${options.animation}`);
  if (options.step !== undefined) parts.push(`step: ${options.step}`);
  if (edge.curve !== undefined) parts.push(`curve: ${edge.curve}`);
  return parts.length > 0 ? `${edge.ref}@{ ${parts.join(', ')} }` : null;
}

function treeLines(items: TreeItem[], depth: number, out: string[]): void {
  const pad = INDENT.repeat(depth);
  for (const item of items) {
    if (item.kind === 'node') {
      for (const comment of item.node.comments ?? []) out.push(`${pad}${comment}`);
      out.push(`${pad}${nodeLine(item.node)}`);
      continue;
    }
    for (const comment of item.subgraph.comments ?? []) out.push(`${pad}${comment}`);
    out.push(`${pad}${subgraphHeader(item.subgraph)}`);
    if (item.subgraph.direction) out.push(`${pad}${INDENT}direction ${item.subgraph.direction}`);
    treeLines(item.children, depth + 1, out);
    for (const comment of item.subgraph.endComments ?? []) out.push(`${pad}${INDENT}${comment}`);
    out.push(`${pad}end`);
  }
}

export function serializeFlowchart(model: FlowModel): string {
  const lines = model.preamble ? [model.preamble] : [];
  lines.push(`${model.kind === 'swimlane' ? 'swimlane-beta' : 'flowchart'} ${model.direction}`);
  treeLines(buildTree(model), 1, lines);
  for (const edge of model.edges) {
    for (const comment of edge.comments ?? []) lines.push(`${INDENT}${comment}`);
    lines.push(`${INDENT}${edgeLine(edge)}`);
  }
  for (const edge of model.edges) {
    const options = edgeOptionsLine(edge);
    if (options) lines.push(`${INDENT}${options}`);
  }
  for (const subgraph of model.subgraphs) {
    if (subgraph.view) lines.push(`${INDENT}${subgraph.id}@{ view: ${subgraph.view} }`);
  }
  for (const comment of model.tailComments ?? []) lines.push(`${INDENT}${comment}`);
  for (const line of stylingLines(model)) lines.push(`${INDENT}${line}`);
  for (const node of model.nodes) {
    if (node.click) lines.push(`${INDENT}click ${node.id} ${node.click}`);
  }
  for (const comment of model.endComments ?? []) lines.push(`${INDENT}${comment}`);
  return `${lines.join('\n')}\n`;
}

/** Commas separate declarations, so a comma inside one is written as `\\,`. */
function declarations(styles: readonly string[]): string {
  return styles.map((s) => s.replaceAll(',', '\\,')).join(',');
}

/**
 * `classDef`, `class`, `style` and `linkStyle` statements, after the graph. Classes are always
 * written as `class` statements (not `:::`), grouped by class.
 */
function stylingLines(model: FlowModel): string[] {
  const lines: string[] = [];
  for (const def of model.classDefs ?? []) lines.push(`classDef ${def.name} ${declarations(def.styles)}`);

  const members = new Map<string, string[]>();
  const addClasses = (id: string, classes: readonly string[] | undefined): void => {
    for (const name of classes ?? []) members.set(name, [...(members.get(name) ?? []), id]);
  };
  for (const node of model.nodes) addClasses(node.id, node.classes);
  for (const subgraph of model.subgraphs) addClasses(subgraph.id, subgraph.classes);
  for (const edge of model.edges) if (edge.ref) addClasses(edge.ref, edge.classes);
  // Each element's classes are already in canonical order (see sortClasses); write the statements in that order too.
  const order = sortClasses([...members.keys()], model.classDefs);
  for (const name of order) lines.push(`class ${(members.get(name) ?? []).join(',')} ${name}`);

  for (const item of [...model.nodes, ...model.subgraphs]) {
    if (item.styles) lines.push(`style ${item.id} ${declarations(item.styles)}`);
  }

  const defaults = model.linkDefaults;
  if (defaults?.curve) lines.push(`linkStyle default interpolate ${defaults.curve}`);
  if (defaults?.styles) lines.push(`linkStyle default ${declarations(defaults.styles)}`);
  model.edges.forEach((edge, index) => {
    // An edge with an id has its curve in `id@{ curve }`.
    if (edge.curve && !edge.ref) lines.push(`linkStyle ${index} interpolate ${edge.curve}`);
    if (edge.styles) lines.push(`linkStyle ${index} ${declarations(edge.styles)}`);
  });
  return lines;
}
