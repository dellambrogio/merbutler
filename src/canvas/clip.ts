/**
 * Edge ends on the real outline of a shape. Layout engines (ELK) route edges to the node's
 * bounding box; for a diamond, a circle or a slanted shape the end would then float beside the
 * outline. As Mermaid does, the canvas moves each end along its last segment onto the outline.
 */
import type { Shape } from '../core/model';
import { SLANT } from '../flowchart/shapes';

export interface Point {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Outline = { kind: 'polygon'; points: Point[] } | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

/** Points along a half ellipse, for the round ends of a stadium. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 8): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

/**
 * The outline of a shape in a box (absolute coordinates), or null when the box itself is the
 * outline (rectangles and shapes that fill their box at the middle of each side).
 */
export function outlineOf(shape: Shape, box: Box): Outline | null {
  const { x: l, y: t, width: w, height: h } = box;
  const r = l + w;
  const b = t + h;
  const cx = l + w / 2;
  const cy = t + h / 2;
  const s = Math.min(SLANT, w / 3);
  const poly = (points: Array<[number, number]>): Outline => ({ kind: 'polygon', points: points.map(([x, y]) => ({ x, y })) });
  switch (shape) {
    case 'diamond':
      return poly([[cx, t], [r, cy], [cx, b], [l, cy]]);
    case 'hexagon':
      return poly([[l + s, t], [r - s, t], [r, cy], [r - s, b], [l + s, b], [l, cy]]);
    case 'lean-right':
      return poly([[l + s, t], [r, t], [r - s, b], [l, b]]);
    case 'lean-left':
      return poly([[l, t], [r - s, t], [r, b], [l + s, b]]);
    case 'trapezoid':
      return poly([[l + s, t], [r - s, t], [r, b], [l, b]]);
    case 'inv-trapezoid':
      return poly([[l, t], [r, t], [r - s, b], [l + s, b]]);
    case 'flag':
      return poly([[l, t], [r, t], [r, b], [l, b], [l + 14, cy]]);
    case 'circle':
    case 'double-circle':
    case 'sm-circ':
    case 'fr-circ':
    case 'f-circ':
    case 'cross-circ':
      return { kind: 'ellipse', cx, cy, rx: w / 2, ry: h / 2 };
    case 'stadium': {
      const rr = Math.min(h / 2, w / 2);
      return { kind: 'polygon', points: [...arc(r - rr, cy, rr, h / 2, -Math.PI / 2, Math.PI / 2), ...arc(l + rr, cy, rr, h / 2, Math.PI / 2, (3 * Math.PI) / 2)] };
    }
    default:
      return null;
  }
}

/** The smallest t > 0 where the ray `from + t * dir` meets the outline, or null. */
function hit(outline: Outline, from: Point, dir: Point): number | null {
  if (outline.kind === 'ellipse') {
    // Solve ((x - cx) / rx)^2 + ((y - cy) / ry)^2 = 1 for t.
    const ox = (from.x - outline.cx) / outline.rx;
    const oy = (from.y - outline.cy) / outline.ry;
    const dx = dir.x / outline.rx;
    const dy = dir.y / outline.ry;
    const a = dx * dx + dy * dy;
    const bq = 2 * (ox * dx + oy * dy);
    const c = ox * ox + oy * oy - 1;
    const disc = bq * bq - 4 * a * c;
    if (a === 0 || disc < 0) return null;
    const roots = [(-bq - Math.sqrt(disc)) / (2 * a), (-bq + Math.sqrt(disc)) / (2 * a)].filter((v) => v > 1e-9);
    return roots.length > 0 ? Math.min(...roots) : null;
  }
  let best: number | null = null;
  const pts = outline.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p.x - from.x) * ey - (p.y - from.y) * ex) / den;
    const u = ((p.x - from.x) * dir.y - (p.y - from.y) * dir.x) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

/** True if a point is inside the outline. */
function inside(outline: Outline, p: Point): boolean {
  if (outline.kind === 'ellipse') return ((p.x - outline.cx) / outline.rx) ** 2 + ((p.y - outline.cy) / outline.ry) ** 2 < 1;
  let odd = false;
  const pts = outline.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
}

/**
 * Moves the end `end` of a segment that comes from `from` onto the outline: along the segment
 * (extended into the box if needed), else toward the shape's center.
 */
function onOutline(outline: Outline, from: Point, end: Point, center: Point): Point {
  if (inside(outline, from)) return end;
  for (const target of [end, center]) {
    const dir = { x: target.x - from.x, y: target.y - from.y };
    const t = hit(outline, from, dir);
    if (t !== null) return { x: from.x + dir.x * t, y: from.y + dir.y * t };
  }
  return end;
}

/** A route with its first point on the source's outline and its last on the target's. */
export function clipRoute(points: readonly Point[], source: { outline: Outline | null; center: Point }, target: { outline: Outline | null; center: Point }): Point[] {
  if (points.length < 2) return [...points];
  const out = [...points];
  if (target.outline) out[out.length - 1] = onOutline(target.outline, out[out.length - 2], out[out.length - 1], target.center);
  if (source.outline) out[0] = onOutline(source.outline, out[1], out[0], source.center);
  return out;
}
