import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from '../src/parse';
import { SHAPE_INFO } from '../src/shapes';
import { serialize } from '../src/serialize';
import {
  addNode,
  addSubgraph,
  canonicalOrder,
  connect,
  diagramTitle,
  EDGE_ENDS,
  removeElements,
  setParent,
  SHAPES,
  STROKES,
  updateEdge,
  updateNode,
  updateSubgraph,
  type FlowModel,
} from '../src/model';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixtureNames: string[] = readdirSync(FIXTURES).filter((f) => f.endsWith('.mmd'));

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(`parse failed: ${result.error}`);
  return result.model;
}

describe('round-trip', () => {
  test.each(fixtureNames)('%s', async (name) => {
    const text = readFileSync(join(FIXTURES, name), 'utf8');
    const model = await parseOk(text);
    const out = serialize(model);
    expect(await parseOk(out)).toEqual(model);
    // Serializing twice gives the same text.
    expect(serialize(await parseOk(out))).toBe(out);
    expect(out).toMatchSnapshot();
  });
});

describe('parse', () => {
  test('maps shapes, strokes, arrows and labels', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'basic.mmd'), 'utf8'));
    expect(model.direction).toBe('LR');
    expect(model.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Start', 'rect'],
      ['B', 'Ok?', 'diamond'],
      ['C', 'Done', 'round'],
      ['D', 'Retry', 'stadium'],
      ['E', 'Circle', 'circle'],
      ['F', 'F', 'rect'],
    ]);
    expect(model.edges.map((e) => [e.source, e.target, e.label, e.stroke, e.end])).toEqual([
      ['A', 'B', '', 'normal', 'arrow'],
      ['B', 'C', 'yes', 'normal', 'arrow'],
      ['B', 'D', 'no', 'dotted', 'arrow'],
      ['D', 'A', '', 'thick', 'arrow'],
      ['E', 'C', '', 'normal', 'none'],
    ]);
  });

  test('decodes entities to real characters', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'special-text.mmd'), 'utf8'));
    expect(model.nodes.map((n) => n.label)).toEqual(['Say "hi" (now)', 'x [y] {z}', 'ünïcode: ✓']);
    expect(model.edges[0].label).toBe('a | b');
  });

  test('keeps a literal #word; sequence', async () => {
    const model = await parseOk('flowchart LR\n  a["x"]');
    const edited = { ...model, nodes: [{ ...model.nodes[0], label: 'see #ref; & #quot;' }] };
    expect((await parseOk(serialize(edited))).nodes[0].label).toBe('see #ref; & #quot;');
  });

  test('labels are trimmed and an empty node label becomes the id', async () => {
    const model = await parseOk('flowchart LR\n  a --> b');
    const edited = updateEdge(updateNode(model, 'a', { label: '  ' }), model.edges[0].id, { label: ' hi ' });
    expect(edited.nodes[0].label).toBe('a');
    expect(edited.edges[0].label).toBe('hi');
    expect(await parseOk(serialize(edited))).toEqual(edited);
  });

  test.each(['/slashes/', '\\back', 'a|b', '(x)', 'end', '#35;', 'line;semi'])(
    'node and edge label %j survive a round-trip',
    async (label) => {
      const model = await parseOk('flowchart LR\n  a --> b');
      const edited = updateEdge(updateNode(model, 'a', { label }), model.edges[0].id, { label });
      const reparsed = await parseOk(serialize(edited));
      expect(reparsed.nodes[0].label).toBe(label);
      expect(reparsed.edges[0].label).toBe(label);
    },
  );

  test('maps all shapes', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'all-shapes.mmd'), 'utf8'));
    expect(model.nodes.map((n) => [n.id, n.shape])).toEqual([
      ['a', 'rect'],
      ['b', 'round'],
      ['c', 'stadium'],
      ['d', 'subroutine'],
      ['e', 'cylinder'],
      ['f', 'circle'],
      ['g', 'flag'],
      ['h', 'diamond'],
      ['i', 'hexagon'],
      ['j', 'lean-right'],
      ['k', 'trapezoid'],
      ['l', 'double-circle'],
      ['m', 'lean-left'],
      ['n', 'inv-trapezoid'],
    ]);
  });

  const withBrackets = SHAPES.filter((s) => SHAPE_INFO[s].brackets);
  const atOnly = SHAPES.filter((s) => !SHAPE_INFO[s].brackets);

  test.each(withBrackets)('shape %s keeps a label with special characters', async (shape) => {
    // No HTML tags: Mermaid removes unknown tags such as <t> from labels.
    const label = 'a "q" (x) [y] {z} /s/ \\b\\ |p| > #35;';
    const model = await parseOk('flowchart LR\n  a');
    const edited = updateNode(model, 'a', { label, shape });
    const reparsed = await parseOk(serialize(edited));
    expect(reparsed.nodes[0]).toEqual({ id: 'a', label, shape, markdown: false, parent: null });
  });

  test.each(atOnly)('shape %s (only in @{} syntax) keeps a label with special characters, as Markdown', async (shape) => {
    const label = 'a "q" (x) [y] {z} /s/ \\b\\ |p| > #35;';
    const model = await parseOk('flowchart LR\n  a');
    const edited = updateNode(model, 'a', { label, shape });
    expect(serialize(edited)).toContain(`a@{ shape: ${SHAPE_INFO[shape].at}, label: `);
    const reparsed = await parseOk(serialize(edited));
    expect(reparsed.nodes[0]).toEqual({ id: 'a', label, shape, markdown: true, parent: null, shapeName: SHAPE_INFO[shape].at });
  });

  test.each(SHAPES)('shape %s keeps a Markdown label', async (shape) => {
    const label = '**b** "q" `tick` *i*\nsecond (line) #35;';
    const model = await parseOk('flowchart LR\n  a');
    const edited = updateNode(model, 'a', { label, shape, markdown: true });
    const reparsed = await parseOk(serialize(edited));
    expect(reparsed.nodes[0]).toMatchObject({ id: 'a', label, shape, markdown: true, parent: null });
  });

  test.each(atOnly)('shape %s: every alias parses to it', async (shape) => {
    for (const name of [SHAPE_INFO[shape].at, ...SHAPE_INFO[shape].aliases]) {
      const model = await parseOk(`flowchart LR\n  a@{ shape: ${name}, label: "x" }\n`);
      expect(model.nodes[0]).toMatchObject({ shape, shapeName: name });
    }
  });

  test('maps edge ends', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'edge-ends.mmd'), 'utf8'));
    expect(model.edges.map((e) => [e.source, e.stroke, e.end, e.bothEnds])).toEqual([
      ['A', 'normal', 'arrow', false],
      ['B', 'normal', 'none', false],
      ['C', 'dotted', 'arrow', false],
      ['D', 'thick', 'arrow', false],
      ['E', 'normal', 'circle', false],
      ['F', 'normal', 'cross', false],
      ['G', 'normal', 'arrow', true],
    ]);
  });

  const endCombos = STROKES.flatMap((stroke) =>
    EDGE_ENDS.flatMap((end) => (end === 'none' ? [false] : [false, true]).map((bothEnds) => ({ stroke, end, bothEnds }))),
  );
  test.each(endCombos)('edge $stroke / $end / bothEnds=$bothEnds survives a round-trip', async (combo) => {
    // Ids that start or end with o and x, next to the operator, must not change the parse.
    const model = await parseOk('flowchart LR\n  xo --> ox');
    const edited = updateEdge(model, model.edges[0].id, { ...combo, label: 'lbl' });
    const reparsed = await parseOk(serialize(edited));
    expect(reparsed).toEqual(edited);
  });

  test('both ends without a marker is not kept', async () => {
    const model = await parseOk('flowchart LR\n  a <--> b');
    const edited = updateEdge(model, model.edges[0].id, { end: 'none' });
    expect(edited.edges[0].bothEnds).toBe(false);
  });

  test('graph TD maps to TB', async () => {
    expect((await parseOk('graph TD\n  a --> b')).direction).toBe('TB');
  });

  test.each([
    ['syntax error', 'flowchart LR\n  A --> -->'],
    ['other diagram type', 'sequenceDiagram\n  A->>B: hi'],
    ['unknown @{} shape', 'flowchart LR\n  a@{ shape: nonsense }'],
    ['click', 'flowchart LR\n  a\n  click a "https://example.com"'],
  ])('rejects %s', async (_name, text) => {
    const result = await parse(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('model edits survive serialization', () => {
  test('add, connect, update, remove', async () => {
    let model = await parseOk('flowchart LR\n  a --> b');
    model = addNode(model, 'Third "one"', 'diamond');
    const added = model.nodes[2];
    expect(added.id).toBe('n1');
    model = connect(model, 'b', added.id);
    const newEdge = model.edges[1];
    model = updateEdge(model, newEdge.id, { label: 'go', markdown: false, stroke: 'thick', end: 'none' });
    model = updateNode(model, 'a', { label: 'Alpha', shape: 'stadium' });

    const reparsed = await parseOk(serialize(model));
    expect(reparsed.nodes).toEqual([
      { id: 'a', label: 'Alpha', shape: 'stadium', markdown: false, parent: null },
      { id: 'b', label: 'b', shape: 'rect', markdown: false, parent: null },
      { id: 'n1', label: 'Third "one"', shape: 'diamond', markdown: false, parent: null },
    ]);
    expect(reparsed.edges.map((e) => [e.source, e.target, e.label, e.stroke, e.end])).toEqual([
      ['a', 'b', '', 'normal', 'arrow'],
      ['b', 'n1', 'go', 'thick', 'none'],
    ]);

    const removed = removeElements(reparsed, ['b'], []);
    expect(removed.nodes.map((n) => n.id)).toEqual(['a', 'n1']);
    expect(removed.edges).toEqual([]);
  });
});

describe('subgraphs', () => {
  test('parses nesting, labels and direction', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'subgraphs.mmd'), 'utf8'));
    expect(model.subgraphs).toEqual([
      { id: 'outer', label: 'Outer box', markdown: false, parent: null, direction: 'TB' },
      { id: 'inner', label: 'Inner "x"', markdown: false, parent: 'outer', direction: null },
      { id: 'plain', label: 'plain', markdown: false, parent: null, direction: null },
      { id: 'subGraph3', label: 'Title with spaces', markdown: false, parent: null, direction: null },
    ]);
    const parents = Object.fromEntries(model.nodes.map((n) => [n.id, n.parent]));
    expect(parents).toEqual({ start: null, e: null, a: 'outer', b: 'inner', c: 'plain', d: 'subGraph3' });
  });

  test('parses edges to and from subgraphs', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'subgraph-edges.mmd'), 'utf8'));
    expect(model.nodes.map((n) => n.id)).toEqual(['a1', 'a2', 'b1']);
    expect(model.subgraphs.map((s) => [s.id, s.direction])).toEqual([
      ['ingest', 'TB'],
      ['store', null],
    ]);
    expect(model.edges.map((e) => [e.source, e.target])).toEqual([
      ['a1', 'a2'],
      ['ingest', 'store'],
    ]);
  });

  test('deleting a subgraph removes its edges and keeps its nodes', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'subgraph-edges.mmd'), 'utf8'));
    const result = removeElements(model, ['ingest'], []);
    expect(result.nodes.map((n) => [n.id, n.parent])).toEqual([
      ['a1', null],
      ['a2', null],
      ['b1', 'store'],
    ]);
    expect(result.edges.map((e) => [e.source, e.target])).toEqual([['a1', 'a2']]);
    expect(await parseOk(serialize(result))).toEqual(canonicalOrder(result));
  });

  test('add, move, rename and delete keep the code valid', async () => {
    let model = await parseOk('flowchart LR\n  a --> b\n  b --> c');
    model = addSubgraph(model, 'Group one');
    model = addSubgraph(model, 'Nested', 's1');
    model = setParent(model, 'a', 's1');
    model = setParent(model, 'b', 's2');
    model = updateSubgraph(model, 's2', { label: 'Inner', direction: 'LR' });

    let reparsed = await parseOk(serialize(model));
    expect(reparsed.subgraphs).toEqual([
      { id: 's1', label: 'Group one', markdown: false, parent: null, direction: null },
      { id: 's2', label: 'Inner', markdown: false, parent: 's1', direction: 'LR' },
    ]);
    expect(reparsed.nodes.map((n) => [n.id, n.parent])).toEqual([
      ['c', null],
      ['a', 's1'],
      ['b', 's2'],
    ]);

    // Deleting the outer subgraph keeps its contents: they move up one level.
    reparsed = removeElements(reparsed, ['s1'], []);
    expect(reparsed.subgraphs).toEqual([{ id: 's2', label: 'Inner', markdown: false, parent: null, direction: 'LR' }]);
    expect(reparsed.nodes.map((n) => [n.id, n.parent])).toEqual([
      ['c', null],
      ['a', null],
      ['b', 's2'],
    ]);
    expect(reparsed.edges).toHaveLength(2);
    expect((await parseOk(serialize(reparsed))).subgraphs).toHaveLength(1);
  });

  test('deleting nested subgraphs moves contents to the nearest kept parent', () => {
    let model: FlowModel = { direction: 'TB', nodes: [], subgraphs: [], edges: [] };
    model = addSubgraph(model, 'top');
    model = addSubgraph(model, 'mid', 's1');
    model = addSubgraph(model, 'low', 's2');
    model = addNode(model, 'x', 'rect', 's3');
    const result = removeElements(model, ['s2', 's3'], []);
    expect(result.subgraphs.map((s) => s.id)).toEqual(['s1']);
    expect(result.nodes[0].parent).toBe('s1');
  });

  test('a subgraph cannot move inside itself or a descendant', () => {
    let model: FlowModel = { direction: 'TB', nodes: [], subgraphs: [], edges: [] };
    model = addSubgraph(model, 'top');
    model = addSubgraph(model, 'child', 's1');
    expect(setParent(model, 's1', 's1')).toBe(model);
    expect(setParent(model, 's1', 's2')).toBe(model);
    expect(setParent(model, 's1', 'missing')).toBe(model);
    expect(setParent(model, 's2', null).subgraphs[1].parent).toBeNull();
  });

  test('new ids do not collide between nodes and subgraphs', () => {
    let model: FlowModel = {
      direction: 'TB',
      nodes: [{ id: 's1', label: 's1', shape: 'rect', markdown: false, parent: null }],
      subgraphs: [{ id: 'n1', label: 'n1', markdown: false, parent: null, direction: null }],
      edges: [],
    };
    model = addNode(addSubgraph(model));
    expect(model.subgraphs.map((s) => s.id)).toEqual(['n1', 's2']);
    expect(model.nodes.map((n) => n.id)).toEqual(['s1', 'n2']);
  });
});

describe('rich text labels', () => {
  test('parses the Markdown flag and keeps <br>', async () => {
    const model = await parseOk(readFileSync(join(FIXTURES, 'rich-text.mmd'), 'utf8'));
    expect(model.nodes.map((n) => [n.id, n.label, n.markdown])).toEqual([
      ['A', 'Text with (parens) & symbols', false],
      ['B', '**bold** and *italic*', true],
      ['C', 'line one<br>line two', false],
    ]);
  });

  test('Markdown edge labels and subgraph titles survive a round-trip', async () => {
    const text = 'flowchart LR\n  subgraph s ["`*sub* title`"]\n    a\n  end\n  a -->|"`**go**`"| b\n  b --> s';
    const model = await parseOk(text);
    expect(model.subgraphs[0]).toMatchObject({ label: '*sub* title', markdown: true });
    expect(model.edges[0]).toMatchObject({ label: '**go**', markdown: true });
    expect(await parseOk(serialize(model))).toEqual(model);
  });

  test('a subgraph whose Markdown title equals its id keeps the title', async () => {
    const model = await parseOk('flowchart LR\n  subgraph s ["`s`"]\n    a\n  end');
    expect(model.subgraphs[0].markdown).toBe(true);
    expect((await parseOk(serialize(model))).subgraphs[0].markdown).toBe(true);
  });

  test('turning Markdown on and off converts line breaks', async () => {
    let model = await parseOk('flowchart LR\n  a["x<br>y"]');
    model = updateNode(model, 'a', { markdown: true });
    expect(model.nodes[0].label).toBe('x\ny');
    expect(await parseOk(serialize(model))).toEqual(model);
    model = updateNode(model, 'a', { markdown: false });
    expect(model.nodes[0].label).toBe('x<br>y');
  });

  test.each(['a<br>b', 'a<br/>b', 'a<br />b'])('keeps the line break %s', async (label) => {
    const model = await parseOk(`flowchart LR\n  x["${label}"]`);
    const reparsed = await parseOk(serialize(model));
    expect(reparsed.nodes[0].label).toBe(model.nodes[0].label);
  });

  test('a newline from an edit field becomes <br> in a plain label, and stays in a Markdown label', async () => {
    let model = await parseOk('flowchart LR\n  a --> b');
    model = updateNode(model, 'a', { label: 'one\ntwo' });
    model = updateNode(model, 'b', { label: 'one\ntwo', markdown: true });
    model = updateEdge(model, model.edges[0].id, { label: 'x\ny' });
    expect(model.nodes.map((n) => n.label)).toEqual(['one<br>two', 'one\ntwo']);
    expect(model.edges[0].label).toBe('x<br>y');
    expect(await parseOk(serialize(model))).toEqual(model);
  });
});

describe('kept on a canvas edit', () => {
  test('preamble before the flowchart line', async () => {
    const text = '%%{init: {"theme": "forest"}}%%\n%% note\ngraph TD\n  a --> b\n';
    const model = await parseOk(text);
    expect(model.preamble).toBe('%%{init: {"theme": "forest"}}%%\n%% note');
    const edited = updateNode(model, 'a', { label: 'A' });
    expect(serialize(edited)).toBe('%%{init: {"theme": "forest"}}%%\n%% note\nflowchart TB\n  a[A]\n  b\n  a --> b\n');
  });

  test('no preamble', async () => {
    expect((await parseOk('flowchart LR\n  a\n')).preamble).toBeUndefined();
    expect((await parseOk('\n\nflowchart LR\n  a\n')).preamble).toBeUndefined();
  });

  test('front matter that mentions graph', async () => {
    const model = await parseOk('---\ntitle: graph LR\n---\nflowchart TB\n  a\n');
    expect(model.preamble).toBe('---\ntitle: graph LR\n---');
    expect(model.direction).toBe('TB');
  });

  test('edge id, settings and length survive other edits', async () => {
    const model = await parseOk('flowchart LR\n  a e1@---> b\n  e1@{ animation: fast }\n');
    expect(model.edges[0]).toMatchObject({ ref: 'e1', length: 2, options: { animation: 'fast' } });
    const edited = connect(addNode(model), 'b', 'n1');
    expect(serialize(edited)).toBe('flowchart LR\n  a\n  b\n  n1[New node]\n  a e1@---> b\n  b --> n1\n  e1@{ animation: fast }\n');
  });

  test('a removed edge takes its settings with it', async () => {
    const model = await parseOk('flowchart LR\n  a e1@--> b\n  e1@{ animate: true }\n');
    expect(serialize(removeElements(model, [], [model.edges[0].id]))).toBe('flowchart LR\n  a\n  b\n');
  });

  test('edge length from the inspector', async () => {
    const model = await parseOk('flowchart LR\n  a -.-> b\n');
    const id = model.edges[0].id;
    expect(serialize(updateEdge(model, id, { length: 3 }))).toContain('a -...-> b');
    expect(serialize(updateEdge(model, id, { length: 3, stroke: 'thick', end: 'none' }))).toContain('a ===== b');
  });
});

describe('rejected instead of dropped', () => {
  test.each([
    ['icon shape', 'flowchart LR\n  A@{ icon: "fa:user", label: "User" }\n', 'icon shape (node A)'],
    ['image shape', 'flowchart LR\n  A@{ img: "data:image/png;base64,AAAA", label: "Pic" }\n', 'image shape (node A)'],
    ['click with a link', 'flowchart LR\n  A --> B\n  click B "https://example.com"\n', 'click on node B'],
    ['click with a callback', 'flowchart LR\n  A --> B\n  click A callback\n', 'click on node A'],
  ])('%s', async (_name, text, message) => {
    const result = await parse(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});

describe('@{ shape } syntax', () => {
  test('aliases map to the bracket shapes and keep the name as written', async () => {
    const model = await parseOk('flowchart LR\n  a@{ shape: decision }\n  b@{ shape: db, label: "Store" }\n  c>Bracket flag]\n  d@{ shape: odd }\n');
    expect(model.nodes.map((n) => [n.id, n.shape, n.shapeName])).toEqual([
      ['a', 'diamond', 'decision'],
      ['b', 'cylinder', 'db'],
      ['c', 'flag', undefined],
      ['d', 'flag', 'odd'],
    ]);
  });

  test('a new shape from the inspector keeps the syntax, with the short name', async () => {
    const model = await parseOk('flowchart LR\n  a@{ shape: decision, label: "Go?" }\n');
    expect(serialize(updateNode(model, 'a', { shape: 'hexagon' }))).toBe('flowchart LR\n  a@{ shape: hex, label: "Go?" }\n');
  });

  test('a plain label switches to brackets, because @{ label } is always Markdown', async () => {
    const model = await parseOk('flowchart LR\n  a@{ shape: diam, label: "Go?" }\n');
    expect(serialize(updateNode(model, 'a', { markdown: false }))).toBe('flowchart LR\n  a{Go?}\n');
    // Without a label, the text is the id: the syntax stays.
    const bare = await parseOk('flowchart LR\n  a@{ shape: diam }\n');
    expect(serialize(updateNode(bare, 'a', { shape: 'circle' }))).toBe('flowchart LR\n  a@{ shape: circle }\n');
    // Renaming it gives a plain label, so it switches too.
    expect(serialize(updateNode(bare, 'a', { label: 'Go?' }))).toBe('flowchart LR\n  a{Go?}\n');
  });

  test('bracket text and @{ shape } on the same node: the plain text wins, written with brackets', async () => {
    const model = await parseOk('flowchart LR\n  a[Old text] --> b\n  a@{ shape: diam }\n');
    expect(model.nodes[0]).toMatchObject({ label: 'Old text', shape: 'diamond', markdown: false });
    expect(model.nodes[0].shapeName).toBeUndefined();
  });
});

describe('invisible links', () => {
  test('have no markers', async () => {
    const model = await parseOk('flowchart LR\n  a --> b\n');
    const id = model.edges[0].id;
    const edited = updateEdge(model, id, { stroke: 'invisible' });
    expect(edited.edges[0]).toMatchObject({ stroke: 'invisible', end: 'none', bothEnds: false });
    expect(serialize(edited)).toContain('a ~~~ b');
    expect(serialize(updateEdge(edited, id, { length: 2 }))).toContain('a ~~~~ b');
  });
});

describe('diagram title', () => {
  test.each([
    ['---\ntitle: Checkout flow\n---', 'Checkout flow'],
    ['---\ntitle: "Quoted: yes"\nconfig:\n  look: classic\n---', 'Quoted: yes'],
    ['---\nconfig:\n  title: nested is not the title\n---', null],
    ['%% title: in a comment', null],
    [undefined, null],
  ])('%s', (preamble, title) => {
    expect(diagramTitle({ direction: 'TB', nodes: [], subgraphs: [], edges: [], preamble })).toBe(title);
  });
});
