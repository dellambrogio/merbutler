/**
 * What the canvas context menu offers for a node, a subgraph, an edge or the empty canvas, per
 * diagram kind (flowchart and swimlane, state, use case). Each action returns a new model through
 * `actions.change`, like the toolbar and the inspector do.
 */
import { isAlignGroup, visibleParent } from '../core/alignGroups';
import type { CodeTarget } from '../core/codeLocation';
import { action, separator, submenu, type MenuItem } from './ContextMenu';
import {
  addNode,
  addSubgraph,
  connect,
  DIRECTIONS,
  duplicateNode,
  EDGE_ENDS,
  nextNodeId,
  nextSubgraphId,
  removeElements,
  reverseEdge,
  setParent,
  STROKES,
  subgraphWithDescendants,
  updateEdge,
  updateNode,
  updateSubgraph,
  type FlowEdge,
  type FlowModel,
  type FlowNode,
  type FlowSubgraph,
  type Shape,
} from '../core/model';
import { SHAPE_INFO } from '../flowchart/shapes';
import { addNote, addPseudoState, canTransition, setStateKind, STATE_KINDS } from '../state/stateDiagram';
import { addUseCaseNode, addUseCaseNote, allowedRelations, canRelate, forwardRelation, setRelation, USECASE_RELATIONS } from '../usecase/usecaseDiagram';

export type MenuTarget = { kind: 'node'; id: string } | { kind: 'subgraph'; id: string } | { kind: 'edge'; id: string } | { kind: 'pane' };

export interface MenuActions {
  /** Applies a new model; `select` is an element to select after the next layout. */
  change: (next: FlowModel, select?: string) => void;
  /** Opens the label editor on the node or subgraph. */
  rename: (id: string) => void;
  /** Selects the edge and puts the cursor in its label field. */
  editEdgeLabel: (id: string) => void;
  fit: () => void;
  /** Opens the Classes panel. */
  openClasses: () => void;
  /** Opens the Palettes panel. */
  openPalette: () => void;
  /** "Go to code": what selects the element's line in the code editor, or null when the code does not name it. */
  goToCode?: (target: CodeTarget) => (() => void) | null;
}

/** The shapes the menu offers; the inspector has all of them. */
const MENU_SHAPES: Shape[] = ['rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'diamond', 'hexagon', 'lean-right', 'trapezoid', 'doc', 'cloud'];

const nameOf = (item: { id: string; label: string }): string => (item.label && item.label !== item.id ? `${item.label.replace(/<br\s*\/?>|\n/g, ' ')} (${item.id})` : item.id);

/** The menu for one target, or null if there is nothing to offer. */
export function menuFor(model: FlowModel, target: MenuTarget, readOnly: boolean, actions: MenuActions): { title: string; items: MenuItem[] } | null {
  const view = [action('Fit view', actions.fit)];
  if (target.kind === 'pane') return { title: 'Diagram', items: readOnly ? view : [...paneItems(model, actions), separator, ...view] };
  if (readOnly) return null;
  const menu = elementMenu(model, target, actions);
  if (!menu) return null;
  // First: where it is written.
  const go = actions.goToCode?.(target);
  return go ? { ...menu, items: [action('Go to code', go), separator, ...menu.items] } : menu;
}

function elementMenu(model: FlowModel, target: CodeTarget, actions: MenuActions): { title: string; items: MenuItem[] } | null {
  if (target.kind === 'node') {
    const node = model.nodes.find((n) => n.id === target.id);
    return node ? { title: nodeTitle(model, node), items: nodeItems(model, node, actions) } : null;
  }
  if (target.kind === 'subgraph') {
    const sub = model.subgraphs.find((s) => s.id === target.id);
    return sub ? { title: subgraphTitle(model, sub), items: subgraphItems(model, sub, actions) } : null;
  }
  const edge = model.edges.find((e) => e.id === target.id);
  return edge ? { title: edge.noteLink ? 'Note link' : `${edge.source} → ${edge.target}`, items: edgeItems(model, edge, actions) } : null;
}

function nodeTitle(model: FlowModel, node: FlowNode): string {
  if (node.state === 'start' || node.state === 'end') return `[*] ${node.state}`;
  if (node.note) return `Note for ${node.note.of}`;
  if (node.usecase) return `${node.usecase.kind === 'actor' ? 'Actor' : 'Use case'} ${nameOf(node)}`;
  if (model.kind === 'state') return `${node.state ? node.state[0].toUpperCase() + node.state.slice(1) : 'State'} ${node.id}`;
  return `Node ${nameOf(node)}`;
}

function subgraphTitle(model: FlowModel, sub: FlowSubgraph): string {
  if (sub.region) return `Region of ${sub.parent}`;
  if (model.kind === 'state') return `Composite state ${nameOf(sub)}`;
  if (model.kind === 'usecase') return `System boundary ${nameOf(sub)}`;
  if (model.kind === 'swimlane' && sub.parent === null) return `Lane ${nameOf(sub)}`;
  return `Subgraph ${nameOf(sub)}`;
}

/**
 * Whether an element can move to another parent (by the menu or by dragging it). Notes, `[*]`
 * states, regions, lanes and use case boundaries stay where they are.
 */
export function canMove(model: FlowModel, id: string): boolean {
  const node = model.nodes.find((n) => n.id === id);
  if (node) {
    if (node.note) return false;
    if (model.kind === 'state') return node.state !== 'start' && node.state !== 'end';
    if (model.kind === 'usecase') return node.usecase !== undefined;
    return true;
  }
  const sub = model.subgraphs.find((s) => s.id === id);
  if (!sub) return false;
  if (model.kind === 'state') return !sub.region;
  if (model.kind === 'usecase') return false;
  return !(model.kind === 'swimlane' && sub.parent === null);
}

/** Where an element can move: the top level (null) or a subgraph, with the rules of its kind of diagram. */
export function moveTargets(model: FlowModel, id: string): (string | null)[] {
  const exclude = model.subgraphs.some((s) => s.id === id) ? subgraphWithDescendants(model, id) : new Set<string>();
  // State diagrams: a composite with regions holds its states in the regions.
  const filter = (s: FlowSubgraph): boolean => model.kind !== 'state' || s.region === true || !model.subgraphs.some((r) => r.region && r.parent === s.id);
  // Alignment groups (Code from layout) are made from the drawing, not moved into.
  return [null, ...model.subgraphs.filter((s) => !exclude.has(s.id) && filter(s) && !isAlignGroup(s)).map((s) => s.id)];
}

/** Moves an element, with the right "Move to" choices for its kind of diagram. */
function moveItem(model: FlowModel, id: string, parent: string | null, actions: MenuActions): MenuItem {
  // Past alignment groups, which are not offered.
  const current = visibleParent(model, parent);
  const label = model.kind === 'swimlane' ? 'Move to lane' : model.kind === 'usecase' ? 'Move to boundary' : model.kind === 'state' ? 'Move into' : 'Move to subgraph';
  return submenu(
    label,
    moveTargets(model, id).map((parent) => {
      const sub = parent === null ? null : model.subgraphs.find((s) => s.id === parent)!;
      const text = sub === null ? 'Top level' : sub.region ? `Region of ${sub.parent}` : nameOf(sub);
      return action(text, () => actions.change(setParent(model, id, parent)), { checked: current === parent, disabled: current === parent });
    }),
  );
}

/**
 * "Class": the defined classes with their look; picking one makes it the element's only class,
 * as a drop from the dock does. Classes are made in the Classes and Palettes panels.
 */
function classItem(model: FlowModel, kind: 'node' | 'subgraph' | 'edge', item: { id: string; classes?: string[] }, actions: MenuActions): MenuItem {
  const defs = (model.classDefs ?? []).filter((d) => d.name !== 'default');
  const current = item.classes ?? [];
  const set = (classes: string[]): void => {
    if (classes.length === current.length && classes.every((c, i) => c === current[i])) return;
    const update = kind === 'edge' ? updateEdge : kind === 'subgraph' ? updateSubgraph : updateNode;
    actions.change(update(model, item.id, { classes }));
  };
  return submenu('Class', [
    action('No class', () => set([]), { checked: current.length === 0 }),
    separator,
    ...defs.map((d) => action(d.name, () => set([d.name]), { checked: current.includes(d.name), swatch: d.styles })),
    // Classes the element uses that no classDef defines.
    ...current.filter((c) => !defs.some((d) => d.name === c)).map((c) => action(c, () => set([c]), { checked: true, hint: 'no classDef' })),
    separator,
    action('Manage classes…', actions.openClasses),
    action('Palettes…', actions.openPalette),
  ]);
}

function deleteItem(label: string, run: () => void): MenuItem {
  return action(label, run, { danger: true, hint: 'Del' });
}

function nodeItems(model: FlowModel, node: FlowNode, actions: MenuActions): MenuItem[] {
  const remove = deleteItem(node.note ? 'Delete note' : 'Delete', () => actions.change(removeElements(model, [node.id], [])));
  if (node.note) return [action('Edit text', () => actions.rename(node.id), { hint: 'double-click' }), separator, remove];

  if (model.kind === 'state') {
    const pseudo = node.state === 'start' || node.state === 'end';
    const plain = !node.state;
    const items: MenuItem[] = [];
    if (plain) items.push(action('Rename', () => actions.rename(node.id), { hint: 'double-click' }));
    if (node.state !== 'end') {
      items.push(
        action('Add next state', () => {
          const id = nextNodeId(model);
          actions.change(connect(addNode(model, 'New state', 'round', node.parent), node.id, id), id);
        }),
      );
    }
    if (!pseudo) {
      items.push(
        submenu(
          'Type',
          STATE_KINDS.map((k) => action(k.title, () => actions.change(setStateKind(model, node.id, k.kind)), { checked: (node.state ?? 'state') === k.kind })),
        ),
      );
    }
    if (plain) items.push(action('Add note', () => actions.change(addNote(model, node.id))));
    if (!pseudo) items.push(moveItem(model, node.id, node.parent, actions), classItem(model, 'node', node, actions));
    return [...items, separator, remove];
  }

  if (model.kind === 'usecase' && node.usecase) {
    return [
      action('Rename', () => actions.rename(node.id), { hint: 'double-click' }),
      action(node.usecase.kind === 'actor' ? 'Add use case for this actor' : 'Add related use case', () => {
        const id = nextNodeId(model);
        const parent = node.usecase!.kind === 'usecase' ? node.parent : null;
        actions.change(connect(addUseCaseNode(model, 'usecase', parent, id), node.id, id), id);
      }),
      action('Add note', () => actions.change(addUseCaseNote(model, node.id))),
      moveItem(model, node.id, node.parent, actions),
      classItem(model, 'node', node, actions),
      separator,
      remove,
    ];
  }

  // Flowcharts and swimlanes.
  const labelled = node.asset !== undefined || SHAPE_INFO[node.shape].label !== 'none';
  return [
    action('Rename', () => actions.rename(node.id), { hint: 'double-click', disabled: !labelled }),
    action('Add connected node', () => {
      const id = nextNodeId(model);
      actions.change(connect(addNode(model, 'New node', 'rect', node.parent), node.id, id), id);
    }),
    action('Duplicate', () => {
      const copy = duplicateNode(model, node.id);
      actions.change(copy.model, copy.id);
    }),
    submenu(
      'Shape',
      node.asset
        ? []
        : [
            ...MENU_SHAPES.map((shape) => action(SHAPE_INFO[shape].title, () => actions.change(updateNode(model, node.id, { shape })), { checked: node.shape === shape })),
            ...(MENU_SHAPES.includes(node.shape) ? [] : [separator, action(SHAPE_INFO[node.shape].title, () => {}, { checked: true, disabled: true })]),
          ],
    ),
    moveItem(model, node.id, node.parent, actions),
    classItem(model, 'node', node, actions),
    separator,
    remove,
  ];
}

function subgraphItems(model: FlowModel, sub: FlowSubgraph, actions: MenuActions): MenuItem[] {
  const remove = deleteItem(sub.region ? 'Delete region (keep states)' : 'Delete (keep contents)', () => actions.change(removeElements(model, [sub.id], [])));
  if (model.kind === 'state') {
    const hasRegions = model.subgraphs.some((s) => s.region && s.parent === sub.id);
    const addInside = (): void => {
      const id = nextNodeId(model);
      actions.change(addNode(model, 'New state', 'round', sub.id), id);
    };
    return [
      ...(sub.region ? [] : [action('Rename', () => actions.rename(sub.id), { hint: 'double-click' })]),
      action('Add state inside', addInside, { disabled: hasRegions }),
      action('Add [*] start inside', () => actions.change(addPseudoState(model, sub.id, 'start')), { disabled: hasRegions || model.nodes.some((n) => n.parent === sub.id && n.state === 'start') }),
      action('Add [*] end inside', () => actions.change(addPseudoState(model, sub.id, 'end')), { disabled: hasRegions || model.nodes.some((n) => n.parent === sub.id && n.state === 'end') }),
      ...(sub.region
        ? []
        : [
            action('Add composite inside', () => actions.change(addSubgraph(model, 'Composite', sub.id), nextSubgraphId(model)), { disabled: hasRegions }),
            moveItem(model, sub.id, sub.parent, actions),
            classItem(model, 'subgraph', sub, actions),
          ]),
      separator,
      remove,
    ];
  }
  if (model.kind === 'usecase') {
    return [
      action('Rename', () => actions.rename(sub.id), { hint: 'double-click' }),
      action('Add use case inside', () => {
        const id = nextNodeId(model);
        actions.change(addUseCaseNode(model, 'usecase', sub.id, id), id);
      }),
      action('Package', () => actions.change({ ...model, subgraphs: model.subgraphs.map((s) => (s.id === sub.id ? withPackage(s, !s.package) : s)) }), { checked: sub.package === true }),
      classItem(model, 'subgraph', sub, actions),
      separator,
      remove,
    ];
  }
  const lane = model.kind === 'swimlane' && sub.parent === null;
  return [
    action('Rename', () => actions.rename(sub.id), { hint: 'double-click' }),
    action('Add node inside', () => {
      const id = nextNodeId(model);
      actions.change(addNode(model, 'New node', 'rect', sub.id), id);
    }),
    action('Add subgraph inside', () => actions.change(addSubgraph(model, 'Group', sub.id), nextSubgraphId(model))),
    ...(lane ? [] : [action(sub.view === 'collapsed' ? 'Expand' : 'Collapse', () => actions.change(updateSubgraph(model, sub.id, { view: sub.view === 'collapsed' ? undefined : 'collapsed' })))]),
    submenu('Direction inside', [
      action('Inherit', () => actions.change(updateSubgraph(model, sub.id, { direction: null })), { checked: sub.direction === null }),
      ...DIRECTIONS.map((d) => action(d, () => actions.change(updateSubgraph(model, sub.id, { direction: d })), { checked: sub.direction === d })),
    ]),
    ...(lane ? [] : [moveItem(model, sub.id, sub.parent, actions)]),
    classItem(model, 'subgraph', sub, actions),
    separator,
    remove,
  ];
}

function withPackage(s: FlowSubgraph, on: boolean): FlowSubgraph {
  if (on) return { ...s, package: true };
  const { package: _p, ...rest } = s;
  return rest;
}

function edgeItems(model: FlowModel, edge: FlowEdge, actions: MenuActions): MenuItem[] {
  const remove = deleteItem('Delete', () => actions.change(removeElements(model, [], [edge.id])));
  if (edge.noteLink) {
    const note = model.nodes.find((n) => n.note && (n.id === edge.source || n.id === edge.target));
    return note ? [deleteItem('Delete note', () => actions.change(removeElements(model, [note.id], [])))] : [];
  }
  const editLabel = action('Edit label', () => actions.editEdgeLabel(edge.id));
  const reverse = (allowed: boolean): MenuItem => action('Reverse direction', () => actions.change(reverseEdge(model, edge.id)), { disabled: !allowed });

  if (model.kind === 'state') return [editLabel, reverse(canTransition(model, edge.target, edge.source)), separator, remove];

  if (model.kind === 'usecase') {
    const relation = forwardRelation(edge.usecase?.relation ?? '-->');
    const allowed = allowedRelations(model, edge);
    const labelled = relation !== 'include' && relation !== 'extend' && relation !== 'generalization';
    return [
      ...(labelled ? [editLabel] : []),
      submenu(
        'Relation',
        USECASE_RELATIONS.filter((r) => allowed.includes(r.relation)).map((r) => action(r.title, () => actions.change(setRelation(model, edge.id, r.relation)), { checked: relation === r.relation })),
      ),
      reverse(canRelate(model, edge.target, edge.source)),
      separator,
      remove,
    ];
  }

  return [
    editLabel,
    reverse(true),
    submenu(
      'Stroke',
      STROKES.map((stroke) => action(stroke[0].toUpperCase() + stroke.slice(1), () => actions.change(updateEdge(model, edge.id, { stroke })), { checked: edge.stroke === stroke })),
    ),
    submenu(
      'End marker',
      EDGE_ENDS.map((end) => action(end === 'none' ? 'None' : end[0].toUpperCase() + end.slice(1), () => actions.change(updateEdge(model, edge.id, { end })), { checked: edge.end === end, disabled: edge.stroke === 'invisible' && end !== 'none' })),
      edge.stroke === 'invisible',
    ),
    action('Marker at both ends', () => actions.change(updateEdge(model, edge.id, { bothEnds: !edge.bothEnds })), { checked: edge.bothEnds, disabled: edge.end === 'none' || edge.stroke === 'invisible' }),
    classItem(model, 'edge', edge, actions),
    separator,
    remove,
  ];
}

function paneItems(model: FlowModel, actions: MenuActions): MenuItem[] {
  const direction = submenu(
    model.kind === 'swimlane' ? 'Lanes' : 'Direction',
    DIRECTIONS.map((d) => action(d, () => actions.change({ ...model, direction: d }), { checked: model.direction === d })),
  );
  if (model.kind === 'state') {
    return [
      action('Add state', () => {
        const id = nextNodeId(model);
        actions.change(addNode(model, 'New state', 'round', null), id);
      }),
      action('Add [*] start', () => actions.change(addPseudoState(model, null, 'start')), { disabled: model.nodes.some((n) => n.parent === null && n.state === 'start') }),
      action('Add [*] end', () => actions.change(addPseudoState(model, null, 'end')), { disabled: model.nodes.some((n) => n.parent === null && n.state === 'end') }),
      action('Add composite state', () => actions.change(addSubgraph(model, 'Composite', null), nextSubgraphId(model))),
      direction,
    ];
  }
  if (model.kind === 'usecase') {
    const add = (kind: 'actor' | 'usecase'): void => {
      const id = nextNodeId(model);
      actions.change(addUseCaseNode(model, kind, null, id), id);
    };
    return [
      action('Add actor', () => add('actor')),
      action('Add use case', () => add('usecase')),
      action('Add system boundary', () => actions.change(addSubgraph(model, 'System', null), nextSubgraphId(model))),
      direction,
    ];
  }
  return [
    action('Add node', () => {
      const id = nextNodeId(model);
      actions.change(addNode(model, 'New node', 'rect', null), id);
    }),
    action(model.kind === 'swimlane' ? 'Add lane' : 'Add subgraph', () => actions.change(addSubgraph(model, model.kind === 'swimlane' ? 'Lane' : 'Group', null), nextSubgraphId(model))),
    direction,
  ];
}
