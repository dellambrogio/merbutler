/**
 * Finds the syntax reference entries for the token under the cursor, or for the selected text.
 * Used by the Syntax panel and by the code editor's hover tooltips.
 */
import { HEADER_LINE, typeOfKeyword } from '../core/diagramTypes';
import { COMMON, docForType, type SyntaxDoc, type SyntaxEntry, type Token } from './syntaxDocs';

/** A word: letters, digits, `_`, and inner `-` (`x-axis`, `cherry-pick`, `stateDiagram-v2`). */
const WORD = /[\p{L}\p{N}_$]/u;
/** Symbols: arrows, brackets, `:::`, `%%`, … (not spaces, words, quotes or commas). */
const SYMBOL = /[^\s\p{L}\p{N}_$"',]/u;

/**
 * The tokens at a position in a line, most specific first: the word under the cursor (with inner
 * dashes), and the run of symbols under it. `column` is between characters; a cursor just after a
 * token still counts. An arrow like `--o` gives both `--o` and its parts.
 */
export function tokensAt(line: string, column: number): string[] {
  const found: string[] = [];
  for (const test of [WORD, SYMBOL]) {
    const inside = (i: number): boolean => i >= 0 && i < line.length && (test.test(line[i]) || (test === WORD && line[i] === '-' && WORD.test(line[i - 1] ?? '') && WORD.test(line[i + 1] ?? '')));
    let at = column;
    if (!inside(at)) at = column - 1;
    if (!inside(at)) continue;
    let from = at;
    let to = at + 1;
    while (inside(from - 1)) from--;
    while (inside(to)) to++;
    found.push(line.slice(from, to));
  }
  // An arrow with `o` or `x` ends (`--o`, `||--o{`, `o--o`, `-x`): symbols and those letters together.
  const arrow = arrowAt(line, column);
  if (arrow) found.unshift(arrow);
  // A symbol run joined to a word (`::icon`): also try them together.
  const sym = found.find((t) => !WORD.test(t[0]) && t !== arrow);
  const word = found.find((t) => WORD.test(t[0]));
  if (sym && word && !arrow) {
    if (line.includes(sym + word)) found.unshift(sym + word);
    else if (line.includes(word + sym)) found.unshift(word + sym);
  }
  return [...new Set(found)];
}

/** The arrow at the column, counting `o` and `x` that touch a symbol and no other letter. */
function arrowAt(line: string, column: number): string | null {
  const sym = (i: number): boolean => i >= 0 && i < line.length && SYMBOL.test(line[i]);
  const end = (i: number): boolean =>
    i >= 0 && i < line.length && (line[i] === 'o' || line[i] === 'x') && !WORD.test(line[i - 1] ?? ' ') && !WORD.test(line[i + 1] ?? ' ') && (sym(i - 1) || sym(i + 1));
  const inside = (i: number): boolean => sym(i) || end(i);
  let at = column;
  if (!inside(at)) at = column - 1;
  if (!inside(at)) return null;
  let from = at;
  let to = at + 1;
  while (inside(from - 1)) from--;
  while (inside(to)) to++;
  const text = line.slice(from, to);
  return /[ox]/.test(text) && /[^ox]/.test(text) ? text : null;
}

/** The token for a selection: the selected text, trimmed, when it is short and on one line. */
export function selectionToken(text: string): string | null {
  const t = text.trim();
  return t !== '' && t.length <= 40 && !t.includes('\n') ? t : null;
}

const matchesToken = (token: Token, text: string, loose: boolean): boolean =>
  typeof token === 'string' ? (loose ? token.toLowerCase() === text.toLowerCase() : token === text) : token.test(text);

/** Symbol tokens also match with a label pipe or colon stuck to them (`-->|`, `-->>:`). */
function variants(text: string): string[] {
  const trimmed = text.replace(/^[|:]+|[|:;]+$/g, '');
  return trimmed !== text && trimmed !== '' ? [text, trimmed] : [text];
}

export interface Match {
  /** The token that matched. */
  token: string;
  entries: SyntaxEntry[];
}

/**
 * The entries of `doc` (and the common section) for the first candidate that has any. Exact matches
 * win over case-insensitive ones.
 */
export function findEntries(doc: SyntaxDoc | undefined, candidates: readonly string[]): Match | null {
  const all = [...(doc?.sections ?? []), COMMON].flatMap((s) => s.entries);
  for (const loose of [false, true]) {
    for (const candidate of candidates) {
      for (const text of variants(candidate)) {
        const entries = all.filter((entry) => entry.tokens.some((t) => matchesToken(t, text, loose)));
        if (entries.length > 0) return { token: text, entries };
      }
    }
  }
  return null;
}

/** The diagram type name of some code, from its header line (after front matter and comments). */
export function typeNameOf(code: string): string | undefined {
  const lines = code.split('\n');
  let i = 0;
  if (/^---\s*$/.test(lines[0] ?? '')) {
    for (i = 1; i < lines.length && !/^---\s*$/.test(lines[i]); i++);
    i++;
  }
  for (; i < lines.length; i++) {
    const keyword = HEADER_LINE.exec(lines[i])?.[1];
    if (keyword) return typeOfKeyword(keyword)?.name;
  }
  return undefined;
}

/** The reference for some code. */
export function docForCode(code: string): SyntaxDoc | undefined {
  const name = typeNameOf(code);
  return name ? docForType(name) : undefined;
}
