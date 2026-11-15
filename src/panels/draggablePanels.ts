/**
 * Lets the user move and resize the floating panels of the canvas. A panel is any element with a
 * `data-panel="<name>"` attribute (the dock and every `Panel`).
 *
 * - Move: a drag on any spot of a panel that is not a control. A double click on its background
 *   puts it back in its place.
 * - Resize: a drag on its `[data-panel-resize]` handle (the bottom-right corner of a `Panel`); the
 *   top-left corner stays where it is. A double click on the handle gives it back its own size.
 *
 * A panel's offset and size live in CSS variables on the canvas element (`--<name>-x`, `--<name>-y`,
 * `--<name>-w`, `--<name>-h`), so a drag re-renders nothing and a node panel replaced by an edge
 * panel (a new selection) keeps where the user put it and its size.
 *
 * The offsets and sizes come from the caller (the URL keeps them), and a finished move or resize is
 * reported back.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { PanelOffset as Offset, PanelSize as Size } from '../core/urlState';

/** Elements that keep their own pointer behavior: a press on them never moves the panel. */
export const CONTROLS = 'input, textarea, select, button, a, label, summary, [contenteditable], [draggable="true"], [role="listbox"], [role="option"], .nodrag';

/** The smallest size a panel can be resized to. */
const MIN_W = 220;
const MIN_H = 140;

interface Hit {
  el: HTMLElement;
  name: string;
  /** The press is on the resize handle. */
  resize: boolean;
}

/** A press on a panel's background or resize handle, or null when it belongs to a control or the canvas. */
function panelAt(target: EventTarget | null): Hit | null {
  if (!(target instanceof Element)) return null;
  const resize = target.closest('[data-panel-resize]') !== null;
  if (!resize && target.closest(CONTROLS)) return null;
  const el = target.closest<HTMLElement>('[data-panel]');
  const name = el?.dataset.panel;
  return el && name ? { el, name, resize } : null;
}

/** True if the press is on a scrollbar of the element (the event target is the element itself then). */
function onScrollbar(el: HTMLElement, e: React.PointerEvent): boolean {
  const box = el.getBoundingClientRect();
  return e.clientX - box.left > el.clientLeft + el.clientWidth || e.clientY - box.top > el.clientTop + el.clientHeight;
}

/** The height the panel would have to show all of its content: its parts, with the body unscrolled. */
function contentHeight(el: HTMLElement): number {
  let h = el.offsetHeight - el.clientHeight; // the borders
  for (const part of el.children) {
    if (!(part instanceof HTMLElement) || getComputedStyle(part).position === 'absolute') continue;
    h += part.classList.contains('panel-body') ? part.scrollHeight : part.offsetHeight;
  }
  return Math.ceil(h);
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, Math.max(min, max)));

export function useDraggablePanels(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  /** The panels' offsets, by name; a panel left out is in its own place. */
  at: Record<string, Offset>,
  /** The panels' sizes, by name; a panel left out has its own size. */
  sizes: Record<string, Size>,
  /** Called when a move ends (null: the panel went back to its place). */
  onMoved: (name: string, at: Offset | null) => void,
  /** Called when a resize ends (null: the panel has its own size again). */
  onResized: (name: string, size: Size | null) => void,
): {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
} {
  const offsets = useRef(new Map<string, Offset>());
  const sized = useRef(new Map<string, Size | null>());
  const report = useRef({ onMoved, onResized });
  report.current = { onMoved, onResized };

  const place = useCallback(
    (name: string, at: Offset): void => {
      offsets.current.set(name, at);
      const canvas = canvasRef.current;
      canvas?.style.setProperty(`--${name}-x`, `${at.x}px`);
      canvas?.style.setProperty(`--${name}-y`, `${at.y}px`);
    },
    [canvasRef],
  );

  const size = useCallback(
    (name: string, to: Size | null): void => {
      sized.current.set(name, to);
      const style = canvasRef.current?.style;
      if (to) {
        style?.setProperty(`--${name}-w`, `${to.w}px`);
        style?.setProperty(`--${name}-h`, `${to.h}px`);
      } else {
        style?.removeProperty(`--${name}-w`);
        style?.removeProperty(`--${name}-h`);
      }
    },
    [canvasRef],
  );

  // The offsets and sizes given (on start, or from a link opened later) win over what is shown; a
  // panel left out goes back to its place and its own size.
  useLayoutEffect(() => {
    for (const name of new Set([...offsets.current.keys(), ...Object.keys(at)])) place(name, at[name] ?? { x: 0, y: 0 });
  }, [at, place]);
  useLayoutEffect(() => {
    for (const name of new Set([...sized.current.keys(), ...Object.keys(sizes)])) size(name, sizes[name] ?? null);
  }, [sizes, size]);

  /** Follows the pointer until it is released, then calls `done`. */
  const track = (el: HTMLElement, move: (ev: PointerEvent) => void, done: () => void): void => {
    const end = (): void => {
      el.classList.remove('dragging', 'resizing');
      done();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const canvas = canvasRef.current;
      const hit = e.button === 0 ? panelAt(e.target) : null;
      if (!canvas || !hit || (!hit.resize && onScrollbar(hit.el, e))) return;
      e.preventDefault(); // no text selection while dragging
      const { el, name } = hit;
      const start = offsets.current.get(name) ?? { x: 0, y: 0 };
      const box = el.getBoundingClientRect();
      const bounds = canvas.getBoundingClientRect();

      if (hit.resize) {
        const startSize = sized.current.get(name) ?? null;
        el.classList.add('resizing');
        track(
          el,
          (ev) => {
            const w = clamp(box.width + ev.clientX - e.clientX, MIN_W, bounds.right - box.left);
            // Never taller than the content: the height is a cap, and dragging past it does nothing.
            const h = clamp(box.height + ev.clientY - e.clientY, Math.min(MIN_H, contentHeight(el)), Math.min(bounds.bottom - box.top, contentHeight(el)));
            size(name, { w: Math.round(w), h: Math.round(h) });
            // A panel held by its right or bottom edge grows to the left or up: move it back so
            // its top-left corner stays under the same spot.
            const now = el.getBoundingClientRect();
            const o = offsets.current.get(name) ?? { x: 0, y: 0 };
            place(name, { x: o.x + box.left - now.left, y: o.y + box.top - now.top });
          },
          () => {
            const to = sized.current.get(name) ?? null;
            if (to && (to.w !== startSize?.w || to.h !== startSize?.h)) report.current.onResized(name, to);
            const moved = offsets.current.get(name) ?? { x: 0, y: 0 };
            if (moved.x !== start.x || moved.y !== start.y) report.current.onMoved(name, moved.x === 0 && moved.y === 0 ? null : moved);
          },
        );
        return;
      }

      // Where the panel would be without an offset; the drag keeps it inside the canvas.
      const homeLeft = box.left - start.x;
      const homeTop = box.top - start.y;
      el.classList.add('dragging');
      track(
        el,
        (ev) => {
          const left = clamp(homeLeft + start.x + ev.clientX - e.clientX, bounds.left, bounds.right - box.width);
          const top = clamp(homeTop + start.y + ev.clientY - e.clientY, bounds.top, bounds.bottom - Math.min(box.height, 40));
          place(name, { x: left - homeLeft, y: top - homeTop });
        },
        () => {
          const moved = offsets.current.get(name) ?? { x: 0, y: 0 };
          if (moved.x !== start.x || moved.y !== start.y) report.current.onMoved(name, moved.x === 0 && moved.y === 0 ? null : moved);
        },
      );
    },
    [canvasRef, place, size],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const hit = panelAt(e.target);
      if (!hit) return;
      if (hit.resize) {
        // Its own size again, with the top-left corner where it is.
        const box = hit.el.getBoundingClientRect();
        size(hit.name, null);
        const now = hit.el.getBoundingClientRect();
        const o = offsets.current.get(hit.name) ?? { x: 0, y: 0 };
        const at = { x: o.x + box.left - now.left, y: o.y + box.top - now.top };
        place(hit.name, at);
        report.current.onResized(hit.name, null);
        report.current.onMoved(hit.name, at.x === 0 && at.y === 0 ? null : at);
        return;
      }
      place(hit.name, { x: 0, y: 0 });
      report.current.onMoved(hit.name, null);
    },
    [place, size],
  );

  return { onPointerDown, onDoubleClick };
}
