/**
 * The style classes panel: every `classDef` with a preview, how many elements use it, and its
 * appearance. Create, rename, edit and delete classes, and add or remove a class on the selection.
 */
import { useState, type JSX } from 'react';
import {
  addClassDef,
  classUsage,
  isClassName,
  removeClassDef,
  renameClassDef,
  toggleClassOn,
  updateClassDef,
  type ClassDef,
  type FlowModel,
} from '../core/model';
import { stylesFromText, stylesToText } from '../flowchart/styling';
import { nextClassStyles } from '../flowchart/palette';
import { TextField } from '../canvas/fields';
import { AppearanceFields, StyleSwatch } from '../canvas/styleControls';
import { selectionSize, startClassDrag, type Selection } from '../canvas/classDrag';
import { Panel } from './Panel';

interface ClassesPanelProps {
  model: FlowModel;
  selection: Selection;
  readOnly: boolean;
  onChange: (model: FlowModel) => void;
  onClose: () => void;
}


/** Why a new class name cannot be used, or null. */
export function nameProblem(model: FlowModel, name: string, current?: string): string | null {
  if (name === '') return 'Give the class a name.';
  if (!isClassName(name)) return 'Use letters, digits, - and _, starting with a letter or _.';
  if (name !== current && model.classDefs?.some((c) => c.name === name)) return `A class ${name} exists already.`;
  return null;
}

export function ClassesPanel({ model, selection, readOnly, onChange, onClose }: ClassesPanelProps): JSX.Element {
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
    <Panel
      name="classes"
      title="Style classes"
      meta={defs.length === 0 ? 'none yet' : `${defs.length}`}
      onClose={onClose}
      hint={
        <>
          Written as <code>classDef</code>.{defs.length === 0 ? ' Ready-made sets are in Palette in the dock.' : ''} Drag a class onto a node, subgraph or edge to apply it (Shift adds it to the classes it has){selected > 0 ? `, or use ＋ / − on the ${selected} selected.` : ', or select elements and use ＋ / −.'}
        </>
      }
      foot={
        readOnly ? undefined : (
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
        )
      }
    >
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
    </Panel>
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
