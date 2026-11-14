import { describe, expect, test } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, Text } from '@codemirror/state';
import { completionSource, errorDiagnostic, mermaidLanguage } from '../src/editor/mermaidEditor';

/** [text, token] pairs of a document, without whitespace. */
function tokens(doc: string): Array<[string, string]> {
  const state = EditorState.create({ doc, extensions: [mermaidLanguage] });
  const tree = ensureSyntaxTree(state, doc.length, 5000)!;
  const out: Array<[string, string]> = [];
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Document' || node.from === node.to) return;
      out.push([doc.slice(node.from, node.to), node.name]);
    },
  });
  return out;
}

const find = (all: Array<[string, string]>, text: string): string | undefined => all.find(([t]) => t === text)?.[1];

describe('highlighting', () => {
  test('keywords, ids, edges, labels, shapes, comments', () => {
    const all = tokens('flowchart LR\n  %% note\n  a[Start] -->|go| b{"Ok?"}\n  subgraph s\n    c\n  end\n');
    expect(find(all, 'flowchart')).toBe('keyword');
    expect(find(all, 'LR')).toBe('atom');
    expect(find(all, '%% note')).toBe('comment');
    expect(find(all, 'a')).toBe('variableName');
    expect(find(all, '[')).toBe('bracket');
    expect(find(all, 'Start')).toBe('string');
    expect(find(all, '-->')).toBe('operator');
    expect(find(all, 'go')).toBe('string');
    expect(find(all, '"Ok?"')).toBe('string');
    expect(find(all, 'subgraph')).toBe('keyword');
    expect(find(all, 'end')).toBe('keyword');
  });

  test('front matter, @{} data, styling and both-ends edges', () => {
    const all = tokens('---\ntitle: X\n---\nflowchart TB\n  a@{ shape: diam, h: 40 } o--o b\n  classDef hot fill:#f96\n');
    expect(find(all, '---')).toBe('meta');
    expect(find(all, 'title')).toBe('propertyName');
    expect(find(all, 'shape')).toBe('propertyName');
    expect(find(all, 'diam')).toBe('atom');
    expect(find(all, '40')).toBe('number');
    expect(find(all, 'o--o')).toBe('operator');
    expect(find(all, 'classDef')).toBe('keyword');
    expect(find(all, 'fill')).toBe('propertyName');
    expect(find(all, '#f96')).toBe('color');
  });
});

describe('autocompletion', () => {
  const data = () => ({ ids: ['start', 'check'], classes: ['hot'] });
  async function complete(doc: string): Promise<string[]> {
    const pos = doc.indexOf('|');
    const text = doc.replace('|', '');
    const state = EditorState.create({ doc: text, extensions: [mermaidLanguage] });
    const result = await completionSource(data)(new CompletionContext(state, pos, true));
    return result?.options.map((o) => o.label) ?? [];
  }

  test('statements and ids at the start of a line', async () => {
    const labels = await complete('flowchart LR\n  start --> check\n  |');
    expect(labels).toEqual(expect.arrayContaining(['subgraph', 'classDef', 'click', 'start', 'check']));
  });

  test('directions, ids after an edge, classes', async () => {
    expect(await complete('flowchart |')).toEqual(['TB', 'TD', 'BT', 'LR', 'RL']);
    expect(await complete('flowchart LR\n  start --> c|')).toEqual(['start', 'check']);
    expect(await complete('flowchart LR\n  a:::|')).toEqual(['hot']);
    expect(await complete('flowchart LR\n  class start |')).toEqual(['hot']);
  });

  test('@{} keys, shape names with aliases, values', async () => {
    expect(await complete('flowchart LR\n  a@{ |')).toEqual(expect.arrayContaining(['shape', 'label', 'icon', 'curve']));
    const shapes = await complete('flowchart LR\n  a@{ shape: d|');
    expect(shapes).toEqual(expect.arrayContaining(['diam', 'decision', 'doc', 'cyl', 'cloud']));
    expect(await complete('flowchart LR\n  s@{ view: |')).toEqual(['collapsed', 'expanded']);
  });

  test('front matter keys and theme names', async () => {
    expect(await complete('---\nconfig:\n  theme: |\n---\nflowchart LR\n')).toEqual(expect.arrayContaining(['default', 'forest', 'neo', 'redux-dark']));
    expect(await complete('---\nconfig:\n  la|\n---\nflowchart LR\n')).toEqual(expect.arrayContaining(['layout', 'look']));
  });

  test('icon names from the bundled packs', async () => {
    expect(await complete('flowchart LR\n  a["fa:fa-twit|"]')).toContain('fa:fa-twitter');
    expect(await complete('flowchart LR\n  a@{ icon: "fab:git|" }')).toContain('fab:github');
  });
});

describe('error marks', () => {
  const line = (doc: string, error: string): string | null => {
    const text = Text.of(doc.split('\n'));
    const mark = errorDiagnostic(text, error);
    return mark ? text.sliceString(mark.from, mark.to) : null;
  };

  test("Mermaid's line numbers count from the flowchart line", () => {
    const doc = '---\ntitle: x\n---\n%% note\nflowchart LR\n  a --> b\n  c --> -->';
    expect(line(doc, 'Parse error on line 3:\n...')).toBe('c --> -->');
  });

  test('Mermaid removes comment lines, and blank lines just before them, before it counts', () => {
    const cases: Array<[string, string]> = [
      ['flowchart LR\n  %% x\n  a --> b\n  c --> -->', 'Parse error on line 3:'],
      ['flowchart LR\n\n  a --> b\n\n  c --> -->', 'Parse error on line 5:'],
      ['flowchart LR\n  %% x\n  %% y\n  a --> b\n  c --> -->', 'Parse error on line 3:'],
      ['flowchart LR\n  a --> b\n\n\n  %% x\n  c --> -->', 'Parse error on line 3:'],
    ];
    for (const [doc, error] of cases) expect(line(doc, error), doc).toBe('c --> -->');
  });

  test("the canvas's own errors mark the line with the id or shape", () => {
    const doc = 'flowchart LR\n  a --> b\n  b@{ shape: nope }';
    expect(line(doc, 'No such shape: nope.')).toBe('b@{ shape: nope }');
    expect(line('flowchart LR\n  x --> ab\n  ab --> c\n  click c "x"', 'Not supported: click on c, which is not a node (node c)')).toBe('ab --> c');
  });
});

describe('other diagram types', () => {
  test('each type gets its keywords highlighted, in a generic mode', () => {
    const all = tokens('sequenceDiagram\n  %% note\n  participant Alice\n  Alice->>Bob: "Hi" 42\n  loop Every minute\n  end\n');
    expect(find(all, 'sequenceDiagram')).toBe('keyword');
    expect(find(all, '%% note')).toBe('comment');
    expect(find(all, 'participant')).toBe('keyword');
    expect(find(all, 'Alice')).toBe('variableName');
    expect(find(all, '->>')).toBe('operator');
    expect(find(all, '"Hi"')).toBe('string');
    expect(find(all, '42')).toBe('number');
    expect(find(all, 'loop')).toBe('keyword');
    // A flowchart keyword is not one in a sequence diagram.
    expect(find(tokens('sequenceDiagram\n  A->>B: style\n'), 'style')).toBe('variableName');
  });

  test('beta keywords, front matter, and types with dashes in keywords', () => {
    const all = tokens('---\ntitle: Sales\n---\nxychart-beta\n  x-axis [jan, feb]\n  bar [1, 2]\n');
    expect(find(all, 'xychart-beta')).toBe('keyword');
    expect(find(all, 'x-axis')).toBe('keyword');
    expect(find(all, 'bar')).toBe('keyword');
    expect(find(tokens('stateDiagram-v2\n  [*] --> A\n  A --> B : go\n'), '[*]')).toBe('atom');
  });

  test('swimlanes use the flowchart mode', () => {
    const all = tokens('swimlane-beta LR\n  subgraph A\n    a --> b\n  end\n');
    expect(find(all, 'swimlane-beta')).toBe('keyword');
    expect(find(all, 'LR')).toBe('atom');
    expect(find(all, 'subgraph')).toBe('keyword');
    expect(find(all, '-->')).toBe('operator');
  });

  async function complete(doc: string): Promise<string[]> {
    const pos = doc.indexOf('|');
    const state = EditorState.create({ doc: doc.replace('|', ''), extensions: [mermaidLanguage] });
    const result = await completionSource(() => ({ ids: [], classes: [] }))(new CompletionContext(state, pos, true));
    return result?.options.map((o) => o.label) ?? [];
  }

  test('the header completes every type keyword', async () => {
    const labels = await complete('|');
    expect(labels).toEqual(expect.arrayContaining(['flowchart', 'sequenceDiagram', 'stateDiagram-v2', 'swimlane-beta', 'xychart-beta', 'railroad-peg-beta', 'C4Context']));
    expect(await complete('---\ntitle: x\n---\nseq|')).toContain('sequenceDiagram');
  });

  test("the body completes the type's keywords", async () => {
    expect(await complete('gitGraph\n  com|')).toEqual(expect.arrayContaining(['commit', 'branch', 'checkout', 'merge']));
    expect(await complete('swimlane-beta |')).toEqual(['TB', 'TD', 'BT', 'LR', 'RL']);
  });

  test('error marks count from the header line of any type', () => {
    const doc = Text.of('---\ntitle: x\n---\nsequenceDiagram\n  %% c\n  Alice->>Bob: hi\n  Bob-->>>Alice'.split('\n'));
    const mark = errorDiagnostic(doc, 'Parse error on line 3:\n...');
    expect(mark && doc.sliceString(mark.from, mark.to)).toBe('Bob-->>>Alice');
    const pie = Text.of('pie title X\n  "a" : 1\n  "b" : x'.split('\n'));
    const pieMark = errorDiagnostic(pie, 'Parsing failed: Lexer error on line 3, column 9: unexpected character');
    expect(pieMark && pie.sliceString(pieMark.from, pieMark.to)).toBe('"b" : x');
  });
});
