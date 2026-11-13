import { describe, expect, test } from 'vitest';
import { GALLERY } from '../src/gallery';
import { parse } from '../src/parse';

const examples = GALLERY.flatMap((g) => g.examples);

describe('gallery', () => {
  test('ids are unique', () => {
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
  });

  test('a caveat is only on an example the canvas can edit', async () => {
    for (const ex of examples.filter((e) => e.caveat)) {
      expect((await parse(ex.code)).ok, ex.id).toBe(true);
    }
  });

  // What the visual editor supports, per example. Update the snapshot when support changes.
  test('support status', async () => {
    const status: Record<string, string> = {};
    for (const ex of examples) {
      const r = await parse(ex.code);
      status[ex.id] = r.ok ? (ex.caveat ? 'editable, lossy' : 'editable') : r.error.replace(/^Not supported by the visual editor: /, 'read-only: ');
    }
    expect(status).toMatchSnapshot();
  });
});
