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
import { diagramLayout, type Direction, type FlowModel, type FlowSubgraph } from './model';

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

/** Runs ELK (layered, like Mermaid). Returns absolute boxes by id, and the edge routes ELK found. */
export async function elkLayout(ctx: LayoutContext): Promise<{ boxes: Map<string, Box>; routes: Map<string, EdgeRoute> }> {
  const { model } = ctx;
  ctx.directionOf = directions(ctx);
  const subgraphOf = new Map(model.subgraphs.map((s) => [s.id, s]));
  const nodeOf = new Map(model.nodes.map((n) => [n.id, n]));
  const hasChildren = (id: string): boolean => (ctx.childrenOf.get(id) ?? []).length > 0;

  const elkNode = (id: string): ElkNode => {
    const direction = ctx.directionOf.get(id) ?? model.direction;
    const node = nodeOf.get(id);
    if (node) {
      const size = node.asset ? assetNodeSize(node.label, node.markdown, node.asset, ctx.text) : nodeSize(node.label, node.shape, node.markdown, direction, ctx.text);
      return { id, ...size };
    }
    const sub = subgraphOf.get(id) as FlowSubgraph;
    if (sub.view === 'collapsed') return { id, ...collapsedSize(sub, ctx.text) };
    if (!hasChildren(id)) return { id, width: Math.max(EMPTY_SUBGRAPH.width, titleWidth(sub, ctx.text)), height: EMPTY_SUBGRAPH.height };
    const side = SUBGRAPH_PADDING.side;
    return {
      id,
      layoutOptions: {
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

  const root: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[model.direction],
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.spacing.edgeLabel': '6',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    },
    children: (ctx.childrenOf.get(null) ?? []).map(elkNode),
    edges: [],
  };

  // ELK wants each edge in the lowest compound node that contains both ends.
  const byId = new Map<string, ElkNode>();
  const index = (n: ElkNode): void => {
    byId.set(n.id, n);
    for (const c of n.children ?? []) index(c);
  };
  index(root);
  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    for (let p = ctx.parentOf.get(id) ?? null; p !== null; p = ctx.parentOf.get(p) ?? null) chain.push(p);
    return chain;
  };
  for (const edge of model.edges) {
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
  return { boxes, routes };
}
