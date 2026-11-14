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

export function ShapePicker({ value, onChange }: { value: Shape; onChange: (shape: Shape) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' });
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  const shown = SHAPES.filter((s) => words.every((w) => searchText(s).includes(w)));

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  /**
   * The popup floats over the page (in a portal, since the inspector scrolls and would clip it),
   * under the button, or above it when there is more room there. It follows the button when the
   * inspector scrolls or the window resizes.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const update = (): void => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const margin = 8;
      const below = window.innerHeight - r.bottom - margin;
      const above = r.top - margin;
      const width = Math.max(r.width, 240);
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
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
  }, [open]);

  const choose = (shape: Shape): void => {
    onChange(shape);
    setOpen(false);
    setQuery('');
  };

  /** Arrow keys move through the grid (three columns); Escape closes. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
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

  const info = SHAPE_INFO[value];
  return (
    <div className="shape-picker" ref={root} onKeyDown={onKeyDown}>
      <span className="color-field-label">Shape</span>
      <button ref={button} type="button" className="shape-picker-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={`${info.title} (${info.at})`}>
        <ShapeIcon shape={value} />
        <span className="shape-picker-name">{info.title}</span>
        <span className="shape-picker-arrow" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open &&
        createPortal(
          <div ref={popup} className="shape-picker-popup" style={place}>
            <input
              ref={search}
              className="shape-picker-search"
              type="search"
              placeholder="Search: diamond, db, doc, ( …"
              aria-label="Search shapes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="shape-picker-list" role="listbox" aria-label="Shapes">
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
                          onClick={() => choose(s)}
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
        )}
    </div>
  );
}
