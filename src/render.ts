/**
 * Mermaid's own rendering, for the gallery previews and the preview pane of diagram types the
 * canvas cannot edit. `mermaid.render` uses shared state, so renders run one at a time.
 */
import mermaid from 'mermaid';
import { BUNDLED_PREFIXES, mermaidIconPacks } from './icons';
import { ensureInitialized, withMermaid } from './parse';

export type RenderResult = { svg: string } | { error: string };

let registered = false;

/** The same icon packs as the canvas, so previews and canvas agree. They load when a diagram needs an icon. */
function registerIcons(): void {
  if (registered) return;
  registered = true;
  mermaid.registerIconPacks(
    [...BUNDLED_PREFIXES].map((name) => ({
      name,
      loader: async () => (await mermaidIconPacks()).find((p) => p.name === name)!.icons,
    })),
  );
}

let count = 0;

/**
 * Renders the code to an SVG string with Mermaid (securityLevel 'strict', set up by `parse`).
 * Renders share the queue of `withMermaid` with parses.
 */
export function renderMermaid(code: string): Promise<RenderResult> {
  registerIcons();
  return ensureInitialized().then(() => withMermaid(async (): Promise<RenderResult> => {
    const id = `mermaid-render-${++count}`;
    try {
      const { svg } = await mermaid.render(id, code);
      return { svg };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      // A failed render can leave its temporary element in the page.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  }));
}
