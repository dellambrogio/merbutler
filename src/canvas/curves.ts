/** The d3 curves Mermaid draws edges with, shared by the canvas and the curve picker's samples. */
import {
  curveBasis,
  curveBumpX,
  curveBumpY,
  curveCardinal,
  curveCatmullRom,
  curveLinear,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  line,
  type CurveFactory,
} from 'd3-shape';

/** The d3 curves Mermaid draws edges with, by the name in the code. */
const CURVE_FACTORIES: Record<string, CurveFactory> = {
  basis: curveBasis,
  bumpX: curveBumpX,
  bumpY: curveBumpY,
  cardinal: curveCardinal,
  catmullRom: curveCatmullRom,
  linear: curveLinear,
  monotoneX: curveMonotoneX,
  monotoneY: curveMonotoneY,
  natural: curveNatural,
  step: curveStep,
  stepAfter: curveStepAfter,
  stepBefore: curveStepBefore,
};

/** An SVG path through the points with the named curve, as Mermaid draws it (unknown or missing: `basis`). */
export function curvePath(points: ReadonlyArray<readonly [number, number]>, curve: string | undefined): string {
  return line().curve(CURVE_FACTORIES[curve ?? 'basis'] ?? curveBasis)(points as Array<[number, number]>) ?? '';
}
