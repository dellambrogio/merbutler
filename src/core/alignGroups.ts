/**
 * Mermaid code from a free layout: nodes the user lined up (a row or a column) go into an invisible
 * subgraph with a `direction`, so Mermaid's own layout keeps them lined up too.
 *
 * Each group is a subgraph with the class `layoutAlign` (no fill, no border, no visible title). Making
 * the code again first takes out the groups made the last time, so they follow the drawing.
 *
 * Mermaid ignores a subgraph's `direction` when one of its nodes is linked to a node outside it;
 * the group still keeps its members together.
 */
import { addClassDef, classUsage, freshId, removeClassDef, type Direction, type FlowModel, type FlowSubgraph } from './model';
import { readingOrder, type Point } from './positions';

export const ALIGN_CLASS = 'layoutAlign';
const ALIGN_STYLES = ['fill:none', 'stroke:none', 'color:transparent'];
/** Centers this close count as lined up. */
const TOLERANCE = 20;

/** Whether a subgraph is an alignment group made by `alignGroups`. */
export function isAlignGroup(subgraph: FlowSubgraph): boolean {
  return subgraph.classes?.includes(ALIGN_CLASS) ?? false;
}

/** The model without alignment groups: what they held goes back to their parent. */
export function withoutAlignGroups(model: FlowModel): FlowModel {
  const groups = new Map(model.subgraphs.filter(isAlignGroup).map((s) => [s.id, s]));
  if (groups.size === 0) return model;
  const lift = (parent: string | null): string | null => {
    for (let p = parent; p !== null; p = groups.get(p)!.parent) if (!groups.has(p)) return p;
    return null;
  };
  const positions = model.positions && Object.fromEntries(Object.entries(model.positions).filter(([id]) => !groups.has(id)));
  return {
    ...model,
    nodes: model.nodes.map((n) => (groups.has(n.parent ?? '') ? { ...n, parent: lift(n.parent) } : n)),
    subgraphs: model.subgraphs.filter((s) => !groups.has(s.id)).map((s) => (groups.has(s.parent ?? '') ? { ...s, parent: lift(s.parent) } : s)),
    ...(positions ? { positions } : {}),
  };
}

interface Line {
  ids: string[];
  /** A row reads left to right, a column top to bottom. */
  row: boolean;
}

/** Ids whose centers are within TOLERANCE of each other along one axis, in groups of two or more. */
function lines(ids: readonly string[], centers: ReadonlyMap<string, Point>, row: boolean): Line[] {
  const at = (id: string): number => (row ? centers.get(id)!.y : centers.get(id)!.x);
  const sorted = [...ids].sort((a, b) => at(a) - at(b));
  const out: Line[] = [];
  let current: string[] = [];
  for (const id of sorted) {
    if (current.length > 0 && at(id) - at(current[0]) > TOLERANCE) {
      if (current.length > 1) out.push({ ids: current, row });
      current = [];
    }
    current.push(id);
  }
  if (current.length > 1) out.push({ ids: current, row });
  return out;
}

/** The direction of a line, in the sense of `current` when it lies on the same axis. */
function lineDirection(row: boolean, current: Direction): Direction {
  if (row) return current === 'RL' ? 'RL' : 'LR';
  return current === 'BT' ? 'BT' : 'TB';
}

/**
 * Groups the elements lined up in the drawing. `centers` are the centers of the elements on the
 * canvas. In each scope (the top level and each expanded subgraph), the longest lines are taken
 * first and an element goes into one group at most. A line that holds the whole scope sets the
 * subgraph's direction (or the diagram's) instead of adding a group. Flowcharts only.
 */
export function alignGroups(model: FlowModel, centers: ReadonlyMap<string, Point>): FlowModel {
  if (model.kind !== undefined) return model;
  let next = withoutAlignGroups(model);
  const scopes: (FlowSubgraph | null)[] = [null, ...next.subgraphs.filter((s) => s.view !== 'collapsed')];
  const groupCenters = new Map(centers);
  let added = false;
  for (const scope of scopes) {
    const parent = scope?.id ?? null;
    const siblings = [...next.nodes, ...next.subgraphs].filter((x) => x.parent === parent && centers.has(x.id)).map((x) => x.id);
    if (siblings.length < 2) continue;
    const candidates = [...lines(siblings, centers, true), ...lines(siblings, centers, false)];
    const used = new Set<string>();
    for (;;) {
      const best = candidates
        .map((l) => ({ ...l, ids: l.ids.filter((id) => !used.has(id)) }))
        .filter((l) => l.ids.length > 1)
        .sort((a, b) => b.ids.length - a.ids.length)[0];
      if (!best) break;
      for (const id of best.ids) used.add(id);
      const own = scope ? (next.subgraphs.find((s) => s.id === parent)!.direction ?? next.direction) : next.direction;
      const direction = lineDirection(best.row, own);
      if (best.ids.length === siblings.length) {
        // The whole scope is one line: its own direction is enough.
        next = scope
          ? { ...next, subgraphs: next.subgraphs.map((s) => (s.id === parent ? { ...s, direction } : s)) }
          : { ...next, direction };
        break;
      }
      const id = freshId(best.row ? 'row' : 'col', [...next.nodes.map((n) => n.id), ...next.subgraphs.map((s) => s.id)]);
      const members = new Set(best.ids);
      const group: FlowSubgraph = { id, label: id, markdown: false, parent, direction, classes: [ALIGN_CLASS] };
      next = {
        ...next,
        nodes: next.nodes.map((n) => (members.has(n.id) ? { ...n, parent: id } : n)),
        subgraphs: [...next.subgraphs.map((s) => (members.has(s.id) ? { ...s, parent: id } : s)), group],
      };
      const points = best.ids.map((m) => centers.get(m)!);
      groupCenters.set(id, { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
      added = true;
    }
  }
  if (added && !next.classDefs?.some((d) => d.name === ALIGN_CLASS)) next = addClassDef(next, ALIGN_CLASS, ALIGN_STYLES);
  if (!added && next.classDefs?.some((d) => d.name === ALIGN_CLASS) && classUsage(next, ALIGN_CLASS) === 0) next = removeClassDef(next, ALIGN_CLASS);
  // Statements in reading order, so each group lists its members along its line.
  return readingOrder(next, groupCenters);
}
