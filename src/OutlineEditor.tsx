import { useMemo, useState, type JSX, type KeyboardEvent } from 'react';
import {
  addChild,
  addSibling,
  indent,
  itemAt,
  MINDMAP_SHAPES,
  mindmapIcon,
  move,
  outdent,
  parseOutline,
  readKanbanNode,
  readMindmapNode,
  readTreemapNode,
  readTreeViewNode,
  remove,
  serializeOutline,
  setDecorations,
  setText,
  withMindmapIcon,
  writeKanbanNode,
  writeMindmapNode,
  writeTreemapNode,
  writeTreeViewNode,
  type Outline,
  type OutlineItem,
  type Path,
} from './outline';

interface OutlineEditorProps {
  /** Code that Mermaid accepts. */
  code: string;
  typeName: string;
  /** False while the code does not parse: the outline is of older code. */
  editable: boolean;
  onChange: (code: string) => void;
}

const samePath = (a: Path | null, b: Path): boolean => a !== null && a.length === b.length && a.every((x, i) => x === b[i]);

/** The label shown for an item in the tree. */
function display(typeName: string, item: OutlineItem): string {
  if (typeName === 'Mindmap') return readMindmapNode(item.text).label.replace(/<br\s*\/?>/g, ' ');
  if (typeName === 'Treemap') {
    const node = readTreemapNode(item.text);
    return node ? (node.value ? `${node.label}: ${node.value}` : node.label) : item.text;
  }
  if (typeName === 'TreeView') return readTreeViewNode(item.text).name;
  if (typeName === 'Kanban') return readKanbanNode(item.text).label;
  return item.text;
}

/** What a new item says, per type. */
function newText(typeName: string, outline: Outline): string {
  if (typeName === 'Treemap') return '"New item": 1';
  if (typeName === 'TreeView') return 'new-file.txt';
  if (typeName === 'Kanban') return '[New card]';
  void outline;
  return 'New item';
}

/**
 * Edits an indentation tree (mindmap, ishikawa, treeView, treemap) as an outline, next to
 * Mermaid's preview. Each change writes the code back.
 */
export function OutlineEditor({ code, typeName, editable, onChange }: OutlineEditorProps): JSX.Element {
  const outline = useMemo(() => parseOutline(code), [code]);
  const [selected, setSelected] = useState<Path | null>([0]);
  if (!outline) return <div className="structured-panel muted">This code has no header line.</div>;

  const item = selected ? itemAt(outline, selected) : undefined;
  const apply = (next: Outline): void => onChange(serializeOutline(next));
  const run = (result: { outline: Outline; path: Path | null }): void => {
    setSelected(result.path);
    apply(result.outline);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!editable || !selected || !item || (e.target as HTMLElement).closest('input, textarea, select')) return;
    const key = `${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`;
    const actions: Record<string, () => void> = {
      Tab: () => run(indent(outline, selected)),
      'Shift+Tab': () => run(outdent(outline, selected)),
      'Alt+ArrowUp': () => run(move(outline, selected, -1)),
      'Alt+ArrowDown': () => run(move(outline, selected, 1)),
      Enter: () => run(addSibling(outline, selected, newText(typeName, outline))),
      Delete: () => run(remove(outline, selected)),
      ArrowUp: () => setSelected(neighbour(outline, selected, -1)),
      ArrowDown: () => setSelected(neighbour(outline, selected, 1)),
    };
    const action = actions[key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const rows: JSX.Element[] = [];
  const walk = (items: OutlineItem[], prefix: number[]): void => {
    items.forEach((it, i) => {
      const path = [...prefix, i];
      rows.push(
        <div
          key={path.join('.')}
          role="treeitem"
          aria-level={path.length}
          aria-selected={samePath(selected, path)}
          className={`outline-row${samePath(selected, path) ? ' selected' : ''}`}
          style={{ paddingLeft: 8 + (path.length - 1) * 16 }}
          onClick={() => setSelected(path)}
        >
          <span className="outline-bullet">{it.children.length > 0 ? '▾' : '•'}</span>
          <span className="outline-text">{display(typeName, it) || ' '}</span>
        </div>,
      );
      walk(it.children, path);
    });
  };
  walk(outline.items, []);

  return (
    <div className="structured-panel outline-editor" onKeyDown={onKeyDown}>
      <div className="structured-toolbar">
        <button disabled={!editable} onClick={() => run(addSibling(outline, selected, newText(typeName, outline)))} title="Add an item after the selected one (Enter)">
          + Item
        </button>
        <button disabled={!editable || !selected} onClick={() => selected && run(addChild(outline, selected, newText(typeName, outline)))} title="Add an item inside the selected one">
          + Child
        </button>
        <button disabled={!editable || !selected} onClick={() => selected && run(outdent(outline, selected))} title="Outdent (Shift+Tab)" aria-label="Outdent">
          ⇤
        </button>
        <button disabled={!editable || !selected} onClick={() => selected && run(indent(outline, selected))} title="Indent (Tab)" aria-label="Indent">
          ⇥
        </button>
        <button disabled={!editable || !selected} onClick={() => selected && run(move(outline, selected, -1))} title="Move up (Alt+↑)" aria-label="Move up">
          ↑
        </button>
        <button disabled={!editable || !selected} onClick={() => selected && run(move(outline, selected, 1))} title="Move down (Alt+↓)" aria-label="Move down">
          ↓
        </button>
        <button className="danger" disabled={!editable || !selected} onClick={() => selected && run(remove(outline, selected))} title="Delete the item and what is inside it (Delete)">
          Delete
        </button>
      </div>
      <div className="outline-tree" role="tree" tabIndex={0} aria-label={`${typeName} outline`}>
        {rows}
      </div>
      {item && selected && editable && (
        <div className="structured-fields" key={`${selected.join('.')}:${item.text}:${item.decorations.join('|')}`}>
          <ItemFields typeName={typeName} item={item} path={selected} outline={outline} apply={apply} />
        </div>
      )}
      <div className="muted structured-hint">Blank lines and spacing in the tree are rewritten when you edit here.</div>
    </div>
  );
}

/** The previous or next row of the tree, in reading order. */
function neighbour(outline: Outline, path: Path, step: -1 | 1): Path {
  const all: Path[] = [];
  const walk = (items: OutlineItem[], prefix: number[]): void =>
    items.forEach((it, i) => {
      all.push([...prefix, i]);
      walk(it.children, [...prefix, i]);
    });
  walk(outline.items, []);
  const index = all.findIndex((p) => samePath(path, p));
  return all[Math.min(all.length - 1, Math.max(0, index + step))] ?? path;
}

interface FieldsProps {
  typeName: string;
  item: OutlineItem;
  path: Path;
  outline: Outline;
  apply: (outline: Outline) => void;
}

function ItemFields({ typeName, item, path, outline, apply }: FieldsProps): JSX.Element {
  const text = (value: string): void => apply(setText(outline, path, value));
  if (typeName === 'Mindmap') {
    const node = readMindmapNode(item.text);
    const fallbackId = `n${path.join('_')}`;
    return (
      <>
        <Field label="Label" value={node.label} onCommit={(label) => text(writeMindmapNode({ ...node, label }, fallbackId))} />
        <label>
          Shape
          <select value={node.shape} onChange={(e) => text(writeMindmapNode({ ...node, shape: e.target.value }, fallbackId))}>
            {MINDMAP_SHAPES.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <Field
          label="Icon"
          placeholder="fa fa-book"
          value={mindmapIcon(item)}
          onCommit={(icon) => apply(setDecorations(outline, path, withMindmapIcon(item, icon)))}
        />
        <Field label="Code line" value={item.text} onCommit={text} mono />
      </>
    );
  }
  if (typeName === 'Treemap') {
    const node = readTreemapNode(item.text);
    if (node) {
      return (
        <>
          <Field label="Label" value={node.label} onCommit={(label) => text(writeTreemapNode({ ...node, label }))} />
          <Field
            label={item.children.length > 0 ? 'Value (a section has none)' : 'Value'}
            value={node.value}
            onCommit={(value) => text(writeTreemapNode({ ...node, value: value.replace(/[^\d.-]/g, '') }))}
          />
          <Field label="Code line" value={item.text} onCommit={text} mono />
        </>
      );
    }
  }
  if (typeName === 'TreeView') {
    const node = readTreeViewNode(item.text);
    return (
      <>
        <Field label="Name" value={node.name} onCommit={(name) => text(writeTreeViewNode({ ...node, name }))} />
        <Field label="Annotation" value={node.annotation} onCommit={(annotation) => text(writeTreeViewNode({ ...node, annotation }))} />
        <Field label="Code line" value={item.text} onCommit={text} mono />
      </>
    );
  }
  if (typeName === 'Kanban') {
    const node = readKanbanNode(item.text);
    return (
      <>
        <Field label={path.length === 1 ? 'Column' : 'Card'} value={node.label} onCommit={(label) => text(writeKanbanNode({ ...node, label }))} />
        {path.length > 1 && (
          <Field label="Data" placeholder="@{ assigned: 'me', priority: 'High' }" value={node.meta} onCommit={(meta) => text(writeKanbanNode({ ...node, meta }))} mono />
        )}
        <Field label="Code line" value={item.text} onCommit={text} mono />
      </>
    );
  }
  return <Field label={path.length === 1 && path[0] === 0 && typeName === 'Ishikawa diagram' ? 'Problem' : 'Text'} value={item.text} onCommit={text} />;
}

/** A text field that commits on Enter or blur, and resets on Escape. */
export function Field({ label, value, onCommit, placeholder, mono }: { label: string; value: string; onCommit: (value: string) => void; placeholder?: string; mono?: boolean }): JSX.Element {
  const [draft, setDraft] = useState(value);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <label>
      {label}
      <input
        className={mono ? 'mono' : undefined}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
    </label>
  );
}
