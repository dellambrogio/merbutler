/**
 * The diagram panel: how the whole diagram is laid out. Its direction (or, in a swimlane diagram,
 * whether lanes are rows or columns), and the layout engine with the `elk:` options that decide
 * where nodes go and how they line up. Free layout stays a tile in the dock.
 *
 * The layout options write the front matter `config:` of the code, so the code stays plain
 * Mermaid, and "Default" removes the option. An option set by a `%%{init}%%` directive wins over
 * the front matter, so its control only shows it.
 */
import type { JSX } from 'react';
import { directives, get, setConfigValue } from '../core/config';
import { DIRECTIONS, diagramLayout, isSwimlane, type FlowModel } from '../core/model';
import { diagramElkConfig, ELK_CHOICES, resolvedElk, type ElkChoice, type ElkFlag } from '../canvas/elkConfig';
import { DIRECTION_NAMES, DockIcons } from '../canvas/Dock';
import { Panel, PanelSection } from './Panel';

interface DiagramPanelProps {
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

/**
 * The Mermaid version that brought each option (checked in the config schema of the published
 * packages). Older versions ignore an option they do not know and use their own default, so the
 * diagram still renders, only laid out differently. Options of Mermaid 11.0 are not marked.
 */
const SINCE: Partial<Record<ElkChoice | ElkFlag, string>> = {
  cycleBreakingStrategy: '11.1',
  considerModelOrder: '11.10',
  forceNodeModelOrder: '11.10',
  nodePlacementAlignment: '11.17',
  keepEntryNodeOnTop: '11.17',
  layeringStrategy: '12',
  preset: '12',
};

/** "12+": the option needs this Mermaid version; GitHub, GitLab and other sites may run an older one. */
function SinceTag({ option }: { option: ElkChoice | ElkFlag }): JSX.Element | null {
  const version = SINCE[option];
  if (!version) return null;
  return (
    <span className="since-tag" title={`Needs Mermaid ${version} or later. Older versions, as some sites still run, ignore it and use their default layout.`}>
      {version}+
    </span>
  );
}

/** The two layout engines, by what they do: dagre (Hierarchical) and ELK (Adaptive, Mermaid 12's default). */
const ENGINES: ReadonlyArray<{ value: 'dagre' | 'elk'; name: string; text: string; title: string }> = [
  {
    value: 'dagre',
    name: 'Hierarchical',
    text: 'Arranges nodes in ordered levels following their hierarchy.',
    title: 'dagre (layout: dagre in the front matter)',
  },
  {
    value: 'elk',
    name: 'Adaptive',
    text: 'Rearranges nodes based on their context to keep the diagram organized.',
    title: "ELK, Mermaid 12's default (no layout in the front matter)",
  },
];

const CHOICE_ORDER: ElkChoice[] = ['nodePlacementAlignment', 'nodePlacementStrategy', 'considerModelOrder', 'layeringStrategy', 'cycleBreakingStrategy', 'preset'];
const FLAG_ORDER: ElkFlag[] = ['forceNodeModelOrder', 'keepEntryNodeOnTop', 'mergeEdges'];

export function DiagramPanel({ model, readOnly, onChange, onClose }: DiagramPanelProps): JSX.Element {
  const elk = diagramElkConfig(model);
  const applied = resolvedElk(elk);
  const fromDirective = directives(model.preamble ?? '');
  const lockedBy = (path: string[]): string | undefined => (get(fromDirective, ...path) !== undefined ? 'Set by %%{init}%% in the code' : undefined);
  const set = (path: string[], value: string | boolean | undefined): void =>
    onChange({ ...model, preamble: setConfigValue(model.preamble, path, value) || undefined });
  const engine = diagramLayout(model);
  const swimlane = isSwimlane(model);

  return (
    <Panel name="diagram" title="Diagram" meta={model.direction} onClose={onClose}>
      <PanelSection title={swimlane ? 'Lanes' : 'Direction'}>
        <div className="direction-choices" role="radiogroup" aria-label={swimlane ? 'Lanes' : 'Direction'}>
          {DIRECTIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={model.direction === d}
              className={model.direction === d ? 'selected' : ''}
              disabled={readOnly}
              title={`${DIRECTION_NAMES[d]} (${d})`}
              onClick={() => model.direction !== d && onChange({ ...model, direction: d })}
            >
              <span className="direction-icon" aria-hidden="true">
                {DockIcons.direction(d)}
              </span>
              {d}
            </button>
          ))}
        </div>
        <p className="panel-note">{swimlane ? 'LR: lanes are rows. TB: lanes are columns.' : DIRECTION_NAMES[model.direction]}</p>
      </PanelSection>
      <PanelSection title="Layout">
        <p className="panel-note">
          Mermaid places the nodes; these options steer it. They go into the front matter of the code. A tag such as{' '}
          <span className="since-tag">12+</span> marks an option that older Mermaid versions ignore.
        </p>
        {!swimlane && (
          <div className="engine-choices" role="radiogroup" aria-label="Layout engine">
            {ENGINES.map((e) => (
              <button
                key={e.value}
                type="button"
                role="radio"
                aria-checked={engine === e.value}
                className={engine === e.value ? 'selected' : ''}
                disabled={readOnly || lockedBy(['layout']) !== undefined}
                title={lockedBy(['layout']) ?? e.title}
                // Adaptive (ELK) is Mermaid 12's default: choosing it removes `layout` from the code.
                onClick={() => engine !== e.value && set(['layout'], e.value === 'dagre' ? 'dagre' : undefined)}
              >
                <span className="engine-name">{e.name}</span>
                <span className="engine-text">{e.text}</span>
              </button>
            ))}
          </div>
        )}
        {engine === 'dagre' ? (
          <p className="panel-note">The options below are for Adaptive. Hierarchical has none for alignment.</p>
        ) : (
          <>
            {CHOICE_ORDER.map((key) => {
              const text = CHOICE_TEXT[key];
              const locked = lockedBy(['elk', key]);
              const unused = key === 'nodePlacementAlignment' && applied.nodePlacementStrategy !== 'BRANDES_KOEPF';
              const shown = key === 'nodePlacementStrategy' ? applied.nodePlacementStrategy : applied[key];
              return (
                <label key={key} title={locked ?? (unused ? 'Only the Brandes-Köpf node placement uses it' : text.title)}>
                  <span className="layout-label">
                    {text.label}
                    <SinceTag option={key} />
                  </span>
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
                  <SinceTag option={key} />
                </label>
              );
            })}
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
