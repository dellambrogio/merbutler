/** FlowModel -> React Flow nodes and edges, positioned with dagre. */
import dagre from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type EdgeMarkerType, type Node } from '@xyflow/react';
import { MARKER_IDS } from './EdgeMarkers';
import { labelLines, visibleLength } from './labels';
import { SHAPE_INFO } from './shapes';
import { edgeLook, isPlain, nodeLook, subgraphLook, type Look } from './styling';
import {
  buildTree,
  diagramCurve,
  visibleModel,
  type Asset,
  type Direction,
  type EdgeEnd,
  type FlowModel,
  type FlowSubgraph,
  type Shape,
  type Stroke,
  type TreeItem,
} from './model';

export interface ShapeNodeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
  /** Colors and font from classDef/class/style. Missing when the node has none. */
  look?: Look;
  /** The rest of the node's `click` statement, shown as a badge. */
  click?: string;
  /** Icon or image: drawn instead of the shape. */
  asset?: Asset;
  shape: Shape;
  sourcePosition: Position;
  targetPosition: Position;
}

export interface SubgraphNodeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
  /** Drawn as one box; the contents are hidden. */
  collapsed: boolean;
  look?: Look;
  sourcePosition: Position;
  targetPosition: Position;
}

export type ShapeNode = Node<ShapeNodeData, 'shape'>;
export type SubgraphNode = Node<SubgraphNodeData, 'subgraph'>;
export type CanvasNode = ShapeNode | SubgraphNode;

export interface LabelEdgeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
  look?: Look;
  /** Mermaid curve name (`linear`, `step`, `basis`, …) for this edge. Missing: the default curve. */
  curve?: string;
  /** Step number from `id@{ step: n }`, shown on the edge. */
  step?: number;
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

/** Default icon size in Mermaid, and its minimum. */
export const ICON_SIZE = 48;
/** Image size when the code gives none (Mermaid uses the natural size of the loaded image). */
export const IMAGE_SIZE = 80;
/** Gap between an icon or image and its label. */
export const ASSET_GAP = 4;

/** Picture size of an icon or image node, from its `w`/`h`. */
export function assetPicture(asset: Asset): { width: number; height: number } {
  if (asset.kind === 'icon') {
    const size = Math.max(asset.h ?? ICON_SIZE, ICON_SIZE);
    return { width: size, height: size };
  }
  const width = asset.w ?? asset.h ?? IMAGE_SIZE;
  return { width, height: asset.h ?? width };
}

/** An icon or image with its label above or below it. */
function assetNodeSize(label: string, markdown: boolean, asset: Asset): { width: number; height: number } {
  const picture = assetPicture(asset);
  if (label === '') return picture;
  const text = textSize(label, markdown);
  return { width: Math.max(picture.width, text.width + 8), height: picture.height + ASSET_GAP + text.height };
}

/** Approximate node size from the label. Exact size does not matter: dagre only needs room. */
export function nodeSize(label: string, shape: Shape, markdown = false, direction: Direction = 'TB'): { width: number; height: number } {
  return SHAPE_INFO[shape].size(textSize(label, markdown), direction === 'TB' || direction === 'BT');
}

function union(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** `look` only when there is something to draw, so plain elements keep plain data. */
function lookField(look: Look): { look?: Look } {
  return isPlain(look) ? {} : { look };
}

/** `color` gives an arrow the edge's own stroke color. Circle and cross markers keep the default color. */
function marker(end: EdgeEnd, color?: string): EdgeMarkerType | undefined {
  switch (end) {
    case 'arrow':
      // Fixed size in px. The default unit (stroke width) makes arrows on thick edges too big.
      return { type: MarkerType.ArrowClosed, width: 27, height: 27, markerUnits: 'userSpaceOnUse', ...(color ? { color } : {}) };
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

/** A collapsed subgraph: one box with its title and a toggle. */
function collapsedSize(subgraph: FlowSubgraph): { width: number; height: number } {
  const text = textSize(subgraph.label, subgraph.markdown);
  return { width: Math.max(text.width, 30) + 2 * SUBGRAPH_PADDING.side + 24, height: text.height + 26 };
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
      g.setNode(id, node.asset ? assetNodeSize(node.label, node.markdown, node.asset) : nodeSize(node.label, node.shape, node.markdown, direction));
    } else if (isCluster(id)) {
      g.setNode(id, {}); // A cluster has no own size.
    } else {
      const content = inner.get(id)?.content;
      const size = sub(id).view === 'collapsed' ? collapsedSize(sub(id)) : content ? padBox(content, sub(id)) : { ...EMPTY_SUBGRAPH };
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
    g.setEdge(source, target, { ...label, minlen: edge.length ?? 1 }, edge.id);
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

const STROKE_DASHES: Record<Stroke, string | undefined> = {
  normal: undefined,
  thick: undefined,
  dotted: '5 5',
  invisible: '1 5',
};

export function layoutModel(full: FlowModel): { nodes: CanvasNode[]; edges: LabelEdge[] } {
  // Collapsed subgraphs: their contents are not drawn, crossing edges end at the box.
  const model = visibleModel(full);
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
            ...lookField(nodeLook(model, item.node)),
            ...(item.node.click ? { click: item.node.click } : {}),
            ...(item.node.asset ? { asset: item.node.asset } : {}),
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
            collapsed: item.subgraph.view === 'collapsed',
            ...lookField(subgraphLook(model, item.subgraph)),
            sourcePosition: handles.source,
            targetPosition: handles.target,
          },
        });
        emit(item.children, id);
      }
    }
  };
  emit(buildTree(model), null);

  const defaultCurve = model.linkDefaults?.curve ?? diagramCurve(model) ?? undefined;
  const edges: LabelEdge[] = model.edges.map((edge) => {
    const look = edgeLook(model, edge);
    const curve = edge.curve ?? defaultCurve;
    const { animate, animation, step } = edge.options ?? {};
    // Mermaid: `animation: fast|slow` alone also turns the animation on.
    const animated = animate === true || (animate === undefined && animation !== undefined);
    return {
      id: edge.id,
      type: 'label',
      source: edge.source,
      target: edge.target,
      data: {
        label: edge.label,
        markdown: edge.markdown,
        ...lookField(look),
        ...(curve ? { curve } : {}),
        ...(step !== undefined ? { step } : {}),
      },
      ...(animated ? { animated: true, className: `edge-anim-${animation ?? 'fast'}` } : {}),
      // Edges between nodes in different subgraphs must draw above the subgraph boxes.
      zIndex: 1,
      markerEnd: marker(edge.end, look.stroke),
      markerStart: edge.bothEnds ? marker(edge.end, look.stroke) : undefined,
      style: {
        strokeWidth: look.strokeWidth ?? (edge.stroke === 'thick' ? 3.5 : 1.5),
        strokeDasharray: look.strokeDasharray ?? STROKE_DASHES[edge.stroke],
        stroke: look.stroke,
        // Mermaid does not draw an invisible link. The canvas shows it faintly, so it can be selected.
        opacity: edge.stroke === 'invisible' ? 0.4 : undefined,
      },
    };
  });

  return { nodes, edges };
}
