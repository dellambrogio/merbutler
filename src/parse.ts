/**
 * Mermaid text -> FlowModel.
 *
 * This is the only file that uses Mermaid internals (mermaidAPI.getDiagramFromText
 * and the flowchart DB). The mermaid version is pinned in package.json because
 * this API is not public and can change.
 */
import mermaid from 'mermaid';
import { canonicalOrder, normalizeNode, sortClasses, type Direction, type EdgeEnd, type EdgeOptions, type FlowEdge, type Styled, type FlowModel, type FlowNode, type FlowSubgraph, type Stroke } from './model';
import { SHAPE_FROM_AT_NAME, SHAPE_FROM_BRACKETS } from './shapes';

export type ParseResult = { ok: true; model: FlowModel } | { ok: false; error: string };

interface MermaidVertex {
  id: string;
  text?: string;
  labelType?: string;
  type?: string | null;
  styles: string[];
  classes: string[];
  link?: string;
  haveCallback?: boolean;
  icon?: string;
  img?: string;
}

interface MermaidEdge {
  start: string;
  end: string;
  type?: string;
  stroke?: string;
  text: string;
  labelType?: string;
  style?: string[];
  classes: string[];
  length?: number;
  id?: string;
  isUserDefinedId?: boolean;
  animate?: boolean;
  animation?: string;
  step?: number;
  interpolate?: string;
}

interface MermaidSubgraph {
  id: string;
  title: string;
  labelType?: string;
  /** Node ids and child subgraph ids. */
  nodes: string[];
  dir?: string;
  classes: string[];
  metadata?: unknown;
}

interface MermaidFlowDb {
  getDirection(): string | undefined;
  getVertices(): Map<string, MermaidVertex>;
  getEdges(): MermaidEdge[];
  getClasses(): Map<string, { id: string; styles: string[] }>;
  getSubGraphs(): MermaidSubgraph[];
}

/** The edge list also carries `linkStyle default …`. */
type MermaidEdges = MermaidEdge[] & { defaultStyle?: string[]; defaultInterpolate?: string };


const DIRECTION_FROM_MERMAID: Record<string, Direction> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

/** Mermaid edge type -> marker at the target, and the same marker at the source too. */
const END_FROM_MERMAID: Record<string, { end: EdgeEnd; bothEnds: boolean }> = {
  arrow_open: { end: 'none', bothEnds: false },
  arrow_point: { end: 'arrow', bothEnds: false },
  arrow_circle: { end: 'circle', bothEnds: false },
  arrow_cross: { end: 'cross', bothEnds: false },
  double_arrow_point: { end: 'arrow', bothEnds: true },
  double_arrow_circle: { end: 'circle', bothEnds: true },
  double_arrow_cross: { end: 'cross', bothEnds: true },
};

const STROKE_FROM_MERMAID: Record<string, Stroke> = {
  normal: 'normal',
  dotted: 'dotted',
  thick: 'thick',
  invisible: 'invisible',
};

class UnsupportedError extends Error {}

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  // The first parse registers the lazy diagram detectors.
  await mermaid.parse('flowchart TB\n  a');
  initialized = true;
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
};

/**
 * Mermaid replaces each `#name;` / `#123;` entity with placeholder characters
 * before it parses. This converts the placeholders to the real characters.
 * Unknown named entities stay as `#name;`.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/ﬂ\xB0\xB0\+?(\d+)\xB6\xDF/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/ﬂ\xB0(\w+)\xB6\xDF/g, (_m, name: string) => NAMED_ENTITIES[name] ?? `#${name};`);
}

function unsupported(what: string): never {
  throw new UnsupportedError(`Not supported by the visual editor: ${what}`);
}

function toDirection(raw: string): Direction {
  const direction = DIRECTION_FROM_MERMAID[raw];
  if (!direction) unsupported(`direction "${raw}"`);
  return direction;
}

/** Declarations as written, trimmed. Mermaid keeps `fill : #f00 ` as it is. */
function cleanStyles(styles: readonly string[] | undefined): string[] {
  return (styles ?? []).map((s) => s.trim()).filter((s) => s !== '');
}

/** Sets `classes` and `styles` only when there are some, so plain items stay plain. */
function setStyling<T extends Styled>(item: T, classes: string[], styles: string[]): T {
  if (classes.length > 0) item.classes = classes;
  if (styles.length > 0) item.styles = styles;
  return item;
}

/** A subgraph's `style` statement is stored on a vertex with the subgraph id. */
function toSubgraph(s: MermaidSubgraph, vertex: MermaidVertex | undefined): FlowSubgraph {
  const subgraph: FlowSubgraph = {
    id: s.id,
    label: decodeEntities(s.title || s.id),
    markdown: s.labelType === 'markdown',
    parent: null,
    direction: s.dir ? toDirection(s.dir) : null,
  };
  if (s.metadata) {
    const { view, ...other } = s.metadata as Record<string, unknown>;
    const keys = Object.keys(other);
    if (keys.length > 0) unsupported(`"${keys[0]}" in ${s.id}@{ … } (subgraph ${s.id})`);
    if (view !== 'collapsed' && view !== 'expanded') unsupported(`view "${String(view)}" (subgraph ${s.id})`);
    subgraph.view = view;
  }
  return setStyling(subgraph, [...s.classes], cleanStyles(vertex?.styles));
}

/** True if the code gives the node `@{ … }` data somewhere (`A@{ shape: diam }`). */
function usesAtSyntax(text: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w-])${escaped}@\\{`, 'm').test(text);
}

/**
 * The statements of the code (split at newlines and `;`), outside quotes and `%%` comments.
 * Enough to find `click` statements, which Mermaid's DB does not keep as written: with
 * securityLevel 'strict' a callback leaves no trace, and links are rewritten (sanitized).
 */
export function statements(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    if (!quoted && c === '%' && text[i + 1] === '%') {
      while (i < text.length && text[i] !== '\n') i++;
      i--;
      continue;
    }
    if (!quoted && (c === '\n' || c === ';')) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  out.push(current.trim());
  return out.filter((s) => s !== '');
}

/** `click id rest` statements by node id (the last one wins, as in Mermaid). */
function clickStatements(text: string): Map<string, string> {
  const clicks = new Map<string, string>();
  for (const statement of statements(text.slice(preambleOf(text).length))) {
    const m = /^click\s+(\S+)\s+(.+)$/s.exec(statement);
    if (m) clicks.set(m[1], m[2].trim());
  }
  return clicks;
}

function toNode(v: MermaidVertex, text: string, clicks: Map<string, string>): FlowNode {
  if (v.icon) unsupported(`icon shape (node ${v.id})`);
  if (v.img) unsupported(`image shape (node ${v.id})`);
  // Bracket and `@{ shape }` names overlap (`circle`, `stadium`, …), so look at the code.
  const atSyntax = v.type != null && usesAtSyntax(text, v.id);
  const shape = v.type == null ? 'rect' : (atSyntax ? SHAPE_FROM_AT_NAME : SHAPE_FROM_BRACKETS).get(v.type);
  if (!shape) unsupported(`shape "${v.type}" (node ${v.id})`);
  const node: FlowNode = { id: v.id, label: decodeEntities(v.text ?? v.id), shape, markdown: v.labelType === 'markdown', parent: null };
  if (atSyntax && v.type) node.shapeName = v.type;
  // `click` adds the class "clickable". The statement itself comes from the code.
  const clickable = v.link !== undefined || v.haveCallback === true || v.classes.includes('clickable');
  const click = clicks.get(v.id);
  if (clickable && !click) unsupported(`click on node ${v.id} (statement not found)`);
  if (click) node.click = click;
  setStyling(node, v.classes.filter((c) => c !== 'default' && c !== 'clickable'), cleanStyles(v.styles));
  return normalizeNode(node);
}

function toEdge(e: MermaidEdge, index: number): FlowEdge {
  const where = `edge ${e.start} -> ${e.end}`;
  const ends = END_FROM_MERMAID[e.type ?? 'arrow_point'];
  if (!ends) unsupported(`arrow type "${e.type}" (${where})`);
  const stroke = STROKE_FROM_MERMAID[e.stroke ?? 'normal'];
  if (!stroke) unsupported(`stroke "${e.stroke}" (${where})`);
  const edge: FlowEdge = { id: `e${index + 1}`, source: e.start, target: e.end, label: decodeEntities(e.text), markdown: e.labelType === 'markdown', stroke, ...ends };
  if (e.length && e.length > 1) edge.length = e.length;
  if (e.isUserDefinedId && e.id) {
    edge.ref = e.id;
    const options = toEdgeOptions(e, where);
    if (Object.keys(options).length > 0) edge.options = options;
  }
  if (e.interpolate !== undefined) edge.curve = e.interpolate;
  if (e.classes.length > 0 && !edge.ref) unsupported(`class on an edge without an id (${where})`);
  return setStyling(edge, [...e.classes], linkStyles(e.style));
}

/** Mermaid adds `fill:none` to every `linkStyle`. It is not part of the code. */
function linkStyles(style: readonly string[] | undefined): string[] {
  const styles = cleanStyles(style);
  if (styles.at(-1)?.replace(/\s/g, '') === 'fill:none') styles.pop();
  return styles;
}

function toEdgeOptions(e: MermaidEdge, where: string): EdgeOptions {
  const options: EdgeOptions = {};
  if (e.animate !== undefined) options.animate = e.animate;
  if (e.animation !== undefined) {
    if (e.animation !== 'fast' && e.animation !== 'slow') unsupported(`animation "${e.animation}" (${where})`);
    options.animation = e.animation;
  }
  if (e.step !== undefined) options.step = e.step;
  return options;
}

/** Front matter: `---` on the first line, up to the next line that is only `---`. */
const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const HEADER = /^[ \t]*(?:flowchart|graph)\b/m;

/**
 * The text before the `flowchart` line (front matter, directives, comments), without trailing
 * whitespace. Mermaid reads it; the model keeps it so a canvas edit does not drop it.
 */
export function preambleOf(text: string): string {
  const front = FRONT_MATTER.exec(text)?.[0].length ?? 0;
  const header = HEADER.exec(text.slice(front));
  const end = header ? front + header.index : front;
  return text.slice(0, end).trimEnd();
}

export async function parse(text: string): Promise<ParseResult> {
  try {
    await ensureInitialized();
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
    if (!diagram.type.startsWith('flowchart')) {
      return { ok: false, error: `Only flowcharts are supported (found "${diagram.type}").` };
    }
    const db = diagram.db as unknown as MermaidFlowDb;
    const direction = toDirection(db.getDirection() ?? 'TB');
    const vertices = db.getVertices();
    const clicks = clickStatements(text);
    for (const id of clicks.keys()) {
      if (!vertices.has(id) || db.getSubGraphs().some((s) => s.id === id)) unsupported(`click on ${id}, which is not a node`);
    }

    const rawSubgraphs = db.getSubGraphs();
    const subgraphs = rawSubgraphs.map((s) => toSubgraph(s, vertices.get(s.id)));
    const subgraphById = new Map(subgraphs.map((s) => [s.id, s]));

    // An edge end can be a node id or a subgraph id.
    const rawEdges = db.getEdges() as MermaidEdges;
    const edges = rawEdges.map(toEdge);

    // An edge to a subgraph also creates a vertex with the subgraph id. It is not a node.
    const nodes = [...vertices.values()].filter((v) => !subgraphById.has(v.id)).map((v) => toNode(v, text, clicks));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // Mermaid lists inner subgraphs first, and keeps each id in one subgraph only.
    for (const raw of rawSubgraphs) {
      for (const child of raw.nodes) {
        const item = subgraphById.get(child) ?? nodeById.get(child);
        if (item && item.parent === null && child !== raw.id) item.parent = raw.id;
      }
    }

    const model: FlowModel = { direction, nodes, subgraphs, edges };
    const classDefs = [...db.getClasses().values()].map((c) => ({ name: c.id, styles: cleanStyles(c.styles) }));
    if (classDefs.length > 0) model.classDefs = classDefs;
    for (const item of [...nodes, ...subgraphs, ...edges]) {
      if (item.classes) item.classes = sortClasses(item.classes, classDefs);
    }
    const linkDefaults: NonNullable<FlowModel['linkDefaults']> = {};
    const defaultStyles = cleanStyles(rawEdges.defaultStyle);
    if (defaultStyles.length > 0) linkDefaults.styles = defaultStyles;
    if (rawEdges.defaultInterpolate) linkDefaults.curve = rawEdges.defaultInterpolate;
    if (Object.keys(linkDefaults).length > 0) model.linkDefaults = linkDefaults;
    const preamble = preambleOf(text);
    if (preamble) model.preamble = preamble;
    return { ok: true, model: canonicalOrder(model) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Checks the rest of a `click` statement from the inspector. Returns an error message, or null
 * if Mermaid accepts it and reads it back the same.
 */
export async function checkClick(rest: string): Promise<string | null> {
  if (/[\n;]/.test(rest.replace(/"[^"]*"/g, ''))) return 'One statement only (no line break or ;).';
  const result = await parse(`flowchart LR\n  a\n  click a ${rest}\n`);
  // Mermaid's message points into the test diagram (line 3), so give a plain one.
  if (!result.ok) return 'Mermaid cannot read this click statement.';
  return result.model.nodes[0]?.click === rest ? null : 'Mermaid reads this differently.';
}
