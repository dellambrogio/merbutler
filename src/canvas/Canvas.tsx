import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react';
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
  type OnNodeDrag,
} from '@xyflow/react';
import { EdgeMarkerDefs } from './EdgeMarkers';
import { LabelEdgeView } from './LabelEdgeView';
import type { CanvasNode } from './layout';
import { layoutCanvas } from './layoutEngine';
import {
  DIRECTIONS,
  addNode,
  addSubgraph,
  addClassDef,
  connect,
  diagramTitle,
  groupInSubgraph,
  isSwimlane,
  nextEdgeId,
  nextNodeId,
  nextSubgraphId,
  removeElements,
  setParent,
  toggleClassOn,
  updateNode,
  updateSubgraph,
  type Direction,
  type FlowModel,
} from '../core/model';
import { EditRequestContext, RenameContext, ShapeNodeView } from './ShapeNodeView';
import { ContextMenu } from './ContextMenu';
import { CLASS_DRAG_TYPE, ClassPanel, type Selection } from './ClassPanel';
import { MultiInspector } from './MultiInspector';
import { LayoutPanel } from './LayoutPanel';
import { OpenClassesContext } from './styleControls';
import { canMove, menuFor, moveTargets, type MenuTarget } from './canvasMenu';
import { CollapseContext, SubgraphNodeView } from './SubgraphNodeView';
import { ImageConsentContext } from './AssetView';
import { useDraggablePanels } from './draggablePanels';
import type { PanelLayout } from '../core/urlState';
import { addNote, addPseudoState, canTransition } from '../state/stateDiagram';
import { StateEdgeInspector, StateNodeInspector, StateSubgraphInspector } from '../state/StateInspector';
import { addUseCaseNode, addUseCaseNote, canRelate } from '../usecase/usecaseDiagram';
import { UseCaseBoundaryInspector, UseCaseEdgeInspector, UseCaseNodeInspector } from '../usecase/UseCaseInspector';
import { FlowEdgeInspector, FlowNodeInspector, FlowSubgraphInspector } from '../flowchart/FlowchartInspector';
import { diagramTheme, GRADIENT_ID, HAND_DRAWN_ID, themeVars, type DiagramTheme } from '../flowchart/themes';

const NODE_TYPES = { shape: ShapeNodeView, subgraph: SubgraphNodeView };
const EDGE_TYPES = { label: LabelEdgeView };










interface CanvasProps {
  model: FlowModel;
  readOnly: boolean;
  onChange: (model: FlowModel) => void;
  /** Which panels are open and where the user dragged them (kept in the URL). */
  panels: PanelLayout;
  onPanelsChange: (update: (panels: PanelLayout) => PanelLayout) => void;
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

export function Canvas({ model, readOnly, onChange, panels, onPanelsChange }: CanvasProps): JSX.Element {
  const { fitView, getInternalNode, screenToFlowPosition } = useReactFlow();
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
    // Mermaid has no positions: an element can be dragged only to move it into another subgraph.
    laid.nodes = laid.nodes.map((n) => ({ ...n, draggable: canMove(model, n.id) }));
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
  /**
   * Dragging moves elements into another subgraph (or to the top level): the subgraph under the
   * pointer is the drop target. Mermaid keeps no positions, so a drop anywhere else puts the
   * elements back where the layout placed them.
   */
  const [dropInto, setDropInto] = useState<string | null>(null);
  /** The dragged elements whose parent is not dragged too: they are the ones that move. */
  const movedRoots = (dragged: CanvasNode[]): string[] => {
    const ids = new Set(dragged.map((n) => n.id));
    return dragged.filter((n) => !n.parentId || !ids.has(n.parentId)).map((n) => n.id).filter((id) => canMove(model, id));
  };
  /** The smallest subgraph under the point that can take all the moved elements, or null for the top level. */
  const dropTargetAt = (e: MouseEvent | TouchEvent, moved: string[]): string | null => {
    const point = 'changedTouches' in e ? e.changedTouches[0] : e;
    if (!point) return null;
    const p = screenToFlowPosition({ x: point.clientX, y: point.clientY });
    const allowed = moved.map((id) => new Set(moveTargets(model, id)));
    let best: string | null = null;
    let bestArea = Infinity;
    for (const n of nodesRef.current) {
      if (n.type !== 'subgraph' || !allowed.every((a) => a.has(n.id))) continue;
      const internal = getInternalNode(n.id);
      if (!internal) continue;
      const { x, y } = internal.internals.positionAbsolute;
      const w = internal.measured.width ?? n.width ?? 0;
      const h = internal.measured.height ?? n.height ?? 0;
      if (p.x < x || p.x > x + w || p.y < y || p.y > y + h || w * h >= bestArea) continue;
      best = n.id;
      bestArea = w * h;
    }
    return best;
  };
  const parentOf = (id: string): string | null =>
    model.nodes.find((n) => n.id === id)?.parent ?? model.subgraphs.find((s) => s.id === id)?.parent ?? null;
  const onNodeDrag: OnNodeDrag<CanvasNode> = (e, _node, dragged) => {
    const moved = movedRoots(dragged);
    const target = dropTargetAt(e, moved);
    // Highlight only a real move.
    setDropInto(moved.some((id) => parentOf(id) !== target) ? target : null);
  };
  const onNodeDragStop: OnNodeDrag<CanvasNode> = (e, _node, dragged) => {
    setDropInto(null);
    const moved = movedRoots(dragged);
    const target = dropTargetAt(e, moved);
    let next = model;
    for (const id of moved) if (parentOf(id) !== target) next = setParent(next, id, target);
    if (next !== model) onChange(next);
    else void relayout();
  };
  const shownNodes = useMemo(
    () => (dropInto ? nodes.map((n) => (n.id === dropInto ? { ...n, className: 'drop-target' } : n)) : nodes),
    [nodes, dropInto],
  );

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

  /** The selected nodes and subgraphs that can go into a new subgraph. */
  const groupable = selectedNodes.map((n) => n.id).filter((id) => canMove(model, id));
  /**
   * Puts the selected elements into a new subgraph, or adds an empty one when nothing that can
   * move is selected. A state diagram cannot put a composite straight into one that has regions.
   */
  const onAddSubgraph = (): void => {
    const label = stateDiagram ? 'Composite' : 'Group';
    const id = nextSubgraphId(model);
    if (groupable.length > 0) {
      const grouped = groupInSubgraph(model, groupable, label);
      const parent = grouped.subgraphs.find((s) => s.id === id)?.parent ?? null;
      if (grouped === model || !moveTargets(model, groupable[0]).includes(parent)) return;
      pendingSelect.current = id;
      onChange(grouped);
      return;
    }
    pendingSelect.current = id;
    onChange(addSubgraph(model, label, targetParent()));
  };

  /** A new lane goes after the last one. */
  const onAddLane = (): void => {
    pendingSelect.current = nextSubgraphId(model);
    onChange(addSubgraph(model, 'Lane', null));
  };
  const swimlane = isSwimlane(model);
  const isLane = (id: string): boolean => swimlane && model.subgraphs.some((s) => s.id === id && s.parent === null);

  /** The style classes panel (toolbar → Classes). */
  const classesOpen = panels.open.includes('classes');
  /** Opens or closes a panel that can be closed (classes, layout). */
  const setPanelOpen = useCallback(
    (name: string, open: boolean | ((was: boolean) => boolean)): void =>
      onPanelsChange((p) => {
        const was = p.open.includes(name);
        const next = typeof open === 'function' ? open(was) : open;
        if (next === was) return p;
        return { ...p, open: next ? [...p.open, name] : p.open.filter((n) => n !== name) };
      }),
    [onPanelsChange],
  );
  const setClassesOpen = useCallback((open: boolean | ((was: boolean) => boolean)): void => setPanelOpen('classes', open), [setPanelOpen]);
  /** The layout panel (toolbar → Layout). */
  const layoutOpen = panels.open.includes('layout');
  const openClasses = useCallback(() => setClassesOpen(true), [setClassesOpen]);
  const selection: Selection = {
    nodes: selectedNodes.filter((n) => n.type === 'shape').map((n) => n.id),
    subgraphs: selectedNodes.filter((n) => n.type === 'subgraph').map((n) => n.id),
    edges: selectedEdges.filter((e) => !model.edges.find((m) => m.id === e.id)?.noteLink).map((e) => e.id),
  };

  const deleteSelected = (): void => {
    onChange(removeElements(model, selectedNodes.map((n) => n.id), selectedEdges.map((e) => e.id)));
  };

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  // ---- Context menu (right-click, the ContextMenu key, or Shift+F10 on the selection) ----
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelDrag = useDraggablePanels(canvasRef, panels.at, (name, at) =>
    onPanelsChange((p) => {
      const { [name]: _old, ...rest } = p.at;
      return { ...p, at: at ? { ...rest, [name]: at } : rest };
    }),
  );
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
  };
  const openedMenu = menu ? menuFor(model, menu.target, readOnly, menuActions) : null;

  useEffect(() => {
    if (!focusEdgeLabel.current || !edge) return;
    focusEdgeLabel.current = false;
    requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLTextAreaElement>('.inspector textarea')?.focus());
  }, [edge]);

  // Ctrl/Cmd+A selects every node and edge, when the focus is on the canvas or nowhere (after a click on the empty canvas).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'a') return;
      const target = e.target as HTMLElement;
      const onCanvas = canvasRef.current?.contains(target) && !target.closest('input, textarea, select, [contenteditable="true"], .inspector, .class-panel, .layout-panel');
      if (!onCanvas && target !== document.body) return;
      e.preventDefault();
      setNodes((prev) => prev.map((n) => (n.selected ? n : { ...n, selected: true })));
      setEdges((prev) => prev.map((ed) => (ed.selected ? ed : { ...ed, selected: true })));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [readOnly]);

  /** The ContextMenu key or Shift+F10 opens the menu of the selected element, at the element. */
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    // Ctrl/Cmd+G: put the selection into a new subgraph.
    if (e.key.toLowerCase() === 'g' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (readOnly || usecaseDiagram || groupable.length === 0 || (e.target as HTMLElement).closest('input, textarea, select')) return;
      e.preventDefault();
      onAddSubgraph();
      return;
    }
    if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, .context-menu')) return;
    e.preventDefault();
    const target: MenuTarget = node ? { kind: 'node', id: node.id } : subgraph ? { kind: 'subgraph', id: subgraph.id } : edge ? { kind: 'edge', id: edge.id } : { kind: 'pane' };
    const id = target.kind === 'pane' ? null : target.id;
    const el = id ? canvasRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
    const rect = (el ?? canvasRef.current)?.getBoundingClientRect();
    if (rect) openMenu(rect.left + Math.min(rect.width / 2, 120), rect.top + Math.min(rect.height / 2, 60), target);
  };

  /** The node, subgraph or edge under a drag, as its React Flow element. */
  const classDropTarget = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? (target.closest('.react-flow__node, .react-flow__edge') as HTMLElement | null) : null;
  const classDropHover = useRef<HTMLElement | null>(null);
  const setClassDropHover = (el: HTMLElement | null): void => {
    if (classDropHover.current === el) return;
    classDropHover.current?.classList.remove('class-drop-target');
    el?.classList.add('class-drop-target');
    classDropHover.current = el;
  };
  /** A palette color dropped on an element adds its class (creating the classDef if needed). */
  const onClassDragOver = (e: DragEvent): void => {
    if (readOnly || !e.dataTransfer.types.includes(CLASS_DRAG_TYPE)) return;
    const el = classDropTarget(e.target);
    setClassDropHover(el);
    if (!el) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onClassDrop = (e: DragEvent): void => {
    setClassDropHover(null);
    const raw = e.dataTransfer.getData(CLASS_DRAG_TYPE);
    const el = classDropTarget(e.target);
    const id = el?.dataset.id;
    if (readOnly || !raw || !el || !id) return;
    e.preventDefault();
    const { name, styles } = JSON.parse(raw) as { name: string; styles: string[] };
    const kind = el.classList.contains('react-flow__edge') ? 'edges' : model.subgraphs.some((s) => s.id === id) ? 'subgraphs' : 'nodes';
    const item = kind === 'edges' ? model.edges.find((x) => x.id === id) : kind === 'subgraphs' ? model.subgraphs.find((x) => x.id === id) : model.nodes.find((x) => x.id === id);
    if (!item || item.classes?.includes(name)) return;
    onChange(toggleClassOn(addClassDef(model, name, styles), name, { [kind]: [id] }));
  };

  return (
    <div className={`canvas${readOnly ? ' read-only' : ''}${connecting ? ' connecting' : ''}`} ref={canvasRef} onKeyDown={onCanvasKeyDown} onPointerDown={panelDrag.onPointerDown} onDoubleClick={panelDrag.onDoubleClick} onDragOver={onClassDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClassDropHover(null); }} onDrop={onClassDrop}>
      <OpenClassesContext.Provider value={openClasses}>
      {classesOpen && <ClassPanel model={model} selection={selection} readOnly={readOnly} onChange={onChange} onClose={() => setClassesOpen(false)} />}
      {layoutOpen && <LayoutPanel model={model} readOnly={readOnly} onChange={onChange} onClose={() => setPanelOpen('layout', false)} />}
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
          <button
            onClick={onAddSubgraph}
            disabled={readOnly}
            title={groupable.length > 0 ? 'Put the selection into a new subgraph (Ctrl+G)' : 'Add an empty subgraph. Select nodes first to put them into it (Ctrl+G).'}
          >
            {groupable.length > 0 ? (stateDiagram ? 'Group in composite' : 'Group in subgraph') : stateDiagram ? '+ Composite' : '+ Subgraph'}
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
        <button onClick={() => setClassesOpen((o) => !o)} aria-pressed={classesOpen} title="Style classes (classDef): create, edit, apply">
          Classes{(model.classDefs?.length ?? 0) > 0 ? ` ${model.classDefs!.length}` : ''}
        </button>
        <button onClick={() => setPanelOpen('layout', (o) => !o)} aria-pressed={layoutOpen} title="How Mermaid places and aligns the nodes (elk options in the config)">
          Layout
        </button>
        <button onClick={() => void fitView({ padding: 0.2 })}>Fit</button>
      </div>

      {!readOnly && stateDiagram && node && <StateNodeInspector model={model} node={node} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && stateDiagram && subgraph && <StateSubgraphInspector model={model} subgraph={subgraph} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && stateDiagram && edge && <StateEdgeInspector model={model} edge={edge} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && usecaseDiagram && node && <UseCaseNodeInspector model={model} node={node} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && usecaseDiagram && subgraph && <UseCaseBoundaryInspector model={model} subgraph={subgraph} onChange={onChange} onDelete={deleteSelected} />}
      {!readOnly && usecaseDiagram && edge && <UseCaseEdgeInspector model={model} edge={edge} onChange={onChange} onDelete={deleteSelected} />}

      {!readOnly && !stateDiagram && !usecaseDiagram && node && <FlowNodeInspector model={model} node={node} onChange={onChange} onDelete={deleteSelected} />}

            {!readOnly && !stateDiagram && !usecaseDiagram && subgraph && <FlowSubgraphInspector model={model} subgraph={subgraph} lane={isLane(subgraph.id)} onChange={onChange} onDelete={deleteSelected} />}

            {!readOnly && !stateDiagram && !usecaseDiagram && edge && <FlowEdgeInspector model={model} edge={edge} onChange={onChange} onDelete={deleteSelected} />}

      {!readOnly && selectedNodes.length + selectedEdges.length > 1 && (
        <MultiInspector
          model={model}
          nodes={model.nodes.filter((n) => selectedNodes.some((x) => x.id === n.id))}
          subgraphs={model.subgraphs.filter((sg) => selectedNodes.some((x) => x.id === sg.id))}
          edges={model.edges.filter((e) => selectedEdges.some((x) => x.id === e.id))}
          flowchart={!stateDiagram && !usecaseDiagram}
          onChange={onChange}
          onDelete={deleteSelected}
        />
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
              nodes={shownNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              nodesDraggable={!readOnly}
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
              // Shift-click or Ctrl/Cmd-click adds to the selection; Shift-drag on the canvas draws a selection box.
              multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
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
      </OpenClassesContext.Provider>
    </div>
  );
}






