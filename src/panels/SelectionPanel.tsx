/**
 * The inspector of a selection of several nodes, subgraphs and edges. It shows what the selected
 * elements have in common and changes all of them at once: shape, subgraph, line, markers, length
 * and curve of edges, class, and the own style one property at a time (a change of the fill keeps
 * each element's border). Fields where the elements differ show no value ("mixed").
 */
import type { JSX } from 'react';
import {
  diagramCurve,
  isSwimlane,
  setParent,
  subgraphWithDescendants,
  updateEdge,
  updateNode,
  updateSubgraph,
  type EdgeEnd,
  type FlowEdge,
  type FlowModel,
  type FlowNode,
  type FlowSubgraph,
  type Shape,
  type Stroke,
  type Styled,
} from '../core/model';
import { declarationValue, withDeclaration } from '../flowchart/styling';
import { Panel } from './Panel';
import { ShapePicker } from '../canvas/ShapePicker';
import { AppearanceFields, ClassSelect, CurvePicker, EndPicker, LengthPicker, OwnStyleSection, StrokePicker } from '../canvas/styleControls';

/** A value that matches no option of a picker: the selected elements differ. */
const MIXED = '\u0000mixed';

/** The value all items share, or MIXED. */
function shared<T>(values: readonly T[]): T | typeof MIXED {
  return values.every((v) => v === values[0]) ? values[0] : MIXED;
}

/** The properties the appearance controls write. */
const PROPERTIES = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'color', 'font-weight', 'font-style'];

/** The declarations that every list has with the same value. */
export function sharedDeclarations(lists: ReadonlyArray<readonly string[] | undefined>): string[] {
  const out: string[] = [];
  for (const p of PROPERTIES) {
    const v = shared(lists.map((l) => declarationValue(l, p)));
    if (v !== MIXED && v !== '') out.push(`${p}:${v}`);
  }
  return out;
}

/** Whether the own styles of several elements are not all the same. */
function differ(lists: ReadonlyArray<readonly string[] | undefined>): boolean {
  return new Set(lists.map((l) => (l ?? []).join(';'))).size > 1;
}

/**
 * Applies the change from `before` to `after` (the shown declarations) to an element's own list:
 * only the properties that changed are set or removed; the others stay as the element has them.
 */
export function applyDeclarationChange(own: readonly string[] | undefined, before: readonly string[], after: readonly string[]): string[] {
  let next = [...(own ?? [])];
  for (const p of PROPERTIES) {
    const v = declarationValue(after, p);
    if (v !== declarationValue(before, p)) next = withDeclaration(next, p, v);
  }
  return next;
}

/** Classes as a key, for comparing two elements' classes. */
const classKey = (c: readonly string[] | undefined): string => (c ?? []).join(' ');

interface SelectionPanelProps {
  model: FlowModel;
  nodes: FlowNode[];
  subgraphs: FlowSubgraph[];
  edges: FlowEdge[];
  /** Flowcharts and swimlanes: shapes and edge lines can be changed. */
  flowchart: boolean;
  onChange: (model: FlowModel) => void;
  onDelete: () => void;
  onClose: () => void;
}

function count(n: number, word: string): string | null {
  return n === 0 ? null : `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function SelectionPanel({ model, nodes, subgraphs, edges, flowchart, onChange, onDelete, onClose }: SelectionPanelProps): JSX.Element {
  const boxes: Array<FlowNode | FlowSubgraph> = [...nodes, ...subgraphs];
  const title = [count(nodes.length, 'node'), count(subgraphs.length, isSwimlane(model) ? 'lane or subgraph' : 'subgraph'), count(edges.length, 'edge')]
    .filter(Boolean)
    .join(', ');

  /** Changes every selected box (node or subgraph). */
  const eachBox = (m: FlowModel, patch: (item: Styled) => Styled): FlowModel => {
    let next = m;
    for (const n of nodes) next = updateNode(next, n.id, patch(next.nodes.find((x) => x.id === n.id) ?? n));
    for (const s of subgraphs) next = updateSubgraph(next, s.id, patch(next.subgraphs.find((x) => x.id === s.id) ?? s));
    return next;
  };
  const eachEdge = (m: FlowModel, patch: (edge: FlowEdge) => Partial<Omit<FlowEdge, 'id'>>): FlowModel => {
    let next = m;
    for (const e of edges) next = updateEdge(next, e.id, patch(next.edges.find((x) => x.id === e.id) ?? e));
    return next;
  };

  // Shapes: nodes drawn with a shape (not icons, images, actors or states).
  const shaped = flowchart ? nodes.filter((n) => !n.asset && !n.usecase) : [];
  const shape = shared(shaped.map((n) => n.shape));

  // Subgraph: nodes and subgraphs can move into a subgraph that is not one of the moved subgraphs or inside them.
  const parent = shared(boxes.map((b) => b.parent));
  const exclude = new Set(subgraphs.flatMap((s) => [...subgraphWithDescendants(model, s.id)]));
  const moveTo = (to: string | null): void => {
    let next = model;
    for (const b of boxes) next = setParent(next, b.id, to);
    onChange(next);
  };

  const boxStyles = sharedDeclarations(boxes.map((b) => b.styles));
  const edgeStyles = sharedDeclarations(edges.map((e) => e.styles));
  const styledEdges = flowchart ? edges : [];
  const all: Styled[] = [...boxes, ...styledEdges];
  const classes = shared(all.map((x) => classKey(x.classes)));

  const stroke = shared(edges.map((e) => e.stroke));
  const end = shared(edges.map((e) => e.end));
  const bothEnds = edges.every((e) => e.bothEnds);
  const length = shared(edges.map((e) => e.length ?? 1));
  const curve = shared(edges.map((e) => e.curve));

  return (
    <Panel name="inspector" className="multi-inspector" title={`${title} selected`} hint="Changes apply to all of them. Empty fields differ between them." onClose={onClose}>

      {shaped.length > 0 && (
        <ShapePicker value={shape === MIXED ? null : shape} onChange={(s: Shape) => onChange(shaped.reduce((m, n) => updateNode(m, n.id, { shape: s }), model))} />
      )}

      {boxes.length > 0 && model.subgraphs.length > 0 && (
        <label>
          {isSwimlane(model) ? 'Lane or subgraph' : 'Subgraph'}
          <select value={parent === MIXED ? MIXED : (parent ?? '')} onChange={(e) => e.target.value !== MIXED && moveTo(e.target.value || null)}>
            {parent === MIXED && (
              <option value={MIXED} disabled>
                (mixed)
              </option>
            )}
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
      )}

      {flowchart && edges.length > 0 && (
        <>
          <StrokePicker value={(stroke === MIXED ? MIXED : stroke) as Stroke} onChange={(s) => onChange(eachEdge(model, () => ({ stroke: s })))} />
          <EndPicker
            value={(end === MIXED ? MIXED : end) as EdgeEnd}
            bothEnds={bothEnds}
            disabled={stroke === 'invisible'}
            onChange={(e) => onChange(eachEdge(model, () => ({ end: e })))}
            onBothEnds={(both) => onChange(eachEdge(model, () => ({ bothEnds: both })))}
          />
          <LengthPicker value={length === MIXED ? 0 : length} onChange={(l) => onChange(eachEdge(model, () => ({ length: l === 1 ? undefined : l })))} />
          <CurvePicker
            value={curve === MIXED ? MIXED : curve}
            fallback={model.linkDefaults?.curve ?? diagramCurve(model) ?? 'basis'}
            onChange={(c) => onChange(eachEdge(model, () => ({ curve: c })))}
          />
        </>
      )}

      {all.length > 0 && (
        <div className="style-fields">
          <ClassSelect
            model={model}
            classes={classes === MIXED ? [] : (all[0].classes ?? [])}
            onChange={(next) => {
              let m = eachBox(model, () => ({ classes: next }));
              if (styledEdges.length > 0) m = eachEdge(m, () => ({ classes: next }));
              onChange(m);
            }}
          />
          {boxes.length > 0 && (
            <OwnStyleSection
              heading={edges.length > 0 ? 'Own style of the nodes' : 'Own style'}
              title="Written as: style id … for each element"
              styles={boxStyles}
              mixed={differ(boxes.map((b) => b.styles))}
              onReset={boxes.some((b) => (b.styles?.length ?? 0) > 0) ? () => onChange(eachBox(model, () => ({ styles: [] }))) : undefined}
            >
              <AppearanceFields
                key={boxStyles.join(';')}
                styles={boxStyles}
                kind="box"
                sameSwatches
                onChange={(after) => onChange(eachBox(model, (b) => ({ styles: applyDeclarationChange(b.styles, boxStyles, after) })))}
              />
            </OwnStyleSection>
          )}
          {styledEdges.length > 0 && (
            <OwnStyleSection
              heading={boxes.length > 0 ? 'Own style of the edges' : 'Own style'}
              title="Written as: linkStyle n … for each edge"
              styles={edgeStyles}
              mixed={differ(styledEdges.map((e) => e.styles))}
              onReset={styledEdges.some((e) => (e.styles?.length ?? 0) > 0) ? () => onChange(eachEdge(model, () => ({ styles: [] }))) : undefined}
            >
              <AppearanceFields
                key={edgeStyles.join(';')}
                styles={edgeStyles}
                kind="edge"
                sameSwatches
                onChange={(after) => onChange(eachEdge(model, (e) => ({ styles: applyDeclarationChange(e.styles, edgeStyles, after) })))}
              />
            </OwnStyleSection>
          )}
        </div>
      )}

      <button className="danger" onClick={onDelete}>
        Delete {title}
      </button>
    </Panel>
  );
}
