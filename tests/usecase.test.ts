import { describe, expect, test } from 'vitest';
import { MERMAID_EXAMPLES } from '../src/gallery/mermaidExamples';
import { connect, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';
import { addUseCaseNode, addUseCaseNote, canRelate, setRelation, setUseCaseNode } from '../src/usecase/usecaseDiagram';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(`${result.error}\n${text}`);
  return result.model;
}

const byId = (m: FlowModel): FlowModel => ({ ...m, nodes: [...m.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)) });

async function roundtrip(text: string): Promise<{ model: FlowModel; written: string }> {
  const model = await parseOk(text);
  const written = serialize(model);
  const again = await parseOk(written);
  expect(byId(again), written).toEqual(byId(model));
  expect(serialize(again)).toBe(written);
  return { model, written };
}

const examples = MERMAID_EXAMPLES.find((s) => s.id === 'use-case-diagram')!.examples;

describe('use case diagrams', () => {
  test.each(examples.map((e) => [e.title, e.code]))('%s round-trips', async (_t, code) => {
    await roundtrip(code);
  });

  test('actors, use cases, boundaries, packages and labels', async () => {
    const { model, written } = await roundtrip(examples[1].code);
    expect(model.kind).toBe('usecase');
    expect(model.nodes.find((n) => n.id === 'Reader')?.usecase).toEqual({ kind: 'actor' });
    expect(model.nodes.find((n) => n.id === 'BorrowBook')).toMatchObject({ label: 'Borrow a book', parent: 'Library_System', usecase: { kind: 'usecase' } });
    expect(model.subgraphs.find((s) => s.id === 'Staff_Portal')?.package).toBe(true);
    expect(written).toContain('systemBoundary Staff_Portal("Staff Portal")@{ type: package }');
  });

  test('every arrow, include, extend, generalization, notes, styles and settings', async () => {
    const code = `usecase-beta
direction TB
actor A("Alice")@{ type: hollow }
actor B("Bot")@{ icon: "fa:robot" } <<system>>
actor C("Clerk")@{ business: true }
U1("One")
U2["Two"]
U3("Three")@{ business: true }
A --> U1
A -- "uses" --> U2
B --- U3
A --o U1
A --x U2
U1 <-- B
U2 o-- B
U3 x-- C
C <-- "asks" -- U1
U1 ..>:include U2
U3 ..>:extend U1
C --|> A
note for U1 "Main case"
classDef hot fill:#f96
class U1 hot
style U2 fill:#0f0
%% end comment
`;
    const { model, written } = await roundtrip(code);
    expect(model.direction).toBe('TB');
    expect(model.nodes.find((n) => n.id === 'A')?.usecase).toEqual({ kind: 'actor', actorType: 'hollow' });
    expect(model.nodes.find((n) => n.id === 'B')?.usecase).toEqual({ kind: 'actor', icon: 'fa:robot', stereotype: 'system' });
    expect(model.nodes.find((n) => n.id === 'U2')?.usecase).toEqual({ kind: 'usecase', rect: true });
    const rel = (s: string, t: string) => model.edges.find((e) => e.source === s && e.target === t)?.usecase?.relation;
    expect(rel('A', 'U1')).toBe('-->');
    // Backward arrows keep the arrow pointing at the model's target.
    expect(rel('B', 'U1')).toBe('<--');
    expect(rel('U1', 'C')).toBe('<--');
    expect(rel('U1', 'U2')).toBe('include');
    expect(rel('C', 'A')).toBe('generalization');
    expect(model.edges.find((e) => e.source === 'U1' && e.target === 'C')?.label).toBe('asks');
    expect(model.nodes.find((n) => n.state === 'note')?.note?.of).toBe('U1');
    expect(written).toContain('C <-- "asks" -- U1');
    expect(written).toContain('note for U1 "Main case"');
    expect(written).toContain('%% end comment');
  });

  test('canvas edits', async () => {
    let model = await parseOk('usecase-beta\nactor A("Alice")\nU("Use")\nA --> U\n');
    model = addUseCaseNode(model, 'usecase', null, 'n1');
    model = connect(model, 'U', 'n1');
    // Include and extend join use cases only.
    expect(setRelation(connect(model, 'A', 'n1'), `e${model.edges.length + 1}`, 'include')).toEqual(connect(model, 'A', 'n1'));
    model = setRelation(model, model.edges.at(-1)!.id, 'extend');
    model = setUseCaseNode(model, 'U', { rect: true });
    model = setUseCaseNode(model, 'A', { actorType: 'awesome' });
    model = addUseCaseNote(model, 'U');
    const written = serialize(model);
    expect(written).toBe(
      'usecase-beta\nactor A("Alice")@{ type: awesome }\nU["Use"]\nn1("Use case")\nA --> U\nU ..>:extend n1\nnote for U "Note"\n',
    );
    expect(serialize(await parseOk(written))).toBe(written);
    expect(canRelate(model, 'A', 'U')).toBe(true);
    expect(canRelate(model, 'A', 'U__note1')).toBe(false);
  });

  test('what the canvas cannot keep falls back to the preview', async () => {
    const result = await parse('usecase-beta\nactor A\nU("x")\nA e1@--> U\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.preview?.name).toBe('Use case diagram');
  });
});
