/**
 * Chooses the layout engine as Mermaid 12 does (`layout: dagre` in the config, else ELK) and
 * runs it. Both engines give boxes for the same canvas nodes and edges (layout.ts).
 */
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import {
  assetNodeSize,
  canvasFrom,
  collapsedSize,
  EMPTY_SUBGRAPH,
  layoutContext,
  layoutModel,
  nodeSize,
  SUBGRAPH_PADDING,
  textSize,
  titleSpace,
  titleWidth,
  type Box,
  type CanvasNode,
  type EdgeRoute,
  type LabelEdge,
  type LayoutContext,
} from './layout';
import { cyclicEntryNodes, diagramElkConfig, elkLayoutOptions, resolvedElk } from './elkConfig';
import { diagramLayout, laneFlow, lanesOf, type Direction, type FlowModel, type FlowSubgraph } from '../core/model';

/** ELK is large (about 1.5 MB), so it loads on the first ELK layout, as its own chunk. */
let elkInstance: Promise<{ layout: (graph: ElkNode) => Promise<ElkNode> }> | null = null;
function loadElk(): Promise<{ layout: (graph: ElkNode) => Promise<ElkNode> }> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK());
  return elkInstance;
}

const ELK_DIRECTION: Record<Direction, string> = { TB: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' };

/** Lays out the model with the engine its code asks for. */
export async function layoutCanvas(model: FlowModel): Promise<{ nodes: CanvasNode[]; edges: LabelEdge[] }> {
  if (diagramLayout(model) === 'dagre') return layoutModel(model);
  const ctx = layoutContext(model);
  const { boxes, routes } = await elkLayout(ctx);
  return canvasFrom(ctx, boxes, routes);
}

/**
 * The direction that places each element: the subgraph `direction` of the nearest isolated
 * subgraph around it (Mermaid's rule, see findIsolated), else the diagram direction.
 */
function directions(ctx: LayoutContext): Map<string, Direction> {
  const subgraph = new Map<string, FlowSubgraph>(ctx.model.subgraphs.map((s) => [s.id, s]));
  const inside = (id: string | null): Direction => {
    if (id === null) return ctx.model.direction;
    const own = ctx.isolated.has(id) ? subgraph.get(id)?.direction : null;
    return own ?? inside(ctx.parentOf.get(id) ?? null);
  };
  const result = new Map<string, Direction>();
  for (const id of ctx.parentOf.keys()) result.set(id, inside(ctx.parentOf.get(id) ?? null));
  return result;
}

/** Thickness of a lane's title strip, at the start of the lane. */
export const LANE_TITLE = 36;
/** Space between a lane's border and the elements in it, across the flow. */
const LANE_PADDING = 20;
const MARGIN = 20;


/** Runs ELK (layered, like Mermaid). Returns absolute boxes by id, and the edge routes ELK found. */
export async function elkLayout(ctx: LayoutContext): Promise<{ boxes: Map<string, Box>; routes: Map<string, EdgeRoute> }> {
  const { model } = ctx;
  ctx.directionOf = directions(ctx);
  // Swimlanes: lanes are bands, not ELK nodes. Each lane's contents form one ELK partition, in lane order.
  const lanes = lanesOf(model);
  const laneIds = new Set(lanes.map((l) => l.id));
  const flow: Direction = model.kind === 'swimlane' ? laneFlow(model.direction) : model.direction;
  const rows = flow === 'TB';
  if (model.kind === 'swimlane') {
    for (const [id, dir] of ctx.directionOf) if (dir === model.direction) ctx.directionOf.set(id, flow);
  }
  const subgraphOf = new Map(model.subgraphs.map((s) => [s.id, s]));
  const nodeOf = new Map(model.nodes.map((n) => [n.id, n]));
  const hasChildren = (id: string): boolean => (ctx.childrenOf.get(id) ?? []).length > 0;
  // The `elk:` config, as Mermaid applies it.
  const elk = diagramElkConfig(model);
  const elkOptions = elkLayoutOptions(elk);
  const entries = resolvedElk(elk).keepEntryNodeOnTop
    ? cyclicEntryNodes(
        [...model.subgraphs, ...model.nodes].filter((i) => ctx.parentOf.has(i.id)).map((i) => ({ id: i.id, parent: ctx.parentOf.get(i.id) ?? null })),
        model.edges,
      )
    : new Set<string>();
  const entryOptions = (id: string): Partial<ElkNode> =>
    entries.has(id) ? { layoutOptions: { 'elk.layered.layering.layerConstraint': 'FIRST' } } : {};

  const elkNode = (id: string): ElkNode => {
    const direction = ctx.directionOf.get(id) ?? flow;
    const node = nodeOf.get(id);
    if (node) {
      const size = node.asset ? assetNodeSize(node.label, node.markdown, node.asset, ctx.text) : nodeSize(node.label, node.shape, node.markdown, direction, ctx.text);
      return { id, ...size, ...entryOptions(id) };
    }
    const sub = subgraphOf.get(id) as FlowSubgraph;
    if (sub.view === 'collapsed') return { id, ...collapsedSize(sub, ctx.text), ...entryOptions(id) };
    if (!hasChildren(id)) return { id, width: Math.max(EMPTY_SUBGRAPH.width, titleWidth(sub, ctx.text)), height: EMPTY_SUBGRAPH.height, ...entryOptions(id) };
    const side = SUBGRAPH_PADDING.side;
    return {
      id,
      layoutOptions: {
        ...elkOptions.subgraph,
        ...(entries.has(id) ? { 'elk.layered.layering.layerConstraint': 'FIRST' } : {}),
        'elk.padding': `[top=${titleSpace(sub, ctx.text)},left=${side},bottom=${SUBGRAPH_PADDING.bottom},right=${side}]`,
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${titleWidth(sub, ctx.text)}, 40)`,
        // An isolated subgraph is laid out on its own, in its own direction (Mermaid's rule).
        ...(ctx.isolated.has(id)
          ? { 'elk.hierarchyHandling': 'SEPARATE_CHILDREN', 'elk.direction': ELK_DIRECTION[sub.direction ?? direction] }
          : {}),
      },
      children: (ctx.childrenOf.get(id) ?? []).map(elkNode),
      edges: [],
    };
  };

  /** The top-level ELK children: for swimlanes, the contents of each lane with its partition. */
  const topLevel = (): ElkNode[] => {
    if (model.kind !== 'swimlane') return (ctx.childrenOf.get(null) ?? []).map(elkNode);
    const partition = (n: ElkNode, i: number): ElkNode => ({ ...n, layoutOptions: { ...n.layoutOptions, 'elk.partitioning.partition': String(i) } });
    const out: ElkNode[] = [];
    lanes.forEach((lane, i) => {
      const children = ctx.childrenOf.get(lane.id) ?? [];
      // A collapsed or empty lane keeps its band: a placeholder holds its place in the flow.
      if (children.length === 0) out.push(partition({ id: laneSpacer(lane.id), width: rows ? 1 : 120, height: rows ? 40 : 1 }, i));
      for (const child of children) out.push(partition(elkNode(child), i));
    });
    // Nodes outside the lanes get their own band, after the lanes.
    for (const id of ctx.childrenOf.get(null) ?? []) if (!laneIds.has(id)) out.push(partition(elkNode(id), lanes.length));
    return out;
  };
  const titleSide = model.kind === 'swimlane' ? MARGIN + LANE_TITLE + LANE_PADDING : MARGIN;

  const lanePadding = MARGIN + LANE_PADDING;
  const root: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[flow],
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.spacing.edgeLabel': '6',
      ...elkOptions.root,
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
      ...(model.kind === 'swimlane'
        ? {
            'elk.partitioning.activate': 'true',
            // Room for the lane titles at the start of the lanes, and for the lane borders between layers.
            'elk.padding': rows
              ? `[top=${lanePadding},left=${titleSide},bottom=${lanePadding},right=${lanePadding}]`
              : `[top=${titleSide},left=${lanePadding},bottom=${lanePadding},right=${lanePadding}]`,
            'elk.layered.spacing.nodeNodeBetweenLayers': String(60 + LANE_PADDING),
          }
        : {}),
    },
    children: topLevel(),
    edges: [],
  };

  // ELK wants each edge in the lowest compound node that contains both ends.
  const byId = new Map<string, ElkNode>();
  const index = (n: ElkNode): void => {
    byId.set(n.id, n);
    for (const c of n.children ?? []) index(c);
  };
  index(root);
  // Lanes are not ELK nodes: they do not contain edges.
  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    for (let p = ctx.parentOf.get(id) ?? null; p !== null; p = ctx.parentOf.get(p) ?? null) if (!laneIds.has(p)) chain.push(p);
    return chain;
  };
  for (const edge of model.edges) {
    // An edge to a whole lane has no ELK node to end at. The canvas still draws it.
    if (laneIds.has(edge.source) || laneIds.has(edge.target)) continue;
    const up = ancestors(edge.source);
    const down = ancestors(edge.target);
    // An edge between a subgraph and something inside it has no place in a layered layout. The canvas still draws it.
    if (up.includes(edge.target) || down.includes(edge.source)) continue;
    const common = up.find((a) => down.includes(a)) ?? null;
    const container = common === null ? root : (byId.get(common) as ElkNode);
    const text = edge.label === '' ? null : textSize(edge.label, edge.markdown, ctx.text);
    const elkEdge: ElkExtendedEdge = {
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      // Labels on the edge (inline), as Mermaid draws them.
      ...(text ? { labels: [{ text: edge.label, width: text.width + 8, height: text.height + 4, layoutOptions: { 'elk.edgeLabels.inline': 'true' } }] } : {}),
    };
    (container.edges ??= []).push(elkEdge);
  }

  const laid = await (await loadElk()).layout(root);
  // ELK gives positions relative to the parent; the canvas wants absolute boxes.
  const boxes = new Map<string, Box>();
  const collect = (n: ElkNode, ox: number, oy: number): void => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0);
      const y = oy + (c.y ?? 0);
      boxes.set(c.id, { x, y, width: c.width ?? 0, height: c.height ?? 0 });
      collect(c, x, y);
    }
  };
  collect(laid, 0, 0);

  // Edge routes are relative to the node whose `edges` list holds the edge.
  const routes = new Map<string, EdgeRoute>();
  const collectEdges = (n: ElkNode, ox: number, oy: number): void => {
    for (const e of n.edges ?? []) {
      const section = e.sections?.[0];
      if (!section || (e.sections?.length ?? 0) > 1) continue;
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: ox + p.x, y: oy + p.y }));
      const label = e.labels?.[0];
      routes.set(e.id, {
        points,
        ...(label?.x !== undefined && label.y !== undefined
          ? { label: { x: ox + label.x + (label.width ?? 0) / 2, y: oy + label.y + (label.height ?? 0) / 2 } }
          : {}),
      });
    }
    for (const c of n.children ?? []) collectEdges(c, ox + (c.x ?? 0), oy + (c.y ?? 0));
  };
  collectEdges(laid, 0, 0);
  if (model.kind === 'swimlane') laneBoxes(ctx, lanes, rows, laid, boxes);
  return { boxes, routes };
}

const laneSpacer = (id: string): string => `__lane__${id}`;

/**
 * Lane bands from the laid-out contents: each lane spans the whole diagram along the lanes, and
 * from its first to its last element across them. Neighbouring lanes meet halfway between.
 */
function laneBoxes(ctx: LayoutContext, lanes: FlowSubgraph[], rows: boolean, laid: ElkNode, boxes: Map<string, Box>): void {
  const within = (id: string, lane: string): boolean => {
    for (let p = ctx.parentOf.get(id) ?? null; p !== null; p = ctx.parentOf.get(p) ?? null) if (p === lane) return true;
    return false;
  };
  // [start, end] of each lane across the lanes (y for rows, x for columns).
  const spans = lanes.map((lane) => {
    let start = Infinity;
    let end = -Infinity;
    for (const [id, box] of boxes) {
      if (id !== laneSpacer(lane.id) && !within(id, lane.id)) continue;
      start = Math.min(start, rows ? box.y : box.x);
      end = Math.max(end, rows ? box.y + box.height : box.x + box.width);
    }
    return { start, end };
  });
  const along = rows ? (laid.width ?? 0) - MARGIN : (laid.height ?? 0) - MARGIN;
  lanes.forEach((lane, i) => {
    const { start, end } = spans[i];
    const from = i === 0 ? start - LANE_PADDING : (spans[i - 1].end + start) / 2;
    const to = i === lanes.length - 1 ? end + LANE_PADDING : (end + spans[i + 1].start) / 2;
    boxes.set(lane.id, rows ? { x: MARGIN, y: from, width: along - MARGIN, height: to - from } : { x: from, y: MARGIN, width: to - from, height: along - MARGIN });
    boxes.delete(laneSpacer(lane.id));
  });
}
