/**
 * The direction of a subgraph: a pull-down with the dock's direction icons and names, plus
 * "(inherit)", which writes no `direction` statement.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { DIRECTIONS, type Direction } from '../core/model';
import { DIRECTION_NAMES, DockIcons } from './Dock';

export function DirectionSelect({ value, onChange, title }: {
  value: Direction | null | undefined;
  onChange: (direction: Direction | null) => void;
  /** Explains the field (on its label). */
  title?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const options: ReadonlyArray<Direction | null> = [null, ...DIRECTIONS];
  const current = value ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const pick = (direction: Direction | null): void => {
    setOpen(false);
    if (direction !== current) onChange(direction);
  };
  const show = (): void => {
    setActive(Math.max(0, options.indexOf(current)));
    setOpen(true);
  };

  return (
    <div className="class-select-field direction-select" ref={root}>
      <span className="color-field-label" title={title}>
        Direction
      </span>
      <button
        type="button"
        className="class-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Direction: ${current ? DIRECTION_NAMES[current] : 'inherit'}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            show();
          } else if (open && e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (open && e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (open && e.key === 'Enter') {
            e.preventDefault();
            pick(options[active]);
          } else if (open && (e.key === 'Escape' || e.key === 'Tab')) {
            setOpen(false);
          }
        }}
      >
        <DirectionOption direction={current} />
        <span className="class-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="class-select-menu" role="listbox" aria-label="Direction">
          {options.map((d, i) => (
            <li
              key={d ?? ''}
              role="option"
              aria-selected={d === current}
              className={`${i === active ? 'active' : ''}${d === current ? ' selected' : ''}`}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(d)}
            >
              <DirectionOption direction={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DirectionOption({ direction }: { direction: Direction | null }): JSX.Element {
  return (
    <span className="direction-option">
      <span className="direction-icon" aria-hidden="true">
        {direction ? DockIcons.direction(direction) : null}
      </span>
      {direction ? (
        <span className="class-select-name">
          {DIRECTION_NAMES[direction]} <span className="muted">({direction})</span>
        </span>
      ) : (
        <span className="class-select-name muted">(inherit)</span>
      )}
    </span>
  );
}
