import { fromEditText, toEditText } from './labels';
import { frontMatterOf, getString, readConfig, readYamlMaps } from './config';
import { SHAPE_INFO, SHAPES, type Shape } from './shapes';

export { SHAPES, type Shape };

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';
/** `invisible` is `~~~`: the layout uses the link, Mermaid does not draw it. */
export type Stroke = 'normal' | 'dotted' | 'thick' | 'invisible';
export type EdgeEnd = 'none' | 'arrow' | 'circle' | 'cross';

export const DIRECTIONS: readonly Direction[] = ['TB', 'LR', 'BT', 'RL'];

export const STROKES: readonly Stroke[] = ['normal', 'dotted', 'thick', 'invisible'];
export const EDGE_ENDS: readonly EdgeEnd[] = ['none', 'arrow', 'circle', 'cross'];
/** Minimum edge length in ranks: 1 for `-->`, 2 for `--->`, 3 for `---->`. */
export const EDGE_LENGTHS: readonly number[] = [1, 2, 3];

/** Settings from an `id@{ … }` statement for an edge. Kept in the code; the canvas does not draw them yet. */
export interface EdgeOptions {
  animate?: boolean;
  animation?: 'fast' | 'slow';
  step?: number;
}

/** `id@{ icon: "fa:user", form: "square", pos: "t", h: 60 }` (Mermaid 11.3+). */
export interface IconAsset {
  kind: 'icon';
  icon: string;
  /** Background: `square`, `circle`, `rounded`, or none. Other values are kept as written. */
  form?: string;
  /** Label position: `t` (top) or `b` (bottom, the default). */
  pos?: string;
  h?: number;
}

/** `id@{ img: "…", pos: "t", w: 60, h: 60, constraint: "on" }` (Mermaid 11.3+). */
export interface ImageAsset {
  kind: 'image';
  img: string;
  pos?: string;
  w?: number;
  h?: number;
  /** `on`: keep the aspect ratio. */
  constraint?: string;
}

export type Asset = IconAsset | ImageAsset;

/** `classDef name fill:#f96,stroke:#333`. `default` applies to nodes without a class. */
export interface ClassDef {
  name: string;
  /** CSS-like declarations as written, for example `fill:#f96`. */
  styles: string[];
}

/** Classes (`class`, `:::`) and own styles (`style`, `linkStyle`) of a node, subgraph or edge. */
export interface Styled {
  classes?: string[];
  styles?: string[];
}

export interface FlowNode {
  id: string;
  label: string;
  shape: Shape;
  /** True for a Markdown label (`"`…`"` in Mermaid). */
  markdown: boolean;
  /** Id of the subgraph that contains the node, or null at the top level. */
  parent: string | null;
  /**
   * The name written in `id@{ shape: … }` (for example `diam` or its alias `decision`).
   * Missing for the bracket syntax. See `keepsAtSyntax`.
   */
  shapeName?: string;
  classes?: string[];
  /** From `style id …`. */
  styles?: string[];
  /** An icon or image node. `shape` is not used then, and the label may be empty. */
  asset?: Asset;
  /** `%%` comment lines written above the node. */
  comments?: string[];
  /**
   * The rest of a `click id …` statement, as written: `href "https://…" "Tooltip" _blank`,
   * `callback "Tooltip"`, `call cb()`. Kept and shown; the canvas never follows or runs it.
   */
  click?: string;
  /**
   * State diagrams: what the node is. Missing for a plain state. `start` and `end` are `[*]` (one of
   * each per composite state), `note` is a note next to the state `note.of`.
   */
  state?: StateKind;
  /** State diagrams: a note's place. */
  note?: { position: 'left of' | 'right of'; of: string };
  /** State diagrams: description lines after the label (`id : text`). */
  descriptions?: string[];
  /** Use case diagrams: an actor or a use case, with its settings. */
  usecase?: UseCaseNode;
}

/** Use case diagrams: what a node is (see usecaseDiagram.ts). */
export interface UseCaseNode {
  kind: 'actor' | 'usecase';
  /** Actors: `normal` (default), `hollow`, `awesome`. Ignored when `icon` is set. */
  actorType?: 'hollow' | 'awesome';
  /** Actors: an icon instead of the figure. */
  icon?: string;
  business?: boolean;
  /** `<<text>>` after the name. */
  stereotype?: string;
  /** Use cases: a rectangle (`id[Label]`) instead of an ellipse. */
  rect?: boolean;
}

/**
 * Use case relationships, by how they are written: associations with their arrow (`-->`, `--`,
 * `<--`, `--o`, `--x`, `o--`, `x--`), `..>:include`, `..>:extend`, and `--|>` generalization.
 */
export type UseCaseRelation = '-->' | '--' | '<--' | '--o' | '--x' | 'o--' | 'x--' | 'include' | 'extend' | 'generalization';

export type StateKind = 'start' | 'end' | 'choice' | 'fork' | 'join' | 'note';

export interface FlowSubgraph {
  id: string;
  label: string;
  /** True for a Markdown title (`"`…`"` in Mermaid). */
  markdown: boolean;
  /** Id of the subgraph that contains this subgraph, or null at the top level. */
  parent: string | null;
  /** `direction` statement inside the subgraph. Kept in the code; the canvas layout ignores it. */
  direction: Direction | null;
  classes?: string[];
  /** From `style id …`. */
  styles?: string[];
  /** From `id@{ view: … }` (Mermaid 11.17+). Collapsed: drawn as one box, its contents hidden. */
  view?: 'collapsed' | 'expanded';
  /** `%%` comment lines written above the subgraph. */
  comments?: string[];
  /** `%%` comment lines just before the subgraph's `end`. */
  endComments?: string[];
  /** State diagrams: a concurrency region of a composite state (separated by `--`). It has no label of its own. */
  region?: boolean;
  /** Use case diagrams: a system boundary drawn as a package (`@{ type: package }`). */
  package?: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  /** True for a Markdown label (`"`…`"` in Mermaid). */
  markdown: boolean;
  stroke: Stroke;
  /** Marker at the target. */
  end: EdgeEnd;
  /** True: the same marker also at the source (`<-->`, `o--o`, `x--x`). Always false when `end` is 'none'. */
  bothEnds: boolean;
  /** Minimum length in ranks (see EDGE_LENGTHS). Missing means 1. */
  length?: number;
  /** The id written in the code (`A e1@--> B`). Missing when the code gives none. */
  ref?: string;
  /** Settings from `ref@{ … }`. Only an edge with a `ref` can have them. */
  options?: EdgeOptions;
  /** Curve name (`basis`, `linear`, `step`, …) from `ref@{ curve }` or `linkStyle n interpolate`. Not drawn yet. */
  curve?: string;
  /** From `class ref …`. Only an edge with a `ref` can have classes. */
  classes?: string[];
  /** From `linkStyle n …`. */
  styles?: string[];
  /** `%%` comment lines written above the edge. */
  comments?: string[];
  /** State diagrams: the dotted line from a note to its state. Drawn, never written. */
  noteLink?: boolean;
  /** Use case diagrams: the relationship and how its arrow is written. */
  usecase?: { relation: UseCaseRelation };
}

export interface FlowModel {
  /**
   * `swimlane`: a `swimlane-beta` diagram. The same syntax as a flowchart; its top-level subgraphs
   * are lanes. `state`: a `stateDiagram-v2` (see stateDiagram.ts). Missing for a flowchart.
   */
  kind?: 'swimlane' | 'state' | 'usecase';
  /**
   * Text before the `flowchart` line: front matter, `%%{init}%%` directives, comments.
   * Kept as it is. Missing when there is none.
   */
  preamble?: string;
  direction: Direction;
  /** `classDef` statements, in order. */
  classDefs?: ClassDef[];
  /** `%%` comments before the styling statements (`classDef`, `class`, `style`, `linkStyle`, `click`). */
  tailComments?: string[];
  /** `%%` comments after the last statement. */
  endComments?: string[];
  /** `linkStyle default …`: styles and curve for all edges. */
  linkDefaults?: { styles?: string[]; curve?: string };
  nodes: FlowNode[];
  subgraphs: FlowSubgraph[];
  edges: FlowEdge[];
}

/**
 * Classes in a fixed order: as in the `classDef` statements, then undefined ones alphabetically.
 * This is the order Mermaid applies them in (later `classDef` wins, as in CSS), and it keeps
 * the order stable when the code is written and read again.
 */
export function sortClasses(classes: readonly string[], classDefs: readonly ClassDef[] | undefined): string[] {
  const rank = new Map((classDefs ?? []).map((c, i) => [c.name, i]));
  const key = (name: string): number => rank.get(name) ?? Number.MAX_SAFE_INTEGER;
  return [...new Set(classes)].sort((a, b) => key(a) - key(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Comment lines from inspector text: one `%% ` line per non-empty line. */
export function commentsFromText(text: string): string[] {
  // The space after %% keeps a comment that starts with { from being read as a directive (%%{ … }%%).
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => `%% ${line}`);
}

/** Inspector text of comment lines, without the `%%`. */
export function commentsToText(comments: readonly string[] | undefined): string {
  return (comments ?? []).map((c) => c.replace(/^%%\s?/, '')).join('\n');
}

/** Drops empty `classes` and `styles` lists, so a cleared field leaves no statement in the code. */
function withoutEmpty<T extends Styled>(item: T, classDefs?: readonly ClassDef[]): T {
  const next = { ...item };
  if (next.classes) next.classes = sortClasses(next.classes, classDefs);
  if (next.classes?.length === 0) delete next.classes;
  if (next.styles?.length === 0) delete next.styles;
  if ((next as { comments?: string[] }).comments?.length === 0) delete (next as { comments?: string[] }).comments;
  for (const key of ['click', 'view', 'asset'] as const) {
    if (key in next && (next as Record<string, unknown>)[key] === undefined) delete (next as Record<string, unknown>)[key];
  }
  return next;
}

/** An edge id for the code (`A e1@--> B`) that no edge and no node or subgraph uses. */
export function nextEdgeRef(model: FlowModel): string {
  return freshId('e', [...model.edges.flatMap((e) => (e.ref ? [e.ref] : [])), ...vertexIds(model)]);
}

/** Returns an id that is not in `taken`, built from `prefix` and a counter. */
export function freshId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** Node and subgraph ids share one namespace in Mermaid. */
function vertexIds(model: FlowModel): string[] {
  return [...model.nodes.map((n) => n.id), ...model.subgraphs.map((s) => s.id)];
}

export function nextNodeId(model: FlowModel): string {
  return freshId('n', vertexIds(model));
}

export function nextSubgraphId(model: FlowModel): string {
  return freshId('s', vertexIds(model));
}

export function nextEdgeId(model: FlowModel): string {
  return freshId('e', model.edges.map((e) => e.id));
}

export function addNode(model: FlowModel, label = 'New node', shape: Shape = 'rect', parent: string | null = null): FlowModel {
  const node: FlowNode = { id: nextNodeId(model), label, shape, markdown: false, parent };
  return { ...model, nodes: [...model.nodes, node] };
}

export function addSubgraph(model: FlowModel, label = 'Group', parent: string | null = null): FlowModel {
  const subgraph: FlowSubgraph = { id: nextSubgraphId(model), label, markdown: false, parent, direction: null };
  return { ...model, subgraphs: [...model.subgraphs, subgraph] };
}

/**
 * Mermaid trims labels and does not accept an empty node or subgraph label: an empty label
 * becomes the id. A plain label cannot hold a newline: it becomes `<br>`.
 */
export function normalizeNodeLabel(label: string, id: string, markdown = false): string {
  return fromEditText(label, markdown) || id;
}

/** When a label turns into Markdown, `<br>` becomes a real newline (the Markdown line break). */
function relabel<T extends { label: string; markdown: boolean }>(old: T, next: T): string {
  return !old.markdown && next.markdown ? toEditText(next.label) : next.label;
}

/**
 * The `@{ … }` syntax has no plain-text label: `label: "…"` is always Markdown, and without
 * `label:` the text is the id. A node with another plain label is written with brackets.
 * A shape without brackets is always written with `@{ … }`.
 */
export function keepsAtSyntax(node: FlowNode): boolean {
  if (!SHAPE_INFO[node.shape].brackets) return true;
  return node.shapeName !== undefined && (node.markdown || node.label === node.id);
}

/**
 * Makes a node writable in the syntax it needs. A shape without brackets needs `@{ … }`,
 * so a plain label becomes a Markdown label there (`<br>` becomes a newline).
 * A shape with brackets keeps `@{ … }` only while `keepsAtSyntax` allows it.
 */
export function normalizeNode(node: FlowNode): FlowNode {
  const info = SHAPE_INFO[node.shape];
  if (!info.brackets) {
    const next = { ...node, shapeName: node.shapeName ?? info.at };
    if (!next.markdown && next.label !== next.id) {
      next.markdown = true;
      next.label = toEditText(next.label);
    }
    return next;
  }
  if (node.shapeName !== undefined && !keepsAtSyntax(node)) {
    const { shapeName: _dropped, ...rest } = node;
    return rest;
  }
  return node;
}

export function updateNode(
  model: FlowModel,
  id: string,
  patch: Partial<Pick<FlowNode, 'label' | 'shape' | 'markdown' | 'classes' | 'styles' | 'click' | 'asset' | 'comments'>>,
): FlowModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      if (n.id !== id) return n;
      const node = withoutEmpty({ ...n, ...patch }, model.classDefs);
      // State diagrams: plain text labels; an empty label is the id. Start and end have none.
      if (model.kind === 'state' || model.kind === 'usecase') return { ...node, label: node.state === 'start' || node.state === 'end' ? '' : node.label.trim() || id };
      if (node.asset) {
        // An icon or image needs no label, and its label is always Markdown (`label:` in `@{}`).
        node.label = fromEditText(relabel(n, node), node.markdown);
        return node;
      }
      node.label = normalizeNodeLabel(relabel(n, node), id, node.markdown);
      // A new shape keeps the syntax the code used, with the short name.
      if (patch.shape && patch.shape !== n.shape && (node.shapeName !== undefined || !SHAPE_INFO[patch.shape].brackets)) {
        node.shapeName = SHAPE_INFO[patch.shape].at;
      }
      return normalizeNode(node);
    }),
  };
}

export function updateSubgraph(
  model: FlowModel,
  id: string,
  patch: Partial<Pick<FlowSubgraph, 'label' | 'direction' | 'markdown' | 'classes' | 'styles' | 'view' | 'comments'>>,
): FlowModel {
  return {
    ...model,
    subgraphs: model.subgraphs.map((s) => {
      if (s.id !== id) return s;
      const subgraph = withoutEmpty({ ...s, ...patch }, model.classDefs);
      return { ...subgraph, label: normalizeNodeLabel(relabel(s, subgraph), id, subgraph.markdown) };
    }),
  };
}

export function updateEdge(model: FlowModel, id: string, patch: Partial<Omit<FlowEdge, 'id'>>): FlowModel {
  return {
    ...model,
    edges: model.edges.map((e) => {
      if (e.id !== id) return e;
      const edge = withoutEmpty({ ...e, ...patch }, model.classDefs);
      edge.label = fromEditText(relabel(e, edge), edge.markdown);
      // `class ref name` needs an edge id in the code.
      if (edge.classes && !edge.ref) edge.ref = nextEdgeRef(model);
      // An invisible link has no markers.
      if (edge.stroke === 'invisible') edge.end = 'none';
      // Mermaid has no "both ends" line without markers.
      return edge.end === 'none' ? { ...edge, bothEnds: false } : edge;
    }),
  };
}

/** The subgraph and all subgraphs inside it, at any depth. */
export function subgraphWithDescendants(model: FlowModel, id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of model.subgraphs) {
      if (s.parent !== null && result.has(s.parent) && !result.has(s.id)) {
        result.add(s.id);
        grew = true;
      }
    }
  }
  return result;
}

/**
 * Moves a node or a subgraph into `parent` (null = top level). Returns the model unchanged
 * if `parent` does not exist, or if the move would put a subgraph inside itself.
 */
export function setParent(model: FlowModel, id: string, parent: string | null): FlowModel {
  if (parent !== null && !model.subgraphs.some((s) => s.id === parent)) return model;
  if (model.nodes.some((n) => n.id === id)) {
    return { ...model, nodes: model.nodes.map((n) => (n.id === id ? { ...n, parent } : n)) };
  }
  if (model.subgraphs.some((s) => s.id === id)) {
    if (parent !== null && subgraphWithDescendants(model, id).has(parent)) return model;
    return { ...model, subgraphs: model.subgraphs.map((s) => (s.id === id ? { ...s, parent } : s)) };
  }
  return model;
}

/**
 * Removes nodes, subgraphs and edges. Edges connected to a removed node are removed too.
 * The contents of a removed subgraph are not removed: they move to the nearest parent that stays.
 */
export function removeElements(model: FlowModel, ids: Iterable<string>, edgeIds: Iterable<string>): FlowModel {
  const removed = new Set(ids);
  // A note goes with its state.
  for (const n of model.nodes) if (n.note && removed.has(n.note.of)) removed.add(n.id);
  const edges = new Set(edgeIds);
  const parentOf = new Map(model.subgraphs.map((s) => [s.id, s.parent]));
  const keptParent = (parent: string | null): string | null => {
    let p = parent;
    while (p !== null && removed.has(p)) p = parentOf.get(p) ?? null;
    return p;
  };
  return {
    ...model,
    nodes: model.nodes.filter((n) => !removed.has(n.id)).map((n) => ({ ...n, parent: keptParent(n.parent) })),
    subgraphs: model.subgraphs
      .filter((s) => !removed.has(s.id))
      .map((s) => ({ ...s, parent: keptParent(s.parent) })),
    edges: model.edges.filter((e) => !edges.has(e.id) && !removed.has(e.source) && !removed.has(e.target)),
  };
}

export function connect(model: FlowModel, source: string, target: string): FlowModel {
  const edge: FlowEdge = {
    id: nextEdgeId(model),
    source,
    target,
    label: '',
    markdown: false,
    stroke: 'normal',
    end: 'arrow',
    bothEnds: false,
  };
  return { ...model, edges: [...model.edges, edge] };
}

/** Swaps an edge's source and target. Its label, stroke and markers stay. */
export function reverseEdge(model: FlowModel, id: string): FlowModel {
  return { ...model, edges: model.edges.map((e) => (e.id === id ? { ...e, source: e.target, target: e.source } : e)) };
}

/**
 * Adds a copy of a node next to it (same parent, label, shape and styling) with a new id. Its
 * edges, comments and click are not copied. Returns the model and the new id.
 */
export function duplicateNode(model: FlowModel, id: string): { model: FlowModel; id: string } {
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return { model, id };
  const copyId = nextNodeId(model);
  const { comments: _comments, click: _click, ...rest } = node;
  // A label that is the id would show the old id: give the copy its own.
  const label = node.label === node.id ? copyId : node.label;
  const index = model.nodes.indexOf(node);
  const nodes = [...model.nodes];
  nodes.splice(index + 1, 0, { ...rest, id: copyId, label });
  return { model: { ...model, nodes }, id: copyId };
}

export type TreeItem = { kind: 'node'; node: FlowNode } | { kind: 'subgraph'; subgraph: FlowSubgraph; children: TreeItem[] };

/** The nesting tree: at each level, nodes first, then subgraphs, both in model order. */
export function buildTree(model: FlowModel, parent: string | null = null): TreeItem[] {
  const nodes: TreeItem[] = model.nodes.filter((n) => n.parent === parent).map((node) => ({ kind: 'node', node }));
  const subgraphs: TreeItem[] = model.subgraphs
    .filter((s) => s.parent === parent)
    .map((subgraph) => ({ kind: 'subgraph', subgraph, children: buildTree(model, subgraph.id) }));
  return [...nodes, ...subgraphs];
}

/**
 * Orders nodes and subgraphs as the serializer writes them (depth-first tree order).
 * Mermaid creates vertices in the order they appear in the text, so a parsed model in this
 * order gives the same model again after serialize + parse.
 */
export function canonicalOrder(model: FlowModel): FlowModel {
  const nodes: FlowNode[] = [];
  const subgraphs: FlowSubgraph[] = [];
  const walk = (items: TreeItem[]): void => {
    for (const item of items) {
      if (item.kind === 'node') {
        nodes.push(item.node);
      } else {
        subgraphs.push(item.subgraph);
        walk(item.children);
      }
    }
  };
  walk(buildTree(model));
  return { ...model, nodes, subgraphs };
}

/**
 * The diagram's edge curve: `flowchart: curve:` in the config (front matter or `%%{init}%%`).
 */
export function diagramCurve(model: FlowModel): string | null {
  return getString(readConfig(model.preamble), 'flowchart', 'curve') ?? null;
}

/** The layout engine: `layout:` in the config. Mermaid 12 uses ELK unless the code asks for dagre. */
export function diagramLayout(model: FlowModel): 'elk' | 'dagre' {
  // Lanes need ELK's partitions.
  if (model.kind === 'swimlane') return 'elk';
  return getString(readConfig(model.preamble), 'layout') === 'dagre' ? 'dagre' : 'elk';
}

/** The `title:` from the front matter in the preamble, or null. */
export function diagramTitle(model: FlowModel): string | null {
  const title = readYamlMaps(frontMatterOf(model.preamble)).title;
  return typeof title === 'string' && title !== '' ? title : typeof title === 'number' ? String(title) : null;
}

/**
 * The model as the canvas shows it (Mermaid's rules for collapsed subgraphs): the contents of a
 * collapsed subgraph are hidden, an edge that crosses its border ends at the collapsed box, and
 * an edge inside it is hidden. Nested subgraphs collapse into the outermost collapsed one.
 * Edges keep their ids, so a selected edge is still the edge in the model.
 */
export function visibleModel(model: FlowModel): FlowModel {
  if (!model.subgraphs.some((s) => s.view === 'collapsed')) return model;
  const parentOf = new Map<string, string | null>([
    ...model.nodes.map((n) => [n.id, n.parent] as const),
    ...model.subgraphs.map((s) => [s.id, s.parent] as const),
  ]);
  const collapsed = new Set(model.subgraphs.filter((s) => s.view === 'collapsed').map((s) => s.id));
  /** The outermost collapsed subgraph around `id` (not `id` itself), or null. */
  const collapsedAround = (id: string): string | null => {
    let found: string | null = null;
    for (let p = parentOf.get(id) ?? null; p !== null; p = parentOf.get(p) ?? null) if (collapsed.has(p)) found = p;
    return found;
  };
  const shownAs = (id: string): string => collapsedAround(id) ?? id;
  const edges = model.edges.flatMap((e) => {
    const source = shownAs(e.source);
    const target = shownAs(e.target);
    const moved = source !== e.source || target !== e.target;
    if (moved && source === target) return [];
    return [moved ? { ...e, source, target } : e];
  });
  return {
    ...model,
    nodes: model.nodes.filter((n) => collapsedAround(n.id) === null),
    subgraphs: model.subgraphs.filter((s) => collapsedAround(s.id) === null),
    edges,
  };
}

/** True for a swimlane diagram: its top-level subgraphs are lanes. */
export function isSwimlane(model: FlowModel): boolean {
  return model.kind === 'swimlane';
}

/** The lanes of a swimlane diagram, in order (its top-level subgraphs). Empty for a flowchart. */
export function lanesOf(model: FlowModel): FlowSubgraph[] {
  return isSwimlane(model) ? model.subgraphs.filter((s) => s.parent === null) : [];
}

/**
 * Swimlanes: the flow runs across the lanes. `swimlane-beta LR` has lanes as rows (bands that
 * span left to right) and the flow goes down through them; `TB` has lanes as columns.
 */
export function laneFlow(direction: Direction): Direction {
  return direction === 'LR' || direction === 'RL' ? 'TB' : 'LR';
}
