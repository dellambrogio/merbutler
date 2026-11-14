import { describe, expect, test } from 'vitest';
import { GALLERY_EXAMPLES, GALLERY_TYPES, MERMAID_TYPE_COUNT } from '../src/gallery/gallery';
import { parse } from '../src/core/parse';
import { structuredKind } from '../src/structured/StructuredEditor';

const examples = GALLERY_EXAMPLES;

describe('gallery', () => {
  test('ids are unique', () => {
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
  });

  test('a caveat is only on an example the canvas can edit', async () => {
    for (const ex of examples.filter((e) => e.caveat)) {
      expect((await parse(ex.code)).ok, ex.id).toBe(true);
    }
  });

  test('has the examples of every diagram type, each type in one family', () => {
    expect(examples.filter((e) => e.id.startsWith('ex-')).length).toBe(81);
    expect(GALLERY_TYPES.length).toBe(MERMAID_TYPE_COUNT);
    expect(new Set(GALLERY_TYPES.map((t) => t.id)).size).toBe(GALLERY_TYPES.length);
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
