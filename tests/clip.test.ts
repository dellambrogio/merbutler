import { describe, expect, test } from 'vitest';
import { clipRoute, outlineOf } from '../src/canvas/clip';
import { layoutCanvas } from '../src/canvas/layoutEngine';
import type { LabelEdge } from '../src/canvas/layout';
import { parse } from '../src/core/parse';

const box = { x: 0, y: 0, width: 100, height: 60 };
const center = { x: 50, y: 30 };

describe('edge ends on shape outlines', () => {
  test('a horizontal end above the middle moves onto the diamond, keeping its direction', () => {
    const diamond = { outline: outlineOf('diamond', box), center };
    // ELK ends the edge on the box's left side, 10px above the middle: outside the diamond.
    const [, end] = clipRoute([{ x: -40, y: 20 }, { x: 0, y: 20 }], { outline: null, center: { x: -60, y: 20 } }, diamond);
    expect(end.y).toBeCloseTo(20);
    // The diamond's left edge at y = 20 is at x = 50 * (1 - 10 / 30).
    expect(end.x).toBeCloseTo(50 / 3, 5);
  });

  test('circles, and the start of a route', () => {
    const circle = { outline: outlineOf('circle', { x: 0, y: 0, width: 60, height: 60 }), center: { x: 30, y: 30 } };
    const [start] = clipRoute([{ x: 60, y: 30 }, { x: 120, y: 30 }], circle, { outline: null, center: { x: 140, y: 30 } });
    expect(start).toEqual({ x: 60, y: 30 });
    const [corner] = clipRoute([{ x: 60, y: 0 }, { x: 120, y: 0 }], circle, { outline: null, center: { x: 140, y: 0 } });
    // The ray along y = 0 only touches the circle at its top: the end moves toward the center instead.
    expect(Math.hypot(corner.x - 30, corner.y - 30)).toBeCloseTo(30, 3);
  });

  test('rectangles keep the layout route', () => {
    expect(outlineOf('rect', box)).toBeNull();
    const pts = [{ x: -40, y: 20 }, { x: 0, y: 20 }];
    expect(clipRoute(pts, { outline: null, center }, { outline: null, center })).toEqual(pts);
  });

  test('ELK routes into a diamond end on its outline', async () => {
    const r = await parse('flowchart LR\n  a --> d{Decision}\n  b --> d\n  c --> d\n  d --> e\n  d --> f\n');
    if (!r.ok) throw new Error(r.error);
    const { nodes, edges } = await layoutCanvas(r.model);
    const d = nodes.find((n) => n.id === 'd')!;
    const outline = outlineOf('diamond', { x: d.position.x, y: d.position.y, width: d.width!, height: d.height! })!;
    if (outline.kind !== 'polygon') throw new Error('diamond');
    const [top, right, bottom, left] = outline.points;
    // |x - cx| / (w / 2) + |y - cy| / (h / 2) = 1 on a diamond's outline.
    const onDiamond = (p: { x: number; y: number }): number => Math.abs(p.x - top.x) / (right.x - top.x) + Math.abs(p.y - left.y) / (bottom.y - top.y) * 2;
    let checked = 0;
    for (const e of edges as LabelEdge[]) {
      const pts = e.data?.route?.points;
      if (!pts) continue;
      checked++;
      if (e.target === 'd') expect(onDiamond(pts[pts.length - 1]), e.id).toBeCloseTo(1, 3);
      if (e.source === 'd') expect(onDiamond(pts[0]), e.id).toBeCloseTo(1, 3);
    }
    expect(checked).toBe(5);
  });
});
