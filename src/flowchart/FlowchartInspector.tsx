/** The inspector of flowcharts and swimlane diagrams: a node, a subgraph (or lane), an edge. */
import { useState, type JSX } from 'react';
import {
  DIRECTIONS,
  EDGE_CURVES,
  EDGE_LENGTHS,
  commentsToText,
  setParent,
  subgraphWithDescendants,
  updateEdge,
  updateNode,
  updateSubgraph,
  type Asset,
  type Direction,
  type FlowEdge,
  type FlowNode,
  type FlowSubgraph,
  type Shape,
  SHAPES,
} from '../core/model';
import { CommentField, LabelInput, MarkdownToggle, ParentSelect, StyleFields, TextField, type InspectorProps } from '../canvas/fields';
import { EndPicker, StrokePicker } from '../canvas/styleControls';
import { checkClick } from './parseFlowchart';
import { SHAPE_GROUPS, SHAPE_INFO } from './shapes';

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

export function FlowNodeInspector({ model, node, onChange, onDelete }: InspectorProps & { node: FlowNode }): JSX.Element {
  return (
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
      <StyleFields kind="box"
        id={node.id}
        item={node}
        model={model}
        styleTitle="Written as: style id …"
        onChange={(patch) => onChange(updateNode(model, node.id, patch))}
      />
      <button className="danger" onClick={onDelete}>
        Delete node
      </button>
    </div>
  );
}

export function FlowSubgraphInspector({ model, subgraph, onChange, onDelete, lane }: InspectorProps & { subgraph: FlowSubgraph, lane: boolean }): JSX.Element {
  return (
    <div className="inspector">
      <div className="inspector-title">
        {lane ? 'Lane' : 'Subgraph'} {subgraph.id}
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
      <StyleFields kind="box"
        id={subgraph.id}
        item={subgraph}
        model={model}
        styleTitle="Written as: style id …"
        onChange={(patch) => onChange(updateSubgraph(model, subgraph.id, patch))}
      />
      <button className="danger" onClick={onDelete} title="The nodes inside move up one level">
        Delete subgraph (keep contents)
      </button>
    </div>
  );
}

export function FlowEdgeInspector({ model, edge, onChange, onDelete }: InspectorProps & { edge: FlowEdge }): JSX.Element {
  return (
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
      <StrokePicker value={edge.stroke} onChange={(stroke) => onChange(updateEdge(model, edge.id, { stroke }))} />
      <EndPicker
        value={edge.end}
        bothEnds={edge.bothEnds}
        disabled={edge.stroke === 'invisible'}
        onChange={(end) => onChange(updateEdge(model, edge.id, { end }))}
        onBothEnds={(bothEnds) => onChange(updateEdge(model, edge.id, { bothEnds }))}
      />
      <div className="inspector-row">
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
        <label title="Written as id@{ curve: … } for an edge with an id, else linkStyle n interpolate …. The canvas draws linear and step curves; smooth ones look alike on the canvas.">
          Curve
          <select value={edge.curve ?? ''} onChange={(e) => onChange(updateEdge(model, edge.id, { curve: e.target.value || undefined }))}>
            <option value="">Diagram default</option>
            {EDGE_CURVES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <CommentField
        key={`${edge.id}:${commentsToText(edge.comments)}`}
        id={edge.id}
        comments={edge.comments}
        onCommit={(comments) => onChange(updateEdge(model, edge.id, { comments }))}
      />
      <StyleFields kind="edge"
        id={edge.id}
        item={edge}
        model={model}
        styleTitle="Written as: linkStyle n … (classes need an edge id; one is added)"
        onChange={(patch) => onChange(updateEdge(model, edge.id, patch))}
      />
      <button className="danger" onClick={onDelete}>
        Delete edge
      </button>
    </div>
  );
}
