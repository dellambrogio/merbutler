/**
 * Snap guides for the free layout: while a node is dragged, its center snaps to the center of
 * another element in line with it (across or down), and a guide line shows the line. Code from
 * layout groups elements whose centers line up, so snapped rows and columns are found exactly.
 */

export interface SnapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A guide line in canvas coordinates: `x` is a vertical line, `y` a horizontal one, from `from` to `to`. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** How close (in screen pixels) a center must come to snap. */
export const SNAP_PIXELS = 8;

const center = (b: SnapBox): { x: number; y: number } => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/**
 * How far to move `moving` so its center lines up with the nearest center within `threshold`, on
 * each axis separately, and the guides to show. A guide runs across every box lined up on it.
 */
export function snapCenter(moving: SnapBox, others: readonly SnapBox[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const c = center(moving);
  const nearest = (axis: 'x' | 'y'): number | null => {
    let best: number | null = null;
    for (const o of others) {
      const d = center(o)[axis] - c[axis];
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best;
  };
  const dx = nearest('x') ?? 0;
  const dy = nearest('y') ?? 0;
  const moved: SnapBox = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    if ((axis === 'x' ? nearest('x') : nearest('y')) === null) continue;
    const at = center(moved)[axis];
    const lined = [moved, ...others.filter((o) => Math.abs(center(o)[axis] - at) < 0.5)];
    // A vertical guide (x) runs from the top of the highest box to the bottom of the lowest one.
    const starts = lined.map((b) => (axis === 'x' ? b.y : b.x));
    const ends = lined.map((b) => (axis === 'x' ? b.y + b.height : b.x + b.width));
    guides.push({ axis, at, from: Math.min(...starts), to: Math.max(...ends) });
  }
  return { dx, dy, guides };
}
