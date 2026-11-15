import { describe, expect, test } from 'vitest';
import { addImageNode, addTextNode, DEFAULT_IMAGE, isImageNode, toggleClassOn, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

describe('image and text nodes from the dock', () => {
  test('an image node: the placeholder image, 120 by 120, no label; Mermaid reads the code back the same', async () => {
    const model = addImageNode(await parseOk('flowchart LR\n  a\n'));
    const out = serialize(model);
    expect(out).toBe(`flowchart LR\n  a\n  n1@{ img: "${DEFAULT_IMAGE}", w: 120, h: 120 }\n`);
    expect(await parseOk(out)).toEqual(model);
  });

  test('a text block, inside the subgraph it is added to', async () => {
    const model = addTextNode(await parseOk('flowchart LR\n  subgraph s\n    a\n  end\n'), 's');
    const out = serialize(model);
    expect(out).toBe('flowchart LR\n  subgraph s\n    a\n    n1@{ shape: text, label: "Text" }\n  end\n');
    const read = await parseOk(out);
    expect(read.nodes.find((n) => n.id === 'n1')).toMatchObject({ shape: 'text', label: 'Text', parent: 's' });
  });

  test('ids do not clash with nodes already there', async () => {
    const model = addTextNode(addImageNode(await parseOk('flowchart LR\n  n1\n')));
    expect(model.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('an image takes no class', () => {
  test('a class put on a selection skips its image nodes', async () => {
    const model = addImageNode(await parseOk('flowchart LR\n  a\n  classDef hot fill:#f96\n'));
    const next = toggleClassOn(model, 'hot', { nodes: ['a', 'n1'] });
    expect(next.nodes.find((n) => n.id === 'a')!.classes).toEqual(['hot']);
    expect(next.nodes.find((n) => n.id === 'n1')!.classes).toBeUndefined();
    expect(isImageNode(next, 'n1')).toBe(true);
    expect(isImageNode(next, 'a')).toBe(false);
    // Only images: nothing to change.
    expect(toggleClassOn(model, 'hot', { nodes: ['n1'] })).toBe(model);
  });
});
