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
  type NodePositionChange,
  type OnBeforeDelete,
  type OnNodeDrag,
} from '@xyflow/react';
import { EdgeMarkerDefs } from './EdgeMarkers';
import { LabelEdgeView } from './LabelEdgeView';
import type { Box, CanvasNode } from './layout';
import { SNAP_PIXELS, snapCenter, type Guide } from './snap';
import { alignGroupsWithReport, alignMessage, canAlign, isAlignGroup } from '../core/alignGroups';
import { arrangeByPositions, isFreeLayout, toggleFreeLayout, type Point, type Positions } from '../core/positions';
import { absoluteBoxes, layoutCanvas } from './layoutEngine';
import {
  addNode,
  addSubgraph,
  addClassDef,
  addLinkedNode,
  connect,
  diagramTitle,
  groupInSubgraph,
  isSwimlane,
  nextEdgeId,
  nextNodeId,
  nextSubgraphId,
  openSides,
  quickAddLink,
  removeElements,
  setParent,
  subgraphWithDescendants,
  toggleClassOn,
  updateEdge,
  updateNode,
  updateSubgraph,
  type FlowModel,
  type QuickAdd,
} from '../core/model';
import { EditRequestContext, QuickAddContext, RenameContext, ShapeNodeView, type QuickAddActions } from './ShapeNodeView';
import { ContextMenu } from './ContextMenu';
import { CLASS_DRAG_TYPE, ClassStrip, classDragAdds, type Selection } from './classDrag';
import { ClassesPanel } from '../panels/ClassesPanel';
import { PalettePanel } from '../panels/PalettePanel';
import { DEFAULT_DOCK_POSITION, DIRECTION_NAMES, Dock, DockIcons, DockItem, DockSeparator } from './Dock';
import { SelectionPanel } from '../panels/SelectionPanel';
import { DiagramPanel } from '../panels/DiagramPanel';
import { NodePanel } from '../panels/NodePanel';
import { EdgePanel } from '../panels/EdgePanel';
import { OpenClassesContext } from './styleControls';
import { canMove, menuFor, moveTargets, type MenuTarget } from './canvasMenu';
import { CollapseContext, SubgraphNodeView } from './SubgraphNodeView';
import { ImageConsentContext } from './AssetView';
import { useDraggablePanels } from '../panels/draggablePanels';
import type { PanelLayout, PanelSize } from '../core/urlState';

/** No panel resized (one object, so the panels' sizes do not change on every render). */
const NO_SIZES: Record<string, PanelSize> = {};
import { addNote, addPseudoState, canTransition } from '../state/stateDiagram';
import { addUseCaseNode, addUseCaseNote, canRelate } from '../usecase/usecaseDiagram';
import { diagramTheme, GRADIENT_ID, HAND_DRAWN_ID, themeVars, type DiagramTheme } from '../flowchart/themes';

const NODE_TYPES = { shape: ShapeNodeView, subgraph: SubgraphNodeView };
const EDGE_TYPES = { label: LabelEdgeView };










/** How long the message of Code from layout stays. */
const ALIGN_NOTICE_MS = 6000;

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
  const { fitView, getInternalNode, getZoom, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const title = diagramTitle(model);
  const theme = useMemo(() => diagramTheme(model), [model]);
  const titleAnchor = useMemo(() => titlePosition(nodes), [nodes]);
  const [edges, setEdges] = useState<Edge[]>([]);
  /** Node ids, direction and free layout at the last fit. */
  const lastFitKey = useRef<{ ids: string; direction: string; free: boolean; moved: boolean } | null>(null);
  /** Id of an element that the next layout must select (for example a new node). */
  const pendingSelect = useRef<string | null>(null);
  /** True while the user drags a new edge. All handles are shown then, so the user can see the targets. */
  const [connecting, setConnecting] = useState(false);

  /** Node ids, direction and free layout of the layout shown, and whether it moved elements that were already there. */
  const layoutKey = useRef({ ids: '', direction: '', free: false, moved: false });
  /** Counts layouts, so a slow (ELK) layout that finishes after a newer one is dropped. */
  const layoutRun = useRef(0);

  const relayout = useCallback(async (): Promise<void> => {
    const run = ++layoutRun.current;
    const laid = await layoutCanvas(model);
    if (run !== layoutRun.current) return;
    const free = isFreeLayout(model);
    // The fit key belongs to this layout: the layout is async, so model.direction can be newer than the nodes shown.
    // Whether nodes that were shown moved (absolute positions: a subgraph drawn around a dropped node
    // moves its contents' relative positions, not the nodes). A drop leaves them where they are.
    const before = absoluteBoxes(nodesRef.current);
    const after = absoluteBoxes(laid.nodes);
    const moved = laid.nodes.some((n) => {
      const p = before.get(n.id);
      const q = after.get(n.id);
      return n.type === 'shape' && p !== undefined && q !== undefined && (Math.abs(p.x - q.x) > 2 || Math.abs(p.y - q.y) > 2);
    });
    layoutKey.current = { ids: laid.nodes.map((n) => n.id).sort().join(','), direction: model.direction, free, moved };
    const select = pendingSelect.current;
    pendingSelect.current = null;
    // Mermaid has no positions: an element can be dragged only to move it into another subgraph.
    // In a free layout everything can be dragged, and stays where it is dropped.
    // Alignment groups (Code from layout) are invisible: they cannot be picked, moved or dropped into.
    const aligned = new Set(model.subgraphs.filter(isAlignGroup).map((s) => s.id));
    laid.nodes = laid.nodes.map((n) => (aligned.has(n.id) ? { ...n, draggable: false, selectable: false } : { ...n, draggable: free || canMove(model, n.id) }));
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
    const last = lastFitKey.current;
    // Each layout is looked at once: later node changes (a drag, a selection) do not fit again.
    if (key === last) return;
    // Fit when nodes were added or removed, when Mermaid's layout turned, when switching the free
    // layout moved things (back to Mermaid's layout, or back to the user's positions), or when the
    // positions changed in the code. A new direction in a free layout, or a drop, moves nothing.
    const turned = last !== null && ((!key.free && !last.free && last.direction !== key.direction) || (last.free !== key.free && key.moved) || (key.free && last.free && key.moved));
    if (last !== null && last.ids === key.ids && !turned) {
      lastFitKey.current = key;
      return;
    }
    const first = last === null;
    lastFitKey.current = key;
    // Animate later fits, so the view change is easy to follow.
    requestAnimationFrame(() => void fitView({ padding: 0.2, duration: first ? 0 : 250 }));
  }, [nodes, fitView]);

  // Remove events are handled by onBeforeDelete, which updates the model.
  /** The current nodes, for event handlers that must not wait for a render. */
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  /** Whether the layout is free, for the change handlers. */
  const freeRef = useRef(false);
  freeRef.current = isFreeLayout(model);

  /** Snap guides shown while a node is dragged in a free layout. */
  const [guides, setGuides] = useState<Guide[]>([]);
  /** Alt held: drag without snapping. */
  const altRef = useRef(false);
  useEffect(() => {
    const track = (e: KeyboardEvent): void => {
      altRef.current = e.altKey;
    };
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    return () => {
      window.removeEventListener('keydown', track);
      window.removeEventListener('keyup', track);
    };
  }, []);
  /** Absolute box of a node on the canvas, or null. */
  const boxOf = useCallback(
    (id: string): Box | null => {
      const internal = getInternalNode(id);
      if (!internal) return null;
      const { x, y } = internal.internals.positionAbsolute;
      return { x, y, width: internal.measured.width ?? internal.width ?? 0, height: internal.measured.height ?? internal.height ?? 0 };
    },
    [getInternalNode],
  );

  /**
   * Free layout: the dragged node's center snaps to the center of an element in line with it, and
   * the others dragged with it move as much. Changes the position changes in place; returns the guides.
   */
  const snapChanges = useCallback(
    (changes: NodeChange<CanvasNode>[], dragged: ReadonlySet<string>): Guide[] => {
      const moves = changes.filter((c): c is NodePositionChange => c.type === 'position' && !!c.dragging && !!c.position);
      const lead = moves[0];
      const now = lead && boxOf(lead.id);
      if (!lead || !now) return [];
      // Where the change puts it: its box moved by the change.
      const node = nodesRef.current.find((n) => n.id === lead.id);
      if (!node) return [];
      const moving = { ...now, x: now.x + lead.position!.x - node.position.x, y: now.y + lead.position!.y - node.position.y };
      const ancestors = new Set<string>();
      for (let p = node.parentId; p; p = nodesRef.current.find((n) => n.id === p)?.parentId) ancestors.add(p);
      const others = nodesRef.current.flatMap((n) => {
        if (dragged.has(n.id) || ancestors.has(n.id) || (n.type === 'subgraph' && n.data.align)) return [];
        const b = boxOf(n.id);
        return b ? [b] : [];
      });
      const { dx, dy, guides } = snapCenter(moving, others, SNAP_PIXELS / getZoom());
      if (dx !== 0 || dy !== 0) for (const m of moves) m.position = { x: m.position!.x + dx, y: m.position!.y + dy };
      return guides;
    },
    [boxOf, getZoom],
  );

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
      setGuides(freeRef.current && !altRef.current ? snapChanges(changes, dragged) : []);
      // In a free layout they become straight lines, as they will be after the drop.
      const free = freeRef.current;
      setEdges((edges) =>
        edges.map((e) =>
          e.data && (e.data.route || (free && !e.data.floating && e.source !== e.target)) && (dragged.has(e.source) || dragged.has(e.target))
            ? { ...e, data: { ...e.data, route: undefined, ...(free && e.source !== e.target ? { floating: true } : {}) } }
            : e,
        ),
      );
    }
    setNodes((prev) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), prev));
  }, [snapChanges]);
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
  /** The subgraph an element is in, past alignment groups: they are invisible, so a drop does not take it out of one. */
  const parentOf = (id: string): string | null => {
    let p = model.nodes.find((n) => n.id === id)?.parent ?? model.subgraphs.find((s) => s.id === id)?.parent ?? null;
    for (let s = model.subgraphs.find((x) => x.id === p); s && isAlignGroup(s); s = model.subgraphs.find((x) => x.id === p)) p = s.parent;
    return p;
  };
  const onNodeDrag: OnNodeDrag<CanvasNode> = (e, _node, dragged) => {
    altRef.current = e.altKey;
    const moved = movedRoots(dragged);
    const target = dropTargetAt(e, moved);
    // Highlight only a real move.
    setDropInto(moved.some((id) => parentOf(id) !== target) ? target : null);
  };
  /** Absolute boxes of the elements on the canvas, where they are now. */
  const canvasBoxes = (): Map<string, Box> => {
    const boxes = new Map<string, Box>();
    for (const n of nodesRef.current) {
      const internal = getInternalNode(n.id);
      if (!internal) continue;
      const { x, y } = internal.internals.positionAbsolute;
      boxes.set(n.id, { x, y, width: internal.measured.width ?? n.width ?? 0, height: internal.measured.height ?? n.height ?? 0 });
    }
    return boxes;
  };
  /**
   * The free layout positions of what the canvas shows: every element with nothing shown inside it.
   * Elements hidden in a collapsed subgraph keep theirs, and move with the subgraph.
   */
  const placedPositions = (next: FlowModel, boxes: Map<string, Box>): Positions => {
    const old = next.positions ?? {};
    const positions: Positions = {};
    for (const [id, p] of Object.entries(old)) if (!boxes.has(id)) positions[id] = p;
    for (const s of next.subgraphs) {
      const before = old[s.id];
      const now = boxes.get(s.id);
      if (s.view !== 'collapsed' || !before || !now || (before.x === now.x && before.y === now.y)) continue;
      const inside = subgraphWithDescendants(next, s.id);
      for (const item of [...next.nodes, ...next.subgraphs]) {
        const p = positions[item.id];
        if (p && item.parent !== null && inside.has(item.parent)) positions[item.id] = { x: Math.round(p.x + now.x - before.x), y: Math.round(p.y + now.y - before.y) };
      }
    }
    const parents = new Set(nodesRef.current.flatMap((n) => (n.parentId ? [n.parentId] : [])));
    for (const [id, b] of boxes) if (!parents.has(id)) positions[id] = { x: Math.round(b.x), y: Math.round(b.y) };
    return positions;
  };
  const onNodeDragStop: OnNodeDrag<CanvasNode> = (e, _node, dragged) => {
    setDropInto(null);
    setGuides([]);
    const moved = movedRoots(dragged);
    const target = dropTargetAt(e, moved);
    let next = model;
    for (const id of moved) if (parentOf(id) !== target) next = setParent(next, id, target);
    if (isFreeLayout(model)) {
      // Keep where everything is; the code follows the drawing (direction and statement order).
      const boxes = canvasBoxes();
      const centers = new Map<string, Point>([...boxes].map(([id, b]) => [id, { x: b.x + b.width / 2, y: b.y + b.height / 2 }]));
      onChange(arrangeByPositions(next, placedPositions(next, boxes), centers));
      return;
    }
    if (next !== model) onChange(next);
    else void relayout();
  };
  /**
   * Free layout on: everything where the user left it (the first time, where Mermaid's layout put it).
   * Off: Mermaid's layout again; the positions are kept for the next time.
   */
  const free = isFreeLayout(model);
  const toggleFree = (): void => onChange(toggleFreeLayout(model, () => placedPositions(model, canvasBoxes())));
  /** Free layout: invisible subgraphs around the rows and columns lined up on the canvas, so Mermaid's layout lines them up too. */
  /** What Code from layout did, shown for a few seconds; its groups get a brief outline. */
  const [alignNotice, setAlignNotice] = useState<{ text: string; groups: ReadonlySet<string> } | null>(null);
  const alignTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(alignTimer.current), []);
  const codeFromLayout = (): void => {
    const centers = new Map<string, Point>([...canvasBoxes()].map(([id, b]) => [id, { x: b.x + b.width / 2, y: b.y + b.height / 2 }]));
    const { model: next, report } = alignGroupsWithReport(model, centers);
    clearTimeout(alignTimer.current);
    setAlignNotice({ text: alignMessage(report), groups: new Set(report.groups) });
    alignTimer.current = setTimeout(() => setAlignNotice(null), ALIGN_NOTICE_MS);
    if (next !== model) onChange(next);
  };
  const shownNodes = useMemo(() => {
    const flash = alignNotice?.groups;
    if (!dropInto && !flash?.size) return nodes;
    return nodes.map((n) => (n.id === dropInto ? { ...n, className: 'drop-target' } : flash?.has(n.id) ? { ...n, className: 'align-flash' } : n));
  }, [nodes, dropInto, alignNotice]);

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

  /** The style classes panel (dock → Classes). */
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
  /** The diagram panel (dock → Diagram): direction, free layout and layout options. */
  const diagramOpen = panels.open.includes('diagram');
  /** The palettes panel (dock → Palette). */
  const paletteOpen = panels.open.includes('palette');
  const openClasses = useCallback(() => setClassesOpen(true), [setClassesOpen]);
  const selection: Selection = {
    nodes: selectedNodes.filter((n) => n.type === 'shape').map((n) => n.id),
    subgraphs: selectedNodes.filter((n) => n.type === 'subgraph').map((n) => n.id),
    edges: selectedEdges.filter((e) => !model.edges.find((m) => m.id === e.id)?.noteLink).map((e) => e.id),
  };

  /** Closing the node, edge or selection panel clears the selection. */
  const clearSelection = (): void => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
  };

  const deleteSelected = (): void => {
    onChange(removeElements(model, selectedNodes.map((n) => n.id), selectedEdges.map((e) => e.id)));
  };

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  // ---- Context menu (right-click, the ContextMenu key, or Shift+F10 on the selection) ----
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelDrag = useDraggablePanels(
    canvasRef,
    panels.at,
    panels.size ?? NO_SIZES,
    (name, at) =>
      onPanelsChange((p) => {
        const { [name]: _old, ...rest } = p.at;
        return { ...p, at: at ? { ...rest, [name]: at } : rest };
      }),
    (name, size) =>
      onPanelsChange((p) => {
        const { [name]: _old, ...rest } = p.size ?? {};
        const next = size ? { ...rest, [name]: size } : rest;
        const { size: _sizes, ...without } = p;
        return Object.keys(next).length > 0 ? { ...without, size: next } : without;
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
    openClasses: (): void => setClassesOpen(true),
    openPalette: (): void => setPanelOpen('palette', true),
  };
  const openedMenu = menu ? menuFor(model, menu.target, readOnly, menuActions) : null;

  /**
   * The + near a side of a node: a new node linked to it, selected, with its label editor open.
   * Flowcharts, swimlanes and state diagrams; a state diagram keeps its transition rules.
   */
  const quickAdd = useMemo((): QuickAddActions | null => {
    if (readOnly || model.kind === 'usecase') return null;
    const isState = model.kind === 'state';
    const allowed = (id: string, kind: QuickAdd): boolean => {
      if (!isState) return true;
      const link = quickAddLink(model, id, kind);
      return canTransition(model, link.source, link.target);
    };
    return {
      sides: (id) => {
        const n = model.nodes.find((x) => x.id === id);
        if (!n || n.note || n.state === 'note') return null;
        const open = openSides(model, id);
        return {
          after: open.after && allowed(id, 'after'),
          before: open.before && allowed(id, 'before'),
          // A sibling of a start, an end, a fork or a choice would not mean much.
          beside: !n.state && allowed(id, 'beside'),
        };
      },
      add: (id, kind) => {
        const added = addLinkedNode(model, id, kind, isState ? 'New state' : 'New node', isState ? 'round' : 'rect');
        pendingSelect.current = added.id;
        onChange(added.model);
        setEditRequest((r) => ({ id: added.id, n: (r?.n ?? 0) + 1 }));
      },
    };
  }, [model, readOnly, onChange]);

  useEffect(() => {
    if (!focusEdgeLabel.current || !edge) return;
    focusEdgeLabel.current = false;
    requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLTextAreaElement>('.panel-inspector textarea')?.focus());
  }, [edge]);

  // Ctrl/Cmd+A selects every node and edge, when the focus is on the canvas or nowhere (after a click on the empty canvas).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'a') return;
      const target = e.target as HTMLElement;
      const onCanvas = canvasRef.current?.contains(target) && !target.closest('input, textarea, select, [contenteditable="true"], .panel');
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
    classDropHover.current?.classList.remove('class-drop-target', 'class-drop-add');
    el?.classList.add('class-drop-target');
    classDropHover.current = el;
  };
  /**
   * A class dropped on an element replaces the element's classes with it (creating the classDef if
   * needed); with Shift held it is added to them instead.
   */
  /** Whether Shift was down at the last dragover: some platforms leave it out of the drop event. */
  const classDropShift = useRef(false);
  const onClassDragOver = (e: DragEvent): void => {
    if (readOnly || !e.dataTransfer.types.includes(CLASS_DRAG_TYPE)) return;
    classDropShift.current = e.shiftKey;
    const el = classDropTarget(e.target);
    setClassDropHover(el);
    // Shows whether the drop adds the class (Shift) or replaces the element's classes.
    el?.classList.toggle('class-drop-add', classDragAdds(e));
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
    if (!item) return;
    const withDef = addClassDef(model, name, styles);
    const add = classDragAdds(e) || classDropShift.current;
    classDropShift.current = false;
    if (add) {
      if (!item.classes?.includes(name)) onChange(toggleClassOn(withDef, name, { [kind]: [id] }));
      return;
    }
    if (item.classes?.length === 1 && item.classes[0] === name) return;
    const update = kind === 'edges' ? updateEdge : kind === 'subgraphs' ? updateSubgraph : updateNode;
    onChange(update(withDef, id, { classes: [name] }));
  };

  return (
    <div className={`canvas${readOnly ? ' read-only' : ''}${connecting ? ' connecting' : ''}`} data-dock={DEFAULT_DOCK_POSITION} ref={canvasRef} onKeyDown={onCanvasKeyDown} onPointerDown={panelDrag.onPointerDown} onDoubleClick={panelDrag.onDoubleClick} onDragOver={onClassDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClassDropHover(null); }} onDrop={onClassDrop}>
      <OpenClassesContext.Provider value={openClasses}>
      {diagramOpen && <DiagramPanel model={model} readOnly={readOnly} onChange={onChange} onClose={() => setPanelOpen('diagram', false)} />}
      {classesOpen && <ClassesPanel model={model} selection={selection} readOnly={readOnly} onChange={onChange} onClose={() => setClassesOpen(false)} />}
      {paletteOpen && !readOnly && <PalettePanel model={model} onChange={onChange} onClose={() => setPanelOpen('palette', false)} />}
      {menu && openedMenu && <ContextMenu x={menu.x} y={menu.y} title={openedMenu.title} items={openedMenu.items} onClose={closeMenu} />}
      <Dock position={DEFAULT_DOCK_POSITION}>
        {usecaseDiagram && (
          <>
            <DockItem icon={DockIcons.actor} label="Actor" add onClick={() => onAddUseCase('actor')} disabled={readOnly} />
            <DockItem icon={DockIcons.usecase} label="Use case" hint="Goes into the selected system boundary" add onClick={() => onAddUseCase('usecase')} disabled={readOnly} />
            <DockItem icon={DockIcons.boundary} label="Boundary" add onClick={onAddBoundary} disabled={readOnly} />
            <DockItem icon={DockIcons.note} label="Note" hint="For the selected actor or use case" add onClick={() => node?.usecase && onChange(addUseCaseNote(model, node.id))} disabled={readOnly || !node?.usecase} />
          </>
        )}
        {!usecaseDiagram && <DockItem icon={stateDiagram ? DockIcons.state : DockIcons.node} label={stateDiagram ? 'State' : 'Node'} add onClick={onAddNode} disabled={readOnly} />}
        {stateDiagram && (
          <>
            <DockItem icon={DockIcons.start} label="Start" hint="[*] start of the selected composite state, or of the diagram" add onClick={() => onAddPseudo('start')} disabled={readOnly} />
            <DockItem icon={DockIcons.end} label="End" hint="[*] end of the selected composite state, or of the diagram" add onClick={() => onAddPseudo('end')} disabled={readOnly} />
            <DockItem icon={DockIcons.note} label="Note" hint="Next to the selected state" add onClick={() => noteTarget && onChange(addNote(model, noteTarget))} disabled={readOnly || !noteTarget} />
          </>
        )}
        {swimlane && <DockItem icon={DockIcons.lane} label="Lane" hint="A top-level subgraph of a swimlane-beta diagram" add onClick={onAddLane} disabled={readOnly} />}
        {!usecaseDiagram &&
          (groupable.length > 0 ? (
            <DockItem icon={DockIcons.group} label={stateDiagram ? 'Group in composite' : 'Group in subgraph'} hint="Puts the selection into a new one (Ctrl+G)" onClick={onAddSubgraph} disabled={readOnly} />
          ) : (
            <DockItem icon={DockIcons.subgraph} label={stateDiagram ? 'Composite' : 'Subgraph'} hint="Select nodes first to put them into it (Ctrl+G)" add onClick={onAddSubgraph} disabled={readOnly} />
          ))}
        <DockSeparator />
        <DockItem
          icon={DockIcons.diagram}
          label="Diagram"
          hint={`${swimlane ? 'Lanes' : DIRECTION_NAMES[model.direction]} (${model.direction}), and how Mermaid places the nodes`}
          badge={model.direction}
          active={diagramOpen}
          onClick={() => setPanelOpen('diagram', (o) => !o)}
        />
        {!swimlane && (
          <DockItem
            icon={DockIcons.free}
            label={free ? 'Free layout: on' : 'Free layout'}
            hint={
              free
                ? 'Nodes stay where you drop them, kept in a %% comment, and snap into line with others (hold Alt not to). Click to let Mermaid place them again; your positions are kept'
                : model.positions
                  ? 'Puts the nodes back where you placed them'
                  : 'Place nodes anywhere; the code keeps their positions in a %% comment and follows the drawing'
            }
            active={free}
            disabled={readOnly}
            onClick={toggleFree}
          />
        )}
        {free && canAlign(model) && (
          <DockItem
            icon={DockIcons.align}
            label="Code from layout"
            hint="Puts the rows and columns you lined up into invisible subgraphs, chained with invisible links (~~~), so Mermaid lines them up too. Again after moving nodes: the groups follow the drawing"
            disabled={readOnly}
            onClick={codeFromLayout}
          />
        )}
        <DockItem
          icon={DockIcons.classes}
          label="Classes"
          hint="Style classes (classDef): create, edit, apply"
          badge={(model.classDefs?.length ?? 0) > 0 ? `${model.classDefs!.length}` : undefined}
          active={classesOpen}
          onClick={() => setClassesOpen((o) => !o)}
        />
        <DockItem
          icon={DockIcons.palette}
          label="Palette"
          hint="Ready-made sets of classes to add or drag onto elements"
          active={paletteOpen}
          disabled={readOnly}
          onClick={() => setPanelOpen('palette', (o) => !o)}
        />
        <ClassStrip model={model} selection={selection} readOnly={readOnly} onChange={onChange} />
      </Dock>
      {alignNotice && (
        <div className="canvas-notice" role="status" onClick={() => setAlignNotice(null)} title="Click to close">
          {alignNotice.text}
        </div>
      )}

      {!readOnly && (node || subgraph) && (
        <NodePanel model={model} node={node} subgraph={subgraph} lane={!!subgraph && isLane(subgraph.id)} onChange={onChange} onDelete={deleteSelected} onClose={clearSelection} />
      )}
      {!readOnly && edge && <EdgePanel model={model} edge={edge} onChange={onChange} onDelete={deleteSelected} onClose={clearSelection} />}

      {!readOnly && selectedNodes.length + selectedEdges.length > 1 && (
        <SelectionPanel
          model={model}
          nodes={model.nodes.filter((n) => selectedNodes.some((x) => x.id === n.id))}
          subgraphs={model.subgraphs.filter((sg) => selectedNodes.some((x) => x.id === sg.id))}
          edges={model.edges.filter((e) => selectedEdges.some((x) => x.id === e.id))}
          flowchart={!stateDiagram && !usecaseDiagram}
          onChange={onChange}
          onDelete={deleteSelected}
          onClose={clearSelection}
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
          <QuickAddContext.Provider value={quickAdd}>
            <ReactFlow
              proOptions={{ hideAttribution: true }}
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
              <Controls showInteractive={false} fitViewOptions={{ padding: 0.2, duration: 250 }} />
              {guides.length > 0 && (
                <ViewportPortal>
                  {guides.map((g) => (
                    <div
                      key={g.axis}
                      className={`snap-guide snap-guide-${g.axis}`}
                      style={g.axis === 'x' ? { left: g.at, top: g.from, height: g.to - g.from } : { top: g.at, left: g.from, width: g.to - g.from }}
                    />
                  ))}
                </ViewportPortal>
              )}
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
          </QuickAddContext.Provider>
          </EditRequestContext.Provider>
          </RenameContext.Provider>
        </CollapseContext.Provider>
      </ImageConsentContext.Provider>
      </OpenClassesContext.Provider>
    </div>
  );
}






