import { describe, expect, test } from 'vitest';
import { readConfig, setConfigValue } from '../src/core/config';
import { cyclicEntryNodes, elkConfigOf, elkLayoutOptions, resolvedElk } from '../src/canvas/elkConfig';

describe('elk config', () => {
  test('Mermaid defaults, presets, and explicit options over the preset', () => {
    expect(resolvedElk(elkConfigOf({}))).toMatchObject({ nodePlacementStrategy: 'BRANDES_KOEPF', nodePlacementAlignment: 'BALANCED', cycleBreakingStrategy: 'DEPTH_FIRST', considerModelOrder: 'NODES_AND_EDGES' });
    const legacy = elkConfigOf(readConfig('---\nconfig:\n  elk:\n    preset: legacy\n    nodePlacementAlignment: LEFTUP\n    mergeEdges: true\n    nodePlacementStrategy: nonsense\n---'));
    expect(resolvedElk(legacy)).toMatchObject({ nodePlacementStrategy: 'BRANDES_KOEPF', nodePlacementAlignment: 'LEFTUP', cycleBreakingStrategy: 'GREEDY', mergeEdges: true });
    expect(elkLayoutOptions(legacy).root['elk.layered.nodePlacement.bk.fixedAlignment']).toBe('LEFTUP');
    // A directive wins, as in Mermaid.
    const directive = elkConfigOf(readConfig(`---\nconfig:\n  elk:\n    preset: legacy\n---\n%%{init: {"elk": {"preset": "modelOrder"}}}%%`));
    expect(directive.choices.preset).toBe('modelOrder');
  });

  test('keepEntryNodeOnTop: one entry per all-cycle part, none where a source exists', () => {
    const items = ['a', 'b', 'c', 'x', 'y'].map((id) => ({ id, parent: null }));
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
      { source: 'x', target: 'y' },
    ];
    expect([...cyclicEntryNodes(items, edges)]).toEqual(['a']);
  });
});

describe('writing the front matter config', () => {
  test('adds the front matter, then the keys, and keeps what is there', () => {
    const one = setConfigValue(undefined, ['elk', 'preset'], 'legacy');
    expect(one).toBe('---\nconfig:\n  elk:\n    preset: legacy\n---');
    const kept = setConfigValue('---\ntitle: Hi\nconfig:\n  theme: forest # mine\n---\n%% note', ['elk', 'mergeEdges'], true);
    expect(kept).toBe('---\ntitle: Hi\nconfig:\n  theme: forest # mine\n  elk:\n    mergeEdges: true\n---\n%% note');
    expect(setConfigValue(kept, ['elk', 'mergeEdges'], false)).toContain('    mergeEdges: false\n');
    expect(setConfigValue('---\nconfig:\n    layout: elk\n---', ['elk', 'preset'], 'legacy')).toBe('---\nconfig:\n    layout: elk\n    elk:\n        preset: legacy\n---');
  });

  test('removing a value drops maps and front matter left empty', () => {
    const both = setConfigValue(setConfigValue(undefined, ['elk', 'preset'], 'legacy'), ['layout'], 'dagre');
    const noPreset = setConfigValue(both, ['elk', 'preset'], undefined);
    expect(noPreset).toBe('---\nconfig:\n  layout: dagre\n---');
    expect(setConfigValue(noPreset, ['layout'], undefined)).toBe('');
    expect(setConfigValue('---\ntitle: T\nconfig:\n  elk:\n    preset: legacy\n---\n%% c', ['elk', 'preset'], undefined)).toBe('---\ntitle: T\n---\n%% c');
    expect(setConfigValue('%% c', ['elk', 'preset'], undefined)).toBe('%% c');
  });
});
