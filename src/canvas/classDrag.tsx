/**
 * Dragging a style class onto an element: the drag data, the picture under the pointer, whether
 * Shift adds the class, and the classes as tiles at the end of the dock.
 */
import type { DragEvent, JSX } from 'react';
import { toggleClassOn, type FlowModel } from '../core/model';
import { declarationValue } from '../flowchart/styling';
import { StyleSwatch } from './styleControls';
import { DockLabel, DockSeparator } from './Dock';

/** The selected elements, by kind. */
export interface Selection {
  nodes: string[];
  subgraphs: string[];
  edges: string[];
}

export const selectionSize = (s: Selection): number => s.nodes.length + s.subgraphs.length + s.edges.length;

/** The drag data of a palette class: JSON `{ name, styles }`. */
export const CLASS_DRAG_TYPE = 'application/x-merbutler-class';

/**
 * Starts dragging a class: its data, and as the picture under the pointer a chip with its name in
 * its colors, instead of the browser's snapshot of the element (which would take in the hover
 * label and the see-through dock behind it).
 */
// Whether Shift is down. Drag events on some platforms (Chrome on Linux) always say it is up,
// and no key events arrive during a drag, so Shift is also read from the keys and the pointer
// before the drag, and remembered from its start.
let shiftDown = false;
let shiftAtDragStart = false;
if (typeof window !== 'undefined') {
  const track = (e: KeyboardEvent | MouseEvent): void => {
    shiftDown = e.shiftKey;
  };
  for (const type of ['keydown', 'keyup', 'pointermove', 'pointerdown'] as const) window.addEventListener(type, track, true);
  window.addEventListener('blur', () => {
    shiftDown = false;
  });
}

/** Whether a class drag adds the class to the element's classes (Shift) rather than replacing them. */
export function classDragAdds(e: { shiftKey: boolean }): boolean {
  return e.shiftKey || shiftDown || shiftAtDragStart;
}

export function startClassDrag(e: DragEvent, name: string, styles: readonly string[]): void {
  shiftAtDragStart = e.shiftKey || shiftDown;
  e.dataTransfer.setData(CLASS_DRAG_TYPE, JSON.stringify({ name, styles }));
  // Any effect: holding Shift turns a drag into a move, which a copy-only drag would refuse.
  e.dataTransfer.effectAllowed = 'all';
  const v = (p: string): string => declarationValue(styles, p);
  const chip = document.createElement('div');
  chip.className = 'class-drag-chip';
  chip.textContent = name;
  chip.style.background = v('fill');
  chip.style.borderColor = v('stroke');
  chip.style.color = v('color') || (v('fill') ? '#333333' : '');
  document.body.append(chip);
  e.dataTransfer.setDragImage(chip, chip.offsetWidth / 2, chip.offsetHeight / 2);
  // The browser has taken its picture once this event is over.
  setTimeout(() => chip.remove(), 0);
  document.body.classList.add('class-dragging');
  e.currentTarget.addEventListener(
    'dragend',
    () => {
      document.body.classList.remove('class-dragging');
      shiftAtDragStart = false;
    },
    { once: true },
  );
}

/**
 * The classes as tiles at the end of the dock, always visible: drag one onto a node, subgraph or
 * edge to apply it, or click it to add or remove it on the selection.
 */
export function ClassStrip({ model, selection, readOnly, onChange }: {
  model: FlowModel;
  selection: Selection;
  readOnly: boolean;
  onChange: (model: FlowModel) => void;
}): JSX.Element | null {
  const defs = (model.classDefs ?? []).filter((d) => d.name !== 'default');
  if (defs.length === 0) return null;
  const selected = selectionSize(selection);
  const apply = (name: string) => (): void => {
    if (!readOnly && selected > 0) onChange(toggleClassOn(model, name, selection));
  };
  return (
    <>
      <DockSeparator />
      <div className="dock-classes" role="group" aria-label="Style classes">
        {defs.map((def) => (
          // A span, not a button: Firefox starts no drag from a button.
          <span
            key={def.name}
            role="button"
            tabIndex={readOnly ? -1 : 0}
            aria-disabled={readOnly}
            aria-label={`Class ${def.name}`}
            className={`dock-item dock-class${readOnly ? ' disabled' : ''}`}
            data-dock-item=""
            draggable={!readOnly}
            onDragStart={(e) => startClassDrag(e, def.name, def.styles)}
            onClick={apply(def.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                apply(def.name)();
              }
            }}
          >
            <span className="dock-tile">
              <StyleSwatch styles={def.styles} />
            </span>
            <DockLabel label={def.name} hint={`Drag onto an element (Shift: add to its classes)${selected > 0 ? '; click: add to or remove from the selection' : ''}`} />
          </span>
        ))}
      </div>
    </>
  );
}

