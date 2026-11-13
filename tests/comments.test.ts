import { describe, expect, test } from 'vitest';
import { commentsFromText, commentsToText, removeElements, updateEdge, updateNode, type FlowModel } from '../src/model';
import { parse, scan } from '../src/parse';
import { serialize } from '../src/serialize';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

/** Parse, write, parse: the model and the text must not change any more. */
async function stable(text: string): Promise<string> {
  const model = await parseOk(text);
  const out = serialize(model);
  expect(await parseOk(out)).toEqual(model);
  expect(serialize(await parseOk(out))).toBe(out);
  return out;
}

describe('comments', () => {
  test('scan: comments outside quotes only', () => {
    expect(scan('a["%% not a comment"] --> b\n  %% a comment\nc')).toEqual([
      { kind: 'statement', text: 'a["%% not a comment"] --> b' },
      { kind: 'comment', text: '%% a comment' },
      { kind: 'statement', text: 'c' },
    ]);
  });

  test('chains and & take the comment to the first edge of the statement', async () => {
    const out = await stable('flowchart LR\n  a --> b --> c\n  %% from d\n  d & e --> f\n  %% from c\n  c --> d\n');
    expect(out).toContain('  %% from d\n  d --> f\n');
    expect(out).toContain('  %% from c\n  c --> d\n');
  });

  test('edges from a subgraph, edge options and a subgraph with a title only', async () => {
    const out = await stable(
      'flowchart LR\n  %% group\n  subgraph Some title\n    a\n  end\n  %% out of the group\n  subGraph0 --> b\n  x e1@--> y\n  %% options\n  e1@{ animate: true }\n',
    );
    expect(out).toContain('  %% group\n  subgraph subGraph0 [Some title]\n');
    expect(out).toContain('  %% out of the group\n  subGraph0 --> b\n');
    expect(out).toContain('  %% options\n  x e1@--> y\n');
  });

  test('a comment goes with its element through edits, and away with it', async () => {
    const model = await parseOk('flowchart LR\n  %% about a\n  a[A]\n  %% about the edge\n  a --> b\n');
    const renamed = updateNode(model, 'a', { label: 'Alpha', shape: 'round' });
    expect(serialize(renamed)).toBe('flowchart LR\n  %% about a\n  a(Alpha)\n  b\n  %% about the edge\n  a --> b\n');
    const removed = removeElements(renamed, [], [renamed.edges[0].id]);
    expect(serialize(removed)).not.toContain('about the edge');
  });

  test('inspector: one %% line per line, never a directive', async () => {
    expect(commentsFromText('first\n\n  {second}  \n')).toEqual(['%% first', '%% {second}']);
    expect(commentsToText(['%% first', '%%tight'])).toBe('first\ntight');
    const model = await parseOk('flowchart LR\n  a --> b\n');
    const edited = updateEdge(model, model.edges[0].id, { comments: commentsFromText('why this edge') });
    expect(serialize(edited)).toBe('flowchart LR\n  a\n  b\n  %% why this edge\n  a --> b\n');
    expect(serialize(updateEdge(edited, model.edges[0].id, { comments: [] }))).toBe('flowchart LR\n  a\n  b\n  a --> b\n');
  });
});
