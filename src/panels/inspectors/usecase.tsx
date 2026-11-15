/** The inspector of use case diagrams: an actor or use case (or note), a system boundary, a relationship. */
import type { JSX } from 'react';
import { setParent, updateEdge, updateNode, updateSubgraph, type FlowEdge, type FlowNode, type FlowSubgraph } from '../../core/model';
import { LabelInput, ParentSelect, StyleFields, TextField, type InspectorProps } from '../../canvas/fields';
import { allowedRelations, forwardRelation, setRelation, setUseCaseNode, USECASE_RELATIONS } from '../../usecase/usecaseDiagram';
import { Panel } from '../Panel';

/** Use case diagrams: an actor, a use case, or a note. */
export function UseCaseNodeInspector({ model, node, onChange, onDelete, onClose }: InspectorProps & { node: FlowNode }): JSX.Element {
  const uc = node.usecase;
  if (!uc) {
    return (
      <Panel name="inspector" title={<>Note for {node.note?.of}</>} onClose={onClose}>
        <label>
          Text
          <LabelInput key={`${node.id}:${node.label}`} value={node.label} onCommit={(label) => onChange(updateNode(model, node.id, { label }))} />
        </label>
        <button className="danger" onClick={onDelete}>
          Delete note
        </button>
      </Panel>
    );
  }
  const set = (patch: Partial<NonNullable<FlowNode['usecase']>>): void => onChange(setUseCaseNode(model, node.id, patch));
  return (
    <Panel name="inspector" title={<>{uc.kind === 'actor' ? 'Actor' : 'Use case'} {node.id}</>} onClose={onClose}>
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
      <StyleFields kind="box" id={node.id} item={node} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateNode(model, node.id, patch))} />
      <button className="danger" onClick={onDelete}>
        Delete {uc.kind === 'actor' ? 'actor' : 'use case'}
      </button>
    </Panel>
  );
}

/** Use case diagrams: a system boundary. */
export function UseCaseBoundaryInspector({ model, subgraph, onChange, onDelete, onClose }: InspectorProps & { subgraph: FlowSubgraph }): JSX.Element {
  return (
    <Panel name="inspector" title={<>System boundary {subgraph.id}</>} onClose={onClose}>
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
      <StyleFields kind="box" id={subgraph.id} item={subgraph} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateSubgraph(model, subgraph.id, patch))} />
      <button className="danger" onClick={onDelete} title="Its actors and use cases move out of it">
        Delete boundary (keep contents)
      </button>
    </Panel>
  );
}

/** Use case diagrams: a relationship. */
export function UseCaseEdgeInspector({ model, edge, onChange, onDelete, onClose }: InspectorProps & { edge: FlowEdge }): JSX.Element {
  if (edge.noteLink) {
    return (
      <Panel name="inspector" title={<>Note link</>} onClose={onClose}>
        <div className="muted inspector-note">Select the note to change or delete it.</div>
      </Panel>
    );
  }
  const relation = edge.usecase?.relation ?? '-->';
  const allowed = allowedRelations(model, edge);
  const labelled = relation !== 'include' && relation !== 'extend' && relation !== 'generalization';
  return (
    <Panel name="inspector" title={<>{edge.source} → {edge.target}</>} onClose={onClose}>
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
    </Panel>
  );
}
