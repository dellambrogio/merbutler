/**
 * Where an element is written in the code, for "Go to code" in the canvas menu: the line of a
 * node's definition (or else the first line that uses it), of a subgraph's `subgraph` line (or a
 * composite state's `state … {`), or of an edge. Front matter, `%%` comments and the free layout
 * line are skipped. The range is the line without its indentation.
 */
import type { FlowModel } from './model';

export type CodeTarget = { kind: 'node' | 'subgraph' | 'edge'; id: string };

export interface CodeRange {
  from: number;
  to: number;
}

interface Line {
  text: string;
  /** Offset of the first character that is not indentation. */
  from: number;
  /** Offset of the end of the line, without trailing spaces. */
  to: number;
}

/** The statement lines of the code: no front matter, no `%%` lines, no empty lines. */
function statementLines(code: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  let inFrontMatter = false;
  const raw = code.split('\n');
  raw.forEach((line, i) => {
    const start = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (i === 0 && trimmed === '---') {
      inFrontMatter = true;
      return;
    }
    if (inFrontMatter) {
      if (trimmed === '---') inFrontMatter = false;
      return;
    }
    if (trimmed === '' || trimmed.startsWith('%%')) return;
    const indent = line.length - line.trimStart().length;
    lines.push({ text: line, from: start + indent, to: start + line.trimEnd().length });
  });
  return lines;
}

const escape = (id: string): string => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The id as a whole word: not part of a longer id (ids may hold letters, digits, `_` and `-`). */
const word = (id: string): RegExp => new RegExp(`(?<![\\w-])${escape(id)}(?![\\w-])`);

const range = (line: Line): CodeRange => ({ from: line.from, to: line.to });

export function codeLocation(code: string, model: FlowModel, target: CodeTarget): CodeRange | null {
  const lines = statementLines(code);
  if (target.kind === 'edge') {
    const edge = model.edges.find((e) => e.id === target.id);
    // A note's link to its state is drawn, never written.
    if (!edge || edge.noteLink) return null;
    if (edge.ref) {
      const own = lines.find((l) => l.text.includes(`${edge.ref}@`));
      if (own) return range(own);
    }
    // The k-th line that links the same two ends, for the k-th such edge.
    const same = model.edges.filter((e) => !e.noteLink && e.source === edge.source && e.target === edge.target);
    const k = same.findIndex((e) => e.id === edge.id);
    const s = word(edge.source);
    const t = word(edge.target);
    /** The source, then a link, then the target (a chain `a --> b --> c` links each pair in turn). */
    const links = (text: string): boolean => {
      const from = s.exec(text);
      if (!from) return false;
      const rest = text.slice(from.index + from[0].length);
      const to = t.exec(rest);
      return to !== null && /[-=.~]{2,}|-\.|\.-/.test(rest.slice(0, to.index));
    };
    const linking = lines.filter((l) => links(l.text));
    const line = linking[Math.min(k, linking.length - 1)];
    return line ? range(line) : null;
  }
  const id = target.id;
  const w = word(id);
  const using = lines.filter((l) => w.test(l.text));
  if (using.length === 0) return null;
  if (target.kind === 'subgraph') {
    const head = using.find((l) => new RegExp(`^\\s*(subgraph\\s+${escape(id)}(?![\\w-])|state\\s.*\\{\\s*$)`).test(l.text));
    return range(head ?? using[0]);
  }
  // A node: its definition (`id[…]`, `id@{ … }`, `id:::class`, or the id alone), else its first use.
  const definition = new RegExp(`(?<![\\w-])${escape(id)}(\\s*[[({>]|\\s*@\\{|:::)`);
  const defined = using.find((l) => l.text.trim() === id || definition.test(l.text));
  return range(defined ?? using[0]);
}
