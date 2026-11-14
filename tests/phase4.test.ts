import { describe, expect, test } from 'vitest';
import { imageSource } from '../src/canvas/AssetView';
import { layoutModel } from '../src/canvas/layout';
import { diagramCurve, updateNode, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';

async function parseOk(text: string): Promise<FlowModel> {
  const result = await parse(text);
  if (!result.ok) throw new Error(result.error);
  return result.model;
}

describe('icon and image nodes', () => {
  test('an empty label stays empty, and edits keep the @{} data', async () => {
    const m = await parseOk('flowchart LR\n  a@{ icon: "fa:user", form: "circle" }\n');
    expect(m.nodes[0]).toMatchObject({ label: '', asset: { kind: 'icon', icon: 'fa:user', form: 'circle' } });
    const labeled = updateNode(m, 'a', { label: 'Me', markdown: true });
    expect(serialize(labeled)).toBe('flowchart LR\n  a@{ icon: "fa:user", form: "circle", label: "Me" }\n');
    expect(serialize(updateNode(labeled, 'a', { label: '' }))).toBe('flowchart LR\n  a@{ icon: "fa:user", form: "circle" }\n');
    expect(serialize(updateNode(m, 'a', { asset: { kind: 'icon', icon: 'mdi:cloud', h: 64 } }))).toBe('flowchart LR\n  a@{ icon: "mdi:cloud", h: 64 }\n');
  });

  test('sizes: icons at least 48, images from w/h or 80', async () => {
    const m = await parseOk(
      'flowchart LR\n  i@{ icon: "fa:x", h: 20 }\n  j@{ icon: "fa:x", h: 64, label: "Label" }\n  p@{ img: "data:image/png;base64,AA", w: 120 }\n  q@{ img: "data:image/png;base64,AA" }\n',
    );
    const size = Object.fromEntries(layoutModel(m).nodes.map((n) => [n.id, [n.width, n.height]]));
    expect(size.i).toEqual([48, 48]);
    expect(size.j[1]).toBeGreaterThan(64);
    expect(size.p).toEqual([120, 120]);
    expect(size.q).toEqual([80, 80]);
  });

  test('which images load: data at once, http(s) after consent, nothing else', () => {
    expect(imageSource('data:image/svg+xml,%3Csvg/%3E')).toEqual({ kind: 'data' });
    expect(imageSource('https://cdn.example.com:8443/a.png')).toEqual({ kind: 'remote', host: 'cdn.example.com:8443' });
    expect(imageSource('javascript:alert(1)')).toEqual({ kind: 'blocked' });
    expect(imageSource('file:///etc/passwd')).toEqual({ kind: 'blocked' });
    expect(imageSource('logo.png')).toEqual({ kind: 'blocked' });
    expect(imageSource('data:text/html,<b>x</b>')).toEqual({ kind: 'blocked' });
  });
});

describe('edges', () => {
  test('animation, speed and step reach the canvas', async () => {
    const m = await parseOk(
      'flowchart LR\n  a e1@--> b e2@--> c e3@--> d\n  e1@{ animate: true }\n  e2@{ animation: slow, step: 2 }\n  e3@{ animate: false, animation: fast }\n',
    );
    const [e1, e2, e3] = layoutModel(m).edges;
    expect([e1.animated, e1.className]).toEqual([true, 'edge-anim-fast']);
    expect([e2.animated, e2.className, e2.data?.step]).toEqual([true, 'edge-anim-slow', 2]);
    expect(e3.animated).toBeUndefined();
  });

  test('curve: edge, then linkStyle default, then the diagram config', async () => {
    const m = await parseOk(
      '---\nconfig:\n  flowchart:\n    curve: stepBefore\n---\nflowchart LR\n  a e1@--> b --> c\n  e1@{ curve: linear }\n',
    );
    expect(layoutModel(m).edges.map((e) => e.data?.curve)).toEqual(['linear', 'stepBefore']);
    const withDefault = await parseOk('flowchart LR\n  a --> b\n  linkStyle default interpolate step\n');
    expect(layoutModel(withDefault).edges[0].data?.curve).toBe('step');
    expect(layoutModel(await parseOk('flowchart LR\n  a --> b\n')).edges[0].data?.curve).toBeUndefined();
  });

  test.each([
    ['---\nconfig:\n  flowchart:\n    curve: linear\n---', 'linear'],
    ['---\nconfig:\n  look: classic\n  flowchart:\n    htmlLabels: false\n    curve: "basis"\n  theme: dark\n---', 'basis'],
    ['---\nconfig:\n  flowchart:\n    htmlLabels: false\n  curve: wrong-level\n---', null],
    ['%%{init: {"flowchart": {"curve": "step"}}}%%', 'step'],
    ['%% curve: linear', null],
  ])('diagram curve from %j', (preamble, curve) => {
    expect(diagramCurve({ direction: 'TB', nodes: [], subgraphs: [], edges: [], preamble })).toBe(curve);
  });
});
