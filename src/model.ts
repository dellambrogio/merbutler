import { fromEditText, toEditText } from './labels';

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';
export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'double-circle'
  | 'flag'
  | 'diamond'
  | 'hexagon'
  | 'lean-right'
  | 'lean-left'
  | 'trapezoid'
  | 'inv-trapezoid';
export type Stroke = 'normal' | 'dotted' | 'thick';
export type EdgeEnd = 'none' | 'arrow' | 'circle' | 'cross';

export const DIRECTIONS: readonly Direction[] = ['TB', 'LR', 'BT', 'RL'];
export const SHAPES: readonly Shape[] = [
  'rect',
  'round',
  'stadium',
  'subroutine',
  'cylinder',
  'circle',
  'double-circle',
  'flag',
  'diamond',
  'hexagon',
  'lean-right',
  'lean-left',
  'trapezoid',
  'inv-trapezoid',
];
export const STROKES: readonly Stroke[] = ['normal', 'dotted', 'thick'];
export const EDGE_ENDS: readonly EdgeEnd[] = ['none', 'arrow', 'circle', 'cross'];

export interface FlowNode {
  id: string;
  label: string;
  shape: Shape;
  /** True for a Markdown label (`"`…`"` in Mermaid). */
  markdown: boolean;
  /** Id of the subgraph that contains the node, or null at the top level. */
  parent: string | null;
}

export interface FlowSubgraph {
  id: string;
  label: string;
  /** True for a Markdown title (`"`…`"` in Mermaid). */
  markdown: boolean;
  /** Id of the subgraph that contains this subgraph, or null at the top level. */
  parent: string | null;
  /** `direction` statement inside the subgraph. Kept in the code; the canvas layout ignores it. */
  direction: Direction | null;
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
}

export interface FlowModel {
  direction: Direction;
  nodes: FlowNode[];
  subgraphs: FlowSubgraph[];
  edges: FlowEdge[];
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

export function updateNode(
  model: FlowModel,
  id: string,
  patch: Partial<Pick<FlowNode, 'label' | 'shape' | 'markdown'>>,
): FlowModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      if (n.id !== id) return n;
      const node = { ...n, ...patch };
      return { ...node, label: normalizeNodeLabel(relabel(n, node), id, node.markdown) };
    }),
  };
}

export function updateSubgraph(
  model: FlowModel,
  id: string,
  patch: Partial<Pick<FlowSubgraph, 'label' | 'direction' | 'markdown'>>,
): FlowModel {
  return {
    ...model,
    subgraphs: model.subgraphs.map((s) => {
      if (s.id !== id) return s;
      const subgraph = { ...s, ...patch };
      return { ...subgraph, label: normalizeNodeLabel(relabel(s, subgraph), id, subgraph.markdown) };
    }),
  };
}

export function updateEdge(model: FlowModel, id: string, patch: Partial<Omit<FlowEdge, 'id'>>): FlowModel {
  return {
    ...model,
    edges: model.edges.map((e) => {
      if (e.id !== id) return e;
      const edge = { ...e, ...patch };
      edge.label = fromEditText(relabel(e, edge), edge.markdown);
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
