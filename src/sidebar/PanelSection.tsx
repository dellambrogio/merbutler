import { useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

/** Sections open by default that the user closed. */
const CLOSED_KEY = 'merbutler:closedSections';
/** Sections closed by default that the user opened. */
const OPENED_KEY = 'merbutler:openedSections';
/** Heights the user dragged sections to, in pixels, by id. */
const HEIGHTS_KEY = 'merbutler:sectionHeights';

/** The smallest height of a resized section's content, and the least the growing section keeps. */
const MIN_HEIGHT = 60;
const GROW_KEEPS = 120;

function loadList(key: string): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether a section is open, remembered in this browser when it differs from the default. */
function useSectionOpen(id: string, defaultOpen: boolean): [boolean, () => void] {
  const key = defaultOpen ? CLOSED_KEY : OPENED_KEY;
  const [open, setOpen] = useState(() => loadList(key).includes(id) !== defaultOpen);
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    try {
      const others = loadList(key).filter((x) => x !== id);
      localStorage.setItem(key, JSON.stringify(next === defaultOpen ? others : [...others, id]));
    } catch {
      // Storage is a convenience only.
    }
  };
  return [open, toggle];
}

function loadHeights(): Record<string, number> {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(HEIGHTS_KEY) ?? '{}');
    if (!all || typeof all !== 'object') return {};
    return Object.fromEntries(Object.entries(all).filter(([, h]) => typeof h === 'number' && h >= MIN_HEIGHT));
  } catch {
    return {};
  }
}

/** The height a section was resized to (null: its own height), remembered in this browser. */
function useSectionHeight(id: string): [number | null, (height: number | null, keep?: boolean) => void] {
  const [height, setHeight] = useState<number | null>(() => loadHeights()[id] ?? null);
  const set = (next: number | null, keep = true): void => {
    setHeight(next);
    if (!keep) return;
    try {
      const { [id]: _old, ...others } = loadHeights();
      localStorage.setItem(HEIGHTS_KEY, JSON.stringify(next === null ? others : { ...others, [id]: Math.round(next) }));
    } catch {
      // Storage is a convenience only.
    }
  };
  return [height, set];
}

/**
 * One panel of the side column: a header that opens and closes it (a click anywhere on it but on
 * its actions), optional actions on the right, and the content. A `grow` section takes the free
 * height while open. The others can be resized by dragging the edge toward the growing section (its
 * top edge below it, `resizeEdge="bottom"` above it), which takes height from, or gives it to, the
 * growing section; a double click there gives them back their own height.
 */
export function PanelSection({ id, title, actions, grow = false, defaultOpen = true, resizeEdge = 'top', onOpenChange, children }: {
  id: string;
  title: string;
  /** Controls shown in the header while the section is open. */
  actions?: ReactNode;
  grow?: boolean;
  /** Open until the user closes it (the default), or closed until the user opens it. */
  defaultOpen?: boolean;
  /** The edge that resizes it: the one toward the growing section. */
  resizeEdge?: 'top' | 'bottom';
  /** Called when the user opens or closes the section. */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}): JSX.Element {
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  const [height, setHeight] = useSectionHeight(id);
  const body = useRef<HTMLDivElement>(null);
  const resizable = open && !grow;

  /** The most this section's content may take: what the growing section can give up. */
  const maxHeight = (current: number): number => {
    const section = body.current?.closest('.side-section');
    const growing = section?.parentElement?.querySelector<HTMLElement>(':scope > .side-section.grow');
    const spare = growing ? growing.getBoundingClientRect().height - GROW_KEEPS : 0;
    return Math.max(MIN_HEIGHT, current + Math.max(0, spare));
  };
  const resizeTo = (to: number, current: number, keep: boolean): void =>
    setHeight(Math.round(Math.max(MIN_HEIGHT, Math.min(to, maxHeight(current)))), keep);

  const onResizeStart = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || !body.current) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const start = body.current.getBoundingClientRect().height;
    const y0 = e.clientY;
    let last = start;
    // Dragging the top edge up, or the bottom edge down, makes the section taller.
    const sign = resizeEdge === 'top' ? 1 : -1;
    const move = (ev: globalThis.PointerEvent): void => {
      last = start + sign * (y0 - ev.clientY);
      resizeTo(last, start, false);
    };
    const end = (): void => {
      document.body.classList.remove('side-resizing');
      grip.classList.remove('active');
      resizeTo(last, start, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    document.body.classList.add('side-resizing');
    grip.classList.add('active');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const onResizeKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!body.current || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const current = body.current.getBoundingClientRect().height;
    const up = e.key === 'ArrowUp';
    resizeTo(current + (up === (resizeEdge === 'top') ? 20 : -20), current, true);
  };

  const sized = resizable && height !== null;
  return (
    <section
      className={`side-section${open ? ' open' : ''}${grow && open ? ' grow' : ''}${sized ? ' sized' : ''}`}
      aria-label={title}
      style={sized ? ({ '--section-height': `${height}px` } as CSSProperties) : undefined}
    >
      {resizable && (
        <div
          className={`side-section-resize ${resizeEdge}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize ${title}`}
          title="Drag to resize; double-click for its own height"
          tabIndex={0}
          onPointerDown={onResizeStart}
          onDoubleClick={() => setHeight(null)}
          onKeyDown={onResizeKey}
        />
      )}
      <div className="side-section-head">
        <button type="button" className="side-section-toggle" aria-expanded={open} onClick={() => (toggle(), onOpenChange?.(!open))} title={open ? `Close ${title}` : `Open ${title}`}>
          <span className="side-section-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {open && actions}
      </div>
      {open && (
        <div className="side-section-body" ref={body}>
          {children}
        </div>
      )}
    </section>
  );
}
