/**
 * The style classes panel: every `classDef` with a preview, how many elements use it, and its
 * appearance. Create, rename, edit and delete classes, and add or remove a class on the selection.
 */
import { useState, type DragEvent, type JSX } from 'react';
import {
  addClassDef,
  addClassDefs,
  classUsage,
  isClassName,
  removeClassDef,
  renameClassDef,
  toggleClassOn,
  updateClassDef,
  type ClassDef,
  type FlowModel,
} from '../core/model';
import { declarationValue, stylesFromText, stylesToText } from '../flowchart/styling';
import { CLASS_SETS, nextClassStyles } from '../flowchart/palette';
import { TextField } from './fields';
import { AppearanceFields, StyleSwatch } from './styleControls';
import { DockLabel, DockSeparator } from './Dock';

export interface Selection {
  nodes: string[];
  subgraphs: string[];
  edges: string[];
}

interface ClassPanelProps {
  model: FlowModel;
  selection: Selection;
  readOnly: boolean;
  onChange: (model: FlowModel) => void;
  onClose: () => void;
}

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

function startClassDrag(e: DragEvent, name: string, styles: readonly string[]): void {
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

const selectionSize = (s: Selection): number => s.nodes.length + s.subgraphs.length + s.edges.length;

/** Why a new class name cannot be used, or null. */
export function nameProblem(model: FlowModel, name: string, current?: string): string | null {
  if (name === '') return 'Give the class a name.';
  if (!isClassName(name)) return 'Use letters, digits, - and _, starting with a letter or _.';
  if (name !== current && model.classDefs?.some((c) => c.name === name)) return `A class ${name} exists already.`;
  return null;
}

export function ClassPanel({ model, selection, readOnly, onChange, onClose }: ClassPanelProps): JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const defs = model.classDefs ?? [];
  const selected = selectionSize(selection);

  const create = (): void => {
    const name = draft.trim();
    const why = nameProblem(model, name);
    setProblem(why);
    if (why) return;
    // A new class starts with a visible look of its own, so its effect shows at once.
    let next = addClassDef(model, name, nextClassStyles(defs.map((d) => d.styles)));
    if (selected > 0) next = toggleClassOn(next, name, selection);
    onChange(next);
    setDraft('');
    setOpen(name);
  };

  return (
    <div className="class-panel" role="dialog" aria-label="Style classes">
      <div className="class-panel-head">
        <strong>Style classes</strong>
        <span className="muted">{defs.length === 0 ? 'none yet' : `${defs.length}`}</span>
        <span className="spacer" />
        <button type="button" className="link-button" onClick={onClose} aria-label="Close the classes panel" title="Close">
          ✕
        </button>
      </div>
      <p className="muted class-panel-hint">
        Written as <code>classDef</code>.{defs.length === 0 ? ' Ready-made sets are in Palette in the dock.' : ''} Drag a class onto a node, subgraph or edge to apply it (Shift adds it to the classes it has){selected > 0 ? `, or use ＋ / − on the ${selected} selected.` : ', or select elements and use ＋ / −.'}
      </p>
      <div className="class-list">
        {defs.map((def) => (
          <ClassRow
            key={def.name}
            def={def}
            model={model}
            used={classUsage(model, def.name)}
            selection={selection}
            readOnly={readOnly}
            expanded={open === def.name}
            onToggle={() => setOpen(open === def.name ? null : def.name)}
            onChange={(next, rename) => {
              onChange(next);
              if (rename) setOpen(rename);
            }}
          />
        ))}
      </div>
      {!readOnly && (
        <form
          className="class-new"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            value={draft}
            placeholder="new class name, e.g. warning"
            aria-label="New class name"
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem(null);
            }}
          />
          <button type="submit" title={selected > 0 ? 'Create the class and add it to the selection' : 'Create the class'}>
            ＋ New class
          </button>
          {problem && <span className="field-error">{problem}</span>}
        </form>
      )}
    </div>
  );
}

/**
 * The palettes: ready-made sets of classes. ＋ Add writes a set's classDefs; a color dragged onto
 * a node, subgraph or edge applies its class, creating it if needed.
 */
export function PalettePanel({ model, onChange, onClose }: {
  model: FlowModel;
  onChange: (model: FlowModel) => void;
  onClose: () => void;
}): JSX.Element {
  const defs = model.classDefs ?? [];
  return (
    <div className="palette-panel" role="dialog" aria-label="Palettes">
      <div className="class-panel-head">
        <strong>Palettes</strong>
        <span className="muted">{CLASS_SETS.length}</span>
        <span className="spacer" />
        <button type="button" className="link-button" onClick={onClose} aria-label="Close the palettes panel" title="Close">
          ✕
        </button>
      </div>
      <p className="muted class-panel-hint">＋ Add writes a palette's classes. Drag a color onto an element to give it that class (Shift adds it).</p>
      <div className="class-sets">
        {CLASS_SETS.map((set) => {
          const missing = set.classes.filter((c) => !defs.some((d) => d.name === c.name));
          return (
            <div key={set.name} className="class-set">
              <div className="class-set-head">
                <strong>{set.name}</strong>
                <span className="muted class-set-names">
                  {set.prefix}-1…{set.classes.length}
                </span>
                <button
                  type="button"
                  disabled={missing.length === 0}
                  title={missing.length === 0 ? 'All its classes exist already' : `Add ${missing.map((c) => c.name).join(', ')}`}
                  onClick={() => onChange(addClassDefs(model, missing))}
                >
                  {missing.length === 0 ? 'Added' : missing.length === set.classes.length ? '＋ Add' : `＋ Add ${missing.length}`}
                </button>
              </div>
              <div className="class-set-preview">
                {set.classes.map((c, i) => (
                  <span
                    key={c.name}
                    draggable
                    onDragStart={(e) => startClassDrag(e, c.name, c.styles)}
                    title={`${c.name}: drag onto an element to apply it`}
                    style={{ background: set.colors[i] }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

function ClassRow({ def, model, used, selection, readOnly, expanded, onToggle, onChange }: {
  def: ClassDef;
  model: FlowModel;
  used: number;
  selection: Selection;
  readOnly: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (model: FlowModel, renamedTo?: string) => void;
}): JSX.Element {
  const selected = selectionSize(selection);
  const onSelection = [
    ...model.nodes.filter((n) => selection.nodes.includes(n.id)),
    ...model.subgraphs.filter((s) => selection.subgraphs.includes(s.id)),
    ...model.edges.filter((e) => selection.edges.includes(e.id)),
  ];
  const allHave = onSelection.length > 0 && onSelection.every((i) => i.classes?.includes(def.name));
  const isDefault = def.name === 'default';
  return (
    <div className={`class-row${expanded ? ' expanded' : ''}`}>
      <div
        className="class-row-head"
        draggable={!readOnly && !isDefault}
        onDragStart={(e) => startClassDrag(e, def.name, def.styles)}
        title={readOnly || isDefault ? undefined : `Drag ${def.name} onto an element to apply it`}
      >
        <span className="class-row-grip" aria-hidden="true">
          <StyleSwatch styles={def.styles} />
        </span>
        <button type="button" className="class-row-toggle" aria-expanded={expanded} onClick={onToggle} title={expanded ? 'Close' : 'Edit this class'}>
          <span className="class-row-name">{def.name}</span>
          <span className="muted class-row-used" title={isDefault ? 'Applies to every node without a class' : `Used by ${used} element${used === 1 ? '' : 's'}`}>
            {isDefault ? 'all nodes' : used}
          </span>
        </button>
        {!readOnly && !isDefault && selected > 0 && (
          <button
            type="button"
            className={`class-apply${allHave ? ' on' : ''}`}
            onClick={() => onChange(toggleClassOn(model, def.name, selection))}
            title={allHave ? `Remove ${def.name} from the selection` : `Add ${def.name} to the selection`}
            aria-label={allHave ? `Remove ${def.name} from the selection` : `Add ${def.name} to the selection`}
          >
            {allHave ? '−' : '＋'}
          </button>
        )}
      </div>
      {expanded && <ClassEditor def={def} model={model} used={used} readOnly={readOnly} onChange={onChange} />}
    </div>
  );
}

/**
 * Edits one class: its name (renamed wherever it is used), its appearance, its declarations as
 * text, and deletes it (asking first when elements use it).
 */
export function ClassEditor({ def, model, used, readOnly, onChange }: {
  def: ClassDef;
  model: FlowModel;
  used: number;
  readOnly: boolean;
  onChange: (model: FlowModel, renamedTo?: string) => void;
}): JSX.Element {
  const [confirm, setConfirm] = useState(false);
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  return (
    <div className="class-row-body">
      {!readOnly && (
        <label>
          Name
          <TextField
            key={`name:${def.name}`}
            value={def.name}
            onCommit={(text) => {
              const name = text.trim();
              const why = nameProblem(model, name, def.name);
              setRenameProblem(why);
              if (!why && name !== def.name) onChange(renameClassDef(model, def.name, name), name);
            }}
          />
          {renameProblem && <span className="field-error">{renameProblem}</span>}
        </label>
      )}
      <AppearanceFields key={def.styles.join(';')} styles={def.styles} kind="box" onChange={(styles) => onChange(updateClassDef(model, def.name, styles))} />
      <details className="style-advanced">
        <summary>Advanced: declarations as text</summary>
        <label>
          classDef {def.name}
          <TextField key={`styles:${def.styles.join(';')}`} value={stylesToText(def.styles)} placeholder="fill:#f96; stroke:#333" onCommit={(text) => onChange(updateClassDef(model, def.name, stylesFromText(text)))} />
        </label>
      </details>
      {!readOnly && (
        <button
            type="button"
            className="danger"
            onClick={() => {
              if (used > 0 && !confirm) {
                setConfirm(true);
                return;
              }
              onChange(removeClassDef(model, def.name));
            }}
            onBlur={() => setConfirm(false)}
          >
            {confirm ? `Delete, and remove it from ${used} element${used === 1 ? '' : 's'}?` : 'Delete class'}
          </button>
      )}
    </div>
  );
}
