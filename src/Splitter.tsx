/**
 * A vertical bar that resizes the first column of a two-column grid, by drag or with the arrow
 * keys. The width is a percent of the grid, in the grid's `--split` CSS variable: the grid's CSS
 * reads it as its first column (`grid-template-columns: var(--split, <default>) …`). A drag sets the
 * variable directly, so nothing re-renders while it moves; the caller hears of the result once, at
 * the end. A double click (or Enter) goes back to the default width (null).
 *
 * The bar is the grid's last child, absolutely placed on the right edge of its first child.
 */
import { useCallback, useLayoutEffect, useRef, useState, type JSX } from 'react';

interface SplitterProps {
  /** Width of the first column in percent of the grid; null: the CSS default. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Smallest widths in pixels of the first and the second column. */
  minFirst: number;
  minSecond: number;
  /** What the bar resizes, for screen readers ("Code editor width"). */
  label: string;
}

/** Percents are kept to one decimal: enough for a pixel, short in the URL. */
const round = (n: number): number => Math.round(n * 10) / 10;

export function Splitter({ value, onChange, minFirst, minSecond, label }: SplitterProps): JSX.Element {
  const bar = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /** The percent shown, for aria-valuenow. */
  const [shown, setShown] = useState<number | null>(value);

  const grid = (): HTMLElement | null => bar.current?.parentElement ?? null;

  /** Puts the bar on the right edge of the first column. */
  const place = useCallback((): void => {
    const g = grid();
    const first = g?.firstElementChild as HTMLElement | null;
    if (!g || !first || !bar.current) return;
    const left = first.getBoundingClientRect().right - g.getBoundingClientRect().left;
    bar.current.style.left = `${left}px`;
    setShown(round((left / g.clientWidth) * 100));
  }, []);

  const apply = useCallback(
    (percent: number | null): void => {
      const g = grid();
      if (!g) return;
      if (percent === null) g.style.removeProperty('--split');
      else g.style.setProperty('--split', `${percent}%`);
      place();
    },
    [place],
  );

  /** The percent for a first column of `px` pixels, kept within the smallest widths. */
  const clamp = (px: number): number => {
    const width = grid()?.clientWidth ?? 0;
    if (width <= 0) return 50;
    const max = Math.max(minFirst, width - minSecond);
    return round((Math.min(Math.max(px, minFirst), max) / width) * 100);
  };

  // The value given (on start, or from a link) wins.
  useLayoutEffect(() => apply(value), [value, apply]);

  // Follow the grid and its first column when the window or the content changes.
  useLayoutEffect(() => {
    const g = grid();
    const first = g?.firstElementChild;
    if (!g || !first) return;
    const ro = new ResizeObserver(place);
    ro.observe(g);
    ro.observe(first);
    return () => ro.disconnect();
  }, [place]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const g = grid();
    if (e.button !== 0 || !g) return;
    e.preventDefault();
    const left = g.getBoundingClientRect().left;
    let last = value;
    const move = (ev: PointerEvent): void => {
      last = clamp(ev.clientX - left);
      apply(last);
    };
    const end = (): void => {
      setDragging(false);
      document.documentElement.classList.remove('splitting');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (last !== value) onChange(last);
    };
    setDragging(true);
    document.documentElement.classList.add('splitting');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const g = grid();
    const first = g?.firstElementChild;
    if (!g || !first) return;
    const step = e.shiftKey ? 100 : 20;
    const now = first.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') onChange(clamp(now - step));
    else if (e.key === 'ArrowRight') onChange(clamp(now + step));
    else if (e.key === 'Enter' || e.key === 'Home') onChange(null);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={bar}
      className={`splitter${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={shown ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      title="Drag to resize. Double-click: back to the default width."
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(null)}
      onKeyDown={onKeyDown}
    />
  );
}
