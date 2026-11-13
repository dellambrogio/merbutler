import { describe, expect, test } from 'vitest';
import { parse } from '../src/parse';
import { serialize } from '../src/serialize';
import { removeElements, updateEdge, updateNode, updateSubgraph, type FlowModel } from '../src/model';
import { layoutModel } from '../src/layout';
import { classesFromText, edgeLook, nodeLook, stylesFromText, stylesToText, subgraphLook } from '../src/styling';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

const node = (m: FlowModel, id: string) => m.nodes.find((n) => n.id === id)!;

describe('look', () => {
  test('default class, then classes in order, then style', async () => {
    const m = await parseOk(
      'flowchart LR\n  a --> b:::hot\n  c:::hot\n  class c cold\n' +
        '  classDef default fill:#eee,color:#111\n  classDef hot fill:#f96,stroke:#333\n  classDef cold fill:#9cf,stroke-width:4\n' +
        '  style c stroke:#0a0,font-weight:bold\n',
    );
    // No class: the default class.
    expect(nodeLook(m, node(m, 'a'))).toEqual({ fill: '#eee', color: '#111' });
    // A class: not the default class.
    expect(nodeLook(m, node(m, 'b'))).toEqual({ fill: '#f96', stroke: '#333' });
    // Later class wins, style wins over classes; a bare stroke-width gets px.
    expect(nodeLook(m, node(m, 'c'))).toEqual({ fill: '#9cf', stroke: '#0a0', strokeWidth: '4px', fontWeight: 'bold' });
  });

  test('ignores values outside a small safe set', async () => {
    // Mermaid's grammar already rejects parentheses here (url(), var(), rgb()). The canvas also drops
    // quotes and comments, and strips !important.
    const m = await parseOk("flowchart LR\n  a\n  style a color:'red',fill:#f00/*x*/,stroke-width:2px !important,font-size:12px\n");
    expect(nodeLook(m, node(m, 'a'))).toEqual({ strokeWidth: '2px', fontSize: '12px' });
    // Still kept in the code as written.
    expect(node(m, 'a').styles).toHaveLength(4);
  });

  test('edges: linkStyle default, then classes, then own linkStyle', async () => {
    const m = await parseOk(
      'flowchart LR\n  a e1@--> b --> c\n  classDef hot stroke:#f00,stroke-width:3px\n  class e1 hot\n' +
        '  linkStyle default stroke:#999,color:#555\n  linkStyle 0 stroke-width:5px\n',
    );
    expect(edgeLook(m, m.edges[0])).toEqual({ stroke: '#f00', color: '#555', strokeWidth: '5px' });
    expect(edgeLook(m, m.edges[1])).toEqual({ stroke: '#999', color: '#555' });
  });

  test('subgraphs: classes and style', async () => {
    const m = await parseOk('flowchart LR\n  subgraph s\n    a\n  end\n  classDef box stroke:#00f\n  class s box\n  style s fill:#ffe\n');
    expect(subgraphLook(m, m.subgraphs[0])).toEqual({ stroke: '#00f', fill: '#ffe' });
  });

  test('reaches the canvas: node data, edge style and arrow color', async () => {
    const m = await parseOk('flowchart LR\n  a --> b\n  style a fill:#f96\n  linkStyle 0 stroke:#0a0,stroke-width:3px\n');
    const { nodes, edges } = layoutModel(m);
    expect(nodes.find((n) => n.id === 'a')?.data.look).toEqual({ fill: '#f96' });
    expect(nodes.find((n) => n.id === 'b')?.data.look).toBeUndefined();
    expect(edges[0].style).toMatchObject({ stroke: '#0a0', strokeWidth: '3px' });
    expect(edges[0].markerEnd).toMatchObject({ color: '#0a0' });
  });
});

describe('editing', () => {
  test('classes and style from the inspector', async () => {
    const m = await parseOk('flowchart LR\n  a --> b\n  classDef hot fill:#f96\n');
    const edited = updateNode(m, 'a', { classes: classesFromText('hot, cold hot'), styles: stylesFromText('stroke:#333; color: white ;') });
    expect(serialize(edited)).toBe('flowchart LR\n  a\n  b\n  a --> b\n  classDef hot fill:#f96\n  class a hot\n  class a cold\n  style a stroke:#333,color: white\n');
    // Clearing the fields removes the statements.
    const cleared = updateNode(edited, 'a', { classes: classesFromText(''), styles: stylesFromText('') });
    expect(serialize(cleared)).toBe('flowchart LR\n  a\n  b\n  a --> b\n  classDef hot fill:#f96\n');
  });

  test('a class on an edge adds an edge id', async () => {
    const m = await parseOk('flowchart LR\n  e1 --> b\n  b --> c\n');
    const edited = updateEdge(m, m.edges[1].id, { classes: ['hot'] });
    // "e1" is a node id, so the edge gets "e2".
    expect(serialize(edited)).toBe('flowchart LR\n  e1\n  b\n  c\n  e1 --> b\n  b e2@--> c\n  class e2 hot\n');
  });

  test('linkStyle indices follow the edges after a delete', async () => {
    const m = await parseOk('flowchart LR\n  a --> b --> c --> d\n  linkStyle 2 stroke:#f00\n  linkStyle 1 interpolate step\n');
    const edited = removeElements(m, [], [m.edges[0].id]);
    expect(serialize(edited)).toContain('  linkStyle 0 interpolate step\n  linkStyle 1 stroke:#f00\n');
  });

  test('subgraph style', async () => {
    const m = await parseOk('flowchart LR\n  subgraph s\n    a\n  end\n');
    expect(serialize(updateSubgraph(m, 's', { styles: ['fill:#ffe'] }))).toContain('  style s fill:#ffe\n');
  });

  test('inspector text', () => {
    expect(stylesToText(['fill:#f96', 'stroke-dasharray: 9,5'])).toBe('fill:#f96; stroke-dasharray: 9,5');
    expect(stylesFromText('fill:#f96;; stroke-dasharray: 9,5 ; nonsense')).toEqual(['fill:#f96', 'stroke-dasharray: 9,5']);
    expect(classesFromText('hot  cold,hot bad!name')).toEqual(['hot', 'cold']);
  });
});

describe('class order', () => {
  test('a later classDef wins, whatever order the class statements have', async () => {
    const m = await parseOk('flowchart LR\n  a\n  class a second\n  class a first\n  classDef first fill:#111\n  classDef second fill:#222\n');
    expect(m.nodes[0].classes).toEqual(['first', 'second']);
    expect(nodeLook(m, m.nodes[0])).toEqual({ fill: '#222' });
    const edited = updateNode(m, 'a', { classes: ['second', 'first'] });
    expect(edited.nodes[0].classes).toEqual(['first', 'second']);
  });
});

describe('readable labels', () => {
  test('a fill without a color gets dark or light text', async () => {
    const { textStyle, luminance } = await import('../src/styling');
    expect(textStyle({ fill: '#dcfce7' }).color).toBe('#1d2330');
    expect(textStyle({ fill: '#333' }).color).toBe('#f2f4f8');
    expect(textStyle({ fill: 'navy' }).color).toBe('#f2f4f8');
    expect(textStyle({ fill: '#333', color: '#ff0' }).color).toBe('#ff0');
    // Unknown color forms leave the theme color.
    expect(textStyle({ fill: 'hsl(1,2%,3%)' }).color).toBeUndefined();
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#0008')).toBeCloseTo(0);
  });
});
