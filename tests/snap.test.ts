import { describe, expect, test } from 'vitest';
import { snapCenter, type SnapBox } from '../src/canvas/snap';

const box = (x: number, y: number, width = 100, height = 40): SnapBox => ({ x, y, width, height });

describe('snap guides', () => {
  test('a center within the threshold snaps across, and a guide spans the row', () => {
    // Moving center y = 25 + 20 = 45; the other's is 40.
    const r = snapCenter(box(300, 25), [box(0, 20)], 8);
    expect(r).toEqual({ dx: 0, dy: -5, guides: [{ axis: 'y', at: 40, from: 0, to: 400 }] });
  });

  test('down too: a column, with boxes of different sizes lined up on their centers', () => {
    // Other center x = 50; moving (width 60) center x = 26 + 30 = 56.
    const r = snapCenter(box(26, 200, 60, 30), [box(0, 0)], 8);
    expect(r.dx).toBe(-6);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ axis: 'x', at: 50, from: 0, to: 230 }]);
  });

  test('both axes at once, each to its own nearest box', () => {
    const r = snapCenter(box(203, 103), [box(200, 0), box(0, 100)], 8);
    expect([r.dx, r.dy]).toEqual([-3, -3]);
    expect(r.guides.map((g) => g.axis)).toEqual(['x', 'y']);
  });

  test('beyond the threshold nothing snaps and no guide shows', () => {
    expect(snapCenter(box(300, 29), [box(0, 20)], 8)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  test('the nearest of several wins, and the guide runs across every box on the line', () => {
    const r = snapCenter(box(500, 23), [box(0, 20), box(200, 26), box(800, 20)], 8);
    // Centers: 40 (two boxes) and 46; the moving one is at 43. Ties go to the first found: 40.
    expect(r.dy).toBe(-3);
    expect(r.guides).toEqual([{ axis: 'y', at: 40, from: 0, to: 900 }]);
    const closer = snapCenter(box(500, 25), [box(0, 20), box(200, 26)], 8);
    expect(closer.dy).toBe(1);
  });

  test('already in line: no move, the guide still shows', () => {
    expect(snapCenter(box(300, 20), [box(0, 20)], 8)).toEqual({ dx: 0, dy: 0, guides: [{ axis: 'y', at: 40, from: 0, to: 400 }] });
  });

  test('nothing to snap to', () => {
    expect(snapCenter(box(0, 0), [], 8)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
