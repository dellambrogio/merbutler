/** Inspector fields shared by every diagram kind: labels, text fields, parents, styling, comments. */
import { useState, type JSX } from 'react';
import { toEditText } from '../core/labels';
import { commentsFromText, commentsToText, isSwimlane, type FlowModel, type Styled } from '../core/model';
import { classesFromText, stylesFromText, stylesToText } from '../flowchart/styling';

/** What every inspector gets: the model, a way to change it, and the delete action. */
export interface InspectorProps {
  model: FlowModel;
  onChange: (model: FlowModel) => void;
  onDelete: () => void;
}

/** State diagrams: a state, `[*]`, choice, fork, join or note. */
/** Select for the subgraph that contains an element. `exclude` lists subgraphs that are not valid targets. */
export function ParentSelect({
  model,
  value,
  exclude,
  onSelect,
}: {
  model: FlowModel;
  value: string | null;
  exclude: Set<string>;
  onSelect: (parent: string | null) => void;
}): JSX.Element {
  return (
    <label>
      {isSwimlane(model) ? 'Lane or subgraph' : 'Subgraph'}
      <select value={value ?? ''} onChange={(e) => onSelect(e.target.value || null)}>
        <option value="">(none)</option>
        {model.subgraphs
          .filter((s) => !exclude.has(s.id))
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.label === s.id ? s.id : `${s.label} (${s.id})`}
            </option>
          ))}
      </select>
    </label>
  );
}

/**
 * Multi-line label field that reports its value on Enter or blur, not on each keystroke.
 * Shift+Enter adds a line break. The field shows `<br>` as a line break.
 */
export function LabelInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }): JSX.Element {
  const initial = toEditText(value);
  const [draft, setDraft] = useState(initial);
  const commit = (): void => {
    if (draft !== initial) onCommit(draft);
  };
  return (
    <textarea
      value={draft}
      rows={Math.max(1, draft.split('\n').length)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') setDraft(initial);
      }}
    />
  );
}

/** One-line text field that commits on Enter or blur, and resets on Escape. */
export function TextField({ value, onCommit, placeholder, list }: { value: string; onCommit: (value: string) => void; placeholder?: string; list?: string }): JSX.Element {
  const [draft, setDraft] = useState(value);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      value={draft}
      placeholder={placeholder}
      list={list}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}

/**
 * Classes and own style of a node, subgraph or edge. Classes are names from `classDef`;
 * the style is declarations separated by `;` (written as `style`/`linkStyle`, comma-separated, in the code).
 */
export function StyleFields({ id, item, model, styleTitle, onChange }: {
  id: string;
  item: Styled;
  model: FlowModel;
  styleTitle: string;
  onChange: (patch: Styled) => void;
}): JSX.Element {
  const classes = (item.classes ?? []).join(' ');
  const styles = stylesToText(item.styles);
  const defined = (model.classDefs ?? []).map((c) => c.name).filter((n) => n !== 'default');
  return (
    <>
      <label title={defined.length > 0 ? `Defined: ${defined.join(', ')}` : 'Define classes with classDef in the code'}>
        Classes
        <TextField
          key={`${id}:classes:${classes}`}
          value={classes}
          placeholder={defined.length > 0 ? defined.slice(0, 3).join(' ') : 'none defined'}
          list="class-names"
          onCommit={(text) => onChange({ classes: classesFromText(text) })}
        />
      </label>
      <label title={styleTitle}>
        Style
        <TextField
          key={`${id}:styles:${styles}`}
          value={styles}
          placeholder="fill:#f96; stroke:#333"
          onCommit={(text) => onChange({ styles: stylesFromText(text) })}
        />
      </label>
    </>
  );
}

/** `%%` comment lines above a node, edge or subgraph. */
export function CommentField({ comments, onCommit }: { id: string; comments: readonly string[] | undefined; onCommit: (comments: string[]) => void }): JSX.Element {
  const value = commentsToText(comments);
  const [draft, setDraft] = useState(value);
  return (
    <label title="Written as %% lines above it in the code">
      Comment
      <textarea
        value={draft}
        rows={Math.max(1, draft.split('\n').length)}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(commentsFromText(draft))}
        onKeyDown={(e) => e.key === 'Escape' && setDraft(value)}
      />
    </label>
  );
}

/** Checkbox for the Markdown flag of a label. */
export function MarkdownToggle({ checked, onToggle }: { checked: boolean; onToggle: (markdown: boolean) => void }): JSX.Element {
  return (
    <label className="checkbox" title="Markdown label: **bold**, *italic*, line breaks">
      <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      Markdown
    </label>
  );
}
