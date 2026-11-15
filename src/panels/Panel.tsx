/**
 * The frame every panel shares, so they all look and behave alike: a header with the title, an
 * optional count or version beside it and a close button, an optional muted hint, the content, and
 * an optional footer.
 *
 * `Panel` floats over the canvas; it can be moved, and resized by its bottom-right corner. Its
 * `name` is what `useDraggablePanels` and the URL know it by (`--<name>-x` / `--<name>-y` hold
 * its offset, `--<name>-w` its width and `--<name>-h` its greatest height: it never grows taller
 * than its content). `WindowPanel` puts the same frame in a
 * window over the whole app, for About and Settings: not modal, and it can be moved too.
 */
import { useEffect, useId, useRef, type JSX, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CONTROLS } from './draggablePanels';

interface FrameProps {
  /** What the panel is about; it names the panel for screen readers too. */
  title: ReactNode;
  /** Short muted text beside the title, such as a count. */
  meta?: ReactNode;
  /** A line of muted help under the header. */
  hint?: ReactNode;
  /** Buttons along the bottom. */
  foot?: ReactNode;
  onClose?: () => void;
  children?: ReactNode;
}

function PanelHead({ title, meta, onClose, titleId, closeLabel }: {
  title: ReactNode;
  meta?: ReactNode;
  onClose?: () => void;
  titleId?: string;
  closeLabel: string;
}): JSX.Element {
  return (
    <div className="panel-head">
      <h2 className="panel-title" id={titleId}>
        {title}
      </h2>
      {meta !== undefined && meta !== null && <span className="panel-meta">{meta}</span>}
      <span className="spacer" />
      {onClose && (
        <button type="button" className="panel-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          ✕
        </button>
      )}
    </div>
  );
}

export function Panel({ name, className, title, meta, hint, foot, onClose, children }: FrameProps & {
  /** The panel's name for dragging and the URL, such as `diagram` or `inspector`. */
  name: string;
  className?: string;
}): JSX.Element {
  const titleId = useId();
  return (
    <div
      className={`panel panel-floating panel-${name}${className ? ` ${className}` : ''}`}
      data-panel={name}
      role="dialog"
      aria-labelledby={titleId}
      // The resized height is a cap: the panel is never taller than its content.
      style={{ width: `var(--${name}-w, var(--panel-width))`, ['--panel-h' as string]: `var(--${name}-h, 100vh)` }}
    >
      <PanelHead title={title} meta={meta} onClose={onClose} titleId={titleId} closeLabel="Close the panel" />
      <div className="panel-body">
        {/* In the body, so it scrolls away in a panel resized small. */}
        {hint && <p className="panel-hint">{hint}</p>}
        {children}
      </div>
      {foot && <div className="panel-foot">{foot}</div>}
      <span className="panel-resize" data-panel-resize="" title="Drag to resize; double-click for the default size" aria-hidden="true" />
    </div>
  );
}

/** The window panel last pressed is drawn above the other. */
let topWindow = 0;

/**
 * Lets a window panel be moved by a drag on any spot of it that is not a control, kept inside the
 * browser window; a double click there puts it back in the middle. Where it was moved is kept
 * while the page is open.
 */
function useMovableWindow(dialog: React.RefObject<HTMLDialogElement | null>): {
  onPointerDown: (e: ReactPointerEvent<HTMLDialogElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
} {
  const at = useRef({ x: 0, y: 0 });
  const show = (d: HTMLDialogElement): void => {
    d.style.translate = at.current.x === 0 && at.current.y === 0 ? '' : `${at.current.x}px ${at.current.y}px`;
  };
  const onFrame = (target: EventTarget, d: HTMLDialogElement): boolean =>
    target instanceof Element && d.contains(target) && !target.closest(CONTROLS);

  return {
    onPointerDown: (e) => {
      const d = dialog.current;
      if (!d) return;
      d.style.zIndex = `${60 + ++topWindow}`;
      if (e.button !== 0 || !onFrame(e.target, d)) return;
      // Not on the body's scrollbar.
      const body = (e.target as Element).closest<HTMLElement>('.panel-body');
      if (body && e.clientX - body.getBoundingClientRect().left > body.clientLeft + body.clientWidth) return;
      e.preventDefault();
      const start = { ...at.current };
      const box = d.getBoundingClientRect();
      const home = { left: box.left - start.x, top: box.top - start.y };
      const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, Math.max(min, max)));
      const move = (ev: PointerEvent): void => {
        const left = clamp(home.left + start.x + ev.clientX - e.clientX, 0, window.innerWidth - box.width);
        const top = clamp(home.top + start.y + ev.clientY - e.clientY, 0, window.innerHeight - Math.min(box.height, 40));
        at.current = { x: left - home.left, y: top - home.top };
        show(d);
      };
      const end = (): void => {
        d.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      d.classList.add('dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    onDoubleClick: (e) => {
      const d = dialog.current;
      if (!d || !onFrame(e.target, d)) return;
      at.current = { x: 0, y: 0 };
      show(d);
    },
  };
}

/**
 * The panel frame in a window over the whole app, for About and Settings. It is not modal: the app
 * stays usable while it is open. The ✕, or Esc while it has the focus, closes it; a drag on it moves it.
 */
export function WindowPanel({ open, className, title, meta, hint, foot, onClose, children }: FrameProps & {
  open: boolean;
  onClose: () => void;
  className?: string;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const movable = useMovableWindow(dialog);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.style.zIndex = `${60 + ++topWindow}`;
      d.show();
      d.focus();
    } else if (!open && d.open) d.close();
  }, [open]);
  const titleId = useId();
  return (
    <dialog
      ref={dialog}
      className={`panel panel-window${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      tabIndex={-1}
      onClose={onClose}
      onPointerDown={movable.onPointerDown}
      onDoubleClick={movable.onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="panel-frame">
        <PanelHead title={title} meta={meta} onClose={onClose} titleId={titleId} closeLabel="Close the panel (Esc)" />
        {hint && <p className="panel-hint">{hint}</p>}
        <div className="panel-body">{children}</div>
        {foot && <div className="panel-foot">{foot}</div>}
      </div>
    </dialog>
  );
}

/** A titled group of fields inside a panel. */
export function PanelSection({ title, children }: { title: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section className="panel-section">
      <h3 className="panel-section-title">{title}</h3>
      {children}
    </section>
  );
}
