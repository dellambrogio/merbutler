/**
 * Table editors for the data diagram types (pie, sankey, xychart, …). The code is a list of
 * lines: the lines a type's spec reads are rows of the table (and `section` lines are group
 * headings); every other line stays as written, where it is. Editing a cell rewrites only its line.
 */
import { useMemo, useState, type JSX } from 'react';
import { HEADER_LINE } from './diagramTypes';

export interface TableEditorProps {
  code: string;
  typeName: string;
  editable: boolean;
  onChange: (code: string) => void;
}

export interface Column {
  name: string;
  placeholder?: string;
  /** Narrow column for numbers. */
  numeric?: boolean;
}

export interface TableSpec {
  /** What the rows are, when they are only part of the diagram (for example "Messages"). */
  title?: string;
  columns: Column[];
  /** Cells of a row line (trimmed), or null if the line is not a row. */
  read: (line: string) => string[] | null;
  write: (cells: string[]) => string;
  /** `section Name` lines, shown as headings that group the rows below them. */
  section?: { read: (line: string) => string | null; write: (name: string) => string };
  newRow: string[];
  /** Short help shown under the table. */
  hint?: string;
  /** Fixes the rows after an edit (packets: bit ranges must follow each other). */
  normalize?: (rows: string[][]) => string[][];
}

const quote = (s: string): string => `"${s.replace(/"/g, "'")}"`;
const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1');
const num = (s: string): string => s.trim().replace(/[^\d.eE+-]/g, '') || '0';
const SECTION = {
  read: (line: string): string | null => /^section\s+(.*)$/.exec(line)?.[1] ?? null,
  write: (name: string): string => `section ${name.trim() || 'Section'}`,
};

/** Splits a comma-separated list, keeping quoted parts whole. */
function splitList(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if (c === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else current += c;
  }
  if (current.trim() !== '' || out.length > 0) out.push(current.trim());
  return out;
}

/** Sequence arrows, longest first so `-->>` is not read as `-->`. */
const SEQ_ARROWS = ['<<-->>', '<<->>', '-->>', '->>', '-->', '->', '--x', '-x', '--)', '-)'];
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEQ_MESSAGE = new RegExp(`^([^\\s:]+?)\\s*(${SEQ_ARROWS.map(escapeRe).join('|')})([+-]?)\\s*([^:]+?)\\s*:\\s*(.*)$`);

/** `A --> B`, `A -- "label" --> B` (use case and block diagrams). */
const SIMPLE_EDGE = /^([\w-]+)\s*(?:--\s*"((?:[^"\\]|\\.)*)"\s*)?(-->|---|-\.->|==>)\s*([\w-]+)$/;

const relationSpec = (title: string, hint: string): Pick<TableSpec, 'title' | 'hint'> => ({ title, hint });

export const TABLE_SPECS: Record<string, TableSpec> = {
  'Sequence diagram': {
    ...relationSpec('Messages', 'Arrows: ->> solid, -->> dotted, -x cross, -) async; add + or - to activate or deactivate the target. Participants, notes and blocks (loop, alt, par) are edited in the code.'),
    columns: [{ name: 'From' }, { name: 'Arrow', placeholder: '->>' }, { name: 'To' }, { name: 'Message' }],
    read: (line) => {
      const m = SEQ_MESSAGE.exec(line);
      return m ? [m[1], m[2] + m[3], m[4], m[5]] : null;
    },
    write: ([from, arrow, to, text]) => {
      const a = arrow.trim();
      const base = SEQ_ARROWS.find((x) => a.startsWith(x)) ?? '->>';
      const activation = /[+-]$/.test(a) && a.length > base.length ? a.slice(-1) : '';
      return `${from.trim() || 'A'}${base}${activation}${to.trim() || 'B'}: ${text.trim()}`;
    },
    newRow: ['A', '->>', 'B', 'Message'],
  },
  'Class diagram': {
    ...relationSpec('Relations', 'Relations: <|-- inheritance, *-- composition, o-- aggregation, --> association, ..> dependency, ..|> realization. Classes and members are edited in the code.'),
    columns: [{ name: 'From' }, { name: 'Card.', placeholder: '1' }, { name: 'Relation', placeholder: '-->' }, { name: 'Card.', placeholder: '0..*' }, { name: 'To' }, { name: 'Label' }],
    read: (line) => {
      const m = /^([\w~<>-]+)\s*(?:"([^"]*)"\s*)?((?:<\||\*|o|<)?(?:--|\.\.)(?:\|>|\*|o|>)?)\s*(?:"([^"]*)"\s*)?([\w~<>-]+)\s*(?::\s*(.*))?$/.exec(line);
      return m ? [m[1], m[2] ?? '', m[3], m[4] ?? '', m[5], m[6] ?? ''] : null;
    },
    write: ([from, c1, rel, c2, to, label]) =>
      `${from.trim()} ${c1.trim() ? `"${c1.trim()}" ` : ''}${rel.trim() || '-->'} ${c2.trim() ? `"${c2.trim()}" ` : ''}${to.trim()}${label.trim() ? ` : ${label.trim()}` : ''}`,
    newRow: ['A', '', '-->', '', 'B', ''],
  },
  'Entity relationship diagram': {
    ...relationSpec('Relationships', 'Cardinality: || exactly one, |o zero or one, }| one or more, }o zero or more; -- identifying, .. non-identifying. Entities and attributes are edited in the code.'),
    columns: [{ name: 'Entity' }, { name: 'Relationship', placeholder: '||--o{' }, { name: 'Entity' }, { name: 'Label' }],
    read: (line) => {
      const m = /^([\w-]+|"[^"]+")\s*([|}][|o]|[|o][|{])?((?:\|\||\|o|o\||}\||\|}|}o|o{|\|{)(?:--|\.\.)(?:\|\||\|o|o\||}\||\|}|}o|o{|\|{))\s*([\w-]+|"[^"]+")\s*:\s*(.*)$/.exec(line);
      return m ? [m[1], m[3], m[4], unquote(m[5])] : null;
    },
    write: ([a, rel, b, label]) => `${a.trim()} ${rel.trim() || '||--o{'} ${b.trim()} : ${/^[\w-]+$/.test(label.trim()) ? label.trim() : quote(label.trim())}`,
    newRow: ['A', '||--o{', 'B', 'has'],
  },
  'Requirement diagram': {
    ...relationSpec('Relations', 'Relations: contains, copies, derives, satisfies, verifies, refines, traces. Requirements and elements are edited in the code.'),
    columns: [{ name: 'Source' }, { name: 'Relation', placeholder: 'satisfies' }, { name: 'Target' }],
    read: (line) => {
      const m = /^([\w-]+)\s*-\s*(\w+)\s*->\s*([\w-]+)$/.exec(line);
      return m ? [m[1], m[2], m[3]] : null;
    },
    write: ([a, rel, b]) => `${a.trim()} - ${rel.trim() || 'satisfies'} -> ${b.trim()}`,
    newRow: ['a', 'satisfies', 'b'],
  },
  'C4 diagram': {
    ...relationSpec('Relations', 'Kinds: Rel, BiRel, Rel_U, Rel_D, Rel_L, Rel_R, Rel_Back. People, systems and boundaries are edited in the code.'),
    columns: [{ name: 'Kind', placeholder: 'Rel' }, { name: 'From' }, { name: 'To' }, { name: 'Label' }, { name: 'Technology' }],
    read: (line) => {
      const m = /^(Rel|BiRel|Rel_[A-Za-z]+)\((.*)\)\s*$/.exec(line);
      if (!m) return null;
      const args = splitList(m[2]).map(unquote);
      return args.length >= 2 && args.length <= 4 ? [m[1], args[0], args[1], args[2] ?? '', args[3] ?? ''] : null;
    },
    write: ([kind, from, to, label, tech]) => {
      const args = [from.trim(), to.trim(), quote(label.trim()), ...(tech.trim() ? [quote(tech.trim())] : [])];
      return `${/^(Rel|BiRel|Rel_[A-Za-z]+)$/.test(kind.trim()) ? kind.trim() : 'Rel'}(${args.join(', ')})`;
    },
    newRow: ['Rel', 'a', 'b', 'Uses', ''],
  },
  'Architecture diagram': {
    ...relationSpec('Edges', 'Sides: L, R, T, B. Links: -- line, --> arrow, <--> both. Groups and services are edited in the code.'),
    columns: [{ name: 'From' }, { name: 'Side', placeholder: 'R' }, { name: 'Link', placeholder: '-->' }, { name: 'Side', placeholder: 'L' }, { name: 'To' }],
    read: (line) => {
      const m = /^([\w-]+)(\{group\})?:([LRTB])\s*(<?--+>?)\s*([LRTB]):([\w-]+)(\{group\})?$/.exec(line);
      return m && !m[2] && !m[7] ? [m[1], m[3], m[4], m[5], m[6]] : null;
    },
    write: ([from, s1, link, s2, to]) => {
      const side = (s: string, d: string): string => (/^[LRTB]$/.test(s.trim().toUpperCase()) ? s.trim().toUpperCase() : d);
      return `${from.trim()}:${side(s1, 'R')} ${/^<?--+>?$/.test(link.trim()) ? link.trim() : '--'} ${side(s2, 'L')}:${to.trim()}`;
    },
    newRow: ['a', 'R', '-->', 'L', 'b'],
  },
  'Use case diagram': {
    ...relationSpec('Links', 'Actors, use cases and system boundaries are edited in the code.'),
    columns: [{ name: 'From' }, { name: 'Label' }, { name: 'To' }],
    read: (line) => {
      const m = SIMPLE_EDGE.exec(line);
      return m && m[3] === '-->' ? [m[1], m[2] ?? '', m[4]] : null;
    },
    write: ([from, label, to]) => `${from.trim()} ${label.trim() ? `-- ${quote(label.trim())} ` : ''}--> ${to.trim()}`,
    newRow: ['Actor', '', 'UseCase'],
  },
  'Block diagram': {
    ...relationSpec('Edges', 'Blocks, columns and spaces are edited in the code.'),
    columns: [{ name: 'From' }, { name: 'Label' }, { name: 'Arrow', placeholder: '-->' }, { name: 'To' }],
    read: (line) => {
      const m = SIMPLE_EDGE.exec(line);
      return m ? [m[1], m[2] ?? '', m[3], m[4]] : null;
    },
    write: ([from, label, arrow, to]) => `${from.trim()} ${label.trim() ? `-- ${quote(label.trim())} ` : ''}${['-->', '---'].includes(arrow.trim()) ? arrow.trim() : '-->'} ${to.trim()}`,
    newRow: ['a', '', '-->', 'b'],
  },
  'Pie chart': {
    columns: [{ name: 'Label' }, { name: 'Value', numeric: true }],
    read: (line) => {
      const m = /^"((?:[^"\\]|\\.)*)"\s*:\s*(-?[\d.]+)\s*$/.exec(line);
      return m ? [m[1], m[2]] : null;
    },
    write: ([label, value]) => `${quote(label)} : ${num(value)}`,
    newRow: ['New slice', '10'],
  },
  'Sankey diagram': {
    columns: [{ name: 'Source' }, { name: 'Target' }, { name: 'Value', numeric: true }],
    read: (line) => {
      const cells = splitList(line);
      return cells.length === 3 && /^-?[\d.]+$/.test(cells[2]) ? [unquote(cells[0]), unquote(cells[1]), cells[2]] : null;
    },
    write: ([source, target, value]) => {
      const csv = (s: string): string => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s.trim());
      return `${csv(source)},${csv(target)},${num(value)}`;
    },
    newRow: ['Source', 'Target', '10'],
  },
  'Packet diagram': {
    columns: [{ name: 'Bits', placeholder: '0-15 or +16' }, { name: 'Label' }],
    read: (line) => {
      const m = /^(\+?\d+(?:-\d+)?)\s*:\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
      return m ? [m[1], m[2]] : null;
    },
    write: ([bits, label]) => `${bits.trim().replace(/\s/g, '') || '+8'}: ${quote(label)}`,
    newRow: ['+8', 'Field'],
    hint: 'Bits: a range (0-15), one bit (16), or a width after the previous field (+8). Ranges are renumbered to follow each other.',
    normalize: (rows) => {
      let next = 0;
      return rows.map(([bits, label]) => {
        const relative = /^\+(\d+)$/.exec(bits);
        if (relative) {
          next += Number(relative[1]);
          return [bits, label];
        }
        const range = /^(\d+)(?:-(\d+))?$/.exec(bits);
        if (!range) return [bits, label];
        const width = range[2] === undefined ? 1 : Math.max(1, Number(range[2]) - Number(range[1]) + 1);
        const start = next;
        next += width;
        return [width === 1 ? String(start) : `${start}-${start + width - 1}`, label];
      });
    },
  },
  'Radar chart': {
    columns: [{ name: 'Id' }, { name: 'Curve' }, { name: 'Values', placeholder: '1, 2, 3' }],
    read: (line) => {
      const m = /^curve\s+([\w-]+)(?:\["((?:[^"\\]|\\.)*)"\])?\s*\{(.*)\}\s*$/.exec(line);
      return m ? [m[1], m[2] ?? '', m[3].trim()] : null;
    },
    write: ([id, label, values]) => `curve ${id.trim() || 'c'}${label.trim() ? `[${quote(label)}]` : ''}{${values.trim()}}`,
    newRow: ['new', 'New curve', '1, 2, 3'],
    hint: 'One value per axis, in the order of the axis lines.',
  },
  'XY chart': {
    columns: [{ name: 'Kind', placeholder: 'bar or line' }, { name: 'Title' }, { name: 'Values', placeholder: '1, 2, 3' }],
    read: (line) => {
      const m = /^(bar|line)\s*(?:"((?:[^"\\]|\\.)*)")?\s*\[(.*)\]\s*$/.exec(line);
      return m ? [m[1], m[2] ?? '', m[3].trim()] : null;
    },
    write: ([kind, title, values]) => `${kind.trim() === 'line' ? 'line' : 'bar'}${title.trim() ? ` ${quote(title)}` : ''} [${values.trim()}]`,
    newRow: ['bar', '', '1, 2, 3'],
    hint: 'One value per x-axis category.',
  },
  'Quadrant chart': {
    columns: [{ name: 'Point' }, { name: 'x', numeric: true }, { name: 'y', numeric: true }, { name: 'More', placeholder: 'radius: 9' }],
    read: (line) => {
      const m = /^(?!x-axis|y-axis|quadrant-|title\b|classDef\b)(.+?)\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*(.*)$/.exec(line);
      return m ? [m[1], m[2], m[3], m[4]] : null;
    },
    write: ([name, x, y, more]) => `${name.trim() || 'Point'}: [${num(x)}, ${num(y)}]${more.trim() ? ` ${more.trim()}` : ''}`,
    newRow: ['New point', '0.5', '0.5', ''],
    hint: 'x and y from 0 to 1. A class goes after the name: Point:::class.',
  },
  Timeline: {
    columns: [{ name: 'Period' }, { name: 'Events', placeholder: 'one : two' }],
    read: (line) => {
      if (/^(title|section)\b/.test(line)) return null;
      const m = /^([^:]*?)\s*:\s*(.*)$/.exec(line);
      return m ? [m[1], m[2]] : null;
    },
    write: ([period, events]) => `${period.trim()} : ${events.trim()}`,
    section: SECTION,
    newRow: ['Period', 'Event'],
    hint: 'A row with an empty period adds events to the period above it.',
  },
  'User journey': {
    columns: [{ name: 'Task' }, { name: 'Score', numeric: true }, { name: 'Actors', placeholder: 'Me, Cat' }],
    read: (line) => {
      const m = /^([^:]+?)\s*:\s*(\d+)\s*(?::\s*(.*))?$/.exec(line);
      return m && !/^(title|section)\b/.test(line) ? [m[1], m[2], m[3] ?? ''] : null;
    },
    write: ([task, score, actors]) => `${task.trim() || 'Task'}: ${num(score)}${actors.trim() ? `: ${actors.trim()}` : ''}`,
    section: SECTION,
    newRow: ['New task', '5', 'Me'],
    hint: 'Score from 1 (bad) to 7 (good).',
  },
  'Gantt chart': {
    columns: [{ name: 'Task' }, { name: 'Data', placeholder: 'done, id, after a, 3d' }],
    read: (line) => {
      if (/^(title|section|dateFormat|axisFormat|tickInterval|excludes|includes|weekday|weekend|todayMarker|inclusiveEndDates|topAxis|displayMode|click|vert)\b/.test(line)) return null;
      const m = /^([^:]+?)\s*:\s*(.*)$/.exec(line);
      return m ? [m[1], m[2]] : null;
    },
    write: ([task, data]) => `${task.trim() || 'Task'} :${data.trim()}`,
    section: SECTION,
    newRow: ['New task', 'after a, 3d'],
    hint: 'Data: tags (done, active, crit, milestone), an id, a start date or "after id", and a duration or end date.',
  },
  'Git graph': {
    columns: [{ name: 'Command', placeholder: 'commit' }, { name: 'Arguments', placeholder: 'id: "x" tag: "v1"' }],
    read: (line) => {
      const m = /^(commit|branch|checkout|switch|merge|cherry-pick)\b\s*(.*)$/.exec(line);
      return m ? [m[1], m[2]] : null;
    },
    write: ([command, args]) => `${command.trim() || 'commit'}${args.trim() ? ` ${args.trim()}` : ''}`,
    newRow: ['commit', ''],
    hint: 'Commands run in order: commit, branch name, checkout name, merge name, cherry-pick id: "…".',
  },
};

export type LineKind = { kind: 'row'; cells: string[] } | { kind: 'section'; name: string } | { kind: 'other' };

export interface TableDoc {
  /** Lines up to and including the header line. */
  head: string[];
  lines: Array<{ text: string; indent: string } & LineKind>;
}

const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/;

/** Reads the lines of the code as rows, sections and other lines. Null without a header line. */
export function readTable(code: string, spec: TableSpec): TableDoc | null {
  const front = FRONT_MATTER.exec(code)?.[0] ?? '';
  const all = code.slice(front.length).split('\n');
  const header = all.findIndex((l) => HEADER_LINE.test(l));
  if (header < 0) return null;
  const head = [...(front ? front.replace(/\n$/, '').split('\n') : []), ...all.slice(0, header + 1)];
  const lines = all.slice(header + 1).map((text) => {
    const indent = /^\s*/.exec(text)![0];
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.startsWith('%%')) return { text, indent, kind: 'other' as const };
    const section = spec.section?.read(trimmed);
    if (section != null) return { text, indent, kind: 'section' as const, name: section };
    const cells = spec.read(trimmed);
    return cells ? { text, indent, kind: 'row' as const, cells } : { text, indent, kind: 'other' as const };
  });
  return { head, lines };
}

/** Applies the spec's normalize step to the rows (in order). */
export function normalizeTable(doc: TableDoc, spec: TableSpec): TableDoc {
  if (!spec.normalize) return doc;
  const rows = doc.lines.flatMap((l) => (l.kind === 'row' ? [l.cells] : []));
  const fixed = spec.normalize(rows);
  let k = 0;
  return {
    ...doc,
    lines: doc.lines.map((l) => {
      if (l.kind !== 'row') return l;
      const cells = fixed[k++];
      if (cells.every((c, i) => c === l.cells[i])) return l;
      const text = spec.write(cells);
      return { ...l, text: `${l.indent}${text}`, cells };
    }),
  };
}

export function writeTable(doc: TableDoc): string {
  const lines = [...doc.head, ...doc.lines.map((l) => l.text)];
  const text = lines.join('\n');
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** The indentation for a new line: that of the nearest row, else of any body line, else 4 spaces. */
function rowIndent(doc: TableDoc, near: number, kind: 'row' | 'section'): string {
  const same = (i: number): boolean => doc.lines[i]?.kind === kind;
  for (let d = 0; d < doc.lines.length; d++) {
    if (same(near - d)) return doc.lines[near - d].indent;
    if (same(near + d)) return doc.lines[near + d].indent;
  }
  return doc.lines.find((l) => l.text.trim() !== '')?.indent ?? '    ';
}

export function setCells(doc: TableDoc, spec: TableSpec, index: number, cells: string[]): TableDoc {
  const lines = [...doc.lines];
  const line = lines[index];
  const text = spec.write(cells);
  lines[index] = { text: `${line.indent}${text}`, indent: line.indent, kind: 'row', cells: spec.read(text) ?? cells };
  return { ...doc, lines };
}

export function setSection(doc: TableDoc, spec: TableSpec, index: number, name: string): TableDoc {
  const lines = [...doc.lines];
  const line = lines[index];
  lines[index] = { text: `${line.indent}${spec.section!.write(name)}`, indent: line.indent, kind: 'section', name: name.trim() || 'Section' };
  return { ...doc, lines };
}

/**
 * Inserts a line after `after` (or after the last row, or at the end). A new row is a copy of the
 * row above it (the spec's `newRow` when there is none). Returns the new doc and the new line's index.
 */
export function insertLine(doc: TableDoc, spec: TableSpec, after: number | null, kind: 'row' | 'section'): { doc: TableDoc; index: number } {
  const lastRow = doc.lines.map((l, i) => (l.kind === 'row' || l.kind === 'section' ? i : -1)).filter((i) => i >= 0).pop();
  let at = (after ?? lastRow ?? doc.lines.length - 1) + 1;
  // Not after the trailing blank lines and comments of the code.
  if (after === null && lastRow === undefined) {
    while (at > 0 && doc.lines[at - 1]?.text.trim() === '') at--;
  }
  const indent = rowIndent(doc, Math.max(0, at - 1), kind);
  // A new row copies the row above it, so it names things the diagram has.
  const above = doc.lines.slice(0, at).reverse().find((l) => l.kind === 'row');
  const cells = above?.kind === 'row' ? [...above.cells] : spec.newRow;
  const text = kind === 'row' ? spec.write(cells) : spec.section!.write('New section');
  const line = kind === 'row' ? { text: `${indent}${text}`, indent, kind: 'row' as const, cells: spec.read(text) ?? cells } : { text: `${indent}${text}`, indent, kind: 'section' as const, name: 'New section' };
  const lines = [...doc.lines];
  lines.splice(at, 0, line);
  return { doc: { ...doc, lines }, index: at };
}

export function removeLine(doc: TableDoc, index: number): TableDoc {
  return { ...doc, lines: doc.lines.filter((_, i) => i !== index) };
}

/** Swaps a row or section with the previous or next row or section. Other lines stay in place. */
export function moveLine(doc: TableDoc, index: number, step: -1 | 1): { doc: TableDoc; index: number } {
  let to = index + step;
  while (to >= 0 && to < doc.lines.length && doc.lines[to].kind === 'other') to += step;
  if (to < 0 || to >= doc.lines.length) return { doc, index };
  const lines = [...doc.lines];
  // Keep each position's indentation.
  const a = lines[index];
  const b = lines[to];
  lines[index] = { ...b, text: a.indent + b.text.trimStart(), indent: a.indent };
  lines[to] = { ...a, text: b.indent + a.text.trimStart(), indent: b.indent };
  return { doc: { ...doc, lines }, index: to };
}

/** The table editor of one type. */
function TableEditor({ code, typeName, editable, onChange }: TableEditorProps): JSX.Element {
  const spec = TABLE_SPECS[typeName];
  const doc = useMemo(() => readTable(code, spec), [code, spec]);
  const [selected, setSelected] = useState<number | null>(null);
  if (!doc) return <div className="structured-panel muted">This code has no header line.</div>;
  const apply = (next: TableDoc): void => onChange(writeTable(normalizeTable(next, spec)));
  const shown = doc.lines.map((l, i) => ({ ...l, index: i })).filter((l) => l.kind !== 'other');
  const current = selected !== null && doc.lines[selected]?.kind !== 'other' ? selected : null;

  return (
    <div className="structured-panel table-editor">
      <div className="structured-toolbar">
        {spec.title && <strong className="structured-title">{spec.title}</strong>}
        <button
          disabled={!editable}
          onClick={() => {
            const r = insertLine(doc, spec, current, 'row');
            setSelected(r.index);
            apply(r.doc);
          }}
          title="Add a row after the selected one"
        >
          + Row
        </button>
        {spec.section && (
          <button
            disabled={!editable}
            onClick={() => {
              const r = insertLine(doc, spec, current, 'section');
              setSelected(r.index);
              apply(r.doc);
            }}
          >
            + Section
          </button>
        )}
        <button
          disabled={!editable || current === null}
          aria-label="Move up"
          title="Move up"
          onClick={() => {
            if (current === null) return;
            const r = moveLine(doc, current, -1);
            setSelected(r.index);
            apply(r.doc);
          }}
        >
          ↑
        </button>
        <button
          disabled={!editable || current === null}
          aria-label="Move down"
          title="Move down"
          onClick={() => {
            if (current === null) return;
            const r = moveLine(doc, current, 1);
            setSelected(r.index);
            apply(r.doc);
          }}
        >
          ↓
        </button>
        <button
          className="danger"
          disabled={!editable || current === null}
          onClick={() => {
            if (current === null) return;
            setSelected(null);
            apply(removeLine(doc, current));
          }}
        >
          Delete
        </button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {spec.columns.map((c) => (
                <th key={c.name} className={c.numeric ? 'numeric' : undefined}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((line) =>
              line.kind === 'section' ? (
                <tr key={`${line.index}:${line.text}`} className={`section-row${current === line.index ? ' selected' : ''}`} onClick={() => setSelected(line.index)}>
                  <td colSpan={spec.columns.length}>
                    <Cell value={line.name} disabled={!editable} label="Section" onCommit={(name) => apply(setSection(doc, spec, line.index, name))} />
                  </td>
                </tr>
              ) : line.kind === 'row' ? (
                <tr key={`${line.index}:${line.text}`} className={current === line.index ? 'selected' : undefined} onClick={() => setSelected(line.index)}>
                  {spec.columns.map((c, ci) => (
                    <td key={c.name} className={c.numeric ? 'numeric' : undefined}>
                      <Cell
                        value={line.cells[ci] ?? ''}
                        placeholder={c.placeholder}
                        disabled={!editable}
                        label={c.name}
                        onCommit={(v) => apply(setCells(doc, spec, line.index, line.cells.map((x, k) => (k === ci ? v : x))))}
                      />
                    </td>
                  ))}
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
        {shown.length === 0 && <div className="muted structured-hint">No rows yet. Add one with + Row.</div>}
      </div>
      <div className="muted structured-hint">
        {spec.hint ?? ''}
        {spec.title ? '' : ' Other lines (title, axes, settings) are edited in the code.'}
      </div>
    </div>
  );
}

function Cell({ value, onCommit, placeholder, disabled, label }: { value: string; onCommit: (v: string) => void; placeholder?: string; disabled: boolean; label: string }): JSX.Element {
  const [draft, setDraft] = useState(value);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      aria-label={label}
      title={draft.length > 24 ? draft : undefined}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}

/** Table editors by diagram type name. */
export const TABLE_EDITORS: Record<string, (props: TableEditorProps) => JSX.Element> = Object.fromEntries(
  Object.keys(TABLE_SPECS).map((name) => [name, TableEditor]),
);
