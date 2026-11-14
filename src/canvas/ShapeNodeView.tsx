import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent } from 'react';
import { Handle, type NodeProps } from '@xyflow/react';
import type { ShapeNode } from './layout';
import { toEditText } from '../core/labels';
import { LabelText } from './LabelText';
import type { Shape } from '../core/model';
import { SHAPE_INFO, SLANT } from '../flowchart/shapes';
import { boxVars, textStyle } from '../flowchart/styling';
import { AssetView } from './AssetView';

/** Lets a node rename itself without passing callbacks through node data. */
export const RenameContext = createContext<(id: string, label: string) => void>(() => {});

/** A request to open the label editor of one node or subgraph (from the context menu). `n` makes each request new. */
export const EditRequestContext = createContext<{ id: string; n: number } | null>(null);

/** Height of the top ellipse of a cylinder, in px. */
const CYLINDER_CAP = 10;
/** Height of the wave at the bottom of a document, in px. */
const WAVE = 10;

/** The outline box, inset by half the stroke so the stroke is not cut off. */
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

type Point = [number, number];

function polygon(points: Point[], className?: string): JSX.Element {
  return <polygon className={className} points={points.map(([x, y]) => `${x},${y}`).join(' ')} />;
}

/** A document: flat top, wavy bottom. */
function docPath({ l, t, r, b, w }: Box): string {
  return `M ${l},${t} H ${r} V ${b - WAVE} C ${r - w * 0.3},${b - WAVE * 2.2} ${l + w * 0.35},${b + WAVE * 0.4} ${l},${b - WAVE * 0.4} Z`;
}

/** A curly brace from top to bottom with its spine at `x`. `open` is +1 for `{`, -1 for `}`. */
function bracePath(x: number, t: number, b: number, open: 1 | -1): string {
  const cy = (t + b) / 2;
  const d = 6 * open;
  return `M ${x + d},${t} Q ${x},${t} ${x},${t + 6} V ${cy - 6} Q ${x},${cy} ${x - d},${cy} Q ${x},${cy} ${x},${cy + 6} V ${b - 6} Q ${x},${b} ${x + d},${b}`;
}

/** Points on an ellipse around the box, starting at the top. */
function ring(box: Box, n: number, scale = 1): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return [box.cx + (box.w / 2) * scale * Math.cos(a), box.cy + (box.h / 2) * scale * Math.sin(a)];
  });
}

/** Outline of a box made of `n` bumps between points on an ellipse (a cloud, or a bang when `inward`). */
function bumpyPath(box: Box, n: number, inward: boolean): string {
  const outer = ring(box, n, inward ? 1 : 0.86);
  const control = ring({ ...box }, n * 2, inward ? 0.72 : 1.14).filter((_, i) => i % 2 === 1);
  return outer.map(([x, y], i) => {
    const [nx, ny] = outer[(i + 1) % n];
    const [qx, qy] = control[i];
    return `${i === 0 ? `M ${x},${y} ` : ''}Q ${qx},${qy} ${nx},${ny}`;
  }).join(' ') + ' Z';
}

/** Two shapes stacked behind the front one, up and to the right. */
function stacked(front: (box: Box) => JSX.Element, box: Box, step = 5): JSX.Element {
  const shifted = (k: number): Box => ({ ...box, l: box.l + k * step, r: box.r - (2 - k) * step, t: box.t + (2 - k) * step, b: box.b - k * step, w: box.w - 2 * step, h: box.h - 2 * step, cx: box.cx + (k - 1) * step, cy: box.cy - (k - 1) * step });
  return (
    <g>
      {front(shifted(2))}
      {front(shifted(1))}
      {front(shifted(0))}
    </g>
  );
}

const rect = ({ l, t, w, h }: Box): JSX.Element => <rect x={l} y={t} width={w} height={h} rx={2} />;

/**
 * The outline of each shape, drawn in the node box. Shapes follow Mermaid's drawings
 * (Mermaid 12.3, classic look). Classes: `nofill` draws only the stroke, `solid` fills with the stroke color.
 */
const OUTLINES: Record<Shape, (box: Box) => JSX.Element> = {
  rect,
  round: ({ l, t, w, h }) => <rect x={l} y={t} width={w} height={h} rx={10} />,
  stadium: ({ l, t, w, h }) => <rect x={l} y={t} width={w} height={h} rx={h / 2} />,
  subroutine: ({ l, t, r, b, w, h }) => (
    <g>
      <rect x={l} y={t} width={w} height={h} rx={2} />
      <line x1={l + 8} y1={t} x2={l + 8} y2={b} />
      <line x1={r - 8} y1={t} x2={r - 8} y2={b} />
    </g>
  ),
  cylinder: ({ l, t, r, b, w, cx }) => {
    const ry = CYLINDER_CAP / 2;
    return (
      <g>
        <path d={`M ${l},${t + ry} A ${w / 2},${ry} 0 0 0 ${r},${t + ry} V ${b - ry} A ${w / 2},${ry} 0 0 1 ${l},${b - ry} Z`} />
        <ellipse cx={cx} cy={t + ry} rx={w / 2} ry={ry} />
      </g>
    );
  },
  circle: ({ cx, cy, w, h }) => <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />,
  'double-circle': ({ cx, cy, w, h }) => (
    <g>
      <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />
      <ellipse cx={cx} cy={cy} rx={w / 2 - 5} ry={h / 2 - 5} />
    </g>
  ),
  flag: ({ l, t, r, b, cy }) => polygon([[l, t], [r, t], [r, b], [l, b], [l + 14, cy]]),
  diamond: ({ l, t, r, b, cx, cy }) => polygon([[cx, t], [r, cy], [cx, b], [l, cy]]),
  hexagon: ({ l, t, r, b, cy }) => polygon([[l + SLANT, t], [r - SLANT, t], [r, cy], [r - SLANT, b], [l + SLANT, b], [l, cy]]),
  'lean-right': ({ l, t, r, b }) => polygon([[l + SLANT, t], [r, t], [r - SLANT, b], [l, b]]),
  'lean-left': ({ l, t, r, b }) => polygon([[l, t], [r - SLANT, t], [r, b], [l + SLANT, b]]),
  trapezoid: ({ l, t, r, b }) => polygon([[l + SLANT, t], [r - SLANT, t], [r, b], [l, b]]),
  'inv-trapezoid': ({ l, t, r, b }) => polygon([[l, t], [r, t], [r - SLANT, b], [l + SLANT, b]]),

  'notch-rect': ({ l, t, r, b }) => polygon([[l + 12, t], [r, t], [r, b], [l, b], [l, t + 12]]),
  'div-rect': (box) => (
    <g>
      {rect(box)}
      <line x1={box.l} y1={box.t + 8} x2={box.r} y2={box.t + 8} />
    </g>
  ),
  'lin-rect': (box) => (
    <g>
      {rect(box)}
      <line x1={box.l + 7} y1={box.t} x2={box.l + 7} y2={box.b} />
    </g>
  ),
  'st-rect': (box) => stacked(rect, box),
  'tag-rect': (box) => (
    <g>
      {rect(box)}
      {polygon([[box.r - 12, box.b], [box.r, box.b - 12], [box.r, box.b]], 'solid')}
    </g>
  ),
  'notch-pent': ({ l, t, r, b }) => polygon([[l + 12, t], [r - 12, t], [r, t + 12], [r, b], [l, b], [l, t + 12]]),
  'sl-rect': ({ l, t, r, b }) => polygon([[l, t + 14], [r, t], [r, b], [l, b]]),
  'curv-trap': ({ l, t, r, b, h, cy }) => <path d={`M ${l + 14},${t} H ${r - h / 2} A ${h / 2},${h / 2} 0 0 1 ${r - h / 2},${b} H ${l + 14} L ${l},${cy} Z`} />,
  delay: ({ l, t, r, b, h }) => <path d={`M ${l},${t} H ${r - h / 2} A ${h / 2},${h / 2} 0 0 1 ${r - h / 2},${b} H ${l} Z`} />,
  hourglass: ({ l, t, r, b }) => polygon([[l, t], [r, t], [l, b], [r, b]]),
  tri: ({ l, t, r, b, cx }) => polygon([[cx, t], [r, b], [l, b]]),
  'flip-tri': ({ l, t, r, b, cx }) => polygon([[l, t], [r, t], [cx, b]]),
  fork: ({ l, t, w, h }) => <rect className="solid" x={l} y={t} width={w} height={h} rx={1} />,

  'h-cyl': ({ l, t, r, b, h, cy }) => {
    const rx = 6;
    return (
      <g>
        <path d={`M ${l + rx},${t} H ${r - rx} A ${rx},${h / 2} 0 0 1 ${r - rx},${b} H ${l + rx} A ${rx},${h / 2} 0 0 1 ${l + rx},${t} Z`} />
        <ellipse cx={r - rx} cy={cy} rx={rx} ry={h / 2} />
      </g>
    );
  },
  'lin-cyl': (box) => {
    const ry = CYLINDER_CAP / 2;
    return (
      <g>
        {OUTLINES.cylinder(box)}
        <path className="nofill" d={`M ${box.l},${box.t + ry + 8} A ${box.w / 2},${ry} 0 0 0 ${box.r},${box.t + ry + 8}`} />
      </g>
    );
  },
  datastore: ({ l, t, r, b, w, h }) => (
    <g>
      <rect className="ghost" x={l} y={t} width={w} height={h} />
      <line x1={l} y1={t} x2={r} y2={t} />
      <line x1={l} y1={b} x2={r} y2={b} />
    </g>
  ),
  'bow-rect': ({ l, t, r, b, h }) => {
    const rx = 8;
    return <path d={`M ${l + rx},${t} H ${r} A ${rx},${h / 2} 0 0 0 ${r},${b} H ${l + rx} A ${rx},${h / 2} 0 0 1 ${l + rx},${t} Z`} />;
  },
  'win-pane': (box) => (
    <g>
      {rect(box)}
      <line x1={box.l} y1={box.t + 8} x2={box.r} y2={box.t + 8} />
      <line x1={box.l + 8} y1={box.t} x2={box.l + 8} y2={box.b} />
    </g>
  ),
  bucket: ({ l, t, r, b, w, cx }) => {
    const ry = 8;
    return (
      <g>
        <path d={`M ${l},${t + ry} A ${w / 2},${ry} 0 0 0 ${r},${t + ry} L ${r - 14},${b} H ${l + 14} Z`} />
        <ellipse cx={cx} cy={t + ry} rx={w / 2} ry={ry} />
      </g>
    );
  },

  doc: (box) => <path d={docPath(box)} />,
  'lin-doc': (box) => (
    <g>
      <path d={docPath(box)} />
      <line x1={box.l + 7} y1={box.t} x2={box.l + 7} y2={box.b - WAVE * 0.6} />
    </g>
  ),
  'tag-doc': (box) => (
    <g>
      <path d={docPath(box)} />
      {polygon([[box.r - 14, box.b - WAVE * 1.15], [box.r, box.b - WAVE * 2], [box.r, box.b - WAVE]], 'solid')}
    </g>
  ),
  docs: (box) => stacked((b) => <path d={docPath(b)} />, box),
  'paper-tape': ({ l, t, r, b, w, cx }) => {
    const a = 6;
    return <path d={`M ${l},${t + a} Q ${l + w / 4},${t - a} ${cx},${t + a} T ${r},${t + a} V ${b - a} Q ${r - w / 4},${b + a} ${cx},${b - a} T ${l},${b - a} Z`} />;
  },

  'sm-circ': ({ cx, cy, w }) => <circle className="thick" cx={cx} cy={cy} r={w / 2 - 1.5} />,
  'fr-circ': ({ cx, cy, w }) => (
    <g>
      <circle className="thick" cx={cx} cy={cy} r={w / 2 - 1.5} />
      <circle className="solid" cx={cx} cy={cy} r={w / 4} />
    </g>
  ),
  'f-circ': ({ cx, cy, w }) => <circle className="solid" cx={cx} cy={cy} r={w / 2} />,
  'cross-circ': ({ cx, cy, w }) => {
    const r = w / 2;
    const d = r * Math.SQRT1_2;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} />
        <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
        <line x1={cx - d} y1={cy + d} x2={cx + d} y2={cy - d} />
      </g>
    );
  },
  bolt: ({ l, t, w, h }) =>
    polygon([[l + w * 0.72, t], [l, t + h * 0.56], [l + w * 0.45, t + h * 0.5], [l + w * 0.28, t + h], [l + w, t + h * 0.42], [l + w * 0.55, t + h * 0.48]]),

  brace: ({ l, t, b, w, h }) => (
    <g>
      <rect className="ghost" x={l} y={t} width={w} height={h} />
      <path className="nofill" d={bracePath(l + 6, t, b, 1)} />
    </g>
  ),
  'brace-r': ({ l, t, r, b, w, h }) => (
    <g>
      <rect className="ghost" x={l} y={t} width={w} height={h} />
      <path className="nofill" d={bracePath(r - 6, t, b, -1)} />
    </g>
  ),
  braces: ({ l, t, r, b, w, h }) => (
    <g>
      <rect className="ghost" x={l} y={t} width={w} height={h} />
      <path className="nofill" d={bracePath(l + 6, t, b, 1)} />
      <path className="nofill" d={bracePath(r - 6, t, b, -1)} />
    </g>
  ),
  text: ({ l, t, w, h }) => <rect className="ghost" x={l} y={t} width={w} height={h} />,

  cloud: (box) => <path d={bumpyPath(box, 9, false)} />,
  bang: (box) => <path d={bumpyPath(box, 14, true)} />,
  person: ({ l, t, w, h, cx }) => (
    <g>
      <rect x={l} y={t + 26} width={w} height={h - 26} rx={Math.min(14, (h - 26) / 2)} />
      <circle cx={cx} cy={t + 14} r={14} />
    </g>
  ),
  folder: ({ l, t, r, b, w }) => <path d={`M ${l},${t} H ${l + w * 0.38} L ${l + w * 0.38 + 8},${t + 8} H ${r} V ${b} H ${l} Z`} />,
  browser: ({ l, t, r, w, h }) => (
    <g>
      <rect x={l} y={t} width={w} height={h} rx={6} />
      <line x1={l} y1={t + 16} x2={r} y2={t + 16} />
      {[8, 15, 22].map((x) => (
        <circle key={x} className="solid" cx={l + x} cy={t + 8} r={1.8} />
      ))}
      <rect className="nofill" x={l + 32} y={t + 4} width={Math.max(w - 40, 10)} height={8} rx={4} />
    </g>
  ),
  console: ({ l, t, w, h }) => (
    <g>
      <rect x={l} y={t} width={w} height={h} rx={8} />
      <path className="nofill" d={`M ${l + 9},${t + 7} L ${l + 14},${t + 11} L ${l + 9},${t + 15} M ${l + 16},${t + 16} H ${l + 23}`} />
    </g>
  ),
};

function ShapeOutline({ shape, width, height }: { shape: Shape; width: number; height: number }): JSX.Element {
  const sw = 1.5;
  const l = sw / 2;
  const t = sw / 2;
  const r = width - sw / 2;
  const b = height - sw / 2;
  return OUTLINES[shape]({ l, t, r, b, w: r - l, h: b - t, cx: width / 2, cy: height / 2 });
}

export function ShapeNodeView({ id, data, width, height, selected }: NodeProps<ShapeNode>): JSX.Element {
  const rename = useContext(RenameContext);
  const [draft, setDraft] = useState<string | null>(null);
  /** True while the input is open. The blur that follows Enter/Escape must not commit again. */
  const editing = useRef(false);
  const w = width ?? 100;
  const h = height ?? 44;
  const labelInsets = SHAPE_INFO[data.shape].label;
  // Mermaid draws no label on some shapes (a junction dot, a fork bar). Others place it in part of the shape.
  const labelPlace: 'none' | CSSProperties =
    labelInsets === 'none' ? 'none' : labelInsets ? { position: 'absolute', inset: (({ top, right, bottom, left }) => `${top}px ${right}px ${bottom}px ${left}px`)(labelInsets(w, h)), display: 'flex', alignItems: 'center', justifyContent: 'center' } : {};

  const start = (): void => {
    editing.current = true;
    setDraft(toEditText(data.label));
  };

  const finish = (save: boolean): void => {
    if (!editing.current) return;
    editing.current = false;
    if (save && draft !== null && draft !== toEditText(data.label)) rename(id, draft);
    setDraft(null);
  };

  const request = useContext(EditRequestContext);
  useEffect(() => {
    if (request?.id === id && labelPlace !== 'none') start();
    // Only a new request opens the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter saves. Shift+Enter adds a line break.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      finish(true);
    }
    if (event.key === 'Escape') finish(false);
  };

  return (
    <div
      className={`shape-node${selected ? ' selected' : ''}`}
      style={{ width: w, height: h, ...boxVars(data.look) }}
      onDoubleClick={start}
    >
      {!data.asset && (
        <svg className="shape-outline" width={w} height={h}>
          <ShapeOutline shape={data.shape} width={w} height={h} />
        </svg>
      )}
      <Handle type="target" position={data.targetPosition} />
      {draft === null ? (
        data.asset ? (
          <AssetView asset={data.asset} label={data.label} markdown={data.markdown} labelStyle={textStyle(data.look)} />
        ) : labelPlace !== 'none' && (
          <span className="shape-label" style={{ ...labelPlace, ...textStyle(data.look) }}>
            <LabelText text={data.label} markdown={data.markdown} />
          </span>
        )
      ) : (
        <textarea
          className="shape-input nodrag nowheel"
          rows={Math.max(1, draft.split('\n').length)}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={onKeyDown}
        />
      )}
      {data.click && (
        // Shows that the node has a `click` statement. Never followed or run on the canvas.
        <span className="click-badge" title={`click ${id} ${data.click}`}>
          {/^(href\b|")/.test(data.click) ? '↗' : 'ƒ'}
        </span>
      )}
      <Handle type="source" position={data.sourcePosition} />
    </div>
  );
}
