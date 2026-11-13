import type { JSX } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { LabelText } from './LabelText';
import type { LabelEdge } from './layout';
import { textStyle } from './styling';

/**
 * A bezier edge whose label is HTML, not SVG text, so it can show line breaks, bold and italic.
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
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
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
    </>
  );
}
