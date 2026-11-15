/**
 * Mermaid code from a free layout: elements the user lined up (a row or a column) go into an
 * invisible subgraph, so Mermaid's own layout keeps them lined up too.
 *
 * Mermaid places a subgraph's contents in ranks along its direction, and only a chain of links
 * keeps elements in a line along it: elements with no link between them share a rank, and ELK
 * packs unlinked elements into a block. So each group gets the direction of its line, and an
 * invisible link (`~~~`) joins neighbors that are not linked yet.
 *
 * Mermaid ignores a subgraph's `direction` when one of its elements is linked to one outside it,
 * and invisible links there make other links skip ranks, which pushes elements off the line. So
 * only a line with no links to the rest of the diagram becomes a group; the rest is left to
 * Mermaid's layout. tools/mermaid-check draws the cases with Mermaid itself.
 *
 * A group is a subgraph with the class `layoutAlign` (no fill, no border, no visible title) and an
 * id `row<n>` or `col<n>`. Making the code again first takes out the groups made the last time, and
 * the invisible links between their elements, so they follow the drawing.
 */
import {
  addClassDef,
  canonicalOrder,
  classUsage,
  freshId,
  nextEdgeId,
  removeClassDef,
  type Direction,
  type FlowEdge,
  type FlowModel,
  type FlowSubgraph,
} from './model';
import { readingOrder, type Point } from './positions';

export const ALIGN_CLASS = 'layoutAlign';
const ALIGN_STYLES = ['fill:none', 'stroke:none', 'color:transparent'];
const ALIGN_ID = /^(row|col)\d+$/;
/** Centers this close count as lined up. */
const TOLERANCE = 20;

/** Whether the diagram can get alignment groups: flowcharts only. */
export function canAlign(model: FlowModel): boolean {
  return model.kind === undefined;
}

/** Whether a subgraph is an alignment group made by `alignGroups` (not one the user made or styled). */
export function isAlignGroup(subgraph: FlowSubgraph): boolean {
  return ALIGN_ID.test(subgraph.id) && (subgraph.classes?.includes(ALIGN_CLASS) ?? false);
}

/** The subgraph that holds an element as the user sees it: past alignment groups, which are invisible. */
export function visibleParent(model: FlowModel, parent: string | null): string | null {
  let p = parent;
  for (let s = model.subgraphs.find((x) => x.id === p); s && isAlignGroup(s); s = model.subgraphs.find((x) => x.id === p)) p = s.parent;
  return p;
}

/**
 * The model without alignment groups: what they held goes back to their parent. A group that is
 * collapsed, holds something `keep` says to keep, or has a link of its own is not taken out: it is
 * the user's now. A linked one loses the class, so its title shows.
 */
export function withoutAlignGroups(model: FlowModel, keep: (id: string) => boolean = () => false): FlowModel {
  const linked = new Set(model.edges.flatMap((e) => [e.source, e.target]));
  const childrenOf = (id: string): string[] => [...model.nodes, ...model.subgraphs].filter((x) => x.parent === id).map((x) => x.id);
  const groups = new Map(
    model.subgraphs.filter((s) => isAlignGroup(s) && !linked.has(s.id) && s.view !== 'collapsed' && !childrenOf(s.id).some(keep)).map((s) => [s.id, s]),
  );
  const unclassed = model.subgraphs.filter((s) => isAlignGroup(s) && linked.has(s.id)).map((s) => s.id);
  if (groups.size === 0 && unclassed.length === 0) return model;
  const lift = (parent: string | null): string | null => {
    for (let p = parent; p !== null; p = groups.get(p)!.parent) if (!groups.has(p)) return p;
    return null;
  };
  const positions = model.positions && Object.fromEntries(Object.entries(model.positions).filter(([id]) => !groups.has(id)));
  const parentOf = new Map([...model.nodes, ...model.subgraphs].map((x) => [x.id, x.parent]));
  const madeLink = (e: FlowEdge): boolean => {
    const p = parentOf.get(e.source);
    return isPlainInvisible(e) && p != null && groups.has(p) && parentOf.get(e.target) === p;
  };
  return {
    ...model,
    edges: model.edges.filter((e) => !madeLink(e)),
    nodes: model.nodes.map((n) => (groups.has(n.parent ?? '') ? { ...n, parent: lift(n.parent) } : n)),
    subgraphs: model.subgraphs
      .filter((s) => !groups.has(s.id))
      .map((s) => (groups.has(s.parent ?? '') ? { ...s, parent: lift(s.parent) } : s))
      .map((s) => (unclassed.includes(s.id) ? withoutClass(s) : s)),
    ...(positions ? { positions } : {}),
  };
}

/** An invisible link with nothing of its own: the kind `alignGroups` adds. */
function isPlainInvisible(e: FlowEdge): boolean {
  return e.stroke === 'invisible' && e.label === '' && !e.ref && !e.styles?.length && !e.comments?.length && (e.length ?? 1) === 1;
}

function withoutClass(s: FlowSubgraph): FlowSubgraph {
  const classes = (s.classes ?? []).filter((c) => c !== ALIGN_CLASS);
  const { classes: _old, ...rest } = s;
  return classes.length > 0 ? { ...rest, classes } : rest;
}

interface Line {
  /** In order along the line: left to right, or top to bottom. */
  ids: string[];
  row: boolean;
}

/** Ids whose centers are within TOLERANCE of the first one's along one axis, in groups of two or more. */
function lines(ids: readonly string[], centers: ReadonlyMap<string, Point>, row: boolean): Line[] {
  const across = (id: string): number => (row ? centers.get(id)!.y : centers.get(id)!.x);
  const along = (id: string): number => (row ? centers.get(id)!.x : centers.get(id)!.y);
  const sorted = [...ids].sort((a, b) => across(a) - across(b));
  const out: Line[] = [];
  let current: string[] = [];
  const flush = (): void => {
    if (current.length > 1) out.push({ ids: [...current].sort((a, b) => along(a) - along(b)), row });
    current = [];
  };
  for (const id of sorted) {
    if (current.length > 0 && across(id) - across(current[0]) > TOLERANCE) flush();
    current.push(id);
  }
  flush();
  return out;
}

/** What `alignGroupsWithReport` did. */
export interface AlignReport {
  /** Ids of the groups in the result. */
  groups: string[];
  rows: number;
  columns: number;
  /** Invisible links added. */
  links: number;
  /** Lines left to Mermaid because their elements link to others. */
  skipped: number;
  /** Whether the code changed. */
  changed: boolean;
}

/**
 * Groups the elements lined up in the drawing. `centers` are the centers of the elements on the
 * canvas. In each scope (the top level and each expanded subgraph), the longest lines are taken
 * first and an element goes into one group at most. Returns `model` itself when the code would
 * not change.
 */
export function alignGroups(model: FlowModel, centers: ReadonlyMap<string, Point>): FlowModel {
  return alignGroupsWithReport(model, centers).model;
}

/** `alignGroups`, and what it did. */
export function alignGroupsWithReport(model: FlowModel, centers: ReadonlyMap<string, Point>): { model: FlowModel; report: AlignReport } {
  const result = groupLines(model, centers);
  const made = result.made;
  const grouped = new Set(made.flatMap((m) => m.ids));
  // A line left out counts if two of its elements did not go into another group.
  const skipped = result.skipped.filter((ids) => ids.filter((id) => !grouped.has(id)).length > 1).length;
  return {
    model: result.model,
    report: {
      groups: made.map((m) => m.group),
      rows: made.filter((m) => m.row).length,
      columns: made.filter((m) => !m.row).length,
      links: made.reduce((sum, m) => sum + m.links, 0),
      skipped,
      changed: result.model !== model,
    },
  };
}

/** One sentence on what Code from layout did, for the canvas. */
export function alignMessage(report: AlignReport): string {
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const parts = [report.rows > 0 ? plural(report.rows, 'row', 'rows') : '', report.columns > 0 ? plural(report.columns, 'column', 'columns') : ''].filter(Boolean);
  const made = parts.join(' and ');
  const left =
    report.skipped > 0
      ? `${plural(report.skipped, 'line was', 'lines were')} left to Mermaid: ${report.skipped === 1 ? 'its' : 'their'} nodes link to other nodes.`
      : '';
  let first: string;
  if (made === '') first = report.changed ? 'Removed the groups: nothing is lined up now.' : 'Nothing lined up to group.';
  else if (!report.changed) first = `Already up to date: ${made} grouped.`;
  else first = `Grouped ${made}${report.links > 0 ? `, with ${plural(report.links, 'invisible link', 'invisible links')}` : ''}.`;
  return left ? `${first} ${left}` : first;
}

interface Made {
  group: string;
  ids: string[];
  row: boolean;
  links: number;
}

function groupLines(model: FlowModel, centers: ReadonlyMap<string, Point>): { model: FlowModel; made: Made[]; skipped: string[][] } {
  if (!canAlign(model)) return { model, made: [], skipped: [] };
  const start = withoutAlignGroups(model, (id) => !centers.has(id));
  let next = start;
  const parentOf = new Map<string, string | null>([...next.nodes, ...next.subgraphs].map((x) => [x.id, x.parent]));
  const subgraphOf = new Map(next.subgraphs.map((s) => [s.id, s]));
  /** The direction a scope lays out in: its own, else the one around it. */
  const directionOf = (scope: string | null): Direction =>
    scope === null ? next.direction : (subgraphOf.get(scope)?.direction ?? directionOf(parentOf.get(scope) ?? null));
  /** The element of the scope that holds `id` (itself or an ancestor), or null. */
  const memberOf = (id: string, scope: string | null): string | null => {
    for (let cur: string | null = id; cur !== null && parentOf.has(cur); cur = parentOf.get(cur) ?? null) if (parentOf.get(cur) === scope) return cur;
    return null;
  };
  const scopes: (string | null)[] = [null, ...next.subgraphs.filter((s) => s.view !== 'collapsed').map((s) => s.id)];
  const groupCenters = new Map(centers);
  const made: Made[] = [];
  const skipped: string[][] = [];
  for (const scope of scopes) {
    const siblings = [...parentOf].filter(([id, p]) => p === scope && centers.has(id)).map(([id]) => id);
    if (siblings.length < 2) continue;
    /** Each link as the elements of the scope that hold its ends (null: outside the scope). */
    const ends = next.edges.map((e): [string | null, string | null] => [memberOf(e.source, scope), memberOf(e.target, scope)]);
    /** Whether a link joins the elements of the scope themselves, not something inside one of them. */
    const direct = next.edges.map((e, i) => e.source === ends[i][0] && e.target === ends[i][1]);
    const candidates = [...lines(siblings, centers, true), ...lines(siblings, centers, false)];
    const used = new Set<string>();
    while (candidates.length > 0) {
      // The line with the most elements not in a group yet; it is used up either way.
      const fresh = candidates.map((l) => l.ids.filter((id) => !used.has(id)).length);
      const [line] = candidates.splice(fresh.indexOf(Math.max(...fresh)), 1);
      const ids = line.ids.filter((id) => !used.has(id));
      if (ids.length < 2) continue;
      const members = new Set(ids);
      const inner = ends.filter(([s, t]) => s !== null && t !== null && s !== t && members.has(s) && members.has(t)) as [string, string][];
      // Linked to the outside: Mermaid ignores the group's direction, and invisible links would
      // only make links that skip ranks. Its elements are left free for another line.
      // A link between two of them that ends inside one (a subgraph) does not hold a chain either:
      // with ELK the subgraphs came apart and out of order (tools/mermaid-check).
      const into = ends.some(([s, t], i) => s !== null && t !== null && s !== t && members.has(s) && members.has(t) && !direct[i]);
      if (into || ends.some(([s, t]) => (s !== null && members.has(s)) !== (t !== null && members.has(t)))) {
        skipped.push(ids);
        continue;
      }
      for (const id of ids) used.add(id);
      // The way most links between the elements point along the line.
      const forward = inner.reduce((sum, [s, t]) => sum + Math.sign(ids.indexOf(t) - ids.indexOf(s)), 0) >= 0;
      const direction: Direction = line.row ? (forward ? 'LR' : 'RL') : forward ? 'TB' : 'BT';
      const linked = (a: string, b: string): boolean => inner.some(([s, t]) => (s === a && t === b) || (s === b && t === a));
      // The whole scope, already a chain along its direction: nothing to add.
      if (ids.length === siblings.length && direction === directionOf(scope) && ids.every((id, i) => i === 0 || linked(ids[i - 1], id))) continue;
      const group = freshId(line.row ? 'row' : 'col', [...next.nodes.map((n) => n.id), ...next.subgraphs.map((s) => s.id)]);
      const links: FlowEdge[] = [];
      // Invisible links between neighbors not linked yet, in the direction of the flow.
      const flowsBack = direction === 'RL' || direction === 'BT';
      for (let i = 0; i < ids.length - 1; i++) {
        const [a, b] = flowsBack ? [ids[i + 1], ids[i]] : [ids[i], ids[i + 1]];
        if (linked(a, b)) continue;
        const id = nextEdgeId({ ...next, edges: [...next.edges, ...links] });
        links.push({ id, source: a, target: b, label: '', markdown: false, stroke: 'invisible', end: 'none', bothEnds: false });
      }
      const subgraph: FlowSubgraph = { id: group, label: group, markdown: false, parent: scope, direction, classes: [ALIGN_CLASS] };
      next = {
        ...next,
        nodes: next.nodes.map((n) => (members.has(n.id) ? { ...n, parent: group } : n)),
        subgraphs: [...next.subgraphs.map((s) => (members.has(s.id) ? { ...s, parent: group } : s)), subgraph],
        edges: [...next.edges, ...links],
      };
      const points = ids.map((m) => centers.get(m)!);
      groupCenters.set(group, { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
      made.push({ group, ids, row: line.row, links: links.length });
    }
  }
  if (made.length === 0) {
    if (start === model) return { model, made, skipped };
    const cleaned = next.classDefs?.some((d) => d.name === ALIGN_CLASS) && classUsage(next, ALIGN_CLASS) === 0 ? removeClassDef(next, ALIGN_CLASS) : next;
    return { model: cleaned, made, skipped };
  }
  if (!next.classDefs?.some((d) => d.name === ALIGN_CLASS)) next = addClassDef(next, ALIGN_CLASS, ALIGN_STYLES);
  // Statements in reading order; then each group's elements in order along its line.
  next = readingOrder(next, groupCenters);
  for (const m of made) next = orderAlong(next, m.ids);
  // In the order the code is written, so the code reads back the same.
  next = canonicalOrder(next);
  return { model: sameCode(next, model) ? model : next, made, skipped };
}

/** Whether two models give the same code: in the order it is written, and without edge ids (the app's own). */
function sameCode(a: FlowModel, b: FlowModel): boolean {
  const key = (m: FlowModel): string => {
    const written = canonicalOrder(m);
    return JSON.stringify({ ...written, edges: written.edges.map(({ id: _id, ...e }) => e) });
  };
  return key(a) === key(b);
}

/** The elements `ids` in this order in the model's lists, in the places they already take. */
function orderAlong(model: FlowModel, ids: readonly string[]): FlowModel {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const reorder = <T extends { id: string }>(items: T[]): T[] => {
    const slots = items.flatMap((x, i) => (rank.has(x.id) ? [i] : []));
    const sorted = slots.map((i) => items[i]).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const out = [...items];
    slots.forEach((slot, k) => (out[slot] = sorted[k]));
    return out;
  };
  return { ...model, nodes: reorder(model.nodes), subgraphs: reorder(model.subgraphs) };
}
