import type { JSX } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from '@xyflow/react';
import { curvePath } from './curves';
import { LabelText } from './LabelText';
import type { LabelEdge } from './layout';
import { textStyle } from '../flowchart/styling';

type PathParams = Parameters<typeof getBezierPath>[0];

/**
 * The path for a Mermaid curve name. Mermaid uses d3 curves; the canvas has three kinds of path,
 * so `linear` is straight, the `step*` curves are right angles, and the smooth ones are bezier.
 */
function edgePath(curve: string | undefined, params: PathParams): [string, number, number] {
  if (curve === 'linear') {
    const [path, x, y] = getStraightPath(params);
    return [path, x, y];
  }
  if (curve === 'step' || curve === 'stepBefore' || curve === 'stepAfter') {
    const [path, x, y] = getSmoothStepPath({ ...params, borderRadius: 0 });
    return [path, x, y];
  }
  const [path, x, y] = getBezierPath(params);
  return [path, x, y];
}

type Point = { x: number; y: number };

/** A path through a layout route, drawn with the edge's curve as Mermaid draws it. */
function routePath(points: Point[], curve: string | undefined): string {
  return curvePath(points.map((p) => [p.x, p.y] as const), curve);
}

/** The point halfway along a polyline. */
function midpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let rest = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i]) {
      const t = lengths[i] === 0 ? 0 : rest / lengths[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    rest -= lengths[i];
  }
  return points[points.length - 1];
}

/**
 * An edge whose label is HTML, not SVG text, so it can show line breaks, bold and italic.
 * It follows the edge's curve, and shows its step number (`id@{ step: n }`).
 */
export function LabelEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  selected,
  data,
}: EdgeProps<LabelEdge>): JSX.Element {
  // With ELK the edge follows the route the layout found, as in Mermaid. Else the canvas draws its own curve.
  const route = data?.route;
  const routeLabel = route ? (route.label ?? midpoint(route.points)) : null;
  const [path, labelX, labelY] = route && routeLabel
    ? [routePath(route.points, data?.curve), routeLabel.x, routeLabel.y]
    : edgePath(data?.curve, { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} style={style} />
      {data && data.label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label nodrag nopan${selected ? ' selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, ...textStyle(data.look) }}
          >
            <LabelText text={data.label} markdown={data.markdown} />
          </div>
        </EdgeLabelRenderer>
      )}
      {data?.step !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="edge-step"
            title={`Step ${data.step} of the step-by-step flow`}
            // Beside the label, so both stay readable.
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - (data.label !== '' ? 20 : 0)}px)` }}
          >
            {data.step}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
