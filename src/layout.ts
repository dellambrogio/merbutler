/** FlowModel -> React Flow nodes and edges, positioned with dagre. */
import dagre from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type EdgeMarkerType, type Node } from '@xyflow/react';
import { MARKER_IDS } from './EdgeMarkers';
import { labelLines, visibleLength } from './labels';
import {
  buildTree,
  type Direction,
  type EdgeEnd,
  type FlowModel,
  type FlowSubgraph,
  type Shape,
  type TreeItem,
} from './model';

/** Horizontal slant of parallelograms, trapezoids and hexagons, in px. Shared with the node view. */
export const SLANT = 16;

export interface ShapeNodeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
  shape: Shape;
  sourcePosition: Position;
  targetPosition: Position;
}

export interface SubgraphNodeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
  sourcePosition: Position;
  targetPosition: Position;
}

export type ShapeNode = Node<ShapeNodeData, 'shape'>;
export type SubgraphNode = Node<SubgraphNodeData, 'subgraph'>;
export type CanvasNode = ShapeNode | SubgraphNode;

export interface LabelEdgeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
}

export type LabelEdge = Edge<LabelEdgeData, 'label'>;

const HANDLES: Record<Direction, { source: Position; target: Position }> = {
  TB: { source: Position.Bottom, target: Position.Top },
  BT: { source: Position.Top, target: Position.Bottom },
  LR: { source: Position.Right, target: Position.Left },
  RL: { source: Position.Left, target: Position.Right },
};

const CHAR_WIDTH = 7.5;

/** Space around the contents of a subgraph box. The top has room for the title. */
export const SUBGRAPH_PADDING = { side: 16, top: 34, bottom: 16 } as const;
const EMPTY_SUBGRAPH = { width: 160, height: 70 } as const;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_TEXT_WIDTH = 220;
export const LINE_HEIGHT = 18;

/** Approximate text size. Lines longer than the maximum width wrap. */
export function textSize(label: string, markdown: boolean): { width: number; height: number; lines: number } {
  const lines = labelLines(label, markdown).map((l) => visibleLength(l, markdown) * CHAR_WIDTH);
  const wrapped = lines.reduce((sum, w) => sum + Math.max(1, Math.ceil(w / MAX_TEXT_WIDTH)), 0);
  const width = Math.min(Math.max(...lines, 0), MAX_TEXT_WIDTH);
  return { width, height: wrapped * LINE_HEIGHT, lines: wrapped };
}

/** Approximate node size from the label. Exact size does not matter: dagre only needs room. */
export function nodeSize(label: string, shape: Shape, markdown = false): { width: number; height: number } {
  const text = textSize(label, markdown);
  const textWidth = Math.max(text.width, 30);
  const base = nodeSizeOneLine(textWidth, shape);
  const extra = (text.lines - 1) * LINE_HEIGHT;
  if (shape === 'circle' || shape === 'double-circle') {
    const d = Math.max(base.width, base.height + extra);
    return { width: d, height: d };
  }
  if (shape === 'diamond') return { width: base.width + extra, height: base.height + extra * 1.5 };
  return { width: base.width, height: base.height + extra };
}

function nodeSizeOneLine(textWidth: number, shape: Shape): { width: number; height: number } {
  switch (shape) {
    case 'circle': {
      const d = Math.max(textWidth + 24, 60);
      return { width: d, height: d };
    }
    case 'double-circle': {
      const d = Math.max(textWidth + 36, 70);
      return { width: d, height: d };
    }
    case 'diamond': {
      const w = Math.max(textWidth * 1.6 + 40, 90);
      return { width: w, height: Math.max(w * 0.6, 70) };
    }
    case 'stadium':
      return { width: textWidth + 48, height: 44 };
    case 'cylinder':
      return { width: textWidth + 32, height: 54 };
    case 'subroutine':
    case 'flag':
      return { width: textWidth + 48, height: 44 };
    case 'hexagon':
    case 'lean-right':
    case 'lean-left':
    case 'trapezoid':
    case 'inv-trapezoid':
      // The slanted sides take room on both ends.
      return { width: textWidth + 32 + 2 * SLANT, height: 44 };
    case 'rect':
    case 'round':
      return { width: textWidth + 32, height: 44 };
  }
}

function union(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function marker(end: EdgeEnd): EdgeMarkerType | undefined {
  switch (end) {
    case 'arrow':
      // Fixed size in px. The default unit (stroke width) makes arrows on thick edges too big.
      return { type: MarkerType.ArrowClosed, width: 27, height: 27, markerUnits: 'userSpaceOnUse' };
    case 'circle':
      return MARKER_IDS.circle;
    case 'cross':
      return MARKER_IDS.cross;
    case 'none':
      return undefined;
  }
}

/** Facts about the nesting and the edges that the layout needs. */
interface LayoutContext {
  model: FlowModel;
  parentOf: Map<string, string | null>;
  childrenOf: Map<string | null, string[]>;
  subgraphIds: Set<string>;
  /** Subgraphs that no edge crosses. They are laid out separately, with their own direction. */
  isolated: Set<string>;
  /** Direction of the layout that places each element. Used for the handle positions. */
  directionOf: Map<string, Direction>;
}

function isInside(ctx: LayoutContext, id: string, subgraph: string): boolean {
  for (let p = ctx.parentOf.get(id) ?? null; p !== null; p = ctx.parentOf.get(p) ?? null) {
    if (p === subgraph) return true;
  }
  return false;
}

/**
 * Mermaid rule: a subgraph `direction` is used only if no edge connects an element inside the
 * subgraph to an element outside it. An edge that ends at the subgraph itself does not cross.
 */
function findIsolated(ctx: LayoutContext): Set<string> {
  const isolated = new Set<string>();
  for (const s of ctx.subgraphIds) {
    const crosses = ctx.model.edges.some((e) => {
      const sourceIn = isInside(ctx, e.source, s);
      const targetIn = isInside(ctx, e.target, s);
      return (sourceIn && !targetIn && e.target !== s) || (targetIn && !sourceIn && e.source !== s);
    });
    if (!crosses) isolated.add(s);
  }
  return isolated;
}

/** The isolated subgraph whose layout places this element, or null for the top level. */
function scopeOf(ctx: LayoutContext, id: string): string | null {
  let p = ctx.parentOf.get(id) ?? null;
  while (p !== null && !ctx.isolated.has(p)) p = ctx.parentOf.get(p) ?? null;
  return p;
}

function titleWidth(subgraph: FlowSubgraph): number {
  return textSize(subgraph.label, subgraph.markdown).width + 2 * SUBGRAPH_PADDING.side;
}

/** Space above the contents of a subgraph: more for a title with several lines. */
function titleSpace(subgraph: FlowSubgraph): number {
  return SUBGRAPH_PADDING.top + (textSize(subgraph.label, subgraph.markdown).lines - 1) * LINE_HEIGHT;
}

/** Box around the contents, with room for the title. */
function padBox(inner: Box, subgraph: FlowSubgraph): Box {
  const top = titleSpace(subgraph);
  const box = {
    x: inner.x - SUBGRAPH_PADDING.side,
    y: inner.y - top,
    width: inner.width + 2 * SUBGRAPH_PADDING.side,
    height: inner.height + top + SUBGRAPH_PADDING.bottom,
  };
  const min = titleWidth(subgraph);
  return box.width >= min ? box : { ...box, x: box.x - (min - box.width) / 2, width: min };
}

/**
 * Lays out the elements of one scope (the top level, or one isolated subgraph) with dagre.
 * Isolated subgraphs inside the scope are laid out first and then placed as one block.
 * Other subgraphs are dagre clusters. Returns boxes in the coordinates of this layout.
 */
function layoutScope(ctx: LayoutContext, scope: string | null, direction: Direction): Map<string, Box> {
  const { model } = ctx;
  const members = new Set(
    [...model.nodes.map((n) => n.id), ...model.subgraphs.map((s) => s.id)].filter((id) => scopeOf(ctx, id) === scope),
  );
  const result = new Map<string, Box>();
  if (members.size === 0) return result;

  const subgraphOf = new Map(model.subgraphs.map((s) => [s.id, s]));
  const sub = (id: string): FlowSubgraph => subgraphOf.get(id) as FlowSubgraph;
  const isCluster = (id: string): boolean =>
    ctx.subgraphIds.has(id) && !ctx.isolated.has(id) && (ctx.childrenOf.get(id) ?? []).length > 0;

  // Lay out the isolated subgraphs first: their size is needed here.
  const inner = new Map<string, { boxes: Map<string, Box>; content: Box | null }>();
  for (const id of members) {
    if (!ctx.isolated.has(id)) continue;
    const boxes = layoutScope(ctx, id, sub(id).direction ?? direction);
    inner.set(id, { boxes, content: boxes.size > 0 ? union([...boxes.values()]) : null });
  }

  const g = new dagre.graphlib.Graph({ multigraph: true, compound: true });
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of members) {
    ctx.directionOf.set(id, direction);
    const node = model.nodes.find((n) => n.id === id);
    if (node) {
      g.setNode(id, nodeSize(node.label, node.shape, node.markdown));
    } else if (isCluster(id)) {
      g.setNode(id, {}); // A cluster has no own size.
    } else {
      const content = inner.get(id)?.content;
      const size = content ? padBox(content, sub(id)) : { ...EMPTY_SUBGRAPH };
      g.setNode(id, { width: Math.max(size.width, titleWidth(sub(id))), height: size.height });
    }
  }
  for (const id of members) {
    const parent = ctx.parentOf.get(id) ?? null;
    if (parent !== scope && parent !== null) g.setParent(id, parent);
  }

  /** dagre cannot connect edges to a cluster. Such an edge uses an element inside the cluster. */
  const leafOf = (id: string): string => {
    if (!isCluster(id)) return id;
    const first = (ctx.childrenOf.get(id) ?? [])[0];
    return leafOf(first);
  };
  /** The member of this scope that contains the edge end, or null if the end is not in this scope. */
  const lift = (id: string): string | null => {
    let cur: string | null = id;
    while (cur !== null && !members.has(cur)) {
      if (cur === scope) return null; // An edge from inside to the scope subgraph itself.
      cur = ctx.parentOf.get(cur) ?? null;
    }
    return cur === null ? null : leafOf(cur);
  };
  for (const edge of model.edges) {
    const source = lift(edge.source);
    const target = lift(edge.target);
    if (source === null || target === null || source === target) continue;
    // Edge labels need room between ranks.
    const label = edge.label ? textSize(edge.label, edge.markdown) : {};
    g.setEdge(source, target, label, edge.id);
  }
  dagre.layout(g);

  const dagreBox = (id: string): Box => {
    const { x, y, width, height } = g.node(id);
    return { x: x - width / 2, y: y - height / 2, width, height };
  };
  // Cluster boxes come from their contents, so there is room for the title.
  const boxOf = (id: string): Box => {
    const known = result.get(id);
    if (known) return known;
    const box = isCluster(id)
      ? padBox(union((ctx.childrenOf.get(id) ?? []).map(boxOf)), sub(id))
      : dagreBox(id);
    result.set(id, box);
    return box;
  };
  for (const id of members) boxOf(id);

  // Move the contents of each isolated subgraph into its box, below the title.
  for (const [id, { boxes, content }] of inner) {
    if (!content) continue;
    const box = result.get(id) as Box;
    const dx = box.x + (box.width - content.width) / 2 - content.x;
    const dy = box.y + titleSpace(sub(id)) - content.y;
    for (const [childId, b] of boxes) result.set(childId, { ...b, x: b.x + dx, y: b.y + dy });
  }
  return result;
}

export function layoutModel(model: FlowModel): { nodes: CanvasNode[]; edges: LabelEdge[] } {
  const parentOf = new Map<string, string | null>();
  const childrenOf = new Map<string | null, string[]>();
  const addChild = (parent: string | null, id: string): void => {
    parentOf.set(id, parent);
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), id]);
  };
  for (const n of model.nodes) addChild(n.parent, n.id);
  for (const s of model.subgraphs) addChild(s.parent, s.id);

  const ctx: LayoutContext = {
    model,
    parentOf,
    childrenOf,
    subgraphIds: new Set(model.subgraphs.map((s) => s.id)),
    isolated: new Set(),
    directionOf: new Map(),
  };
  ctx.isolated = findIsolated(ctx);
  const boxes = layoutScope(ctx, null, model.direction);

  const nodes: CanvasNode[] = [];
  /** React Flow needs each parent before its children, and child positions relative to the parent. */
  const emit = (items: TreeItem[], parent: string | null): void => {
    const origin = parent ? (boxes.get(parent) as Box) : { x: 0, y: 0 };
    for (const item of items) {
      const id = item.kind === 'node' ? item.node.id : item.subgraph.id;
      const box = boxes.get(id) as Box;
      const handles = HANDLES[ctx.directionOf.get(id) ?? model.direction];
      const common = {
        id,
        position: { x: box.x - origin.x, y: box.y - origin.y },
        width: box.width,
        height: box.height,
        ...(parent ? { parentId: parent } : {}),
      };
      if (item.kind === 'node') {
        nodes.push({
          ...common,
          type: 'shape',
          data: {
            label: item.node.label,
            markdown: item.node.markdown,
            shape: item.node.shape,
            sourcePosition: handles.source,
            targetPosition: handles.target,
          },
        });
      } else {
        nodes.push({
          ...common,
          type: 'subgraph',
          data: {
            label: item.subgraph.label,
            markdown: item.subgraph.markdown,
            sourcePosition: handles.source,
            targetPosition: handles.target,
          },
        });
        emit(item.children, id);
      }
    }
  };
  emit(buildTree(model), null);

  const edges: LabelEdge[] = model.edges.map((edge) => ({
    id: edge.id,
    type: 'label',
    source: edge.source,
    target: edge.target,
    data: { label: edge.label, markdown: edge.markdown },
    // Edges between nodes in different subgraphs must draw above the subgraph boxes.
    zIndex: 1,
    markerEnd: marker(edge.end),
    markerStart: edge.bothEnds ? marker(edge.end) : undefined,
    style: {
      strokeWidth: edge.stroke === 'thick' ? 3.5 : 1.5,
      strokeDasharray: edge.stroke === 'dotted' ? '5 5' : undefined,
    },
  }));

  return { nodes, edges };
}
