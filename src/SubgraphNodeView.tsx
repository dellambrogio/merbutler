import { createContext, useContext, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Handle, type NodeProps } from '@xyflow/react';
import type { SubgraphNode } from './layout';
import { toEditText } from './labels';
import { LabelText } from './LabelText';
import { EditRequestContext, RenameContext } from './ShapeNodeView';
import { boxVars, textStyle } from './styling';

/** Lets a subgraph collapse or expand itself. Null when the canvas is read-only. */
export const CollapseContext = createContext<((id: string) => void) | null>(null);

/** Lane colors cycle through this many tints (styles.css). */
const LANE_TINTS = 6;

/**
 * A subgraph box, or a swimlane band. Double-click the title to rename it. The arrow collapses or
 * expands a subgraph.
 */
export function SubgraphNodeView({ id, data, width, height, selected }: NodeProps<SubgraphNode>): JSX.Element {
  const rename = useContext(RenameContext);
  const collapse = useContext(CollapseContext);
  // A lane stays a band: it does not collapse on the canvas.
  const toggle = data.lane || data.region ? null : collapse;
  const lane = data.lane ? ` lane ${data.lane.rows ? 'lane-row' : 'lane-column'} lane-tint-${data.lane.index % LANE_TINTS}` : '';
  const [draft, setDraft] = useState<string | null>(null);
  /** True while the input is open. The blur that follows Enter/Escape must not commit again. */
  const editing = useRef(false);

  const finish = (save: boolean): void => {
    if (!editing.current) return;
    editing.current = false;
    if (save && draft !== null && draft !== toEditText(data.label)) rename(id, draft);
    setDraft(null);
  };

  const request = useContext(EditRequestContext);
  useEffect(() => {
    if (request?.id === id && !data.region) {
      editing.current = true;
      setDraft(toEditText(data.label));
    }
    // Only a new request opens the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter saves. Shift+Enter adds a line break.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      finish(true);
    }
    if (event.key === 'Escape') finish(false);
  };

  return (
    <div
      className={`subgraph-node${data.collapsed ? ' collapsed' : ''}${selected ? ' selected' : ''}${lane}${data.region ? ' region' : ''}`}
      style={{ width, height, ...boxVars(data.look) }}
    >
      <Handle type="target" position={data.targetPosition} />
      <Handle type="source" position={data.sourcePosition} />
      {draft === null ? (
        <div
          className="subgraph-title"
          style={textStyle(data.look)}
          title={data.collapsed ? 'Collapsed: the contents are hidden' : undefined}
          onDoubleClick={() => {
            editing.current = true;
            setDraft(toEditText(data.label));
          }}
        >
          {toggle && (
            <button
              className="subgraph-toggle nodrag"
              aria-label={data.collapsed ? 'Expand' : 'Collapse'}
              title={data.collapsed ? 'Expand (writes id@{ view: … })' : 'Collapse (writes id@{ view: collapsed })'}
              onClick={(e) => {
                e.stopPropagation();
                toggle(id);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {data.collapsed ? '▸' : '▾'}
            </button>
          )}
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
