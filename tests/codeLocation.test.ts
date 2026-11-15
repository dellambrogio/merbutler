import { describe, expect, test } from 'vitest';
import { codeLocation, type CodeTarget } from '../src/core/codeLocation';
import type { FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

/** The text "Go to code" selects, or null. */
async function at(code: string, target: CodeTarget | ((m: FlowModel) => CodeTarget)): Promise<string | null> {
  const model = await parseOk(code);
  const r = codeLocation(code, model, typeof target === 'function' ? target(model) : target);
  return r ? code.slice(r.from, r.to) : null;
}

const edge = (source: string, target: string, nth = 0) => (m: FlowModel): CodeTarget => ({
  kind: 'edge',
  id: m.edges.filter((e) => e.source === source && e.target === target)[nth].id,
});

describe('go to code', () => {
  const code = `---
config:
  layout: dagre
---
flowchart LR
  %% a comment that names b
  a[Start] --> b
  b --> c{Ok?}
  c -->|yes| b
  subgraph s [Group]
    d
  end
  b --> c
  style b fill:#f96
%% merbutler-layout a=0,0 b=100,0
`;

  test('a node: its definition, even inside a link; else the line where it is alone', async () => {
    expect(await at(code, { kind: 'node', id: 'a' })).toBe('a[Start] --> b');
    expect(await at(code, { kind: 'node', id: 'c' })).toBe('b --> c{Ok?}');
    expect(await at(code, { kind: 'node', id: 'd' })).toBe('d');
  });

  test('a node defined only by its links: the first line that uses it, not a comment or the front matter', async () => {
    expect(await at(code, { kind: 'node', id: 'b' })).toBe('a[Start] --> b');
  });

  test('a subgraph: its subgraph line', async () => {
    expect(await at(code, { kind: 'subgraph', id: 's' })).toBe('subgraph s [Group]');
  });

  test('an edge: its own line; two edges between the same nodes go to their own lines', async () => {
    expect(await at(code, edge('c', 'b'))).toBe('c -->|yes| b');
    expect(await at(code, edge('b', 'c', 0))).toBe('b --> c{Ok?}');
    expect(await at(code, edge('b', 'c', 1))).toBe('b --> c');
  });

  test('an edge with an id goes to its line by the id', async () => {
    expect(await at('flowchart LR\n  a --> b\n  a e1@--> b\n', (m) => ({ kind: 'edge', id: m.edges.find((e) => e.ref === 'e1')!.id }))).toBe('a e1@--> b');
  });

  test('ids that are part of longer ids are not confused', async () => {
    const c2 = 'flowchart LR\n  ab --> abc\n  abc[Long]\n  a-b[Dash]\n  ab[Short]\n';
    expect(await at(c2, { kind: 'node', id: 'abc' })).toBe('abc[Long]');
    expect(await at(c2, { kind: 'node', id: 'ab' })).toBe('ab[Short]');
    expect(await at(c2, { kind: 'node', id: 'a-b' })).toBe('a-b[Dash]');
  });

  test('state diagrams: a state, a composite state, a transition', async () => {
    const s = 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : start\n  state Busy {\n    Work\n  }\n';
    expect(await at(s, { kind: 'node', id: 'Idle' })).toBe('[*] --> Idle');
    expect(await at(s, { kind: 'subgraph', id: 'Busy' })).toBe('state Busy {');
    expect(await at(s, edge('Idle', 'Busy'))).toBe('Idle --> Busy : start');
  });

  test('nothing to go to: an element the code does not name', async () => {
    expect(await at('flowchart LR\n  a\n', { kind: 'node', id: 'zz' })).toBeNull();
  });
});
