import type { JSX } from 'react';

/**
 * React Flow has only arrow markers. These SVG markers draw the Mermaid circle (`--o`) and
 * cross (`--x`) ends. Edges refer to them by id. `auto-start-reverse` turns a start marker
 * so it points away from the line, as React Flow does for its arrows.
 */
export const MARKER_IDS = {
  circle: 'merbutler-marker-circle',
  cross: 'merbutler-marker-cross',
} as const;

export function EdgeMarkerDefs(): JSX.Element {
  // The line ends at (0, 0) and comes from the negative x side.
  return (
    <svg className="edge-marker-defs" aria-hidden="true">
      <defs>
        <marker
          id={MARKER_IDS.circle}
          viewBox="-10 -10 20 20"
          markerWidth="20"
          markerHeight="20"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <circle cx="-4.5" cy="0" r="4" className="edge-marker-fill" />
        </marker>
        <marker
          id={MARKER_IDS.cross}
          viewBox="-10 -10 20 20"
          markerWidth="20"
          markerHeight="20"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M -9,-4 L -1,4 M -9,4 L -1,-4" className="edge-marker-line" />
        </marker>
      </defs>
    </svg>
  );
}
