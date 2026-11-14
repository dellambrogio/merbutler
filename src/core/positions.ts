/**
 * Free layout: where the user put each element on the canvas. Mermaid has no positions, so they
 * are kept in a comment that Mermaid ignores:
 *
 *   %% merbutler-layout a=120,40 b=300,40 group1=60,200
 *
 * Merbutler reads it back and shows the diagram as the user arranged it. Other renderers lay the
 * diagram out themselves; to come close to the arrangement, the code also follows it: the
 * direction is the one most arrows point to, and statements are written in reading order.
 *
 * Positions are the top-left corners of the leaves of the nesting tree (nodes, and subgraphs with
 * nothing inside or collapsed), in canvas coordinates. A subgraph with contents is drawn around them.
 */
import type { Direction, FlowModel } from './model';

export interface Point {
  x: number;
  y: number;
}

export type Positions = Record<string, Point>;

const MARK = 'merbutler-layout';
/** A layout line anywhere in the code, at the start of a line. */
const LINE = new RegExp(`^[ \\t]*%%[ \\t]*${MARK}(?=[ \\t]|$)(.*)$`, 'gm');
/** The word after the mark when the free layout is off. */
const OFF = 'off';
const ENTRY = /^(.+)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
/** Entries per comment line, so a long diagram does not make one very long line. */
const PER_LINE = 6;

/** Ids are written as they are, except the characters that would break an entry. */
function encodeId(id: string): string {
  return id.replace(/[%=\s,]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`);
}

function decodeId(text: string): string {
  return text.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Takes the layout lines out of the code. Each one becomes an empty line, so the line numbers of
 * Mermaid's errors stay right. `positions` is missing when the code has no layout line; `off` is
 * true when the line says the free layout is off.
 */
export function extractPositions(text: string): { text: string; positions?: Positions; off?: true } {
  let found = false;
  let off = false;
  const positions: Positions = {};
  const rest = text.replace(LINE, (_line, entries: string) => {
    found = true;
    for (const entry of entries.trim().split(/\s+/)) {
      if (entry === OFF) off = true;
      const m = ENTRY.exec(entry);
      if (m) positions[decodeId(m[1])] = { x: Number(m[2]), y: Number(m[3]) };
    }
    return '';
  });
  if (!found) return { text };
  return off ? { text: rest, positions, off: true } : { text: rest, positions };
}

/** Whether the canvas shows the user's arrangement instead of Mermaid's layout. Lanes keep their bands. */
export function isFreeLayout(model: FlowModel): boolean {
  return model.positions !== undefined && !model.positionsOff && model.kind !== 'swimlane';
}

/**
 * The layout comment lines for the model: the positions of its nodes and subgraphs, in the
 * order the code lists them. A free layout with nothing placed yet still gets a line, so it stays on.
 */
export function positionLines(model: FlowModel): string[] {
  const positions = model.positions;
  if (!positions) return [];
  const entries = [...model.nodes, ...model.subgraphs].flatMap((item) => {
    const p = positions[item.id];
    return p ? [`${encodeId(item.id)}=${Math.round(p.x)},${Math.round(p.y)}`] : [];
  });
  const mark = model.positionsOff ? `%% ${MARK} ${OFF}` : `%% ${MARK}`;
  if (entries.length === 0) return [mark];
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += PER_LINE) lines.push(`${i === 0 ? mark : `%% ${MARK}`} ${entries.slice(i, i + PER_LINE).join(' ')}`);
  return lines;
}

/** The code with the layout lines at the end. */
export function withPositionLines(text: string, model: FlowModel): string {
  const lines = positionLines(model);
  if (lines.length === 0) return text;
  return `${text.replace(/\n*$/, '\n')}${lines.join('\n')}\n`;
}

/**
 * The direction most drawn edges point to, from the centers of their ends. The current direction
 * stays unless the other axis clearly wins, so a balanced drawing does not flip back and forth.
 */
export function inferDirection(model: FlowModel, centers: ReadonlyMap<string, Point>): Direction {
  let dx = 0;
  let dy = 0;
  for (const e of model.edges) {
    if (e.stroke === 'invisible' || e.noteLink || e.source === e.target) continue;
    const s = centers.get(e.source);
    const t = centers.get(e.target);
    if (!s || !t) continue;
    dx += t.x - s.x;
    dy += t.y - s.y;
  }
  if (dx === 0 && dy === 0) return model.direction;
  const horizontal = model.direction === 'LR' || model.direction === 'RL';
  const useX = horizontal ? Math.abs(dx) * 1.2 >= Math.abs(dy) : Math.abs(dx) > Math.abs(dy) * 1.2;
  return useX ? (dx >= 0 ? 'LR' : 'RL') : dy >= 0 ? 'TB' : 'BT';
}

/** Elements this close along the flow count as one rank, and are read across it. */
const RANK_BAND = 40;

/**
 * Nodes, subgraphs and edges in reading order along the direction: rank by rank, and across each
 * rank from left (or top). Mermaid's layout engines keep that order where they can.
 */
export function readingOrder(model: FlowModel, centers: ReadonlyMap<string, Point>): FlowModel {
  const vertical = model.direction === 'TB' || model.direction === 'BT';
  const sign = model.direction === 'BT' || model.direction === 'RL' ? -1 : 1;
  const key = (id: string): [number, number] => {
    const c = centers.get(id);
    if (!c) return [Infinity, Infinity];
    const along = sign * (vertical ? c.y : c.x);
    return [Math.round(along / RANK_BAND), vertical ? c.x : c.y];
  };
  const compare = (a: [number, number], b: [number, number]): number => a[0] - b[0] || a[1] - b[1] || 0;
  const byKey = <T,>(items: readonly T[], keyOf: (item: T) => [number, number][]): T[] =>
    items
      .map((item, i) => ({ item, i, k: keyOf(item) }))
      .sort((a, b) => {
        for (let j = 0; j < a.k.length; j++) {
          const c = compare(a.k[j], b.k[j]);
          if (c !== 0 && !Number.isNaN(c)) return c;
        }
        return a.i - b.i;
      })
      .map((x) => x.item);
  return {
    ...model,
    nodes: byKey(model.nodes, (n) => [key(n.id)]),
    subgraphs: byKey(model.subgraphs, (s) => [key(s.id)]),
    edges: byKey(model.edges, (e) => [key(e.source), key(e.target)]),
  };
}

/** The model with new positions, and the direction and statement order that follow from them. */
export function arrangeByPositions(model: FlowModel, positions: Positions, centers: ReadonlyMap<string, Point>): FlowModel {
  const direction = inferDirection(model, centers);
  return readingOrder({ ...model, positions, direction }, centers);
}

/** The model without a free layout: Mermaid's layout, and no positions kept. */
export function withoutPositions(model: FlowModel): FlowModel {
  const { positions: _positions, positionsOff: _off, ...rest } = model;
  return rest;
}

/**
 * Turns the free layout off (Mermaid's layout places everything; the positions are kept) or on.
 * On again, each element goes back where the user left it; elements added since have no position
 * yet and go next to an element they are linked to. `snapshot` gives the positions for a first
 * free layout: where Mermaid's layout put everything.
 */
export function toggleFreeLayout(model: FlowModel, snapshot: () => Positions): FlowModel {
  if (isFreeLayout(model)) return { ...model, positionsOff: true };
  const { positionsOff: _off, ...on } = model;
  return on.positions ? on : { ...on, positions: snapshot() };
}
