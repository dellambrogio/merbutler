/**
 * State diagrams (`stateDiagram-v2`) as a FlowModel with `kind: 'state'`, so the canvas edits them
 * like flowcharts: states are nodes, composite states are subgraphs (concurrency regions are
 * subgraphs inside them), transitions are edges, `[*]` is a start or end node per composite, and
 * notes are nodes linked to their state.
 *
 * Reads Mermaid's state DB (internal API, pinned like the flowchart DB in parse.ts): `getData()`
 * for what Mermaid draws (nodes, parents, edges) and the statement tree for what the code says.
 */
import { decodeEntities, scan, preambleOf, UnsupportedError } from '../core/mermaid';
import { canonicalOrder, sortClasses, type Direction, type FlowEdge, type FlowModel, type FlowNode, type FlowSubgraph, type StateKind } from '../core/model';
import type { Shape } from '../flowchart/shapes';

interface DataNode {
  id: string;
  shape: string;
  label?: string;
  parentId?: string;
  isGroup: boolean;
  position?: string;
}

interface DataEdge {
  start: string;
  end: string;
  label?: string;
}

interface StateRecord {
  id: string;
  descriptions?: string[];
  type?: string;
  classes?: string[];
  styles?: string[];
}

interface Stmt {
  stmt: string;
  id?: string;
  type?: string;
  value?: string;
  doc?: Stmt[];
  note?: { position: string; text: string };
}

interface MermaidStateDb {
  getData(): { nodes: DataNode[]; edges: DataEdge[] };
  getRootDocV2(): { id: string; doc: Stmt[] };
  getStates(): Map<string, StateRecord>;
  getClasses(): Map<string, { id: string; styles: string[] }>;
  getDirection(): string | undefined;
}

const INDENT = '  ';

/** The canvas shape that draws each kind of state. */
export const STATE_SHAPES: Record<StateKind | 'state', Shape> = {
  state: 'round',
  start: 'sm-circ',
  end: 'fr-circ',
  choice: 'diamond',
  fork: 'fork',
  join: 'fork',
  note: 'rect',
};

/** Kinds of state that the inspector can choose for a state (start, end and notes are their own). */
export const STATE_KINDS: ReadonlyArray<{ kind: StateKind | 'state'; title: string }> = [
  { kind: 'state', title: 'State' },
  { kind: 'choice', title: 'Choice <<choice>>' },
  { kind: 'fork', title: 'Fork <<fork>>' },
  { kind: 'join', title: 'Join <<join>>' },
];

function unsupported(what: string): never {
  throw new UnsupportedError(`Not supported by the visual editor: ${what}`);
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };

/** Mermaid escapes the labels it draws. */
function unescapeHtml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** The id of the `[*]` start or end node of a composite state (or `root` for the top level). */
export function pseudoId(scope: string | null, kind: 'start' | 'end'): string {
  return `${scope ?? 'root'}_${kind}`;
}

/** Explicit `direction` statements of composite states, by id. */
function compositeDirections(doc: Stmt[], out = new Map<string, Direction>()): Map<string, Direction> {
  for (const s of doc) {
    if (s.stmt === 'state' && s.doc) {
      const dir = s.doc.find((d) => d.stmt === 'dir')?.value;
      if (dir && s.id && s.type !== 'divider') out.set(s.id, DIRECTIONS[dir] ?? unsupported(`direction "${dir}"`));
      compositeDirections(s.doc, out);
    }
  }
  return out;
}

const KNOWN_STATEMENTS = new Set(['state', 'relation', 'classDef', 'applyClass', 'style', 'dir']);

function checkStatements(doc: Stmt[]): void {
  for (const s of doc) {
    // A floating note (`note "…" as N`) has no statement type.
    if (!KNOWN_STATEMENTS.has(s.stmt)) unsupported(s.stmt ? `"${s.stmt}" in a state diagram` : 'a floating note (note "…" as id)');
    if (s.doc) checkStatements(s.doc);
  }
}

/** Reads a state diagram from Mermaid's state DB. Throws UnsupportedError for what the canvas cannot keep. */
export function stateModel(rawDb: unknown, text: string): FlowModel {
  const db = rawDb as MermaidStateDb;
  const root = db.getRootDocV2();
  checkStatements(root.doc);
  const data = db.getData();
  const records = db.getStates();
  const dataById = new Map(data.nodes.map((n) => [n.id, n]));

  // Regions get stable ids: `<composite>__r<n>`. Mermaid's are random.
  const rename = new Map<string, string>();
  const regionCount = new Map<string, number>();
  for (const n of data.nodes) {
    if (n.shape !== 'divider') continue;
    const parent = n.parentId ?? unsupported('a concurrency region outside a composite state');
    const k = (regionCount.get(parent) ?? 0) + 1;
    regionCount.set(parent, k);
    rename.set(n.id, `${parent}__r${k}`);
  }
  const idOf = (raw: string): string => {
    if (rename.has(raw)) return rename.get(raw)!;
    const pseudo = /^(.*)_(start|end)$/.exec(raw);
    if (pseudo && rename.has(pseudo[1])) return `${rename.get(pseudo[1])}_${pseudo[2]}`;
    return raw;
  };
  const parentOf = (n: DataNode): string | null => (n.parentId ? idOf(n.parentId) : null);

  const nodes: FlowNode[] = [];
  const subgraphs: FlowSubgraph[] = [];
  const directions = compositeDirections(root.doc);
  const styled = <T extends FlowNode | FlowSubgraph>(item: T, record: StateRecord | undefined): T => {
    const classes = [...new Set(record?.classes ?? [])].filter((c) => c !== 'default');
    const styles = (record?.styles ?? []).map((s) => s.trim()).filter((s) => s !== '');
    if (classes.length > 0) item.classes = classes;
    if (styles.length > 0) item.styles = styles;
    return item;
  };

  for (const n of data.nodes) {
    const id = idOf(n.id);
    const parent = parentOf(n);
    const record = records.get(n.id);
    switch (n.shape) {
      case 'stateStart':
      case 'stateEnd': {
        const kind = n.shape === 'stateStart' ? 'start' : 'end';
        nodes.push({ id: pseudoId(parent, kind), label: '', shape: STATE_SHAPES[kind], markdown: false, parent, state: kind });
        break;
      }
      case 'choice':
      case 'fork':
      case 'join':
        nodes.push(styled({ id, label: id, shape: STATE_SHAPES[n.shape], markdown: false, parent, state: n.shape }, record));
        break;
      case 'rect':
      case 'rectWithTitle': {
        const [label, ...rest] = (record?.descriptions ?? []).map((d) => decodeEntities(d));
        const node: FlowNode = { id, label: label ?? id, shape: STATE_SHAPES.state, markdown: false, parent };
        if (rest.length > 0) node.descriptions = rest;
        nodes.push(styled(node, record));
        break;
      }
      case 'roundedWithTitle': {
        const descriptions = (record?.descriptions ?? []).map((d) => decodeEntities(d));
        if (descriptions.length > 1) unsupported(`more than one description on composite state ${id}`);
        subgraphs.push(styled({ id, label: descriptions[0] ?? id, markdown: false, parent, direction: directions.get(id) ?? null }, record));
        break;
      }
      case 'divider':
        subgraphs.push({ id, label: '', markdown: false, parent, direction: null, region: true });
        break;
      case 'noteGroup':
        break;
      case 'note': {
        // `<state>----note-<n>`, inside a note group next to the state.
        const of = /^(.*)----note-\d+$/.exec(n.id)?.[1];
        const target = of ? dataById.get(of) : undefined;
        if (!of || !target) unsupported(`note ${n.id} that is not next to a state`);
        const position = n.position === 'left of' ? 'left of' : 'right of';
        const count = nodes.filter((x) => x.note?.of === idOf(of)).length + 1;
        nodes.push({
          id: `${idOf(of)}__note${count}`,
          label: unescapeHtml(n.label ?? '').split('\n').map((l) => l.trim()).join('\n'),
          shape: STATE_SHAPES.note,
          markdown: false,
          parent: parentOf(target),
          state: 'note',
          note: { position, of: idOf(of) },
        });
        break;
      }
      default:
        unsupported(`state shape "${n.shape}" (state ${id})`);
    }
  }

  const edges: FlowEdge[] = [];
  const isNote = (raw: string): boolean => dataById.get(raw)?.shape === 'note';
  for (const e of data.edges) {
    if (isNote(e.start) || isNote(e.end)) continue;
    edges.push({
      id: `e${edges.length + 1}`,
      source: idOf(e.start),
      target: idOf(e.end),
      label: unescapeHtml(e.label ?? ''),
      markdown: false,
      stroke: 'normal',
      end: 'arrow',
      bothEnds: false,
    });
  }
  for (const note of nodes.filter((n) => n.note)) edges.push(noteLink(note));

  const direction = DIRECTIONS[db.getDirection() ?? 'TB'] ?? unsupported(`direction "${db.getDirection()}"`);
  const model: FlowModel = { kind: 'state', direction, nodes, subgraphs, edges };
  const classDefs = [...db.getClasses().values()].map((c) => ({ name: c.id, styles: c.styles.map((s) => s.trim()).filter((s) => s !== '') }));
  if (classDefs.length > 0) model.classDefs = classDefs;
  for (const item of [...nodes, ...subgraphs]) if (item.classes) item.classes = sortClasses(item.classes, classDefs);
  const preamble = preambleOf(text);
  if (preamble) model.preamble = preamble;
  // Comments are kept, at the end of the diagram.
  const comments = scan(text.slice(preamble.length)).flatMap((item) => (item.kind === 'comment' && !item.text.startsWith('%%{') ? [item.text] : []));
  if (comments.length > 0) model.endComments = comments;
  const ordered = canonicalOrder(model);
  // Transitions in the order the writer puts them, so a canvas edit does not reorder them.
  const order = new Map(writerEdgeOrder(ordered).map((e, i) => [e, i]));
  const sorted = [...ordered.edges].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  let n = 0;
  return { ...ordered, edges: sorted.map((e) => (e.noteLink ? e : { ...e, id: `e${++n}` })) };
}

/** The transitions in the order serializeState writes them: per scope, inner composites first. */
function writerEdgeOrder(model: FlowModel): FlowEdge[] {
  const byScope = new Map<string | null, FlowEdge[]>();
  for (const e of model.edges) {
    if (e.noteLink) continue;
    const scope = edgeScope(model, e);
    byScope.set(scope, [...(byScope.get(scope) ?? []), e]);
  }
  const out: FlowEdge[] = [];
  const walk = (scope: string | null): void => {
    for (const sub of model.subgraphs.filter((s) => s.parent === scope)) walk(sub.id);
    out.push(...(byScope.get(scope) ?? []));
  };
  walk(null);
  return out;
}

/** The dotted line between a note and its state. */
export function noteLink(note: FlowNode): FlowEdge {
  const of = note.note!.of;
  const left = note.note!.position === 'left of';
  return {
    id: `${note.id}__link`,
    source: left ? note.id : of,
    target: left ? of : note.id,
    label: '',
    markdown: false,
    stroke: 'dotted',
    end: 'none',
    bothEnds: false,
    noteLink: true,
  };
}

/** The scope (composite, region, or null) that holds a node or subgraph. */
function scopeOf(model: FlowModel, id: string): string | null {
  return model.nodes.find((n) => n.id === id)?.parent ?? model.subgraphs.find((s) => s.id === id)?.parent ?? null;
}

/** The innermost scope that contains both ends of a transition: the transition is written there. */
function edgeScope(model: FlowModel, edge: FlowEdge): string | null {
  const chain = (id: string): Array<string | null> => {
    const out: Array<string | null> = [];
    for (let p = scopeOf(model, id); p !== null; p = scopeOf(model, p)) out.push(p);
    out.push(null);
    return out;
  };
  const up = chain(edge.source);
  const down = new Set(chain(edge.target));
  // A transition to or from a composite state itself belongs next to the composite, not inside it.
  return up.find((s) => down.has(s) && s !== edge.source && s !== edge.target) ?? null;
}

/** A label in `state "…" as id`. Quotes cannot be escaped there. */
const quotable = (label: string): boolean => !label.includes('"') && !label.includes('\n');

/** Writes a state diagram model as Mermaid code. */
export function serializeState(model: FlowModel): string {
  const lines = model.preamble ? [model.preamble] : [];
  lines.push('stateDiagram-v2');
  if (model.direction !== 'TB') lines.push(`${INDENT}direction ${model.direction}`);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const endpoint = (id: string): string => {
    const kind = nodeById.get(id)?.state;
    return kind === 'start' || kind === 'end' ? '[*]' : id;
  };
  const edgesByScope = new Map<string | null, FlowEdge[]>();
  for (const e of model.edges) {
    if (e.noteLink) continue;
    const scope = edgeScope(model, e);
    edgesByScope.set(scope, [...(edgesByScope.get(scope) ?? []), e]);
  }

  const writeScope = (scope: string | null, depth: number): void => {
    const pad = INDENT.repeat(depth);
    const scopeEdges = edgesByScope.get(scope) ?? [];
    const mentioned = new Set(scopeEdges.flatMap((e) => [e.source, e.target]));
    for (const node of model.nodes.filter((n) => n.parent === scope)) {
      if (node.state === 'start' || node.state === 'end' || node.state === 'note') continue;
      if (node.state === 'choice' || node.state === 'fork' || node.state === 'join') {
        lines.push(`${pad}state ${node.id} <<${node.state}>>`);
      } else if (node.label !== node.id && quotable(node.label)) {
        lines.push(`${pad}state "${node.label}" as ${node.id}`);
      } else if (node.label !== node.id) {
        // A label with quotes or line breaks: one description line per line.
        for (const line of node.label.split('\n')) lines.push(`${pad}${node.id} : ${line}`);
      } else if ((node.descriptions ?? []).length === 0 && (depth > 1 || !mentioned.has(node.id))) {
        // A bare declaration: a state without transitions, or one inside a composite (Mermaid puts a
        // state in the composite that mentions it).
        lines.push(`${pad}${node.id}`);
      }
      for (const d of node.descriptions ?? []) lines.push(`${pad}${node.id} : ${d}`);
    }
    for (const sub of model.subgraphs.filter((s) => s.parent === scope && !s.region)) {
      const header = sub.label !== sub.id && quotable(sub.label) ? `state "${sub.label}" as ${sub.id}` : `state ${sub.id}`;
      lines.push(`${pad}${header} {`);
      if (sub.direction) lines.push(`${pad}${INDENT}direction ${sub.direction}`);
      const regions = model.subgraphs.filter((s) => s.parent === sub.id && s.region);
      if (regions.length > 0) {
        regions.forEach((region, i) => {
          if (i > 0) lines.push(`${pad}${INDENT}--`);
          writeScope(region.id, depth + 1);
        });
      } else {
        writeScope(sub.id, depth + 1);
      }
      lines.push(`${pad}}`);
    }
    for (const e of scopeEdges) {
      const label = e.label.trim() === '' ? '' : ` : ${e.label.replace(/\n/g, ' ')}`;
      lines.push(`${pad}${endpoint(e.source)} --> ${endpoint(e.target)}${label}`);
    }
    for (const note of model.nodes.filter((n) => n.parent === scope && n.note)) {
      lines.push(`${pad}note ${note.note!.position} ${note.note!.of}`);
      for (const line of note.label.split('\n')) lines.push(`${pad}${INDENT}${line}`);
      lines.push(`${pad}end note`);
    }
  };
  writeScope(null, 1);

  for (const c of model.classDefs ?? []) lines.push(`${INDENT}classDef ${c.name} ${c.styles.join(',')}`);
  const byClass = new Map<string, string[]>();
  for (const item of [...model.nodes, ...model.subgraphs]) {
    for (const c of item.classes ?? []) byClass.set(c, [...(byClass.get(c) ?? []), item.id]);
  }
  for (const [name, ids] of byClass) lines.push(`${INDENT}class ${ids.join(',')} ${name}`);
  for (const item of [...model.nodes, ...model.subgraphs]) {
    if (item.styles?.length) lines.push(`${INDENT}style ${item.id} ${item.styles.join(',')}`);
  }
  for (const comment of model.endComments ?? []) lines.push(`${INDENT}${comment}`);
  return `${lines.join('\n')}\n`;
}

/** The kind written for a state's type in the inspector. */
export function setStateKind(model: FlowModel, id: string, kind: StateKind | 'state'): FlowModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      if (n.id !== id) return n;
      const { state: _old, ...rest } = n;
      return kind === 'state' ? { ...rest, shape: STATE_SHAPES.state } : { ...rest, state: kind, shape: STATE_SHAPES[kind] };
    }),
  };
}

/** Adds the `[*]` start or end node of a scope, if it has none. */
export function addPseudoState(model: FlowModel, scope: string | null, kind: 'start' | 'end'): FlowModel {
  const id = pseudoId(scope, kind);
  if (model.nodes.some((n) => n.id === id)) return model;
  return { ...model, nodes: [...model.nodes, { id, label: '', shape: STATE_SHAPES[kind], markdown: false, parent: scope, state: kind }] };
}

/** Adds a note next to a state. */
export function addNote(model: FlowModel, of: string, position: 'left of' | 'right of' = 'right of'): FlowModel {
  const state = model.nodes.find((n) => n.id === of);
  if (!state || state.state) return model;
  let k = 1;
  while (model.nodes.some((n) => n.id === `${of}__note${k}`)) k++;
  const note: FlowNode = { id: `${of}__note${k}`, label: 'Note', shape: STATE_SHAPES.note, markdown: false, parent: state.parent, state: 'note', note: { position, of } };
  return { ...model, nodes: [...model.nodes, note], edges: [...model.edges, noteLink(note)] };
}

/**
 * True if a transition can go from `source` to `target`: `[*]` starts only leave and ends only
 * arrive, and notes have no transitions.
 */
export function canTransition(model: FlowModel, source: string, target: string): boolean {
  const kind = (id: string): StateKind | undefined => model.nodes.find((n) => n.id === id)?.state;
  if (kind(source) === 'end' || kind(target) === 'start' || kind(source) === 'note' || kind(target) === 'note') return false;
  return !model.subgraphs.some((s) => s.region && (s.id === source || s.id === target));
}
