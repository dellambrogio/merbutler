/**
 * Mermaid itself, for every diagram type: setup, one call at a time, and the text helpers the
 * type adapters share (entities, statements and comments, the preamble before the header line).
 *
 * The adapters use Mermaid internals (mermaidAPI.getDiagramFromText and each type's DB). The
 * mermaid version is pinned in package.json because this API is not public and can change.
 */
import mermaid from 'mermaid';
import { HEADER_LINE } from './diagramTypes';

/** Something Mermaid accepts that the canvas cannot keep. */
export class UnsupportedError extends Error {}

let initialized: Promise<void> | undefined;

let mermaidQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs Mermaid work one call at a time. Parsing and rendering fill Mermaid's diagram DBs, which
 * are shared: two parses that overlap (for example of two architecture diagrams) mix their data.
 */
export function withMermaid<T>(work: () => Promise<T>): Promise<T> {
  const run = mermaidQueue.then(work, work);
  mermaidQueue = run.catch(() => undefined);
  return run;
}

/** Sets up Mermaid once (securityLevel strict) and registers its diagram detectors. */
export function ensureInitialized(): Promise<void> {
  initialized ??= withMermaid(async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    // The first parse registers the lazy diagram detectors.
    await mermaid.parse('flowchart TB\n  a');
  });
  return initialized;
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
};

/**
 * Mermaid replaces each `#name;` / `#123;` entity with placeholder characters
 * before it parses. This converts the placeholders to the real characters.
 * Unknown named entities stay as `#name;`.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/ﬂ\xB0\xB0\+?(\d+)\xB6\xDF/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/ﬂ\xB0(\w+)\xB6\xDF/g, (_m, name: string) => NAMED_ENTITIES[name] ?? `#${name};`);
}

/** A statement or a `%%` comment line of the code, in order. */
export type CodeItem = { kind: 'statement' | 'comment'; text: string };

/**
 * Statements (split at newlines and `;`) and `%%` comments of the code, outside quotes.
 * Used for what Mermaid's DB does not keep as written: `click` statements (with securityLevel
 * 'strict' a callback leaves no trace, and links are rewritten) and comments.
 */
export function scan(text: string): CodeItem[] {
  const out: CodeItem[] = [];
  let current = '';
  let quoted = false;
  const flush = (): void => {
    if (current.trim() !== '') out.push({ kind: 'statement', text: current.trim() });
    current = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    if (!quoted && c === '%' && text[i + 1] === '%') {
      const end = text.indexOf('\n', i);
      const comment = text.slice(i, end < 0 ? text.length : end).trimEnd();
      flush();
      out.push({ kind: 'comment', text: comment });
      i = end < 0 ? text.length : end;
      continue;
    }
    if (!quoted && (c === '\n' || c === ';')) {
      flush();
      continue;
    }
    current += c;
  }
  flush();
  return out;
}

/** The statements of the code, without comments. */
export function statements(text: string): string[] {
  return scan(text).flatMap((item) => (item.kind === 'statement' ? [item.text] : []));
}

/** Front matter: `---` on the first line, up to the next line that is only `---`. */
const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
/** The header line of any diagram type. */
const HEADER = new RegExp(HEADER_LINE.source, 'm');

/**
 * The text before the `flowchart` line (front matter, directives, comments), without trailing
 * whitespace. Mermaid reads it; the model keeps it so a canvas edit does not drop it.
 */
export function preambleOf(text: string): string {
  const front = FRONT_MATTER.exec(text)?.[0].length ?? 0;
  const header = HEADER.exec(text.slice(front));
  const end = header ? front + header.index : front;
  return text.slice(0, end).trimEnd();
}
