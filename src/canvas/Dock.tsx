/**
 * The dock: the canvas's row of tools (add a node, a subgraph, …, the Diagram, Classes and
 * Palette panels, and the style classes), drawn like the macOS dock. Each tool is an icon tile
 * with its name in a bubble on hover, and a dot under the tiles whose panel is open.
 *
 * It sits at the bottom of the canvas, centered; `DockPosition` leaves room for a setting that
 * puts it at the top instead.
 */
import type { JSX, ReactNode } from 'react';
import type { Direction } from '../core/model';

export type DockPosition = 'bottom' | 'top';

/** Where the dock is until a setting chooses otherwise. */
export const DEFAULT_DOCK_POSITION: DockPosition = 'bottom';

export function Dock({ position = DEFAULT_DOCK_POSITION, children }: { position?: DockPosition; children: ReactNode }): JSX.Element {
  return (
    <div className="dock" data-panel="dock" data-position={position} role="toolbar" aria-label="Dock">
      {children}
    </div>
  );
}

export function DockItem({ icon, label, hint, onClick, disabled = false, active, add = false, badge }: {
  icon: ReactNode;
  /** The name in the hover bubble (and for screen readers). */
  label: string;
  /** A second, smaller line in the bubble. */
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  /** For a tile that opens a panel: whether it is open (a dot under the tile). */
  active?: boolean;
  /** Marks a tile that adds something (a small + on its corner). */
  add?: boolean;
  /** A short text on the tile's corner, such as a count. */
  badge?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`dock-item${active ? ' active' : ''}`}
      data-dock-item=""
      onClick={onClick}
      disabled={disabled}
      aria-label={hint ? `${label}: ${hint}` : label}
      aria-pressed={active}
    >
      <span className="dock-tile">
        <span className="dock-icon" aria-hidden="true">{icon}</span>
        {add && <span className="dock-plus" aria-hidden="true">+</span>}
        {badge && <span className="dock-badge" aria-hidden="true">{badge}</span>}
      </span>
      <DockLabel label={label} hint={hint} />
      {active !== undefined && <span className="dock-dot" aria-hidden="true" />}
    </button>
  );
}

export function DockLabel({ label, hint }: { label: string; hint?: string }): JSX.Element {
  return (
    <span className="dock-label" aria-hidden="true">
      {label}
      {hint && <small>{hint}</small>}
    </span>
  );
}

export function DockSeparator(): JSX.Element {
  return <span className="dock-separator" aria-hidden="true" />;
}

const DIRECTION_ANGLE: Record<Direction, number> = { LR: 0, TB: 90, RL: 180, BT: 270 };

/** What each direction means. */
export const DIRECTION_NAMES: Record<Direction, string> = { TB: 'Top to bottom', BT: 'Bottom to top', LR: 'Left to right', RL: 'Right to left' };

/** 24×24 line icons in the current color. */
function Svg({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const DockIcons = {
  node: (
    <Svg>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
    </Svg>
  ),
  state: (
    <Svg>
      <rect x="3.5" y="6.5" width="17" height="11" rx="5.5" />
    </Svg>
  ),
  start: (
    <Svg>
      <circle cx="12" cy="12" r="5.5" fill="currentColor" />
    </Svg>
  ),
  end: (
    <Svg>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </Svg>
  ),
  note: (
    <Svg>
      <path d="M5.5 4.5h9l4 4v11h-13z" />
      <path d="M14.5 4.5v4h4M8.5 12.5h7M8.5 15.5h5" />
    </Svg>
  ),
  subgraph: (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" strokeDasharray="3 2.5" />
      <rect x="7.5" y="10" width="9" height="6" rx="1.5" />
    </Svg>
  ),
  group: (
    <Svg>
      <rect x="2.5" y="3.5" width="19" height="17" rx="2" strokeDasharray="3 2.5" />
      <rect x="5.5" y="8" width="5.5" height="4.5" rx="1" />
      <rect x="13" y="13" width="5.5" height="4.5" rx="1" />
    </Svg>
  ),
  lane: (
    <Svg>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M3 14.5h18M7.5 4.5v15" />
    </Svg>
  ),
  actor: (
    <Svg>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M12 8.5v6.5M7 11h10M8 20l4-5 4 5" />
    </Svg>
  ),
  usecase: (
    <Svg>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
    </Svg>
  ),
  boundary: (
    <Svg>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <path d="M3.5 8h17" />
    </Svg>
  ),
  direction: (direction: Direction) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <g transform={`rotate(${DIRECTION_ANGLE[direction]} 12 12)`}>
        <rect x="2.5" y="9" width="5" height="6" rx="1.2" />
        <path d="M8.5 12h11M15.5 8l4 4-4 4" />
      </g>
    </svg>
  ),
  palette: (
    <Svg>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.7 1.6-1.5 0-.9-.6-1.2-.6-2 0-.9.7-1.5 1.6-1.5h2a3.9 3.9 0 0 0 3.9-3.9c0-4.4-3.8-8.1-8.5-8.1z" />
      <circle cx="7.8" cy="11" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.3" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.8" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  ),
  classes: (
    <Svg>
      <rect x="3.5" y="4" width="5" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="3.5" y="10" width="5" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.65" />
      <rect x="3.5" y="16" width="5" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M11.5 6h9M11.5 12h9M11.5 18h6" />
    </Svg>
  ),
  free: (
    <Svg>
      <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </Svg>
  ),
  layout: (
    <Svg>
      <rect x="9" y="3" width="6" height="4.5" rx="1" />
      <rect x="3" y="16.5" width="6" height="4.5" rx="1" />
      <rect x="15" y="16.5" width="6" height="4.5" rx="1" />
      <path d="M12 7.5V12M6 16.5V12h12v4.5" />
    </Svg>
  ),
};
