/**
 * Lets the user drag the floating panels of the canvas (dock, inspector, classes, palette and layout panels) by any
 * spot that is not a control. A panel's offset lives in two CSS variables on the canvas element
 * (`--<name>-x`, `--<name>-y`), so a drag re-renders nothing and an inspector that is replaced by
 * another one (a new selection) stays where the user put it. A double click on a panel's
 * background puts it back in its place.
 *
 * The offsets come from the caller (the URL keeps them), and a finished move is reported back.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { PanelOffset as Offset } from '../core/urlState';

/** The panels, by CSS selector, and the name of their variables. */
const PANELS: ReadonlyArray<readonly [selector: string, name: string]> = [
  ['.dock', 'dock'],
  ['.inspector', 'inspector'],
  ['.class-panel', 'classes'],
  ['.layout-panel', 'layout'],
  ['.palette-panel', 'palette'],
];

/** Elements that keep their own pointer behavior: a press on them never moves the panel. */
const CONTROLS = 'input, textarea, select, button, a, label, summary, [contenteditable], [draggable="true"], [role="listbox"], [role="option"], .nodrag';

/** A press on a panel's background, or null when the press belongs to a control or the canvas. */
function panelAt(target: EventTarget | null): { el: HTMLElement; name: string } | null {
  if (!(target instanceof Element) || target.closest(CONTROLS)) return null;
  for (const [selector, name] of PANELS) {
    const el = target.closest<HTMLElement>(selector);
    if (el) return { el, name };
  }
  return null;
}

/** True if the press is on a scrollbar of the element (the event target is the element itself then). */
function onScrollbar(el: HTMLElement, e: React.PointerEvent): boolean {
  const box = el.getBoundingClientRect();
  return e.clientX - box.left > el.clientLeft + el.clientWidth || e.clientY - box.top > el.clientTop + el.clientHeight;
}

export function useDraggablePanels(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  /** The panels' offsets, by name; a panel left out is in its own place. */
  at: Record<string, Offset>,
  /** Called when a move ends (null: the panel went back to its place). */
  onMoved: (name: string, at: Offset | null) => void,
): {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
} {
  const offsets = useRef(new Map<string, Offset>());
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;

  const place = useCallback(
    (name: string, at: Offset): void => {
      offsets.current.set(name, at);
      const canvas = canvasRef.current;
      canvas?.style.setProperty(`--${name}-x`, `${at.x}px`);
      canvas?.style.setProperty(`--${name}-y`, `${at.y}px`);
    },
    [canvasRef],
  );

  // The offsets given (on start, or from a link opened later) win over what is shown.
  useLayoutEffect(() => {
    for (const [, name] of PANELS) place(name, at[name] ?? { x: 0, y: 0 });
  }, [at, place]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const canvas = canvasRef.current;
      const hit = e.button === 0 ? panelAt(e.target) : null;
      if (!canvas || !hit || onScrollbar(hit.el, e)) return;
      e.preventDefault(); // no text selection while dragging
      const { el, name } = hit;
      const start = offsets.current.get(name) ?? { x: 0, y: 0 };
      const box = el.getBoundingClientRect();
      const bounds = canvas.getBoundingClientRect();
      // Where the panel would be without an offset; the drag keeps it inside the canvas.
      const homeLeft = box.left - start.x;
      const homeTop = box.top - start.y;
      const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, Math.max(min, max)));
      const move = (ev: PointerEvent): void => {
        const left = clamp(homeLeft + start.x + ev.clientX - e.clientX, bounds.left, bounds.right - box.width);
        const top = clamp(homeTop + start.y + ev.clientY - e.clientY, bounds.top, bounds.bottom - Math.min(box.height, 40));
        place(name, { x: left - homeLeft, y: top - homeTop });
      };
      const end = (): void => {
        el.classList.remove('dragging');
        const moved = offsets.current.get(name) ?? { x: 0, y: 0 };
        if (moved.x !== start.x || moved.y !== start.y) onMovedRef.current(name, moved.x === 0 && moved.y === 0 ? null : moved);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      el.classList.add('dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [canvasRef, place],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const hit = panelAt(e.target);
      if (!hit) return;
      place(hit.name, { x: 0, y: 0 });
      onMovedRef.current(hit.name, null);
    },
    [place],
  );

  return { onPointerDown, onDoubleClick };
}
