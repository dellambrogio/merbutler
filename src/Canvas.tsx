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
import type { CanvasNode } from './layout';
import { layoutCanvas } from './layoutEngine';
import {
  DIRECTIONS,
  EDGE_ENDS,
  EDGE_LENGTHS,
  SHAPES,
  STROKES,
  addNode,
  addSubgraph,
  commentsFromText,
  commentsToText,
  connect,
  diagramTitle,
  isSwimlane,
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
  type FlowEdge,
  type FlowModel,
  type FlowNode,
  type FlowSubgraph,
  type Shape,
  type Stroke,
  type Styled,
} from './model';
import { EditRequestContext, RenameContext, ShapeNodeView } from './ShapeNodeView';
import { ContextMenu } from './ContextMenu';
import { menuFor, type MenuTarget } from './canvasMenu';
import { SHAPE_GROUPS, SHAPE_INFO } from './shapes';
import { classesFromText, stylesFromText, stylesToText } from './styling';
import { CollapseContext, SubgraphNodeView } from './SubgraphNodeView';
import { ImageConsentContext } from './AssetView';
import { checkClick } from './parse';
import { addNote, addPseudoState, canTransition, noteLink, setStateKind, STATE_KINDS } from './stateDiagram';
import { addUseCaseNode, addUseCaseNote, allowedRelations, canRelate, forwardRelation, setRelation, setUseCaseNode, USECASE_RELATIONS } from './usecaseDiagram';
import { diagramTheme, GRADIENT_ID, HAND_DRAWN_ID, themeVars, type DiagramTheme } from './themes';

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

/** `%%` comment lines above a node, edge or subgraph. */
function CommentField({ comments, onCommit }: { id: string; comments: readonly string[] | undefined; onCommit: (comments: string[]) => void }): JSX.Element {
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

/** SVG definitions a theme needs: the gradient for node strokes, the hand-drawn wobble. */
function ThemeDefs({ theme }: { theme: DiagramTheme }): JSX.Element {
  const gradient = theme.palette.gradient;
  return (
    <svg className="edge-marker-defs" aria-hidden="true">
      <defs>
        {gradient && (
          <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={gradient[0]} />
            <stop offset="1" stopColor={gradient[1]} />
          </linearGradient>
        )}
        {theme.look === 'handDrawn' && (
          <filter id={HAND_DRAWN_ID} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        )}
      </defs>
    </svg>
  );
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
  const theme = useMemo(() => diagramTheme(model), [model]);
  const titleAnchor = useMemo(() => titlePosition(nodes), [nodes]);
  const [edges, setEdges] = useState<Edge[]>([]);
  /** Node ids and direction at the last fit. A change means nodes were added or removed, or the layout turned. */
  const lastFitKey = useRef('');
  /** Id of an element that the next layout must select (for example a new node). */
  const pendingSelect = useRef<string | null>(null);
  /** True while the user drags a new edge. All handles are shown then, so the user can see the targets. */
  const [connecting, setConnecting] = useState(false);

  /** Direction and node ids of the layout shown. */
  const layoutKey = useRef('');
  /** Counts layouts, so a slow (ELK) layout that finishes after a newer one is dropped. */
  const layoutRun = useRef(0);

  const relayout = useCallback(async (): Promise<void> => {
    const run = ++layoutRun.current;
    const laid = await layoutCanvas(model);
    if (run !== layoutRun.current) return;
    // The fit key belongs to this layout: the layout is async, so model.direction can be newer than the nodes shown.
    layoutKey.current = `${model.direction}|${laid.nodes.map((n) => n.id).sort().join(',')}`;
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

  useEffect(() => {
    void relayout();
  }, [relayout]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const key = layoutKey.current;
    if (key === lastFitKey.current) return;
    const first = lastFitKey.current === '';
    lastFitKey.current = key;
    // Animate later fits, so the view change is easy to follow.
    requestAnimationFrame(() => void fitView({ padding: 0.2, duration: first ? 0 : 250 }));
  }, [nodes, fitView]);

  // Remove events are handled by onBeforeDelete, which updates the model.
  /** The current nodes, for event handlers that must not wait for a render. */
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]): void => {
    // A dragged node (with everything inside it) leaves the layout's edge routes; its edges draw their own curve again.
    const dragged = new Set(changes.flatMap((c) => (c.type === 'position' && c.dragging ? [c.id] : [])));
    if (dragged.size > 0) {
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of nodesRef.current) {
          if (n.parentId && dragged.has(n.parentId) && !dragged.has(n.id)) {
            dragged.add(n.id);
            grew = true;
          }
        }
      }
      setEdges((edges) =>
        edges.map((e) =>
          e.data?.route && (dragged.has(e.source) || dragged.has(e.target)) ? { ...e, data: { ...e.data, route: undefined } } : e,
        ),
      );
    }
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
    if (stateDiagram && !canTransition(model, c.source, c.target)) return;
    if (usecaseDiagram && !canRelate(model, c.source, c.target)) return;
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

  const stateDiagram = model.kind === 'state';
  const usecaseDiagram = model.kind === 'usecase';
  /** Use case diagrams: actors go at the top level (or in the selected boundary), use cases into the selected boundary. */
  const onAddUseCase = (kind: 'actor' | 'usecase'): void => {
    const id = nextNodeId(model);
    pendingSelect.current = id;
    const added = addUseCaseNode(model, kind, targetParent(), id);
    onChange(kind === 'actor' && targetParent() ? setParent(added, id, targetParent()) : added);
  };
  const onAddBoundary = (): void => {
    pendingSelect.current = nextSubgraphId(model);
    onChange(addSubgraph(model, 'System', null));
  };
  const onAddNode = (): void => {
    pendingSelect.current = nextNodeId(model);
    onChange(stateDiagram ? addNode(model, 'New state', 'round', targetParent()) : addNode(model, 'New node', 'rect', targetParent()));
  };
  /** State diagrams: `[*]` of the selected composite (or the top level). */
  const onAddPseudo = (kind: 'start' | 'end'): void => onChange(addPseudoState(model, targetParent(), kind));
  const noteTarget = node && !node.state ? node.id : null;

  const onAddSubgraph = (): void => {
    pendingSelect.current = nextSubgraphId(model);
    onChange(addSubgraph(model, 'Group', targetParent()));
  };

  /** A new lane goes after the last one. */
  const onAddLane = (): void => {
    pendingSelect.current = nextSubgraphId(model);
    onChange(addSubgraph(model, 'Lane', null));
  };
  const swimlane = isSwimlane(model);
  const isLane = (id: string): boolean => swimlane && model.subgraphs.some((s) => s.id === id && s.parent === null);

  const deleteSelected = (): void => {
    onChange(removeElements(model, selectedNodes.map((n) => n.id), selectedEdges.map((e) => e.id)));
  };

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  // ---- Context menu (right-click, the ContextMenu key, or Shift+F10 on the selection) ----
  const canvasRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [editRequest, setEditRequest] = useState<{ id: string; n: number } | null>(null);
  /** Set when the menu asks to edit an edge label: the inspector's label field gets the focus. */
  const focusEdgeLabel = useRef(false);

  /** Selects exactly this element, so the inspector shows it while the menu is open. */
  const selectOnly = useCallback((target: MenuTarget): void => {
    const nodeId = target.kind === 'node' || target.kind === 'subgraph' ? target.id : null;
    const edgeId = target.kind === 'edge' ? target.id : null;
    setNodes((prev) => prev.map((n) => (n.selected === (n.id === nodeId) ? n : { ...n, selected: n.id === nodeId })));
    setEdges((prev) => prev.map((e) => (e.selected === (e.id === edgeId) ? e : { ...e, selected: e.id === edgeId })));
  }, []);

  const openMenu = useCallback(
    (clientX: number, clientY: number, target: MenuTarget): void => {
      const box = canvasRef.current?.getBoundingClientRect();
      if (!box) return;
      // Like a click: the element becomes the selection; the empty canvas clears it.
      selectOnly(target);
      setMenu({ x: clientX - box.left, y: clientY - box.top, target });
    },
    [selectOnly],
  );

  const menuActions = {
    change: (next: FlowModel, select?: string): void => {
      if (select) pendingSelect.current = select;
      onChange(next);
    },
    rename: (id: string): void => setEditRequest((r) => ({ id, n: (r?.n ?? 0) + 1 })),
    editEdgeLabel: (id: string): void => {
      focusEdgeLabel.current = true;
      selectOnly({ kind: 'edge', id });
    },
    fit: (): void => void fitView({ padding: 0.2, duration: 250 }),
    relayout: (): void => void relayout(),
  };
  const openedMenu = menu ? menuFor(model, menu.target, readOnly, menuActions) : null;

  useEffect(() => {
    if (!focusEdgeLabel.current || !edge) return;
    focusEdgeLabel.current = false;
    requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLTextAreaElement>('.inspector textarea')?.focus());
  }, [edge]);

  /** The ContextMenu key or Shift+F10 opens the menu of the selected element, at the element. */
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, .context-menu')) return;
    e.preventDefault();
    const target: MenuTarget = node ? { kind: 'node', id: node.id } : subgraph ? { kind: 'subgraph', id: subgraph.id } : edge ? { kind: 'edge', id: edge.id } : { kind: 'pane' };
    const id = target.kind === 'pane' ? null : target.id;
    const el = id ? canvasRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
    const rect = (el ?? canvasRef.current)?.getBoundingClientRect();
    if (rect) openMenu(rect.left + Math.min(rect.width / 2, 120), rect.top + Math.min(rect.height / 2, 60), target);
  };

  return (
    <div className={`canvas${readOnly ? ' read-only' : ''}${connecting ? ' connecting' : ''}`} ref={canvasRef} onKeyDown={onCanvasKeyDown}>
      {menu && openedMenu && <ContextMenu x={menu.x} y={menu.y} title={openedMenu.title} items={openedMenu.items} onClose={closeMenu} />}
      <div className="toolbar">
        {usecaseDiagram && (
          <>
            <button onClick={() => onAddUseCase('actor')} disabled={readOnly}>
              + Actor
            </button>
            <button onClick={() => onAddUseCase('usecase')} disabled={readOnly} title="Goes into the selected system boundary">
              + Use case
            </button>
            <button onClick={onAddBoundary} disabled={readOnly}>
              + Boundary
            </button>
            <button onClick={() => node?.usecase && onChange(addUseCaseNote(model, node.id))} disabled={readOnly || !node?.usecase} title="A note for the selected actor or use case">
              + Note
            </button>
          </>
        )}
        {!usecaseDiagram && (
        <button onClick={onAddNode} disabled={readOnly}>
          {stateDiagram ? '+ State' : '+ Node'}
        </button>
        )}
        {stateDiagram && (
          <>
            <button onClick={() => onAddPseudo('start')} disabled={readOnly} title="[*] start of the selected composite state, or of the diagram">
              + Start
            </button>
            <button onClick={() => onAddPseudo('end')} disabled={readOnly} title="[*] end of the selected composite state, or of the diagram">
              + End
            </button>
            <button onClick={() => noteTarget && onChange(addNote(model, noteTarget))} disabled={readOnly || !noteTarget} title="A note next to the selected state">
              + Note
            </button>
          </>
        )}
        {swimlane && (
          <button onClick={onAddLane} disabled={readOnly} title="A swimlane: a top-level subgraph of a swimlane-beta diagram">
            + Lane
          </button>
        )}
        {!usecaseDiagram && (
          <button onClick={onAddSubgraph} disabled={readOnly}>
            {stateDiagram ? '+ Composite' : '+ Subgraph'}
          </button>
        )}
        <label title={swimlane ? 'LR: lanes are rows, the flow goes down through them. TB: lanes are columns.' : undefined}>
          {swimlane ? 'Lanes' : 'Direction'}{' '}
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
        <button onClick={() => void relayout()} title="Discard manual moves">
          Re-layout
        </button>
        <button onClick={() => void fitView({ padding: 0.2 })}>Fit</button>
      </div>

      {!readOnly && stateDiagram && node && <StateNodeInspector model={model} node={node} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && stateDiagram && subgraph && <StateSubgraphInspector model={model} subgraph={subgraph} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && stateDiagram && edge && <StateEdgeInspector model={model} edge={edge} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && usecaseDiagram && node && <UseCaseNodeInspector model={model} node={node} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && usecaseDiagram && subgraph && <UseCaseBoundaryInspector model={model} subgraph={subgraph} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && usecaseDiagram && edge && <UseCaseEdgeInspector model={model} edge={edge} onChange={onChange} onDelete={deleteSelected} />}

      {!readOnly && !stateDiagram && !usecaseDiagram && node && (
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
          <CommentField
            key={`${node.id}:${commentsToText(node.comments)}`}
            id={node.id}
            comments={node.comments}
            onCommit={(comments) => onChange(updateNode(model, node.id, { comments }))}
          />
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

      {!readOnly && !stateDiagram && !usecaseDiagram && subgraph && (
        <div className="inspector">
          <div className="inspector-title">
            {isLane(subgraph.id) ? 'Lane' : 'Subgraph'} {subgraph.id}
          </div>
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
          <CommentField
            key={`${subgraph.id}:${commentsToText(subgraph.comments)}`}
            id={subgraph.id}
            comments={subgraph.comments}
            onCommit={(comments) => onChange(updateSubgraph(model, subgraph.id, { comments }))}
          />
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

      {!readOnly && !stateDiagram && !usecaseDiagram && edge && (
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
          <CommentField
            key={`${edge.id}:${commentsToText(edge.comments)}`}
            id={edge.id}
            comments={edge.comments}
            onCommit={(comments) => onChange(updateEdge(model, edge.id, { comments }))}
          />
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
          <EditRequestContext.Provider value={editRequest}>
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
              onNodeContextMenu={(e, n) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, n.type === 'subgraph' ? { kind: 'subgraph', id: n.id } : { kind: 'node', id: n.id });
              }}
              onEdgeContextMenu={(e, ed) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, { kind: 'edge', id: ed.id });
              }}
              onPaneContextMenu={(e) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, { kind: 'pane' });
              }}
              onMoveStart={closeMenu}
              nodesConnectable={!readOnly}
              elementsSelectable={!readOnly}
              deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
              zoomOnDoubleClick={false}
              minZoom={0.2}
              style={theme ? themeVars(theme) : undefined}
              // React Flow puts the marker color in an inline style; this keeps arrows the color of the edges.
              defaultMarkerColor="var(--edge-stroke)"
            >
              {/* Inside the diagram, so markers and theme gradients take the diagram's colors. */}
              <EdgeMarkerDefs />
              {theme && <ThemeDefs theme={theme} />}
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
          </EditRequestContext.Provider>
          </RenameContext.Provider>
        </CollapseContext.Provider>
      </ImageConsentContext.Provider>
    </div>
  );
}

interface StateInspectorProps {
  model: FlowModel;
  onChange: (model: FlowModel) => void;
  onDelete: () => void;
}

/** State diagrams: a state, `[*]`, choice, fork, join or note. */
function StateNodeInspector({ model, node, onChange, onDelete }: StateInspectorProps & { node: FlowNode }): JSX.Element {
  const pseudo = node.state === 'start' || node.state === 'end';
  const title = pseudo ? `[*] ${node.state}` : node.state === 'note' ? `Note on ${node.note?.of}` : `State ${node.id}`;
  return (
    <div className="inspector">
      <div className="inspector-title">{title}</div>
      {!pseudo && node.state !== 'fork' && node.state !== 'join' && node.state !== 'choice' && (
        <label>
          {node.state === 'note' ? 'Text' : 'Label'}
          <LabelInput key={`${node.id}:${node.label}`} value={node.label} onCommit={(label) => onChange(updateNode(model, node.id, { label }))} />
        </label>
      )}
      {!pseudo && node.state !== 'note' && (
        <label>
          Type
          <select value={node.state ?? 'state'} onChange={(e) => onChange(setStateKind(model, node.id, e.target.value as (typeof STATE_KINDS)[number]['kind']))}>
            {STATE_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {node.note && (
        <label>
          Side
          <select
            value={node.note.position}
            onChange={(e) => {
              const note = { ...node.note!, position: e.target.value as 'left of' | 'right of' };
              const next = { ...model, nodes: model.nodes.map((n) => (n.id === node.id ? { ...n, note } : n)) };
              onChange({ ...next, edges: next.edges.map((ed) => (ed.noteLink && (ed.source === node.id || ed.target === node.id) ? noteLink({ ...node, note }) : ed)) });
            }}
          >
            <option value="right of">right of</option>
            <option value="left of">left of</option>
          </select>
        </label>
      )}
      {node.descriptions && node.descriptions.length > 0 && (
        <div className="muted inspector-note">More description lines are kept: {node.descriptions.join(' · ')}</div>
      )}
      {!pseudo && node.state !== 'note' && (
        <ParentSelect model={model} value={node.parent} exclude={new Set()} onSelect={(parent) => onChange(setParent(model, node.id, parent))} />
      )}
      {!pseudo && node.state !== 'note' && (
        <StyleFields id={node.id} item={node} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateNode(model, node.id, patch))} />
      )}
      <button className="danger" onClick={onDelete}>
        Delete {node.state === 'note' ? 'note' : 'state'}
      </button>
    </div>
  );
}

/** State diagrams: a composite state, or a concurrency region in one. */
function StateSubgraphInspector({ model, subgraph, onChange, onDelete }: StateInspectorProps & { subgraph: FlowSubgraph }): JSX.Element {
  if (subgraph.region) {
    return (
      <div className="inspector">
        <div className="inspector-title">Concurrent region of {subgraph.parent}</div>
        <div className="muted inspector-note">Regions are separated by -- in the code. Add states with + State while the region is selected.</div>
        <button className="danger" onClick={onDelete} title="Its states move to the composite state">
          Delete region (keep states)
        </button>
      </div>
    );
  }
  const addRegion = (): void => {
    const regions = model.subgraphs.filter((s) => s.parent === subgraph.id && s.region);
    const id = (k: number): string => `${subgraph.id}__r${k}`;
    let k = regions.length + 1;
    while (model.subgraphs.some((s) => s.id === id(k))) k++;
    const created: FlowSubgraph[] = [];
    let next = model;
    if (regions.length === 0) {
      // The current contents become the first region.
      created.push({ id: id(k), label: '', markdown: false, parent: subgraph.id, direction: null, region: true });
      const first = id(k);
      next = {
        ...next,
        nodes: next.nodes.map((n) => (n.parent === subgraph.id ? { ...n, parent: first } : n)),
        subgraphs: next.subgraphs.map((s) => (s.parent === subgraph.id ? { ...s, parent: first } : s)),
      };
      k++;
    }
    created.push({ id: id(k), label: '', markdown: false, parent: subgraph.id, direction: null, region: true });
    onChange({ ...next, subgraphs: [...next.subgraphs, ...created] });
  };
  return (
    <div className="inspector">
      <div className="inspector-title">Composite state {subgraph.id}</div>
      <label>
        Label
        <LabelInput key={`${subgraph.id}:${subgraph.label}`} value={subgraph.label} onCommit={(label) => onChange(updateSubgraph(model, subgraph.id, { label }))} />
      </label>
      <label>
        Direction
        <select
          value={subgraph.direction ?? ''}
          onChange={(e) => onChange(updateSubgraph(model, subgraph.id, { direction: (e.target.value || null) as Direction | null }))}
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
      <button onClick={addRegion} title="Concurrent regions, separated by -- in the code">
        + Concurrent region
      </button>
      <StyleFields id={subgraph.id} item={subgraph} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateSubgraph(model, subgraph.id, patch))} />
      <button className="danger" onClick={onDelete} title="The states inside move up one level">
        Delete composite (keep states)
      </button>
    </div>
  );
}

/** State diagrams: a transition. Its label is the only setting. */
function StateEdgeInspector({ model, edge, onChange, onDelete }: StateInspectorProps & { edge: FlowEdge }): JSX.Element {
  if (edge.noteLink) {
    return (
      <div className="inspector">
        <div className="inspector-title">Note link</div>
        <div className="muted inspector-note">Select the note to change or delete it.</div>
      </div>
    );
  }
  const name = (id: string): string => {
    const kind = model.nodes.find((n) => n.id === id)?.state;
    return kind === 'start' || kind === 'end' ? '[*]' : id;
  };
  return (
    <div className="inspector">
      <div className="inspector-title">
        Transition {name(edge.source)} → {name(edge.target)}
      </div>
      <label>
        Label
        <LabelInput key={`${edge.id}:${edge.label}`} value={edge.label} onCommit={(label) => onChange(updateEdge(model, edge.id, { label }))} />
      </label>
      <button className="danger" onClick={onDelete}>
        Delete transition
      </button>
    </div>
  );
}

/** Use case diagrams: an actor, a use case, or a note. */
function UseCaseNodeInspector({ model, node, onChange, onDelete }: StateInspectorProps & { node: FlowNode }): JSX.Element {
  const uc = node.usecase;
  if (!uc) {
    return (
      <div className="inspector">
        <div className="inspector-title">Note for {node.note?.of}</div>
        <label>
          Text
          <LabelInput key={`${node.id}:${node.label}`} value={node.label} onCommit={(label) => onChange(updateNode(model, node.id, { label }))} />
        </label>
        <button className="danger" onClick={onDelete}>
          Delete note
        </button>
      </div>
    );
  }
  const set = (patch: Partial<NonNullable<FlowNode['usecase']>>): void => onChange(setUseCaseNode(model, node.id, patch));
  return (
    <div className="inspector">
      <div className="inspector-title">
        {uc.kind === 'actor' ? 'Actor' : 'Use case'} {node.id}
      </div>
      <label>
        Label
        <LabelInput key={`${node.id}:${node.label}`} value={node.label} onCommit={(label) => onChange(updateNode(model, node.id, { label }))} />
      </label>
      {uc.kind === 'actor' && (
        <label>
          Figure
          <select value={uc.icon ? 'icon' : (uc.actorType ?? 'normal')} onChange={(e) => set({ actorType: e.target.value === 'normal' || e.target.value === 'icon' ? undefined : (e.target.value as 'hollow' | 'awesome'), icon: e.target.value === 'icon' ? uc.icon || 'fa:user' : undefined })}>
            <option value="normal">Stick figure</option>
            <option value="hollow">Hollow</option>
            <option value="awesome">Awesome (icon font)</option>
            <option value="icon">Icon</option>
          </select>
        </label>
      )}
      {uc.kind === 'actor' && uc.icon !== undefined && (
        <label>
          Icon
          <TextField key={`${node.id}:icon:${uc.icon}`} value={uc.icon} placeholder="fa:user" onCommit={(icon) => set({ icon: icon.trim() || 'fa:user' })} />
        </label>
      )}
      {uc.kind === 'usecase' && (
        <label className="checkbox">
          <input type="checkbox" checked={uc.rect === true} onChange={(e) => set({ rect: e.target.checked || undefined })} />
          Rectangle (id[Label])
        </label>
      )}
      {!(uc.kind === 'usecase' && uc.rect) && !(uc.kind === 'actor' && (uc.icon || uc.actorType === 'awesome')) && (
        <label className="checkbox" title="business: true">
          <input type="checkbox" checked={uc.business === true} onChange={(e) => set({ business: e.target.checked || undefined })} />
          Business
        </label>
      )}
      <label>
        Stereotype
        <TextField key={`${node.id}:st:${uc.stereotype ?? ''}`} value={uc.stereotype ?? ''} placeholder="written as <<text>>" onCommit={(stereotype) => set({ stereotype: stereotype.trim() || undefined })} />
      </label>
      <ParentSelect model={model} value={node.parent} exclude={new Set()} onSelect={(parent) => onChange(setParent(model, node.id, parent))} />
      <StyleFields id={node.id} item={node} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateNode(model, node.id, patch))} />
      <button className="danger" onClick={onDelete}>
        Delete {uc.kind === 'actor' ? 'actor' : 'use case'}
      </button>
    </div>
  );
}

/** Use case diagrams: a system boundary. */
function UseCaseBoundaryInspector({ model, subgraph, onChange, onDelete }: StateInspectorProps & { subgraph: FlowSubgraph }): JSX.Element {
  return (
    <div className="inspector">
      <div className="inspector-title">System boundary {subgraph.id}</div>
      <label>
        Label
        <LabelInput key={`${subgraph.id}:${subgraph.label}`} value={subgraph.label} onCommit={(label) => onChange(updateSubgraph(model, subgraph.id, { label }))} />
      </label>
      <label className="checkbox" title="@{ type: package }">
        <input
          type="checkbox"
          checked={subgraph.package === true}
          onChange={(e) => onChange({ ...model, subgraphs: model.subgraphs.map((s) => (s.id === subgraph.id ? (e.target.checked ? { ...s, package: true } : (({ package: _p, ...rest }) => rest)(s)) : s)) })}
        />
        Package
      </label>
      <StyleFields id={subgraph.id} item={subgraph} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateSubgraph(model, subgraph.id, patch))} />
      <button className="danger" onClick={onDelete} title="Its actors and use cases move out of it">
        Delete boundary (keep contents)
      </button>
    </div>
  );
}

/** Use case diagrams: a relationship. */
function UseCaseEdgeInspector({ model, edge, onChange, onDelete }: StateInspectorProps & { edge: FlowEdge }): JSX.Element {
  if (edge.noteLink) {
    return (
      <div className="inspector">
        <div className="inspector-title">Note link</div>
        <div className="muted inspector-note">Select the note to change or delete it.</div>
      </div>
    );
  }
  const relation = edge.usecase?.relation ?? '-->';
  const allowed = allowedRelations(model, edge);
  const labelled = relation !== 'include' && relation !== 'extend' && relation !== 'generalization';
  return (
    <div className="inspector">
      <div className="inspector-title">
        {edge.source} → {edge.target}
      </div>
      <label>
        Relation
        <select value={forwardRelation(relation)} onChange={(e) => onChange(setRelation(model, edge.id, e.target.value as (typeof USECASE_RELATIONS)[number]['relation']))}>
          {USECASE_RELATIONS.filter((r) => allowed.includes(r.relation)).map((r) => (
            <option key={r.relation} value={r.relation}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      {labelled && (
        <label>
          Label
          <LabelInput key={`${edge.id}:${edge.label}`} value={edge.label} onCommit={(label) => onChange(updateEdge(model, edge.id, { label }))} />
        </label>
      )}
      <button className="danger" onClick={onDelete}>
        Delete relationship
      </button>
    </div>
  );
}
