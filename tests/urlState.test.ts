import { describe, expect, test } from 'vitest';
import { readHash, writeHash } from '../src/core/urlState';

describe('state in the URL hash', () => {
  const code = 'flowchart LR\n  A[Start ✨ «quotes» & more] --> B{"Done?"}\n  %% comment\n';

  test('code and gallery view round-trip', async () => {
    for (const gallery of [null, '', 'state-diagram']) {
      const hash = await writeHash({ code, gallery });
      expect(hash).toMatch(/^[\w=&%-]*$/);
      expect(await readHash(`#${hash}`)).toEqual({ code, gallery });
    }
  });

  test('the code is compressed: a long diagram gives a short link', async () => {
    const long = `flowchart TD\n${Array.from({ length: 200 }, (_, i) => `  n${i}[Step ${i}] --> n${i + 1}[Step ${i + 1}]`).join('\n')}\n`;
    const hash = await writeHash({ code: long, gallery: null });
    expect(hash.startsWith('code=')).toBe(true);
    expect(hash.length).toBeLessThan(long.length / 3);
    expect((await readHash(hash)).code).toBe(long);
  });

  test('plain text links, empty and broken hashes', async () => {
    const text = btoa(String.fromCharCode(...new TextEncoder().encode('pie\n  "A" : 1\n'))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await readHash(`#text=${text}`)).toEqual({ code: 'pie\n  "A" : 1\n', gallery: null });
    expect(await readHash('')).toEqual({ gallery: null });
    expect(await readHash('#code=not-deflate&gallery=pie-chart')).toEqual({ gallery: 'pie-chart' });
    expect(await readHash('#unknown=1')).toEqual({ gallery: null });
  });

  test('resized panels round-trip', async () => {
    const panels = { open: ['diagram'], at: {}, size: { diagram: { w: 320, h: 480.4 } } };
    const hash = await writeHash({ gallery: null, panels });
    expect(hash).toBe('open=diagram&size=diagram_320_480');
    expect(await readHash(`#${hash}`)).toEqual({ gallery: null, panels: { open: ['diagram'], at: {}, size: { diagram: { w: 320, h: 480 } } } });
    // Nonsense sizes are left out.
    expect(await readHash('#size=diagram_x_1.palette_5_400')).toEqual({ gallery: null });
  });

  test('a link to the old Layout panel opens the Diagram panel', async () => {
    expect(await readHash('#open=layout.classes&move=layout_10_-20')).toEqual({ gallery: null, panels: { open: ['diagram', 'classes'], at: { diagram: { x: 10, y: -20 } } } });
  });

  test('open and dragged panels round-trip', async () => {
    const panels = { open: ['classes'], at: { toolbar: { x: 40, y: 0 }, inspector: { x: -120, y: 30 } } };
    const hash = await writeHash({ code, gallery: null, panels });
    expect(hash).toContain('open=classes&move=toolbar_40_0.inspector_-120_30');
    expect(await readHash(hash)).toEqual({ code, gallery: null, panels });
    // Panels in their own place and none open: nothing written.
    expect(await writeHash({ gallery: null, panels: { open: [], at: { toolbar: { x: 0, y: 0.2 } } } })).toBe('');
    expect(await readHash('#move=toolbar_x_1.inspector_3_-4&open=Bad.classes')).toEqual({ gallery: null, panels: { open: ['classes'], at: { inspector: { x: 3, y: -4 } } } });
  });

  test('pane widths round-trip, and odd values are left out', async () => {
    const hash = await writeHash({ gallery: null, split: 35.54, editorSplit: 30 });
    expect(hash).toBe('split=35.5&editorsplit=30');
    expect(await readHash(hash)).toEqual({ gallery: null, split: 35.5, editorSplit: 30 });
    expect(await readHash('#split=2&editorsplit=abc')).toEqual({ gallery: null });
  });
});
