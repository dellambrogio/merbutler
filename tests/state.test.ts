import { describe, expect, test } from 'vitest';
import { MERMAID_EXAMPLES } from '../src/mermaidExamples';
import { connect, removeElements, updateNode, type FlowModel } from '../src/model';
import { parse } from '../src/parse';
import { serialize } from '../src/serialize';
import { addNote, addPseudoState, canTransition, setStateKind } from '../src/stateDiagram';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

/** Mermaid lists states in the order the code first mentions them, which a rewrite can change. */
const byId = (m: FlowModel): FlowModel => ({ ...m, nodes: [...m.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)) });

/** Parse, write, parse again: nothing is lost, and the written text is stable. */
async function roundtrip(text: string): Promise<{ model: FlowModel; written: string }> {
  const model = await parseOk(text);
  const written = serialize(model);
  const again = await parseOk(written);
  expect(byId(again), written).toEqual(byId(model));
  expect(serialize(again)).toBe(written);
  return { model, written };
}

const examples = MERMAID_EXAMPLES.find((s) => s.id === 'state-diagram')!.examples;

describe('state diagrams', () => {
  test.each(examples.map((e) => [e.title, e.code]))('%s round-trips', async (_title, code) => {
    await roundtrip(code);
  });

  test('states, [*], choice, labels and transitions', async () => {
    const { model, written } = await roundtrip(examples[2].code);
    expect(model.kind).toBe('state');
    const kinds = Object.fromEntries(model.nodes.map((n) => [n.id, n.state ?? 'state']));
    expect(kinds).toMatchObject({ battery_check: 'choice', root_start: 'start', root_end: 'end', PowerOn: 'state' });
    expect(model.edges.find((e) => e.source === 'battery_check' && e.target === 'LowPowerMode')?.label).toBe('battery < 20%');
    expect(written).toContain('state battery_check <<choice>>');
    expect(written).toContain('[*] --> PowerOn');
    expect(written).toContain('LowPowerMode --> [*] : power off');
  });

  test('concurrency regions keep their states and their own [*]', async () => {
    const { model, written } = await roundtrip(examples[2].code);
    const regions = model.subgraphs.filter((s) => s.region);
    expect(regions.map((r) => [r.id, r.parent])).toEqual([
      ['Active__r1', 'Active'],
      ['Active__r2', 'Active'],
    ]);
    expect(model.nodes.find((n) => n.id === 'ScreenOn')?.parent).toBe('Active__r2');
    expect(model.nodes.find((n) => n.id === 'Active__r1_start')?.state).toBe('start');
    expect(written).toMatch(/state Active \{[\s\S]*--[\s\S]*\}/);
  });

  test('composite states, direction, notes', async () => {
    const { model, written } = await roundtrip(examples[1].code);
    expect(model.direction).toBe('LR');
    expect(model.subgraphs.map((s) => s.id)).toEqual(['Fulfilment']);
    expect(model.nodes.find((n) => n.id === 'Packing')?.parent).toBe('Fulfilment');
    const note = model.nodes.find((n) => n.state === 'note')!;
    expect(note.note).toEqual({ position: 'right of', of: 'Paid' });
    expect(note.label).toBe('Payment can be card,\nwallet, or bank transfer');
    expect(model.edges.some((e) => e.noteLink && e.source === 'Paid' && e.target === note.id)).toBe(true);
    expect(written).toContain('direction LR');
    expect(written).toContain('note right of Paid');
  });

  test('descriptions, classes, styles, fork and join, comments', async () => {
    const code = `stateDiagram-v2
  %% a comment
  state "Long name" as L
  L : more
  [*] --> L
  classDef hot fill:#f00
  class L hot
  L --> M : go
  style M fill:#0f0
  state F <<fork>>
  state J <<join>>
  M --> F
  F --> J
`;
    const { model, written } = await roundtrip(code);
    const L = model.nodes.find((n) => n.id === 'L')!;
    expect(L.label).toBe('Long name');
    expect(L.descriptions).toEqual(['more']);
    expect(L.classes).toEqual(['hot']);
    expect(model.nodes.find((n) => n.id === 'M')?.styles).toEqual(['fill:#0f0']);
    expect(model.nodes.find((n) => n.id === 'F')?.state).toBe('fork');
    expect(model.nodes.find((n) => n.id === 'J')?.state).toBe('join');
    expect(model.endComments).toEqual(['%% a comment']);
    expect(written).toContain('classDef hot fill:#f00');
  });

  test('a state that a top-level transition mentions stays in its composite', async () => {
    const { model } = await roundtrip('stateDiagram-v2\n  state X {\n    A --> C\n  }\n  B --> A\n  A --> [*]\n');
    expect(model.nodes.find((n) => n.id === 'A')?.parent).toBe('X');
    expect(model.nodes.find((n) => n.id === 'B')?.parent).toBe(null);
  });

  test('canvas edits: add states, transitions, start and end, notes, kinds', async () => {
    let model = await parseOk('stateDiagram-v2\n  A --> B\n');
    model = addPseudoState(model, null, 'start');
    model = connect(model, 'root_start', 'A');
    model = addPseudoState(model, null, 'end');
    model = connect(model, 'B', 'root_end');
    model = addNote(model, 'A', 'left of');
    model = setStateKind(model, 'B', 'choice');
    model = updateNode(model, 'A', { label: 'Alpha' });
    const written = serialize(model);
    expect(written).toBe(
      'stateDiagram-v2\n  state "Alpha" as A\n  state B <<choice>>\n  A --> B\n  [*] --> A\n  B --> [*]\n  note left of A\n    Note\n  end note\n',
    );
    const again = await parseOk(written);
    expect(serialize(again)).toBe(written);
    expect(canTransition(model, 'root_end', 'A')).toBe(false);
    expect(canTransition(model, 'A', 'root_start')).toBe(false);
    expect(canTransition(model, 'A', 'B')).toBe(true);
    const removed = removeElements(model, ['A__note1'], []);
    expect(serialize(removed)).not.toContain('note');
  });

  test('what the canvas cannot keep falls back to the preview', async () => {
    const result = await parse('stateDiagram-v2\n  A --> B\n  note "floating" as N1\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.preview?.name).toBe('State diagram');
      expect(result.error).toContain('floating note');
    }
  });
});
