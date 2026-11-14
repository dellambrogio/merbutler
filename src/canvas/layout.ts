/** FlowModel -> React Flow nodes and edges, positioned with dagre. */
import dagre from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type EdgeMarkerType, type Node } from '@xyflow/react';
import { MARKER_IDS } from './EdgeMarkers';
import { clipRoute, outlineOf } from './clip';
import { labelLines, markdownRuns } from '../core/labels';
import { get, readConfig } from '../core/config';
import { BUNDLED_PREFIXES, LABEL_ICON } from '../flowchart/icons';
import { SHAPE_INFO } from '../flowchart/shapes';
import { diagramTheme } from '../flowchart/themes';
import { edgeLook, isPlain, nodeLook, subgraphLook, type Look } from '../flowchart/styling';
import {
  buildTree,
  diagramCurve,
  laneFlow,
  lanesOf,
  visibleModel,
  type Asset,
  type Direction,
  type EdgeEnd,
  type FlowEdge,
  type FlowModel,
  type FlowSubgraph,
  type Shape,
  type Stroke,
  type TreeItem,
} from '../core/model';

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
  /** State diagrams: a concurrency region (no title, dashed). */
  region?: boolean;
  /** A swimlane: a band with its title along its start. `rows`: the lanes are rows (title on the left). */
  lane?: { rows: boolean; index: number };
  look?: Look;
  sourcePosition: Position;
  targetPosition: Position;
}

export type ShapeNode = Node<ShapeNodeData, 'shape'>;
export type SubgraphNode = Node<SubgraphNodeData, 'subgraph'>;
export type CanvasNode = ShapeNode | SubgraphNode;

/** A route from the layout engine (ELK), in absolute canvas coordinates. */
export interface EdgeRoute {
  points: Array<{ x: number; y: number }>;
  /** Center of the label, where the layout left room for it. */
  label?: { x: number; y: number };
}

export interface LabelEdgeData extends Record<string, unknown> {
  label: string;
  markdown: boolean;
  look?: Look;
  /** Mermaid curve name (`linear`, `step`, `basis`, …) for this edge. Missing: the default curve. */
  curve?: string;
  /** Step number from `id@{ step: n }`, shown on the edge. */
  step?: number;
  /** The layout's route. Missing for dagre, and after a node of the edge was dragged. */
  route?: EdgeRoute;
  /** Free layout: a straight line between the outlines of the ends, that follows them as they move. */
  floating?: boolean;
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
export const EMPTY_SUBGRAPH = { width: 160, height: 70 } as const;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const LINE_HEIGHT = 18;
/** Label font size on the canvas, in px (see styles.css). */
const FONT_SIZE = 14;

/** How labels are measured and wrapped. */
export interface TextSettings {
  /** CSS font family of the labels. */
  font: string;
  /** Lines wider than this wrap (Mermaid's `flowchart.wrappingWidth`, 200 by default). */
  wrapWidth: number;
  /** Markdown labels wrap too (Mermaid's `markdownAutoWrap`, true by default). */
  markdownWrap: boolean;
}

export const DEFAULT_TEXT: TextSettings = { font: 'system-ui, sans-serif', wrapWidth: 200, markdownWrap: true };

let measureContext: OffscreenCanvasRenderingContext2D | null | undefined;

/** Width of a text in px, measured by the browser, or null where it cannot measure (tests). */
function measure(text: string, font: string, bold: boolean): number | null {
  if (measureContext === undefined) {
    measureContext = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  }
  if (!measureContext) return null;
  measureContext.font = `${bold ? '600 ' : ''}${FONT_SIZE}px ${font}`;
  return measureContext.measureText(text).width;
}

function lineWidth(line: string, markdown: boolean, settings: TextSettings): number {
  const runs = markdown ? markdownRuns(line) : [{ text: line, bold: false }];
  let width = 0;
  for (const run of runs) {
    // A bundled icon (`fa:fa-name`) is drawn 1em wide; other tokens stay text.
    let text = run.text;
    for (const m of run.text.matchAll(LABEL_ICON)) {
      if (!BUNDLED_PREFIXES.has(m[1])) continue;
      text = text.replace(m[0], '');
      width += FONT_SIZE;
    }
    width += measure(text, settings.font, run.bold) ?? text.length * CHAR_WIDTH;
  }
  return width;
}

/** Text size of a label. Lines wider than the wrap width wrap, as in Mermaid. */
export function textSize(label: string, markdown: boolean, settings: TextSettings = DEFAULT_TEXT): { width: number; height: number; lines: number } {
  const lines = labelLines(label, markdown).map((l) => lineWidth(l, markdown, settings));
  const wrap = !markdown || settings.markdownWrap ? settings.wrapWidth : Infinity;
  const wrapped = lines.reduce((sum, w) => sum + Math.max(1, Math.ceil(w / wrap)), 0);
  const width = Math.min(Math.max(...lines, 0), wrap);
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
export function assetNodeSize(label: string, markdown: boolean, asset: Asset, text: TextSettings = DEFAULT_TEXT): { width: number; height: number } {
  const picture = assetPicture(asset);
  if (label === '') return picture;
  const size = textSize(label, markdown, text);
  return { width: Math.max(picture.width, size.width + 8), height: picture.height + ASSET_GAP + size.height };
}

/** Approximate node size from the label. Exact size does not matter: dagre only needs room. */
export function nodeSize(
  label: string,
  shape: Shape,
  markdown = false,
  direction: Direction = 'TB',
  text: TextSettings = DEFAULT_TEXT,
): { width: number; height: number } {
  return SHAPE_INFO[shape].size(textSize(label, markdown, text), direction === 'TB' || direction === 'BT');
}

export function union(boxes: Box[]): Box {
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
export interface LayoutContext {
  model: FlowModel;
  parentOf: Map<string, string | null>;
  childrenOf: Map<string | null, string[]>;
  subgraphIds: Set<string>;
  /** Subgraphs that no edge crosses. They are laid out separately, with their own direction. */
  isolated: Set<string>;
  /** Direction of the layout that places each element. Used for the handle positions. */
  directionOf: Map<string, Direction>;
  /** How labels are measured: font from the theme, wrapping from the config. */
  text: TextSettings;
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
export function findIsolated(ctx: LayoutContext): Set<string> {
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

export function titleWidth(subgraph: FlowSubgraph, text: TextSettings = DEFAULT_TEXT): number {
  return textSize(subgraph.label, subgraph.markdown, text).width + 2 * SUBGRAPH_PADDING.side;
}

/** Space above the contents of a subgraph: more for a title with several lines. */
export function titleSpace(subgraph: FlowSubgraph, text: TextSettings = DEFAULT_TEXT): number {
  return SUBGRAPH_PADDING.top + (textSize(subgraph.label, subgraph.markdown, text).lines - 1) * LINE_HEIGHT;
}

/** A collapsed subgraph: one box with its title and a toggle. */
export function collapsedSize(subgraph: FlowSubgraph, text: TextSettings = DEFAULT_TEXT): { width: number; height: number } {
  const size = textSize(subgraph.label, subgraph.markdown, text);
  return { width: Math.max(size.width, 30) + 2 * SUBGRAPH_PADDING.side + 24, height: size.height + 26 };
}

/** Box around the contents, with room for the title. */
export function padBox(inner: Box, subgraph: FlowSubgraph, text: TextSettings): Box {
  const top = titleSpace(subgraph, text);
  const box = {
    x: inner.x - SUBGRAPH_PADDING.side,
    y: inner.y - top,
    width: inner.width + 2 * SUBGRAPH_PADDING.side,
    height: inner.height + top + SUBGRAPH_PADDING.bottom,
  };
  const min = titleWidth(subgraph, text);
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
      g.setNode(id, node.asset ? assetNodeSize(node.label, node.markdown, node.asset, ctx.text) : nodeSize(node.label, node.shape, node.markdown, direction, ctx.text));
    } else if (isCluster(id)) {
      g.setNode(id, {}); // A cluster has no own size.
    } else {
      const content = inner.get(id)?.content;
      const size = sub(id).view === 'collapsed' ? collapsedSize(sub(id), ctx.text) : content ? padBox(content, sub(id), ctx.text) : { ...EMPTY_SUBGRAPH };
      g.setNode(id, { width: Math.max(size.width, titleWidth(sub(id), ctx.text)), height: size.height });
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
    const label = edge.label ? textSize(edge.label, edge.markdown, ctx.text) : {};
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
      ? padBox(union((ctx.childrenOf.get(id) ?? []).map(boxOf)), sub(id), ctx.text)
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

/** Label font from the theme (if the code sets one), wrapping from the config. */
export function textSettings(model: FlowModel): TextSettings {
  const config = readConfig(model.preamble);
  const wrap = get(config, 'flowchart', 'wrappingWidth');
  const markdownWrap = get(config, 'markdownAutoWrap') ?? get(config, 'flowchart', 'markdownAutoWrap');
  return {
    font: diagramTheme(model)?.palette.font ?? DEFAULT_TEXT.font,
    wrapWidth: typeof wrap === 'number' && wrap > 0 ? wrap : DEFAULT_TEXT.wrapWidth,
    markdownWrap: markdownWrap !== false,
  };
}

/** Yellow, as Mermaid draws state notes. */
const NOTE_LOOK: Look = { fill: '#fff5ad', stroke: '#aaaa33', color: '#333333' };
/** A state diagram's start is a filled dot. */
const START_LOOK: Look = { fill: 'var(--node-stroke)' };

/** State diagrams: choice, fork and join have no visible label (Mermaid draws only the shape). */
function stateView(model: FlowModel): FlowModel {
  if (model.kind !== 'state') return model;
  return { ...model, nodes: model.nodes.map((n) => (n.state === 'choice' || n.state === 'fork' || n.state === 'join' ? { ...n, label: '' } : n)) };
}

/** The model as the canvas shows it, with the maps both layout engines need. */
export function layoutContext(full: FlowModel): LayoutContext {
  // Collapsed subgraphs: their contents are not drawn, crossing edges end at the box.
  const model = stateView(visibleModel(full));
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
    text: textSettings(full),
  };
  ctx.isolated = findIsolated(ctx);
  return ctx;
}

/** Lays out with dagre (`layout: dagre` in Mermaid). Synchronous. */
export function layoutModel(full: FlowModel): { nodes: CanvasNode[]; edges: LabelEdge[] } {
  const ctx = layoutContext(full);
  return canvasFrom(ctx, layoutScope(ctx, null, ctx.model.direction));
}

/**
 * React Flow nodes and edges from laid-out boxes (absolute positions) and the direction of each
 * element (`ctx.directionOf`, for the handles).
 */
export function canvasFrom(
  ctx: LayoutContext,
  boxes: Map<string, Box>,
  routes: Map<string, EdgeRoute> = new Map(),
): { nodes: CanvasNode[]; edges: LabelEdge[] } {
  const { model } = ctx;
  const nodes: CanvasNode[] = [];
  const laneIndex = new Map(lanesOf(model).map((lane, i) => [lane.id, i]));
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
            ...lookField({
              ...(item.node.state === 'note' ? NOTE_LOOK : item.node.state === 'start' ? START_LOOK : {}),
              ...nodeLook(model, item.node),
            }),
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
            ...(item.subgraph.region ? { region: true } : {}),
            ...(laneIndex.has(id) ? { lane: { rows: laneFlow(model.direction) === 'TB', index: laneIndex.get(id)! } } : {}),
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
  const shapeOf = new Map(model.nodes.filter((n) => !n.asset).map((n) => [n.id, n.shape]));
  /** The outline and center of an edge end, so a layout route ends on the shape, not on its box. */
  const endOf = (id: string): { outline: ReturnType<typeof outlineOf>; center: { x: number; y: number } } => {
    const box = boxes.get(id);
    const shape = shapeOf.get(id);
    if (!box) return { outline: null, center: { x: 0, y: 0 } };
    return { outline: shape ? outlineOf(shape, box) : null, center: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
  };
  const routeOf = (edge: FlowEdge): EdgeRoute | undefined => {
    const route = routes.get(edge.id);
    return route ? { ...route, points: clipRoute(route.points, endOf(edge.source), endOf(edge.target)) } : undefined;
  };
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
        // Use case include and extend: shown as Mermaid labels them.
        label: edge.usecase?.relation === 'include' || edge.usecase?.relation === 'extend' ? `«${edge.usecase.relation}»` : edge.label,
        markdown: edge.markdown,
        ...lookField(look),
        ...(curve ? { curve } : {}),
        ...(step !== undefined ? { step } : {}),
        ...(routes.has(edge.id) ? { route: routeOf(edge) } : {}),
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
