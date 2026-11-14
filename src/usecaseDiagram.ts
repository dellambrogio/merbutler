/**
 * Use case diagrams (`usecase-beta`) as a FlowModel with `kind: 'usecase'`: actors and use cases
 * are nodes, system boundaries are subgraphs, relationships are edges, and `note for` notes are
 * nodes linked to their element, as in state diagrams.
 *
 * Reads Mermaid's use case DB (internal API, pinned like the other DBs): its actors, use cases,
 * boundaries, relationships and notes. What the canvas cannot keep (JSON nodes, edge ids and
 * animation, edge classes) throws UnsupportedError, so the app shows the preview instead.
 */
import { preambleOf, scan, UnsupportedError } from './parse';
import { canonicalOrder, sortClasses, type Direction, type EdgeEnd, type FlowEdge, type FlowModel, type FlowNode, type FlowSubgraph, type Stroke, type UseCaseNode, type UseCaseRelation } from './model';
import { noteLink } from './stateDiagram';
import type { Shape } from './shapes';

interface UcActor {
  id: string;
  label: string;
  type: 'normal' | 'hollow' | 'awesome' | 'icon';
  icon?: string;
  business: boolean;
  stereotype?: string;
  parentId?: string;
  classes: string[];
  styles: string[];
}

interface UcUseCase {
  id: string;
  label: string;
  shape: 'ellipse' | 'rect';
  business: boolean;
  stereotype?: string;
  parentId?: string;
  classes: string[];
  styles: string[];
}

interface UcBoundary {
  id: string;
  label: string;
  type: 'rect' | 'package';
  members: string[];
  classes: string[];
  styles: string[];
}

interface UcRelationship {
  id: string;
  explicitId: boolean;
  source: string;
  target: string;
  type: 'association' | 'include' | 'extend' | 'generalization';
  arrowType: number;
  label?: string;
  minlen: number;
  classes: string[];
  styles: string[];
  animate: boolean;
}

interface UcDb {
  getActors(): ReadonlyMap<string, UcActor>;
  getUseCases(): ReadonlyMap<string, UcUseCase>;
  getSystemBoundaries(): ReadonlyMap<string, UcBoundary>;
  getRelationships(): readonly UcRelationship[];
  getNotes(): ReadonlyMap<string, { id: string; target: string; label: string }>;
  getJsonNodes(): ReadonlyMap<string, unknown>;
  getClassDefs(): ReadonlyMap<string, { id: string; styles: string[] }>;
  getDirection(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

const INDENT = '  ';

/** Mermaid's ARROW_TYPE values, by how the association is written. */
const ARROWS: Record<number, UseCaseRelation> = { 0: '-->', 1: '<--', 2: '--', 3: '--o', 4: '--x', 5: 'o--', 6: 'x--' };

/** Relations written from the target to the source (`B <-- A`). The model keeps the arrow pointing at `target`. */
const BACKWARD = new Set<UseCaseRelation>(['<--', 'o--', 'x--']);

export const USECASE_RELATIONS: ReadonlyArray<{ relation: UseCaseRelation; title: string }> = [
  { relation: '-->', title: 'Association -->' },
  { relation: '--', title: 'Association --' },
  { relation: '--o', title: 'Association --o' },
  { relation: '--x', title: 'Association --x' },
  { relation: 'include', title: 'Include ..>:include' },
  { relation: 'extend', title: 'Extend ..>:extend' },
  { relation: 'generalization', title: 'Generalization --|>' },
];

/**
 * The forward form of a backward relation (`<--` is `-->`): the model already keeps the arrow
 * pointing at the edge's target, so both mean the same edge.
 */
export function forwardRelation(relation: UseCaseRelation): UseCaseRelation {
  return relation === '<--' ? '-->' : relation === 'o--' ? '--o' : relation === 'x--' ? '--x' : relation;
}

/** How the canvas draws a relationship. */
export function relationLook(relation: UseCaseRelation): { stroke: Stroke; end: EdgeEnd; bothEnds: boolean } {
  switch (relation) {
    case '--':
      return { stroke: 'normal', end: 'none', bothEnds: false };
    case '--o':
    case 'o--':
      return { stroke: 'normal', end: 'circle', bothEnds: false };
    case '--x':
    case 'x--':
      return { stroke: 'normal', end: 'cross', bothEnds: false };
    case 'include':
    case 'extend':
      return { stroke: 'dotted', end: 'arrow', bothEnds: false };
    default:
      return { stroke: 'normal', end: 'arrow', bothEnds: false };
  }
}

export const ACTOR_SHAPE: Shape = 'person';
export const USECASE_SHAPE: Shape = 'stadium';

function unsupported(what: string): never {
  throw new UnsupportedError(`Not supported by the visual editor: ${what}`);
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };

const styled = <T extends FlowNode | FlowSubgraph>(item: T, classes: string[], styles: string[]): T => {
  const c = [...new Set(classes)].filter((x) => x !== 'default');
  const s = styles.map((x) => x.trim()).filter((x) => x !== '');
  if (c.length > 0) item.classes = c;
  if (s.length > 0) item.styles = s;
  return item;
};

/** Reads a use case diagram from Mermaid's use case DB. */
export function usecaseModel(rawDb: unknown, text: string): FlowModel {
  const db = rawDb as UcDb;
  if (db.getJsonNodes().size > 0) unsupported('json nodes in a use case diagram');
  if (db.getAccTitle() || db.getAccDescription()) unsupported('accTitle or accDescr in a use case diagram');

  const nodes: FlowNode[] = [];
  for (const a of db.getActors().values()) {
    const usecase: UseCaseNode = { kind: 'actor' };
    if (a.type === 'hollow' || a.type === 'awesome') usecase.actorType = a.type;
    if (a.icon) usecase.icon = a.icon;
    if (a.business) usecase.business = true;
    if (a.stereotype) usecase.stereotype = a.stereotype;
    nodes.push(styled({ id: a.id, label: a.label, shape: ACTOR_SHAPE, markdown: false, parent: a.parentId ?? null, usecase }, a.classes, a.styles));
  }
  for (const u of db.getUseCases().values()) {
    const usecase: UseCaseNode = { kind: 'usecase' };
    if (u.shape === 'rect') usecase.rect = true;
    if (u.business) usecase.business = true;
    if (u.stereotype) usecase.stereotype = u.stereotype;
    nodes.push(styled({ id: u.id, label: u.label, shape: u.shape === 'rect' ? 'rect' : USECASE_SHAPE, markdown: false, parent: u.parentId ?? null, usecase }, u.classes, u.styles));
  }
  const subgraphs: FlowSubgraph[] = [];
  for (const b of db.getSystemBoundaries().values()) {
    const sub: FlowSubgraph = { id: b.id, label: b.label, markdown: false, parent: null, direction: null };
    if (b.type === 'package') sub.package = true;
    subgraphs.push(styled(sub, b.classes, b.styles));
  }

  const edges: FlowEdge[] = [];
  for (const r of db.getRelationships()) {
    const where = `${r.source} -> ${r.target}`;
    if (r.explicitId) unsupported(`an edge id (${where})`);
    if (r.animate) unsupported(`edge animation (${where})`);
    if (r.classes.filter((c) => c !== 'default').length > 0 || r.styles.length > 0) unsupported(`a style on an edge (${where})`);
    const relation: UseCaseRelation = r.type === 'association' ? (ARROWS[r.arrowType] ?? unsupported(`arrow type ${r.arrowType}`)) : r.type;
    const backward = BACKWARD.has(relation);
    const edge: FlowEdge = {
      id: `e${edges.length + 1}`,
      source: backward ? r.target : r.source,
      target: backward ? r.source : r.target,
      label: r.label ?? '',
      markdown: false,
      ...relationLook(relation),
      usecase: { relation },
    };
    if (r.minlen > 1) {
      if (relation !== '-->' && relation !== '--') unsupported(`a longer ${relation} (${where})`);
      edge.length = r.minlen;
    }
    edges.push(edge);
  }

  for (const n of db.getNotes().values()) {
    const target = nodes.find((x) => x.id === n.target);
    if (!target) unsupported(`a note for ${n.target}, which is not an actor or a use case`);
    const count = nodes.filter((x) => x.note?.of === n.target).length + 1;
    const note: FlowNode = { id: `${n.target}__note${count}`, label: n.label, shape: 'rect', markdown: false, parent: target.parent, state: 'note', note: { position: 'right of', of: n.target } };
    nodes.push(note);
    edges.push(noteLink(note));
  }

  const direction = DIRECTIONS[db.getDirection()] ?? unsupported(`direction "${db.getDirection()}"`);
  const model: FlowModel = { kind: 'usecase', direction, nodes, subgraphs, edges };
  const classDefs = [...db.getClassDefs().values()].map((c) => ({ name: c.id, styles: c.styles.map((s) => s.trim()).filter((s) => s !== '') }));
  if (classDefs.length > 0) model.classDefs = classDefs;
  for (const item of [...nodes, ...subgraphs]) if (item.classes) item.classes = sortClasses(item.classes, classDefs);
  const preamble = preambleOf(text);
  if (preamble) model.preamble = preamble;
  const comments = scan(text.slice(preamble.length)).flatMap((item) => (item.kind === 'comment' && !item.text.startsWith('%%{') ? [item.text] : []));
  if (comments.length > 0) model.endComments = comments;
  return canonicalOrder(model);
}

/** A label in `("…")`: quotes cannot be escaped there. */
const quoted = (label: string): string => `"${label.replace(/"/g, "'").replace(/\n/g, ' ')}"`;

/** `id("Label")@{ … } <<stereotype>>` for an actor or a use case, without the `actor` keyword. */
function declaration(node: FlowNode): string {
  const uc = node.usecase!;
  const label = uc.kind === 'usecase' && uc.rect ? `[${quoted(node.label)}]` : `(${quoted(node.label)})`;
  const meta: string[] = [];
  if (uc.kind === 'actor' && uc.icon) meta.push(`icon: ${quoted(uc.icon)}`);
  else if (uc.kind === 'actor' && uc.actorType) meta.push(`type: ${uc.actorType}`);
  if (uc.business) meta.push('business: true');
  return `${node.id}${label}${meta.length > 0 ? `@{ ${meta.join(', ')} }` : ''}${uc.stereotype ? ` <<${uc.stereotype}>>` : ''}`;
}

/** The written relation between two ids, with an optional label. */
function relationLine(source: string, relation: UseCaseRelation, target: string, label: string, length: number): string {
  const l = label.trim() === '' ? '' : quoted(label.trim());
  const dashes = '-'.repeat(Math.max(2, length + 1));
  switch (relation) {
    case 'include':
    case 'extend':
      return `${source} ..>:${relation} ${target}`;
    case 'generalization':
      return `${source} --|> ${target}`;
    case '-->':
      return l ? `${source} -- ${l} --> ${target}` : `${source} ${dashes}> ${target}`;
    case '--':
      return l ? `${source} -- ${l} -- ${target}` : `${source} ${dashes} ${target}`;
    case '--o':
    case '--x':
      return l ? `${source} -- ${l} ${relation} ${target}` : `${source} ${relation} ${target}`;
    case '<--':
    case 'o--':
    case 'x--':
      return l ? `${source} ${relation} ${l} -- ${target}` : `${source} ${relation} ${target}`;
  }
}

/** Writes a use case diagram model as Mermaid code. */
export function serializeUsecase(model: FlowModel): string {
  const lines = model.preamble ? [model.preamble] : [];
  lines.push('usecase-beta');
  // LR is the default direction of a use case diagram.
  if (model.direction !== 'LR') lines.push(`direction ${model.direction}`);
  const elements = model.nodes.filter((n) => n.usecase);
  const write = (node: FlowNode, pad: string): void => {
    lines.push(`${pad}${node.usecase!.kind === 'actor' ? 'actor ' : ''}${declaration(node)}`);
  };
  for (const node of elements.filter((n) => n.parent === null && n.usecase!.kind === 'actor')) write(node, '');
  for (const sub of model.subgraphs) {
    lines.push(`systemBoundary ${sub.id}(${quoted(sub.label)})${sub.package ? '@{ type: package }' : ''}`);
    for (const node of elements.filter((n) => n.parent === sub.id)) write(node, INDENT);
    lines.push('end');
  }
  for (const node of elements.filter((n) => n.parent === null && n.usecase!.kind === 'usecase')) write(node, '');
  for (const e of model.edges) {
    if (e.noteLink) continue;
    const relation = e.usecase?.relation ?? '-->';
    const [from, to] = BACKWARD.has(relation) ? [e.target, e.source] : [e.source, e.target];
    lines.push(relationLine(from, relation, to, e.label, e.length ?? 1));
  }
  for (const note of model.nodes.filter((n) => n.note)) lines.push(`note for ${note.note!.of} ${quoted(note.label)}`);
  for (const c of model.classDefs ?? []) lines.push(`classDef ${c.name} ${c.styles.join(',')}`);
  const byClass = new Map<string, string[]>();
  for (const item of [...model.nodes, ...model.subgraphs]) for (const c of item.classes ?? []) byClass.set(c, [...(byClass.get(c) ?? []), item.id]);
  for (const [name, ids] of byClass) lines.push(`class ${ids.join(',')} ${name}`);
  for (const item of [...model.nodes, ...model.subgraphs]) if (item.styles?.length) lines.push(`style ${item.id} ${item.styles.join(',')}`);
  for (const comment of model.endComments ?? []) lines.push(comment);
  return `${lines.join('\n')}\n`;
}

/** Adds an actor (top level) or a use case (in `parent`). */
export function addUseCaseNode(model: FlowModel, kind: 'actor' | 'usecase', parent: string | null, id: string): FlowModel {
  const node: FlowNode =
    kind === 'actor'
      ? { id, label: 'Actor', shape: ACTOR_SHAPE, markdown: false, parent: null, usecase: { kind: 'actor' } }
      : { id, label: 'Use case', shape: USECASE_SHAPE, markdown: false, parent, usecase: { kind: 'usecase' } };
  return { ...model, nodes: [...model.nodes, node] };
}

/** Changes an actor's or a use case's settings. The shape follows. */
export function setUseCaseNode(model: FlowModel, id: string, patch: Partial<UseCaseNode>): FlowModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      if (n.id !== id || !n.usecase) return n;
      const usecase: UseCaseNode = { ...n.usecase, ...patch };
      for (const key of Object.keys(usecase) as Array<keyof UseCaseNode>) if (usecase[key] === undefined || usecase[key] === false || usecase[key] === '') delete usecase[key];
      // A business use case is an ellipse; an icon replaces the actor type.
      if (usecase.rect) delete usecase.business;
      if (usecase.icon) delete usecase.actorType;
      const shape = usecase.kind === 'actor' ? ACTOR_SHAPE : usecase.rect ? 'rect' : USECASE_SHAPE;
      return { ...n, usecase, shape };
    }),
  };
}

/**
 * The relations Mermaid accepts between an edge's ends: include and extend join two use cases,
 * generalization joins two actors or two use cases.
 */
export function allowedRelations(model: FlowModel, edge: FlowEdge): UseCaseRelation[] {
  const kind = (id: string): string | undefined => model.nodes.find((n) => n.id === id)?.usecase?.kind;
  const [a, b] = [kind(edge.source), kind(edge.target)];
  return USECASE_RELATIONS.map((r) => r.relation).filter((r) => {
    if (r === 'include' || r === 'extend') return a === 'usecase' && b === 'usecase';
    if (r === 'generalization') return a !== undefined && a === b;
    return true;
  });
}

/** Changes a relationship's kind; the drawing follows. A relation Mermaid does not accept between the ends is ignored. */
export function setRelation(model: FlowModel, id: string, relation: UseCaseRelation): FlowModel {
  const edge = model.edges.find((e) => e.id === id);
  if (!edge || !allowedRelations(model, edge).includes(relation)) return model;
  return {
    ...model,
    edges: model.edges.map((e) => {
      if (e.id !== id) return e;
      const next: FlowEdge = { ...e, ...relationLook(relation), usecase: { relation } };
      // Include, extend and generalization have no label or length.
      if (relation === 'include' || relation === 'extend' || relation === 'generalization') {
        next.label = '';
        delete next.length;
      }
      return next;
    }),
  };
}

/** Adds a note for an actor or a use case. */
export function addUseCaseNote(model: FlowModel, of: string): FlowModel {
  const target = model.nodes.find((n) => n.id === of && n.usecase);
  if (!target) return model;
  let k = 1;
  while (model.nodes.some((n) => n.id === `${of}__note${k}`)) k++;
  const note: FlowNode = { id: `${of}__note${k}`, label: 'Note', shape: 'rect', markdown: false, parent: target.parent, state: 'note', note: { position: 'right of', of } };
  return { ...model, nodes: [...model.nodes, note], edges: [...model.edges, noteLink(note)] };
}

/** True if an edge can join these two: actors and use cases only (not notes or boundaries). */
export function canRelate(model: FlowModel, source: string, target: string): boolean {
  const ok = (id: string): boolean => model.nodes.some((n) => n.id === id && n.usecase);
  return ok(source) && ok(target) && source !== target;
}
