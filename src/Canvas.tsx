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
  type Asset,
  type FlowModel,
  type Shape,
  type Stroke,
  type Styled,
} from './model';
import { RenameContext, ShapeNodeView } from './ShapeNodeView';
import { SHAPE_GROUPS, SHAPE_INFO } from './shapes';
import { classesFromText, stylesFromText, stylesToText } from './styling';
import { CollapseContext, SubgraphNodeView } from './SubgraphNodeView';
import { ImageConsentContext } from './AssetView';
import { checkClick } from './parse';

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

/** One-line text field that commits on Enter or blur, and resets on Escape. */
function TextField({ value, onCommit, placeholder, list }: { value: string; onCommit: (value: string) => void; placeholder?: string; list?: string }): JSX.Element {
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
function StyleFields({ id, item, model, styleTitle, onChange }: {
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

/** The rest of a node's `click` statement. Checked with Mermaid before it is applied. */
function ClickField({ id, value, onCommit }: { id: string; value: string; onCommit: (click: string | undefined) => void }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  return (
    <label title='For example: href "https://example.com" "Tooltip" _blank, or callback "Tooltip". The canvas never follows or runs it.'>
      Click
      <TextField
        key={`${id}:click:${value}`}
        value={value}
        placeholder='href "https://…" "Tooltip"'
        onCommit={(text) => {
          const rest = text.trim();
          if (rest === '') {
            setError(null);
            onCommit(undefined);
            return;
          }
          void checkClick(rest).then((problem) => {
            setError(problem);
            if (!problem) onCommit(rest);
          });
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** A positive whole number, or undefined for an empty field. Other text keeps the old value. */
function sizeFromText(text: string, old: number | undefined): number | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : old;
}

/** Fields of an icon (`@{ icon }`) or image (`@{ img }`) node. */
function AssetFields({ id, asset, onChange }: { id: string; asset: Asset; onChange: (asset: Asset) => void }): JSX.Element {
  const set = (patch: Partial<Asset>): void => {
    const next = { ...asset, ...patch } as Asset & Record<string, unknown>;
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onChange(next);
  };
  const forms = ['', 'square', 'circle', 'rounded'];
  return (
    <>
      {asset.kind === 'icon' ? (
        <>
          <label title="Icon name with its pack prefix, for example fa:user. Mermaid needs the pack registered.">
            Icon
            <TextField key={`${id}:icon:${asset.icon}`} value={asset.icon} onCommit={(icon) => icon.trim() && set({ icon: icon.trim() })} />
          </label>
          <label>
            Background
            <select value={asset.form ?? ''} onChange={(e) => set({ form: e.target.value || undefined })}>
              {[...forms, ...(asset.form && !forms.includes(asset.form) ? [asset.form] : [])].map((f) => (
                <option key={f} value={f}>
                  {f || 'none'}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label title="data: images are shown at once; images from a server only after you allow that server.">
            Image URL
            <TextField key={`${id}:img:${asset.img}`} value={asset.img} onCommit={(img) => img.trim() && set({ img: img.trim() })} />
          </label>
          <label>
            Width
            <TextField key={`${id}:w:${asset.w}`} value={asset.w?.toString() ?? ''} placeholder="natural" onCommit={(t) => set({ w: sizeFromText(t, asset.w) })} />
          </label>
        </>
      )}
      <label>
        Height
        <TextField
          key={`${id}:h:${asset.h}`}
          value={asset.h?.toString() ?? ''}
          placeholder={asset.kind === 'icon' ? '48' : 'natural'}
          onCommit={(t) => set({ h: sizeFromText(t, asset.h) })}
        />
      </label>
      <label>
        Label position
        <select value={asset.pos === 't' ? 't' : 'b'} onChange={(e) => set({ pos: e.target.value === 't' ? 't' : undefined })}>
          <option value="b">below</option>
          <option value="t">above</option>
        </select>
      </label>
      {asset.kind === 'image' && (
        <label className="checkbox">
          <input type="checkbox" checked={asset.constraint === 'on'} onChange={(e) => set({ constraint: e.target.checked ? 'on' : undefined })} />
          Keep aspect ratio
        </label>
      )}
    </>
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

  /** Hosts the user allowed to load remote images from, for this session. */
  const [imageHosts, setImageHosts] = useState<ReadonlySet<string>>(new Set());
  const imageConsent = useMemo(
    () => ({ allowed: imageHosts, allow: (host: string) => setImageHosts((hosts) => new Set([...hosts, host])) }),
    [imageHosts],
  );

  const toggleCollapsed = useCallback(
    (id: string): void => {
      const subgraph = model.subgraphs.find((s) => s.id === id);
      if (readOnly || !subgraph) return;
      onChange(updateSubgraph(model, id, { view: subgraph.view === 'collapsed' ? undefined : 'collapsed' }));
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
          {node.asset ? (
            <AssetFields id={node.id} asset={node.asset} onChange={(asset) => onChange(updateNode(model, node.id, { asset }))} />
          ) : (
            <label>
              Shape
              <select
                value={node.shape}
                onChange={(e) => onChange(updateNode(model, node.id, { shape: e.target.value as Shape }))}
              >
                {SHAPE_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {SHAPES.filter((s) => SHAPE_INFO[s].group === group).map((s) => (
                      <option key={s} value={s}>
                        {SHAPE_INFO[s].title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <ParentSelect
            model={model}
            value={node.parent}
            exclude={new Set()}
            onSelect={(parent) => onChange(setParent(model, node.id, parent))}
          />
          <ClickField id={node.id} value={node.click ?? ''} onCommit={(click) => onChange(updateNode(model, node.id, { click }))} />
          <StyleFields
            id={node.id}
            item={node}
            model={model}
            styleTitle="Written as: style id …"
            onChange={(patch) => onChange(updateNode(model, node.id, patch))}
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
          <label className="checkbox" title="Mermaid draws a collapsed subgraph as one box (id@{ view: collapsed })">
            <input
              type="checkbox"
              checked={subgraph.view === 'collapsed'}
              onChange={(e) => onChange(updateSubgraph(model, subgraph.id, { view: e.target.checked ? 'collapsed' : undefined }))}
            />
            Collapsed
          </label>
          <StyleFields
            id={subgraph.id}
            item={subgraph}
            model={model}
            styleTitle="Written as: style id …"
            onChange={(patch) => onChange(updateSubgraph(model, subgraph.id, patch))}
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
          <StyleFields
            id={edge.id}
            item={edge}
            model={model}
            styleTitle="Written as: linkStyle n … (classes need an edge id; one is added)"
            onChange={(patch) => onChange(updateEdge(model, edge.id, patch))}
          />
          <button className="danger" onClick={deleteSelected}>
            Delete edge
          </button>
        </div>
      )}

      <EdgeMarkerDefs />
      <datalist id="class-names">
        {(model.classDefs ?? [])
          .filter((c) => c.name !== 'default')
          .map((c) => (
            <option key={c.name} value={c.name} />
          ))}
      </datalist>
      <ImageConsentContext.Provider value={imageConsent}>
        <CollapseContext.Provider value={readOnly ? null : toggleCollapsed}>
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
        </CollapseContext.Provider>
      </ImageConsentContext.Provider>
    </div>
  );
}
