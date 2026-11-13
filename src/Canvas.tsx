import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ViewportPortal,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnBeforeDelete,
} from '@xyflow/react';
import { EdgeMarkerDefs } from './EdgeMarkers';
import { LabelEdgeView } from './LabelEdgeView';
import { toEditText } from './labels';
import { layoutModel, type CanvasNode } from './layout';
import {
  DIRECTIONS,
  EDGE_ENDS,
  EDGE_LENGTHS,
  SHAPES,
  STROKES,
  addNode,
  addSubgraph,
  connect,
  diagramTitle,
  nextEdgeId,
  nextNodeId,
  nextSubgraphId,
  removeElements,
  setParent,
  subgraphWithDescendants,
  updateEdge,
  updateNode,
  updateSubgraph,
  type Direction,
  type EdgeEnd,
  type FlowModel,
  type Shape,
  type Stroke,
} from './model';
import { RenameContext, ShapeNodeView } from './ShapeNodeView';
import { SubgraphNodeView } from './SubgraphNodeView';

const NODE_TYPES = { shape: ShapeNodeView, subgraph: SubgraphNodeView };
const EDGE_TYPES = { label: LabelEdgeView };

/** Select for the subgraph that contains an element. `exclude` lists subgraphs that are not valid targets. */
function ParentSelect({
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
      Subgraph
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
function LabelInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }): JSX.Element {
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

/** Checkbox for the Markdown flag of a label. */
function MarkdownToggle({ checked, onToggle }: { checked: boolean; onToggle: (markdown: boolean) => void }): JSX.Element {
  return (
    <label className="checkbox" title="Markdown label: **bold**, *italic*, line breaks">
      <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      Markdown
    </label>
  );
}

interface CanvasProps {
  model: FlowModel;
  readOnly: boolean;
  onChange: (model: FlowModel) => void;
}

/** Keeps the selection of the old elements on the new (re-laid-out) elements. */
function keepSelection<T extends { id: string; selected?: boolean }>(next: T[], prev: T[]): T[] {
  const selected = new Set(prev.filter((x) => x.selected).map((x) => x.id));
  return next.map((x) => (selected.has(x.id) ? { ...x, selected: true } : x));
}

/** Top center of the top-level nodes and subgraphs, where Mermaid draws the diagram title. */
function titlePosition(nodes: CanvasNode[]): { x: number; y: number } | null {
  const top = nodes.filter((n) => !n.parentId);
  if (top.length === 0) return null;
  const left = Math.min(...top.map((n) => n.position.x));
  const right = Math.max(...top.map((n) => n.position.x + (n.width ?? 0)));
  const y = Math.min(...top.map((n) => n.position.y));
  return { x: (left + right) / 2, y: y - 12 };
}

export function Canvas({ model, readOnly, onChange }: CanvasProps): JSX.Element {
  const { fitView } = useReactFlow();
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const title = diagramTitle(model);
  const titleAnchor = useMemo(() => titlePosition(nodes), [nodes]);
  const [edges, setEdges] = useState<Edge[]>([]);
  /** Node ids and direction at the last fit. A change means nodes were added or removed, or the layout turned. */
  const lastFitKey = useRef('');
  /** Id of an element that the next layout must select (for example a new node). */
  const pendingSelect = useRef<string | null>(null);
  /** True while the user drags a new edge. All handles are shown then, so the user can see the targets. */
  const [connecting, setConnecting] = useState(false);

  const relayout = useCallback((): void => {
    const laid = layoutModel(model);
    const select = pendingSelect.current;
    pendingSelect.current = null;
    if (select) {
      setNodes(laid.nodes.map((n) => ({ ...n, selected: n.id === select })));
      setEdges(laid.edges);
    } else {
      setNodes((prev) => keepSelection(laid.nodes, prev));
      setEdges((prev) => keepSelection(laid.edges, prev));
    }
  }, [model]);

  useEffect(relayout, [relayout]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const key = `${model.direction}|${nodes.map((n) => n.id).sort().join(',')}`;
    if (key === lastFitKey.current) return;
    const first = lastFitKey.current === '';
    lastFitKey.current = key;
    // Animate later fits, so the view change is easy to follow.
    requestAnimationFrame(() => void fitView({ padding: 0.2, duration: first ? 0 : 250 }));
  }, [nodes, model.direction, fitView]);

  // Remove events are handled by onBeforeDelete, which updates the model.
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]): void => {
    setNodes((prev) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), prev));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]): void => {
    setEdges((prev) => applyEdgeChanges(changes.filter((c) => c.type !== 'remove'), prev));
  }, []);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const single = selectedNodes.length + selectedEdges.length === 1;
  const selectedId = single ? selectedNodes[0]?.id : undefined;
  const node = selectedId ? model.nodes.find((n) => n.id === selectedId) : undefined;
  const subgraph = selectedId ? model.subgraphs.find((s) => s.id === selectedId) : undefined;
  const edge = single && selectedEdges[0] ? model.edges.find((e) => e.id === selectedEdges[0].id) : undefined;

  /**
   * React Flow also deletes the children of a deleted parent. Here a deleted subgraph keeps its
   * contents, so only the selected elements are removed from the model, and React Flow's own
   * delete is cancelled (the next layout shows the result).
   */
  const onBeforeDelete: OnBeforeDelete<CanvasNode, Edge> = async ({ nodes: dn, edges: de }) => {
    const ids = dn.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = de.filter((e) => e.selected).map((e) => e.id);
    if (ids.length > 0 || edgeIds.length > 0) onChange(removeElements(model, ids, edgeIds));
    return false;
  };

  const onConnect = (c: Connection): void => {
    pendingSelect.current = nextEdgeId(model);
    onChange(connect(model, c.source, c.target));
  };

  const rename = useCallback(
    (id: string, label: string): void => {
      if (readOnly) return;
      const isSubgraph = model.subgraphs.some((s) => s.id === id);
      onChange(isSubgraph ? updateSubgraph(model, id, { label }) : updateNode(model, id, { label }));
    },
    [model, onChange, readOnly],
  );

  /** A new element goes into the selected subgraph, or next to the selected node. */
  const targetParent = (): string | null => subgraph?.id ?? node?.parent ?? null;

  const onAddNode = (): void => {
    pendingSelect.current = nextNodeId(model);
    onChange(addNode(model, 'New node', 'rect', targetParent()));
  };

  const onAddSubgraph = (): void => {
    pendingSelect.current = nextSubgraphId(model);
    onChange(addSubgraph(model, 'Group', targetParent()));
  };

  const deleteSelected = (): void => {
    onChange(removeElements(model, selectedNodes.map((n) => n.id), selectedEdges.map((e) => e.id)));
  };

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  return (
    <div className={`canvas${readOnly ? ' read-only' : ''}${connecting ? ' connecting' : ''}`}>
      <div className="toolbar">
        <button onClick={onAddNode} disabled={readOnly}>
          + Node
        </button>
        <button onClick={onAddSubgraph} disabled={readOnly}>
          + Subgraph
        </button>
        <label>
          Direction{' '}
          <select
            value={model.direction}
            disabled={readOnly}
            onChange={(e) => onChange({ ...model, direction: e.target.value as Direction })}
          >
            {DIRECTIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button onClick={relayout} title="Discard manual moves">
          Re-layout
        </button>
        <button onClick={() => void fitView({ padding: 0.2 })}>Fit</button>
      </div>

      {!readOnly && node && (
        <div className="inspector">
          <div className="inspector-title">Node {node.id}</div>
          <label>
            Label
            <LabelInput
              key={`${node.id}:${node.label}`}
              value={node.label}
              onCommit={(label) => onChange(updateNode(model, node.id, { label }))}
            />
          </label>
          <MarkdownToggle
            checked={node.markdown}
            onToggle={(markdown) => onChange(updateNode(model, node.id, { markdown }))}
          />
          <label>
            Shape
            <select
              value={node.shape}
              onChange={(e) => onChange(updateNode(model, node.id, { shape: e.target.value as Shape }))}
            >
              {SHAPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <ParentSelect
            model={model}
            value={node.parent}
            exclude={new Set()}
            onSelect={(parent) => onChange(setParent(model, node.id, parent))}
          />
          <button className="danger" onClick={deleteSelected}>
            Delete node
          </button>
        </div>
      )}

      {!readOnly && subgraph && (
        <div className="inspector">
          <div className="inspector-title">Subgraph {subgraph.id}</div>
          <label>
            Label
            <LabelInput
              key={`${subgraph.id}:${subgraph.label}`}
              value={subgraph.label}
              onCommit={(label) => onChange(updateSubgraph(model, subgraph.id, { label }))}
            />
          </label>
          <MarkdownToggle
            checked={subgraph.markdown}
            onToggle={(markdown) => onChange(updateSubgraph(model, subgraph.id, { markdown }))}
          />
          <label>
            Direction
            <select
              value={subgraph.direction ?? ''}
              title="As in Mermaid: used only if no edge connects a node inside the subgraph to a node outside it."
              onChange={(e) =>
                onChange(updateSubgraph(model, subgraph.id, { direction: (e.target.value || null) as Direction | null }))
              }
            >
              <option value="">(inherit)</option>
              {DIRECTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <ParentSelect
            model={model}
            value={subgraph.parent}
            exclude={subgraphWithDescendants(model, subgraph.id)}
            onSelect={(parent) => onChange(setParent(model, subgraph.id, parent))}
          />
          <button className="danger" onClick={deleteSelected} title="The nodes inside move up one level">
            Delete subgraph (keep contents)
          </button>
        </div>
      )}

      {!readOnly && edge && (
        <div className="inspector">
          <div className="inspector-title">
            Edge {edge.ref ? `${edge.ref}: ` : ''}
            {edge.source} → {edge.target}
          </div>
          <label>
            Label
            <LabelInput
              key={`${edge.id}:${edge.label}`}
              value={edge.label}
              onCommit={(label) => onChange(updateEdge(model, edge.id, { label }))}
            />
          </label>
          <MarkdownToggle
            checked={edge.markdown}
            onToggle={(markdown) => onChange(updateEdge(model, edge.id, { markdown }))}
          />
          <label>
            Stroke
            <select
              value={edge.stroke}
              onChange={(e) => onChange(updateEdge(model, edge.id, { stroke: e.target.value as Stroke }))}
            >
              {STROKES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label title="Minimum length in ranks: --> is 1, ---> is 2, ----> is 3">
            Length
            <select
              value={edge.length ?? 1}
              onChange={(e) => {
                const length = Number(e.target.value);
                onChange(updateEdge(model, edge.id, { length: length === 1 ? undefined : length }));
              }}
            >
              {EDGE_LENGTHS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            End
            <select
              value={edge.end}
              disabled={edge.stroke === 'invisible'}
              onChange={(e) => onChange(updateEdge(model, edge.id, { end: e.target.value as EdgeEnd }))}
            >
              {EDGE_ENDS.map((end) => (
                <option key={end}>{end}</option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={edge.bothEnds}
              disabled={edge.end === 'none' || edge.stroke === 'invisible'}
              onChange={(e) => onChange(updateEdge(model, edge.id, { bothEnds: e.target.checked }))}
            />
            Both ends
          </label>
          <button className="danger" onClick={deleteSelected}>
            Delete edge
          </button>
        </div>
      )}

      <EdgeMarkerDefs />
      <RenameContext.Provider value={rename}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onBeforeDelete={onBeforeDelete}
          onConnect={onConnect}
          onConnectStart={() => setConnecting(true)}
          onConnectEnd={() => setConnecting(false)}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          zoomOnDoubleClick={false}
          minZoom={0.2}
        >
          <Background />
          <Controls showInteractive={false} />
          {title && titleAnchor && (
            <ViewportPortal>
              <div
                className="diagram-title"
                style={{ transform: `translate(${titleAnchor.x}px, ${titleAnchor.y}px) translate(-50%, -100%)` }}
              >
                {title}
              </div>
            </ViewportPortal>
          )}
        </ReactFlow>
      </RenameContext.Provider>
    </div>
  );
}
