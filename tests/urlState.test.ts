import { describe, expect, test } from 'vitest';
import { readHash, writeHash } from '../src/urlState';

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
});
