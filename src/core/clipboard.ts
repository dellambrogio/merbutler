/** A fenced code block: ``` or ~~~, an optional info string, the body, the same fence again. */
const FENCE = /^(`{3,}|~{3,})[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;

export interface Extracted {
  code: string;
  /** True if the code came from inside a Markdown code fence. */
  fenced: boolean;
}

/**
 * Gets Mermaid code from pasted text. If the text has Markdown code fences, the first
 * block tagged `mermaid` is used, else the first block. Text without fences is kept as is.
 * Line endings are normalized to \n.
 */
export function extractMermaid(text: string): Extracted {
  const normalized = text.replace(/\r\n?/g, '\n');
  const blocks = [...normalized.matchAll(FENCE)].map((m) => ({ lang: m[2].toLowerCase(), body: m[3] }));
  if (blocks.length === 0) return { code: normalized, fenced: false };
  const block = blocks.find((b) => b.lang === 'mermaid') ?? blocks[0];
  return { code: block.body, fenced: true };
}
