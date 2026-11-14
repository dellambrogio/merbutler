/**
 * The Mermaid diagram types, by the id Mermaid's detector gives them (`diagram.type`), with the
 * keywords that start them and what this app can do with them.
 */

/** `canvas`: the visual editor edits it. `preview`: Mermaid draws it; edit it in the code. */
export type Support = 'canvas' | 'preview';

export interface DiagramType {
  /** Mermaid's ids for the type (its detector ids). */
  ids: readonly string[];
  name: string;
  /** Header keywords, the preferred one first. */
  keywords: readonly string[];
  /** Words that start statements or have a meaning in the body, for highlighting and completion. Empty for the canvas types (the flowchart mode knows them). */
  words: readonly string[];
  support: Support;
}

export const DIAGRAM_TYPES: readonly DiagramType[] = [
  { ids: ['flowchart-v2', 'flowchart', 'flowchart-elk'], name: 'Flowchart', keywords: ['flowchart', 'graph', 'flowchart-elk'], words: [], support: 'canvas' },
  { ids: ['swimlane'], name: 'Swimlane', keywords: ['swimlane-beta'], words: [], support: 'canvas' },
  { ids: ['sequence'], name: 'Sequence diagram', keywords: ['sequenceDiagram'], words: ['participant', 'actor', 'as', 'autonumber', 'activate', 'deactivate', 'note', 'Note', 'over', 'left', 'right', 'of', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'break', 'rect', 'end', 'box', 'create', 'destroy', 'title', 'link', 'links'], support: 'preview' },
  { ids: ['classDiagram', 'class'], name: 'Class diagram', keywords: ['classDiagram', 'classDiagram-v2'], words: ['class', 'namespace', 'note', 'for', 'direction', 'end', 'classDef', 'cssClass', 'style', 'callback', 'link', 'click', 'call', 'href'], support: 'preview' },
  { ids: ['stateDiagram', 'state'], name: 'State diagram', keywords: ['stateDiagram-v2', 'stateDiagram'], words: ['state', 'note', 'end', 'as', 'direction', 'classDef', 'class', 'style', 'left', 'right', 'of'], support: 'canvas' },
  { ids: ['er'], name: 'Entity relationship diagram', keywords: ['erDiagram'], words: ['title', 'direction', 'style', 'classDef', 'class', 'PK', 'FK', 'UK'], support: 'preview' },
  { ids: ['journey'], name: 'User journey', keywords: ['journey'], words: ['title', 'section'], support: 'preview' },
  { ids: ['gantt'], name: 'Gantt chart', keywords: ['gantt'], words: ['title', 'dateFormat', 'axisFormat', 'tickInterval', 'excludes', 'includes', 'weekday', 'weekend', 'todayMarker', 'section', 'done', 'active', 'crit', 'milestone', 'after', 'until', 'inclusiveEndDates', 'topAxis', 'displayMode', 'click', 'call', 'href', 'vert'], support: 'preview' },
  { ids: ['pie'], name: 'Pie chart', keywords: ['pie'], words: ['title', 'showData'], support: 'preview' },
  { ids: ['quadrantChart'], name: 'Quadrant chart', keywords: ['quadrantChart'], words: ['title', 'x-axis', 'y-axis', 'quadrant-1', 'quadrant-2', 'quadrant-3', 'quadrant-4', 'classDef'], support: 'preview' },
  { ids: ['requirement'], name: 'Requirement diagram', keywords: ['requirementDiagram'], words: ['requirement', 'functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint', 'element', 'id', 'text', 'risk', 'verifymethod', 'type', 'docRef', 'docref', 'contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces', 'direction', 'classDef', 'class', 'style'], support: 'preview' },
  { ids: ['gitGraph'], name: 'Git graph', keywords: ['gitGraph'], words: ['commit', 'branch', 'checkout', 'switch', 'merge', 'cherry-pick', 'id', 'tag', 'type', 'order', 'parent', 'NORMAL', 'REVERSE', 'HIGHLIGHT'], support: 'preview' },
  {
    ids: ['c4'],
    name: 'C4 diagram',
    keywords: ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'],
    words: ['title', 'Person', 'Person_Ext', 'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext', 'SystemQueue', 'SystemQueue_Ext', 'Container', 'Container_Ext', 'ContainerDb', 'ContainerDb_Ext', 'ContainerQueue', 'ContainerQueue_Ext', 'Component', 'Component_Ext', 'ComponentDb', 'ComponentDb_Ext', 'ComponentQueue', 'ComponentQueue_Ext', 'Boundary', 'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary', 'Node', 'Node_L', 'Node_R', 'Deployment_Node', 'Rel', 'BiRel', 'Rel_U', 'Rel_Up', 'Rel_D', 'Rel_Down', 'Rel_L', 'Rel_Left', 'Rel_R', 'Rel_Right', 'Rel_Back', 'RelIndex', 'UpdateElementStyle', 'UpdateRelStyle', 'UpdateBoundaryStyle', 'UpdateLayoutConfig'], support: 'preview',
  },
  { ids: ['mindmap'], name: 'Mindmap', keywords: ['mindmap'], words: ['root'], support: 'preview' },
  { ids: ['timeline'], name: 'Timeline', keywords: ['timeline'], words: ['title', 'section'], support: 'preview' },
  { ids: ['sankey'], name: 'Sankey diagram', keywords: ['sankey-beta', 'sankey'], words: [], support: 'preview' },
  { ids: ['xychart'], name: 'XY chart', keywords: ['xychart-beta', 'xychart'], words: ['title', 'x-axis', 'y-axis', 'bar', 'line', 'horizontal', 'vertical'], support: 'preview' },
  { ids: ['block'], name: 'Block diagram', keywords: ['block-beta', 'block'], words: ['columns', 'space', 'block', 'end', 'style', 'classDef', 'class'], support: 'preview' },
  { ids: ['packet'], name: 'Packet diagram', keywords: ['packet', 'packet-beta'], words: ['title'], support: 'preview' },
  { ids: ['kanban'], name: 'Kanban', keywords: ['kanban'], words: [], support: 'preview' },
  { ids: ['architecture'], name: 'Architecture diagram', keywords: ['architecture-beta'], words: ['group', 'service', 'junction', 'in'], support: 'preview' },
  { ids: ['radar'], name: 'Radar chart', keywords: ['radar-beta'], words: ['title', 'axis', 'curve', 'max', 'min', 'showLegend', 'ticks', 'graticule'], support: 'preview' },
  { ids: ['treemap'], name: 'Treemap', keywords: ['treemap-beta', 'treemap'], words: ['classDef'], support: 'preview' },
  { ids: ['treeView'], name: 'TreeView', keywords: ['treeView-beta'], words: [], support: 'preview' },
  { ids: ['usecase'], name: 'Use case diagram', keywords: ['usecase-beta'], words: ['actor', 'systemBoundary', 'end', 'note', 'for', 'direction', 'classDef', 'class', 'style', 'include', 'extend'], support: 'canvas' },
  { ids: ['ishikawa'], name: 'Ishikawa diagram', keywords: ['ishikawa-beta', 'ishikawa'], words: [], support: 'preview' },
  { ids: ['venn'], name: 'Venn diagram', keywords: ['venn-beta'], words: ['title', 'set', 'union', 'text', 'style'], support: 'preview' },
  { ids: ['eventmodeling'], name: 'Event modeling', keywords: ['eventmodeling'], words: ['tf', 'rf', 'data'], support: 'preview' },
  { ids: ['wardley'], name: 'Wardley map', keywords: ['wardley-beta'], words: ['title', 'component', 'anchor', 'evolve', 'evolution', 'pipeline', 'note', 'annotation', 'annotations', 'size', 'label', 'inertia', 'market', 'build', 'buy', 'outsource'], support: 'preview' },
  { ids: ['cynefin'], name: 'Cynefin framework', keywords: ['cynefin-beta'], words: ['title', 'complex', 'complicated', 'clear', 'chaotic', 'confusion'], support: 'preview' },
  { ids: ['railroad'], name: 'Railroad diagram', keywords: ['railroad-beta'], words: ['title', 'nonterminal', 'terminal', 'sequence', 'choice', 'optional', 'zeroOrMore', 'oneOrMore'], support: 'preview' },
  { ids: ['railroadEbnf'], name: 'Railroad diagram (EBNF)', keywords: ['railroad-ebnf-beta'], words: ['title'], support: 'preview' },
  { ids: ['railroadAbnf'], name: 'Railroad diagram (ABNF)', keywords: ['railroad-abnf-beta'], words: ['title'], support: 'preview' },
  { ids: ['railroadPeg'], name: 'Railroad diagram (PEG)', keywords: ['railroad-peg-beta'], words: ['title'], support: 'preview' },
  { ids: ['agentflow'], name: 'Agent flow', keywords: ['agentflow-beta'], words: [], support: 'preview' },
  { ids: ['info'], name: 'Info', keywords: ['info'], words: ['showInfo'], support: 'preview' },
];

const BY_ID = new Map(DIAGRAM_TYPES.flatMap((t) => t.ids.map((id) => [id, t] as const)));

/** The type with Mermaid's id, or a generic entry for an id this list does not know (a newer Mermaid). */
export function diagramType(id: string): DiagramType {
  return BY_ID.get(id) ?? { ids: [id], name: id, keywords: [], words: [], support: 'preview' };
}

/** Every header keyword, for completion. */
export const HEADER_KEYWORDS: readonly string[] = DIAGRAM_TYPES.flatMap((t) => t.keywords);

const KEYWORD_PATTERN = [...HEADER_KEYWORDS].sort((a, b) => b.length - a.length).map((k) => k.replace(/-/g, '\\-')).join('|');

/** A header line: a type keyword at the start, not followed by more of a word (`graph` but not `graphs`). */
export const HEADER_LINE = new RegExp(`^\\s*(${KEYWORD_PATTERN})(?![\\w-])`);

/** The type that a header keyword starts. */
export function typeOfKeyword(keyword: string): DiagramType | undefined {
  return DIAGRAM_TYPES.find((t) => t.keywords.includes(keyword));
}
