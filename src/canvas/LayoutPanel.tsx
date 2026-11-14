/**
 * The layout panel: the layout engine and the `elk:` options that decide where nodes go and how
 * they line up. Each control writes the front matter `config:` of the code, so the code stays
 * plain Mermaid, and "Default" removes the option. An option set by a `%%{init}%%` directive wins
 * over the front matter, so its control only shows it.
 */
import type { JSX } from 'react';
import { directives, get, setConfigValue } from '../core/config';
import { diagramLayout, type FlowModel } from '../core/model';
import { diagramElkConfig, ELK_CHOICES, resolvedElk, type ElkChoice, type ElkFlag } from './elkConfig';

interface LayoutPanelProps {
  model: FlowModel;
  readOnly: boolean;
  onChange: (model: FlowModel) => void;
  onClose: () => void;
}

const CHOICE_TEXT: Record<ElkChoice, { label: string; title: string; values: Record<string, string> }> = {
  nodePlacementAlignment: {
    label: 'Alignment',
    title: 'How nodes line up across the flow (elk.nodePlacementAlignment). Used by the Brandes-Köpf placement.',
    values: { BALANCED: 'Balanced (centered)', LEFTUP: 'Left / up', RIGHTUP: 'Right / up', LEFTDOWN: 'Left / down', RIGHTDOWN: 'Right / down', NONE: 'Most compact' },
  },
  nodePlacementStrategy: {
    label: 'Node placement',
    title: 'How nodes are placed across the flow (elk.nodePlacementStrategy)',
    values: { BRANDES_KOEPF: 'Brandes-Köpf (straight edges)', NETWORK_SIMPLEX: 'Network simplex (balanced)', LINEAR_SEGMENTS: 'Linear segments (chains in line)', SIMPLE: 'Simple' },
  },
  considerModelOrder: {
    label: 'Keep code order',
    title: 'Keep the order of nodes and edges as written in the code, when it adds no crossings (elk.considerModelOrder)',
    values: { NODES_AND_EDGES: 'Nodes and edges', PREFER_NODES: 'Prefer nodes', PREFER_EDGES: 'Prefer edges', NONE: 'No' },
  },
  layeringStrategy: {
    label: 'Layers',
    title: 'Which layer (column in LR, row in TB) each node goes to (elk.layeringStrategy)',
    values: { NETWORK_SIMPLEX: 'Fewest long edges', LONGEST_PATH: 'As late as possible', LONGEST_PATH_SOURCE: 'As late as possible, from sources', COFFMAN_GRAHAM: 'Few nodes per layer', MIN_WIDTH: 'Narrow', STRETCH_WIDTH: 'Wide' },
  },
  cycleBreakingStrategy: {
    label: 'Loops',
    title: 'Which edges of a loop go backwards (elk.cycleBreakingStrategy)',
    values: { DEPTH_FIRST: 'Depth first', GREEDY: 'Greedy', MODEL_ORDER: 'Code order', GREEDY_MODEL_ORDER: 'Greedy, code order' },
  },
  preset: {
    label: 'Preset',
    title: "Mermaid's named sets of the options above (elk.preset). An option set here wins over the preset.",
    values: { default: 'Default', legacy: 'Legacy', modelOrder: 'Code order', depthFirst: 'Depth first' },
  },
};

const FLAG_TEXT: Record<ElkFlag, { label: string; title: string }> = {
  forceNodeModelOrder: { label: 'Never reorder nodes', title: 'Nodes keep their code order even if edges cross (elk.forceNodeModelOrder)' },
  keepEntryNodeOnTop: { label: 'Loop entry first', title: 'A loop with no way in starts at its first node (elk.keepEntryNodeOnTop)' },
  mergeEdges: { label: 'Merge edges', title: 'Edges share a path where they can (elk.mergeEdges)' },
};

const CHOICE_ORDER: ElkChoice[] = ['nodePlacementAlignment', 'nodePlacementStrategy', 'considerModelOrder', 'layeringStrategy', 'cycleBreakingStrategy', 'preset'];
const FLAG_ORDER: ElkFlag[] = ['forceNodeModelOrder', 'keepEntryNodeOnTop', 'mergeEdges'];

export function LayoutPanel({ model, readOnly, onChange, onClose }: LayoutPanelProps): JSX.Element {
  const elk = diagramElkConfig(model);
  const applied = resolvedElk(elk);
  const fromDirective = directives(model.preamble ?? '');
  const lockedBy = (path: string[]): string | undefined => (get(fromDirective, ...path) !== undefined ? 'Set by %%{init}%% in the code' : undefined);
  const set = (path: string[], value: string | boolean | undefined): void =>
    onChange({ ...model, preamble: setConfigValue(model.preamble, path, value) || undefined });
  const engine = diagramLayout(model);
  const swimlane = model.kind === 'swimlane';

  return (
    <div className="layout-panel" role="dialog" aria-label="Layout">
      <div className="class-panel-head">
        <strong>Layout</strong>
        <span className="spacer" />
        <button type="button" className="link-button" onClick={onClose} aria-label="Close the layout panel" title="Close">
          ✕
        </button>
      </div>
      <p className="muted class-panel-hint">Mermaid places the nodes; these options steer it. They go into the front matter of the code.</p>
      <div className="layout-fields">
        {!swimlane && (
          <label title={lockedBy(['layout']) ?? 'The layout engine (layout). Mermaid 12 uses ELK unless the code asks for dagre.'}>
            Engine
            <select value={engine} disabled={readOnly || lockedBy(['layout']) !== undefined} onChange={(e) => set(['layout'], e.target.value === 'dagre' ? 'dagre' : undefined)}>
              <option value="elk">ELK (default)</option>
              <option value="dagre">dagre</option>
            </select>
          </label>
        )}
        {engine === 'dagre' ? (
          <p className="muted class-panel-hint">These options are for ELK. dagre has none for alignment.</p>
        ) : (
          <>
            {CHOICE_ORDER.map((key) => {
              const text = CHOICE_TEXT[key];
              const locked = lockedBy(['elk', key]);
              const unused = key === 'nodePlacementAlignment' && applied.nodePlacementStrategy !== 'BRANDES_KOEPF';
              const shown = key === 'nodePlacementStrategy' ? applied.nodePlacementStrategy : applied[key];
              return (
                <label key={key} title={locked ?? (unused ? 'Only the Brandes-Köpf node placement uses it' : text.title)}>
                  {text.label}
                  <select
                    value={elk.choices[key] ?? ''}
                    disabled={readOnly || locked !== undefined || unused}
                    onChange={(e) => set(['elk', key], e.target.value || undefined)}
                  >
                    <option value="">{key === 'preset' ? 'Default' : `Default (${text.values[shown] ?? shown})`}</option>
                    {ELK_CHOICES[key].map((v) => (
                      <option key={v} value={v}>
                        {text.values[v] ?? v}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            {FLAG_ORDER.map((key) => {
              const locked = lockedBy(['elk', key]);
              return (
                <label key={key} className="checkbox" title={locked ?? FLAG_TEXT[key].title}>
                  <input
                    type="checkbox"
                    checked={applied[key]}
                    disabled={readOnly || locked !== undefined}
                    // Off is Mermaid's default: the option is removed from the code.
                    onChange={(e) => set(['elk', key], e.target.checked ? true : undefined)}
                  />
                  {FLAG_TEXT[key].label}
                </label>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
