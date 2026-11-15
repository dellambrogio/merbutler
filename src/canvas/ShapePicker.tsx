/**
 * The shape of a node: a button with the current shape's preview, which opens a grid of every
 * shape with its preview and name, grouped as in Mermaid's docs, with a search field. The previews
 * are the canvas's own outlines, so they look exactly like the node will.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { SHAPES, type Shape } from '../core/model';
import { SHAPE_GROUPS, SHAPE_INFO } from '../flowchart/shapes';
import { ShapeOutline } from './ShapeNodeView';

/** A sample label, so each preview has its shape's real proportions (fixed-size shapes keep theirs). */
const SAMPLE_TEXT = { width: 52, height: 18 };

/** A shape drawn into a small box, keeping its proportions. */
export function ShapeIcon({ shape, width = 40, height = 26 }: { shape: Shape; width?: number; height?: number }): JSX.Element {
  const size = SHAPE_INFO[shape].size(SAMPLE_TEXT, false);
  const pad = 3;
  return (
    <svg className="shape-icon" width={width} height={height} viewBox={`${-pad} ${-pad} ${size.width + 2 * pad} ${size.height + 2 * pad}`} aria-hidden="true">
      <ShapeOutline shape={shape} width={size.width} height={size.height} />
    </svg>
  );
}

/** Every name a shape answers to in the search: title, `@{ shape }` name, aliases, brackets. */
function searchText(shape: Shape): string {
  const info = SHAPE_INFO[shape];
  return [info.title, info.at, ...info.aliases, ...(info.brackets ?? []), info.group].join(' ').toLowerCase();
}

/**
 * Every shape in a popup: a search field and the shapes by group, each with its preview and name.
 * It floats over the page next to `anchor` (below it, or above when there is more room there) and
 * closes on Escape or a click elsewhere. `value` marks the current shape.
 */
export function ShapeMenu({ anchor, value, minWidth = 240, label = 'Shapes', onChoose, onClose }: {
  anchor: HTMLElement;
  value: Shape | null;
  minWidth?: number;
  label?: string;
  onChoose: (shape: Shape) => void;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' });
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  const shown = SHAPES.filter((s) => words.every((w) => searchText(s).includes(w)));

  /** The latest onClose, so the listeners below need not change with it. */
  const close = useRef(onClose);
  close.current = onClose;
  // Focus the search once the popup is placed: a hidden field takes no focus.
  const placed = place.visibility !== 'hidden';
  useEffect(() => {
    if (placed) search.current?.focus();
  }, [placed]);
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      // A click on the anchor is left to the anchor (it toggles the menu).
      if (!anchor.contains(target) && !popup.current?.contains(target)) close.current();
    };
    // Escape closes it wherever the focus is (inside, it is handled below).
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape' && !popup.current?.contains(e.target as Node)) close.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor]);

  /** It follows the anchor when a panel scrolls or the window resizes. */
  useLayoutEffect(() => {
    const update = (): void => {
      const r = anchor.getBoundingClientRect();
      const margin = 8;
      const below = window.innerHeight - r.bottom - margin;
      const above = r.top - margin;
      const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 2 * margin);
      const left = Math.max(margin, Math.min(r.left + r.width / 2 - (r.width >= minWidth ? r.width / 2 : width / 2), window.innerWidth - width - margin));
      const style: CSSProperties = { left, width };
      if (below >= 300 || below >= above) Object.assign(style, { top: r.bottom + 2, maxHeight: below });
      else Object.assign(style, { bottom: window.innerHeight - r.top + 2, maxHeight: above });
      setPlace(style);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor, minWidth]);

  /** Arrow keys move through the grid (three columns); Escape closes. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close.current();
      anchor.focus();
      return;
    }
    const tiles = [...(popup.current?.querySelectorAll<HTMLElement>('.shape-tile') ?? [])];
    const index = tiles.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (step === undefined) return;
    if (index < 0 && e.key === 'ArrowDown') {
      e.preventDefault();
      tiles[0]?.focus();
      return;
    }
    if (index < 0) return;
    e.preventDefault();
    tiles[Math.max(0, Math.min(tiles.length - 1, index + step))]?.focus();
  };

  return createPortal(
    <div ref={popup} className="shape-picker-popup" style={place} onKeyDown={onKeyDown}>
      <input
        ref={search}
        className="shape-picker-search"
        type="search"
        placeholder="Search: diamond, db, doc, ( …"
        aria-label="Search shapes"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="shape-picker-list" role="listbox" aria-label={label}>
        {SHAPE_GROUPS.map((group) => {
          const shapes = shown.filter((s) => SHAPE_INFO[s].group === group);
          if (shapes.length === 0) return null;
          return (
            <div key={group} className="shape-picker-group" role="group" aria-label={group}>
              <div className="shape-picker-heading">{group}</div>
              <div className="shape-picker-grid">
                {shapes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={s === value}
                    className={`shape-tile${s === value ? ' selected' : ''}`}
                    title={`${SHAPE_INFO[s].title}: @{ shape: ${SHAPE_INFO[s].at} }${SHAPE_INFO[s].brackets ? ` or ${SHAPE_INFO[s].brackets!.join('…')}` : ''}`}
                    onClick={() => onChoose(s)}
                  >
                    <ShapeIcon shape={s} width={52} height={32} />
                    <span className="shape-tile-name">{SHAPE_INFO[s].title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="muted shape-picker-empty">No shape matches.</p>}
      </div>
    </div>,
    document.body,
  );
}

/** The shape of a node, in a panel: a button with the current shape that opens the ShapeMenu. */
export function ShapePicker({ value, onChange }: { value: Shape | null; onChange: (shape: Shape) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // null: several nodes with different shapes.
  const info = value ? SHAPE_INFO[value] : null;
  return (
    <div className="shape-picker">
      <span className="color-field-label">Shape</span>
      <button ref={button} type="button" className="shape-picker-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={info ? `${info.title} (${info.at})` : 'The selected nodes have different shapes'}>
        {value ? <ShapeIcon shape={value} /> : <span className="shape-icon" aria-hidden="true" />}
        <span className="shape-picker-name">{info ? info.title : 'Mixed'}</span>
        <span className="shape-picker-arrow" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && button.current && (
        <ShapeMenu
          anchor={button.current}
          value={value}
          onChoose={(shape) => {
            onChange(shape);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
