import { createContext, useContext, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Handle, type NodeProps } from '@xyflow/react';
import { SLANT, type ShapeNode } from './layout';
import { toEditText } from './labels';
import { LabelText } from './LabelText';
import type { Shape } from './model';

/** Lets a node rename itself without passing callbacks through node data. */
export const RenameContext = createContext<(id: string, label: string) => void>(() => {});

/** Height of the top ellipse of a cylinder, in px. */
const CYLINDER_CAP = 10;

function polygon(points: Array<[number, number]>): JSX.Element {
  return <polygon points={points.map(([x, y]) => `${x},${y}`).join(' ')} />;
}

function ShapeOutline({ shape, width, height }: { shape: Shape; width: number; height: number }): JSX.Element {
  const sw = 1.5;
  // Outline box, inset by half the stroke so the stroke is not cut off.
  const l = sw / 2;
  const t = sw / 2;
  const r = width - sw / 2;
  const b = height - sw / 2;
  const w = r - l;
  const h = b - t;
  const cx = width / 2;
  const cy = height / 2;
  switch (shape) {
    case 'round':
      return <rect x={l} y={t} width={w} height={h} rx={10} />;
    case 'stadium':
      return <rect x={l} y={t} width={w} height={h} rx={h / 2} />;
    case 'subroutine':
      return (
        <g>
          <rect x={l} y={t} width={w} height={h} rx={2} />
          <line x1={l + 8} y1={t} x2={l + 8} y2={b} />
          <line x1={r - 8} y1={t} x2={r - 8} y2={b} />
        </g>
      );
    case 'cylinder': {
      const ry = CYLINDER_CAP / 2;
      const body = `M ${l},${t + ry} A ${w / 2},${ry} 0 0 0 ${r},${t + ry} V ${b - ry} A ${w / 2},${ry} 0 0 1 ${l},${b - ry} Z`;
      return (
        <g>
          <path d={body} />
          <ellipse cx={cx} cy={t + ry} rx={w / 2} ry={ry} />
        </g>
      );
    }
    case 'circle':
      return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />;
    case 'double-circle':
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />
          <ellipse cx={cx} cy={cy} rx={w / 2 - 5} ry={h / 2 - 5} />
        </g>
      );
    case 'flag':
      return polygon([[l, t], [r, t], [r, b], [l, b], [l + 14, cy]]);
    case 'diamond':
      return polygon([[cx, t], [r, cy], [cx, b], [l, cy]]);
    case 'hexagon':
      return polygon([[l + SLANT, t], [r - SLANT, t], [r, cy], [r - SLANT, b], [l + SLANT, b], [l, cy]]);
    case 'lean-right':
      return polygon([[l + SLANT, t], [r, t], [r - SLANT, b], [l, b]]);
    case 'lean-left':
      return polygon([[l, t], [r - SLANT, t], [r, b], [l + SLANT, b]]);
    case 'trapezoid':
      return polygon([[l + SLANT, t], [r - SLANT, t], [r, b], [l, b]]);
    case 'inv-trapezoid':
      return polygon([[l, t], [r, t], [r - SLANT, b], [l + SLANT, b]]);
    case 'rect':
      return <rect x={l} y={t} width={w} height={h} rx={2} />;
  }
}

export function ShapeNodeView({ id, data, width, height, selected }: NodeProps<ShapeNode>): JSX.Element {
  const rename = useContext(RenameContext);
  const [draft, setDraft] = useState<string | null>(null);
  /** True while the input is open. The blur that follows Enter/Escape must not commit again. */
  const editing = useRef(false);
  const w = width ?? 100;
  const h = height ?? 44;

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
      style={{ width: w, height: h }}
      onDoubleClick={start}
    >
      <svg className="shape-outline" width={w} height={h}>
        <ShapeOutline shape={data.shape} width={w} height={h} />
      </svg>
      <Handle type="target" position={data.targetPosition} />
      {draft === null ? (
        <span className="shape-label">
          <LabelText text={data.label} markdown={data.markdown} />
        </span>
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
      <Handle type="source" position={data.sourcePosition} />
    </div>
  );
}
