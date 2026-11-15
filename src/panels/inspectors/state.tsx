/** The inspector of state diagrams: a state (or [*], choice, fork, join, note), a composite state or region, a transition. */
import type { JSX } from 'react';
import { setParent, subgraphWithDescendants, updateEdge, updateNode, updateSubgraph, type FlowEdge, type FlowNode, type FlowSubgraph } from '../../core/model';
import { LabelInput, ParentSelect, StyleFields, type InspectorProps } from '../../canvas/fields';
import { DirectionSelect } from '../../canvas/DirectionSelect';
import { noteLink, setStateKind, STATE_KINDS } from '../../state/stateDiagram';
import { Panel } from '../Panel';

export function StateNodeInspector({ model, node, onChange, onDelete, onClose }: InspectorProps & { node: FlowNode }): JSX.Element {
  const pseudo = node.state === 'start' || node.state === 'end';
  const title = pseudo ? `[*] ${node.state}` : node.state === 'note' ? `Note on ${node.note?.of}` : `State ${node.id}`;
  return (
    <Panel name="inspector" title={<>{title}</>} onClose={onClose}>
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
        <StyleFields kind="box" id={node.id} item={node} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateNode(model, node.id, patch))} />
      )}
      <button className="danger" onClick={onDelete}>
        Delete {node.state === 'note' ? 'note' : 'state'}
      </button>
    </Panel>
  );
}

/** State diagrams: a composite state, or a concurrency region in one. */
export function StateSubgraphInspector({ model, subgraph, onChange, onDelete, onClose }: InspectorProps & { subgraph: FlowSubgraph }): JSX.Element {
  if (subgraph.region) {
    return (
      <Panel name="inspector" title={<>Concurrent region of {subgraph.parent}</>} onClose={onClose}>
        <div className="muted inspector-note">Regions are separated by -- in the code. Add states with + State while the region is selected.</div>
        <button className="danger" onClick={onDelete} title="Its states move to the composite state">
          Delete region (keep states)
        </button>
      </Panel>
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
    <Panel name="inspector" title={<>Composite state {subgraph.id}</>} onClose={onClose}>
      <label>
        Label
        <LabelInput key={`${subgraph.id}:${subgraph.label}`} value={subgraph.label} onCommit={(label) => onChange(updateSubgraph(model, subgraph.id, { label }))} />
      </label>
      <DirectionSelect value={subgraph.direction} onChange={(direction) => onChange(updateSubgraph(model, subgraph.id, { direction }))} />
      <ParentSelect
        model={model}
        value={subgraph.parent}
        exclude={subgraphWithDescendants(model, subgraph.id)}
        onSelect={(parent) => onChange(setParent(model, subgraph.id, parent))}
      />
      <button onClick={addRegion} title="Concurrent regions, separated by -- in the code">
        + Concurrent region
      </button>
      <StyleFields kind="box" id={subgraph.id} item={subgraph} model={model} styleTitle="Written as: style id …" onChange={(patch) => onChange(updateSubgraph(model, subgraph.id, patch))} />
      <button className="danger" onClick={onDelete} title="The states inside move up one level">
        Delete composite (keep states)
      </button>
    </Panel>
  );
}

/** State diagrams: a transition. Its label is the only setting. */
export function StateEdgeInspector({ model, edge, onChange, onDelete, onClose }: InspectorProps & { edge: FlowEdge }): JSX.Element {
  if (edge.noteLink) {
    return (
      <Panel name="inspector" title={<>Note link</>} onClose={onClose}>
        <div className="muted inspector-note">Select the note to change or delete it.</div>
      </Panel>
    );
  }
  const name = (id: string): string => {
    const kind = model.nodes.find((n) => n.id === id)?.state;
    return kind === 'start' || kind === 'end' ? '[*]' : id;
  };
  return (
    <Panel name="inspector" title={<>Transition {name(edge.source)} → {name(edge.target)}</>} onClose={onClose}>
      <label>
        Label
        <LabelInput key={`${edge.id}:${edge.label}`} value={edge.label} onCommit={(label) => onChange(updateEdge(model, edge.id, { label }))} />
      </label>
      <button className="danger" onClick={onDelete}>
        Delete transition
      </button>
    </Panel>
  );
}
