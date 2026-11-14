/**
 * The `elk:` options of the Mermaid config, read and turned into ELK layout options as Mermaid 12
 * does (its ELK renderer, `createRootElkGraph` and `buildSubgraphLayoutOptions`), so the canvas
 * places nodes like Mermaid's own drawing. The layout panel uses the same tables.
 */
import { get, readConfig, type ConfigMap } from '../core/config';
import type { FlowModel } from '../core/model';

type Preset = { layering: string; placement: string; containerPlacement: string; alignment: string; cycleBreaking: string };

/** Mermaid's named presets (`elk.preset`). An explicit option wins over its preset value. */
export const ELK_PRESETS: Record<string, Preset> = {
  default: { layering: 'NETWORK_SIMPLEX', placement: 'BRANDES_KOEPF', containerPlacement: 'BRANDES_KOEPF', alignment: 'BALANCED', cycleBreaking: 'DEPTH_FIRST' },
  legacy: { layering: 'NETWORK_SIMPLEX', placement: 'BRANDES_KOEPF', containerPlacement: 'BRANDES_KOEPF', alignment: 'NONE', cycleBreaking: 'GREEDY' },
  modelOrder: { layering: 'NETWORK_SIMPLEX', placement: 'NETWORK_SIMPLEX', containerPlacement: 'BRANDES_KOEPF', alignment: 'NONE', cycleBreaking: 'GREEDY_MODEL_ORDER' },
  depthFirst: { layering: 'NETWORK_SIMPLEX', placement: 'NETWORK_SIMPLEX', containerPlacement: 'BRANDES_KOEPF', alignment: 'NONE', cycleBreaking: 'DEPTH_FIRST' },
};

/** The `elk:` options with a fixed set of values, and those values (Mermaid's config schema). */
export const ELK_CHOICES = {
  preset: ['default', 'legacy', 'modelOrder', 'depthFirst'],
  nodePlacementStrategy: ['BRANDES_KOEPF', 'NETWORK_SIMPLEX', 'LINEAR_SEGMENTS', 'SIMPLE'],
  nodePlacementAlignment: ['BALANCED', 'LEFTUP', 'RIGHTUP', 'LEFTDOWN', 'RIGHTDOWN', 'NONE'],
  layeringStrategy: ['NETWORK_SIMPLEX', 'LONGEST_PATH', 'LONGEST_PATH_SOURCE', 'COFFMAN_GRAHAM', 'MIN_WIDTH', 'STRETCH_WIDTH'],
  cycleBreakingStrategy: ['DEPTH_FIRST', 'GREEDY', 'MODEL_ORDER', 'GREEDY_MODEL_ORDER'],
  considerModelOrder: ['NODES_AND_EDGES', 'PREFER_NODES', 'PREFER_EDGES', 'NONE'],
} as const;
export type ElkChoice = keyof typeof ELK_CHOICES;

/** The `elk:` options that are on or off, and Mermaid's default for each. */
export const ELK_FLAGS = { mergeEdges: false, forceNodeModelOrder: false, keepEntryNodeOnTop: false } as const;
export type ElkFlag = keyof typeof ELK_FLAGS;

/** The `elk:` options the canvas reads, as written in the code (unknown values left out). */
export interface ElkConfig {
  choices: Partial<Record<ElkChoice, string>>;
  flags: Partial<Record<ElkFlag, boolean>>;
  layerBound?: number;
}

/** The `elk:` options of a config map. */
export function elkConfigOf(config: ConfigMap): ElkConfig {
  const result: ElkConfig = { choices: {}, flags: {} };
  for (const key of Object.keys(ELK_CHOICES) as ElkChoice[]) {
    const value = get(config, 'elk', key);
    if (typeof value === 'string' && (ELK_CHOICES[key] as readonly string[]).includes(value)) result.choices[key] = value;
  }
  for (const key of Object.keys(ELK_FLAGS) as ElkFlag[]) {
    const value = get(config, 'elk', key);
    if (typeof value === 'boolean') result.flags[key] = value;
  }
  const bound = get(config, 'elk', 'layeringLayerBound');
  if (typeof bound === 'number' && bound > 0) result.layerBound = bound;
  return result;
}

export function diagramElkConfig(model: FlowModel): ElkConfig {
  return elkConfigOf(readConfig(model.preamble));
}

/** The values that apply: the code's, else the preset's, else Mermaid's defaults. */
export function resolvedElk(elk: ElkConfig): Record<ElkChoice, string> & Record<ElkFlag, boolean> & { containerPlacement: string } {
  const preset = ELK_PRESETS[elk.choices.preset ?? 'default'];
  const c = elk.choices;
  return {
    preset: c.preset ?? 'default',
    nodePlacementStrategy: c.nodePlacementStrategy ?? preset.placement,
    containerPlacement: c.nodePlacementStrategy ?? preset.containerPlacement,
    nodePlacementAlignment: c.nodePlacementAlignment ?? preset.alignment,
    layeringStrategy: c.layeringStrategy ?? preset.layering,
    cycleBreakingStrategy: c.cycleBreakingStrategy ?? preset.cycleBreaking,
    considerModelOrder: c.considerModelOrder ?? 'NODES_AND_EDGES',
    mergeEdges: elk.flags.mergeEdges ?? ELK_FLAGS.mergeEdges,
    forceNodeModelOrder: elk.flags.forceNodeModelOrder ?? ELK_FLAGS.forceNodeModelOrder,
    keepEntryNodeOnTop: elk.flags.keepEntryNodeOnTop ?? ELK_FLAGS.keepEntryNodeOnTop,
  };
}

/** ELK options for the root graph and for each subgraph, from the diagram's `elk:` config. */
export function elkLayoutOptions(elk: ElkConfig): { root: Record<string, string>; subgraph: Record<string, string> } {
  const r = resolvedElk(elk);
  return {
    root: {
      'elk.layered.nodePlacement.strategy': r.nodePlacementStrategy,
      'elk.layered.nodePlacement.bk.fixedAlignment': r.nodePlacementAlignment,
      'elk.layered.mergeEdges': String(r.mergeEdges),
      'elk.layered.crossingMinimization.forceNodeModelOrder': String(r.forceNodeModelOrder),
      'elk.layered.considerModelOrder.strategy': r.considerModelOrder,
      'elk.layered.cycleBreaking.strategy': r.cycleBreakingStrategy,
      'elk.layered.layering.strategy': r.layeringStrategy,
      'elk.layered.layering.coffmanGraham.layerBound': String(elk.layerBound ?? 4),
    },
    subgraph: {
      'elk.layered.nodePlacement.strategy': r.containerPlacement,
      'elk.layered.nodePlacement.bk.fixedAlignment': r.nodePlacementAlignment,
      'elk.layered.mergeEdges': String(r.mergeEdges),
      'elk.layered.cycleBreaking.strategy': r.cycleBreakingStrategy,
      'elk.layered.nodePlacement.networkSimplex.nodeFlexibility': 'PORT_POSITION',
    },
  };
}

/**
 * `keepEntryNodeOnTop`: in each group of siblings, a connected part that is all cycle (no node
 * without incoming edges) gets an entry node, which ELK puts in the first layer. The entry is the
 * first node, in model order, with no incoming edge once the edges that close a cycle are left
 * out. Mermaid's rule (`findCyclicEntryNodes`).
 */
export function cyclicEntryNodes(items: Array<{ id: string; parent: string | null }>, edges: Array<{ source: string; target: string }>): Set<string> {
  const entries = new Set<string>();
  const groups = new Map<string | null, string[]>();
  for (const { id, parent } of items) groups.set(parent, [...(groups.get(parent) ?? []), id]);
  for (const ids of groups.values()) {
    const inGroup = new Set(ids);
    const inDegree = new Map(ids.map((id) => [id, 0]));
    const neighbors = new Map<string, string[]>(ids.map((id) => [id, []]));
    const internal: Array<[string, string]> = [];
    for (const { source, target } of edges) {
      if (source === target || !inGroup.has(source) || !inGroup.has(target)) continue;
      inDegree.set(target, inDegree.get(target)! + 1);
      neighbors.get(source)!.push(target);
      neighbors.get(target)!.push(source);
      internal.push([source, target]);
    }
    const component = new Map<string, number>();
    let count = 0;
    for (const id of ids) {
      if (component.has(id)) continue;
      const stack = [id];
      component.set(id, count);
      while (stack.length > 0) {
        for (const next of neighbors.get(stack.pop()!)!) {
          if (!component.has(next)) {
            component.set(next, count);
            stack.push(next);
          }
        }
      }
      count++;
    }
    const hasSource = new Array<boolean>(count).fill(false);
    for (const id of ids) if (inDegree.get(id) === 0) hasSource[component.get(id)!] = true;
    if (!hasSource.includes(false)) continue;
    const forward = new Map<string, string[]>(ids.map((id) => [id, []]));
    const residual = new Map(ids.map((id) => [id, 0]));
    const reaches = (from: string, to: string): boolean => {
      const seen = new Set([from]);
      const stack = [from];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === to) return true;
        for (const next of forward.get(current)!) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      return false;
    };
    for (const [source, target] of internal) {
      if (reaches(target, source)) continue;
      forward.get(source)!.push(target);
      residual.set(target, residual.get(target)! + 1);
    }
    const nominated = new Array<boolean>(count).fill(false);
    for (const id of ids) {
      const c = component.get(id)!;
      if (!hasSource[c] && !nominated[c] && residual.get(id) === 0) {
        entries.add(id);
        nominated[c] = true;
      }
    }
  }
  return entries;
}
