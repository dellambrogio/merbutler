import { useContext, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Handle, type NodeProps } from '@xyflow/react';
import type { SubgraphNode } from './layout';
import { toEditText } from './labels';
import { LabelText } from './LabelText';
import { RenameContext } from './ShapeNodeView';

/** A subgraph box. Double-click the title to rename it. */
export function SubgraphNodeView({ id, data, width, height, selected }: NodeProps<SubgraphNode>): JSX.Element {
  const rename = useContext(RenameContext);
  const [draft, setDraft] = useState<string | null>(null);
  /** True while the input is open. The blur that follows Enter/Escape must not commit again. */
  const editing = useRef(false);

  const finish = (save: boolean): void => {
    if (!editing.current) return;
    editing.current = false;
    if (save && draft !== null && draft !== toEditText(data.label)) rename(id, draft);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter saves. Shift+Enter adds a line break.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      finish(true);
    }
    if (event.key === 'Escape') finish(false);
  };

  return (
    <div className={`subgraph-node${selected ? ' selected' : ''}`} style={{ width, height }}>
      <Handle type="target" position={data.targetPosition} />
      <Handle type="source" position={data.sourcePosition} />
      {draft === null ? (
        <div
          className="subgraph-title"
          onDoubleClick={() => {
            editing.current = true;
            setDraft(toEditText(data.label));
          }}
        >
          <LabelText text={data.label} markdown={data.markdown} />
        </div>
      ) : (
        <textarea
          className="subgraph-input nodrag nowheel"
          rows={Math.max(1, draft.split('\n').length)}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}
