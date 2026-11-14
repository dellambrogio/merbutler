/**
 * Label text helpers. Labels are stored as Mermaid text without the quotes:
 * a plain label uses `<br>` for line breaks; a Markdown label (`"`…`"` in Mermaid) can also
 * use real newlines, `**bold**` and `*italic*`.
 */

const BR = /<br\s*\/?>/gi;

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** The lines of a label, as the canvas shows them. */
export function labelLines(text: string, markdown: boolean): string[] {
  const lines = text.split(BR);
  return markdown ? lines.flatMap((line) => line.split('\n')) : lines;
}

/** Label -> text for an edit field: line breaks become newlines. */
export function toEditText(text: string): string {
  return text.replace(BR, '\n');
}

/**
 * Text from an edit field -> label. Mermaid trims labels. A plain label cannot hold a
 * newline, so a newline becomes `<br>`. A Markdown label keeps real newlines.
 */
export function fromEditText(text: string, markdown: boolean): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  return markdown ? normalized : normalized.replace(/\n/g, '<br>');
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;

/** Splits one Markdown line into runs. Mermaid supports only bold and italic in labels. */
export function markdownRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const part of line.split(INLINE)) {
    if (part === '') continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      runs.push({ text: part.slice(2, -2), bold: true, italic: false });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), bold: false, italic: true });
    } else {
      runs.push({ text: part, bold: false, italic: false });
    }
  }
  return runs;
}

/** Visible characters of a line (without Markdown markers). Used to size nodes. */
export function visibleLength(line: string, markdown: boolean): number {
  return markdown ? markdownRuns(line).reduce((sum, run) => sum + run.text.length, 0) : line.length;
}

/** Longest visible line and number of lines of a label. */
export function textMetrics(text: string, markdown: boolean): { longest: number; lines: number } {
  const lines = labelLines(text, markdown);
  return { longest: Math.max(0, ...lines.map((l) => visibleLength(l, markdown))), lines: lines.length };
}
