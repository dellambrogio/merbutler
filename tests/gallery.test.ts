import { describe, expect, test } from 'vitest';
import { GALLERY } from '../src/gallery';
import { parse } from '../src/parse';
import { structuredKind } from '../src/StructuredEditor';

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

  test('has every example of the Mermaid examples page', () => {
    expect(examples.filter((e) => e.id.startsWith('ex-')).length).toBe(81);
  });

  test('every example parses with Mermaid (editable or preview)', async () => {
    for (const ex of examples) {
      const r = await parse(ex.code);
      expect(r.ok || r.preview !== undefined, `${ex.id}: ${r.ok ? '' : r.error}`).toBe(true);
    }
  });

  // What the visual editor supports, per example. Update the snapshot when support changes.
  test('support status', async () => {
    const status: Record<string, string> = {};
    for (const ex of examples) {
      const r = await parse(ex.code);
      status[ex.id] = r.ok
        ? ex.caveat
          ? 'editable, lossy'
          : 'editable'
        : r.preview
          ? `${structuredKind(r.preview.name) ? `${structuredKind(r.preview.name)} editor` : 'preview'}: ${r.preview.name}`
          : r.error.replace(/^Not supported by the visual editor: /, 'read-only: ');
    }
    expect(status).toMatchSnapshot();
  });
});
