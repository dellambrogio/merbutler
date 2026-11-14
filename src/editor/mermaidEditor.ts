/**
 * Code panel support for Mermaid: syntax highlighting, indentation, `%%` comments, autocompletion
 * and error marks. Flowcharts get a full mode; the other diagram types get a generic mode with
 * their keywords. CodeMirror extensions, used by CodeEditor.tsx.
 */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import type { Diagnostic } from '@codemirror/lint';
import type { Extension, Text } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { loadIconPacks } from '../flowchart/icons';
import { SHAPE_INFO, SHAPES } from '../flowchart/shapes';
import { THEMES } from '../flowchart/themes';
import { DIAGRAM_TYPES, HEADER_LINE, typeOfKeyword, type DiagramType } from '../core/diagramTypes';

// ---------------------------------------------------------------------------------------------
// Syntax highlighting

interface MermaidState {
  /** Inside the front matter (`---` … `---` at the top). */
  front: 'before' | 'inside' | 'done';
  /** Inside a quoted string that goes on to the next line. */
  string: boolean;
  /** Depth of `@{ … }` data. */
  data: number;
  /** Inside a shape's brackets (`A[…]`): the label is text. */
  shape: boolean;
  /** Inside an edge label `|…|`. */
  pipe: boolean;
  /** The next word is a direction (after `flowchart`, `graph`, `direction`). */
  direction: boolean;
  /** On a `classDef`/`style`/`linkStyle` line: `name:value` declarations follow. */
  declarations: boolean;
  /** Open `subgraph` blocks, for the indentation. */
  depth: number;
  /** The `flowchart` line (or another type's header line) was seen. */
  body: boolean;
  /** Body keywords of a type other than flowchart (generic mode), or null for the flowchart mode. */
  words: ReadonlySet<string> | null;
}

/** Types that use the flowchart mode. */
const FLOWCHART_MODE = new Set(['Flowchart', 'Swimlane']);
const WORDS_BY_TYPE = new Map(DIAGRAM_TYPES.map((t) => [t, new Set(t.words)]));

/** Generic mode: keywords of the type, strings, numbers, arrows, brackets. */
const OTHER_WORD = /^[\p{L}_][\p{L}\p{N}_]*(?:-[\p{L}\p{N}_]+)*/u;
const OTHER_ARROW = /^(?:[<|*}{]*(?:--+|\.\.+|==+|-)[-.=>|o*x}{)+]*|<<?|>>?)/;

function otherToken(stream: StringStream, words: ReadonlySet<string>): string {
  if (stream.match(/^<<[^>\n]*>>/)) return 'meta';
  if (stream.match(/^::icon\([^)]*\)/)) return 'meta';
  if (stream.match(/^:::[\w-]+/)) return 'className';
  if (stream.match(/^#[\da-fA-F]{3,8}\b/)) return 'color';
  if (stream.match(/^-?\d+(?:\.\d+)?(?:%|px|d|h|m|s|w)?(?![\p{L}_])/u)) return 'number';
  const word = stream.match(OTHER_WORD) as RegExpMatchArray | null;
  if (word) {
    if (words.has(word[0])) return 'keyword';
    if (/^(TB|TD|BT|LR|RL)$/.test(word[0])) return 'atom';
    return 'variableName';
  }
  if (stream.match(/^\[\*\]/)) return 'atom';
  if (stream.match(OTHER_ARROW)) return 'operator';
  if (stream.match(/^[[\](){}]/)) return 'bracket';
  stream.next();
  return 'punctuation';
}

const KEYWORDS = /^(flowchart|graph|subgraph|end|direction|classDef|class|style|linkStyle|click|call|href|default|interpolate)\b/;
const DIRECTION = /^(TB|TD|BT|RL|LR)\b/;
const EDGE = /^(?:[<ox](?=[-=~]))?(?:-{2,}|-\.+-|={2,}|~{3,})(?:[>ox](?![\w-]))?/;
const OPEN_SHAPE = /^(?:\(\(\(|\(\[|\[\[|\[\(|\(\(|\{\{|\[\/|\[\\|\[|\(|\{|>)/;
const CLOSE_SHAPE = /^(?:\)\)\)|\]\)|\]\]|\)\]|\)\)|\}\}|\/\]|\\\]|\]|\)|\})/;

function token(stream: StringStream, state: MermaidState): string | null {
  if (stream.sol() && state.front === 'before') {
    state.front = stream.match(/^---\s*$/, false) ? 'inside' : 'done';
    if (state.front === 'inside') {
      stream.skipToEnd();
      return 'meta';
    }
  }
  if (state.front === 'inside') {
    if (stream.sol() && stream.match(/^---\s*$/)) {
      state.front = 'done';
      return 'meta';
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^[\w-]+(?=\s*:)/)) return 'propertyName';
    if (stream.match(/^#.*/)) return 'comment';
    stream.skipToEnd();
    return 'string';
  }
  if (state.string) {
    if (stream.skipTo('"')) {
      stream.next();
      state.string = false;
    } else stream.skipToEnd();
    return 'string';
  }
  if (stream.sol()) state.declarations = false;
  if (stream.eatSpace()) return null;

  if (stream.match('%%{')) {
    stream.skipToEnd();
    return 'meta';
  }
  if (stream.match('%%')) {
    stream.skipToEnd();
    return 'comment';
  }
  if (stream.peek() === '"') {
    stream.next();
    if (stream.skipTo('"')) stream.next();
    else {
      stream.skipToEnd();
      state.string = true;
    }
    return 'string';
  }

  // `@{ key: value, … }` data of a node, edge or subgraph.
  if (state.data > 0) {
    if (stream.eat('{')) {
      state.data++;
      return 'brace';
    }
    if (stream.eat('}')) {
      state.data--;
      return 'brace';
    }
    if (stream.match(/^[\w-]+(?=\s*:)/)) return 'propertyName';
    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
    if (stream.match(/^(true|false)\b/)) return 'bool';
    if (stream.match(/^[\w-]+/)) return 'atom';
    stream.next();
    return 'punctuation';
  }
  if (stream.match('@{')) {
    state.data = 1;
    return 'brace';
  }

  if (state.pipe) {
    if (stream.eat('|')) {
      state.pipe = false;
      return 'bracket';
    }
    stream.eatWhile(/[^|"]/);
    return 'string';
  }
  if (state.shape) {
    if (stream.match(CLOSE_SHAPE)) {
      state.shape = false;
      return 'bracket';
    }
    if (stream.match(/^fa[bklrs]?:fa-[\w-]+/)) return 'atom';
    stream.next();
    stream.eatWhile(/[^\])}/\\"f]/);
    return 'string';
  }

  if (state.declarations) {
    if (stream.match(/^[\w-]+(?=\s*:)/)) return 'propertyName';
    if (stream.match(/^#[\da-fA-F]{3,8}\b/)) return 'color';
    if (stream.match(/^-?\d+(\.\d+)?(px|em|%)?/)) return 'number';
    if (stream.match(/^[\w-]+/)) return 'atom';
    stream.next();
    return 'punctuation';
  }

  // The header line: the type decides the mode.
  if (!state.body) {
    const header = stream.match(/^[A-Za-z][\w-]*/, false) as RegExpMatchArray | null;
    const type = header ? typeOfKeyword(header[0]) : undefined;
    if (type) {
      stream.match(header![0]);
      state.body = true;
      if (FLOWCHART_MODE.has(type.name)) state.direction = true;
      else state.words = WORDS_BY_TYPE.get(type) ?? new Set();
      return 'keyword';
    }
  }
  if (state.words) return otherToken(stream, state.words);

  if (state.direction && stream.match(DIRECTION)) {
    state.direction = false;
    return 'atom';
  }
  state.direction = false;
  if (stream.match(KEYWORDS)) {
    const word = stream.current();
    if (word === 'flowchart' || word === 'graph') state.body = true;
    if (word === 'flowchart' || word === 'graph' || word === 'direction') state.direction = true;
    if (word === 'subgraph') state.depth++;
    if (word === 'end') state.depth = Math.max(0, state.depth - 1);
    if (word === 'classDef' || word === 'style' || word === 'linkStyle') state.declarations = true;
    return 'keyword';
  }
  if (stream.match(EDGE)) return 'operator';
  // `-->|label|`: the label is text.
  if (stream.eat('|')) {
    state.pipe = true;
    return 'bracket';
  }
  if (stream.match(':::')) {
    stream.match(/^[\w-]+/);
    return 'className';
  }
  if (stream.match(OPEN_SHAPE)) {
    state.shape = true;
    return 'bracket';
  }
  if (stream.eat('&') || stream.eat('@')) return 'operator';
  if (stream.match(/^[\p{L}\p{N}_][\p{L}\p{N}_.$-]*/u)) return 'variableName';
  stream.next();
  return 'punctuation';
}

const mermaidLanguage = StreamLanguage.define<MermaidState>({
  name: 'mermaid',
  startState: () => ({ front: 'before', string: false, data: 0, shape: false, pipe: false, direction: false, declarations: false, depth: 0, body: false, words: null }),
  copyState: (s) => ({ ...s }),
  token,
  // The body is indented one level under `flowchart`, one more inside each subgraph.
  // Other types: keep the indentation of the line above.
  indent: (state, textAfter, cx) => {
    if (!state.body) return 0;
    if (state.words) return null;
    const depth = /^\s*end\b/.test(textAfter) ? state.depth - 1 : state.depth;
    return (depth + 1) * cx.unit;
  },
  languageData: { commentTokens: { line: '%%' }, indentOnInput: /^\s*end$/ },
  tokenTable: { brace: t.brace, className: t.className, bool: t.bool, color: t.color },
});

/** Colors from CSS variables (styles.css), so they follow light and dark mode. */
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--hl-keyword)', fontWeight: '600' },
  { tag: t.operator, color: 'var(--hl-operator)' },
  { tag: t.string, color: 'var(--hl-string)' },
  { tag: t.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--hl-meta)' },
  { tag: [t.atom, t.bool], color: 'var(--hl-atom)' },
  { tag: [t.number, t.color], color: 'var(--hl-number)' },
  { tag: t.propertyName, color: 'var(--hl-property)' },
  { tag: t.className, color: 'var(--hl-class)' },
  { tag: [t.bracket, t.brace], color: 'var(--hl-bracket)' },
  { tag: t.variableName, color: 'var(--hl-id)' },
]);

export function mermaidSyntax(): Extension[] {
  return [mermaidLanguage, syntaxHighlighting(highlight)];
}

// ---------------------------------------------------------------------------------------------
// Autocompletion

/** What the completion needs from the last parsed diagram. */
export interface CompletionData {
  ids: string[];
  classes: string[];
}

const kw = (label: string, detail: string, apply?: string): Completion => ({ label, detail, type: 'keyword', ...(apply ? { apply } : {}) });

const STATEMENTS: Completion[] = [
  kw('subgraph', 'group nodes', 'subgraph '),
  kw('end', 'close a subgraph'),
  kw('direction', 'inside a subgraph', 'direction '),
  kw('classDef', 'define a class', 'classDef '),
  kw('class', 'give nodes a class', 'class '),
  kw('style', 'style one node', 'style '),
  kw('linkStyle', 'style edges by index', 'linkStyle '),
  kw('click', 'link or callback', 'click '),
];
/** Header keywords of every type, the preferred one of each type ranked first. */
const HEADER: Completion[] = DIAGRAM_TYPES.filter((t) => t.name !== 'Info').flatMap((t) =>
  t.keywords.map((k, i) => ({ label: k, detail: t.name, type: 'keyword', apply: `${k}${t.name === 'Flowchart' || t.name === 'Swimlane' ? ' ' : '\n  '}`, boost: i === 0 ? 1 : 0 })),
);
const DIRECTIONS: Completion[] = ['TB', 'TD', 'BT', 'LR', 'RL'].map((d) => ({ label: d, type: 'constant', detail: { TB: 'top to bottom', TD: 'top down', BT: 'bottom to top', LR: 'left to right', RL: 'right to left' }[d] }));
const CURVES = ['basis', 'bumpX', 'bumpY', 'cardinal', 'catmullRom', 'linear', 'monotoneX', 'monotoneY', 'natural', 'step', 'stepAfter', 'stepBefore'];
const enumValues = (values: string[], detail?: string): Completion[] => values.map((v) => ({ label: v, type: 'enum', ...(detail ? { detail } : {}) }));

const SHAPE_COMPLETIONS: Completion[] = SHAPES.flatMap((shape) => {
  const info = SHAPE_INFO[shape];
  return [
    { label: info.at, type: 'enum', detail: info.title, boost: 1 },
    ...info.aliases.map((alias) => ({ label: alias, type: 'enum', detail: `${info.title} (alias of ${info.at})` })),
  ];
});

const DATA_KEYS: Completion[] = [
  ['shape', 'node shape'],
  ['label', 'node text (Markdown)'],
  ['icon', 'icon, e.g. "fa:user"'],
  ['form', 'icon background'],
  ['img', 'image URL'],
  ['pos', 'label position: t or b'],
  ['w', 'image width'],
  ['h', 'icon or image height'],
  ['constraint', 'keep image ratio: on'],
  ['animate', 'edge animation'],
  ['animation', 'edge speed: fast or slow'],
  ['curve', 'edge curve'],
  ['step', 'edge step number'],
  ['view', 'subgraph: collapsed or expanded'],
].map(([label, detail]) => ({ label, detail, type: 'property', apply: `${label}: ` }));

const DATA_VALUES: Record<string, Completion[]> = {
  shape: SHAPE_COMPLETIONS,
  curve: enumValues(CURVES),
  view: enumValues(['collapsed', 'expanded']),
  form: enumValues(['square', 'circle', 'rounded']),
  pos: enumValues(['t', 'b']),
  animation: enumValues(['fast', 'slow']),
  animate: enumValues(['true', 'false']),
  constraint: enumValues(['on', 'off']),
};

const FRONT_KEYS: Completion[] = ['title', 'config', 'theme', 'look', 'layout', 'flowchart', 'curve', 'wrappingWidth', 'markdownAutoWrap', 'themeVariables'].map(
  (label) => ({ label, type: 'property', apply: `${label}: ` }),
);
const FRONT_VALUES: Record<string, Completion[]> = {
  theme: enumValues(Object.keys(THEMES)),
  look: enumValues(['neo', 'classic', 'handDrawn']),
  layout: enumValues(['elk', 'dagre']),
  curve: enumValues(CURVES),
  markdownAutoWrap: enumValues(['true', 'false']),
};

const STYLE_PROPERTIES: Completion[] = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'color', 'font-weight', 'font-style', 'font-size'].map((label) => ({
  label,
  type: 'property',
  apply: `${label}:`,
}));

/** Line number (1-based) of the header line (`flowchart`, `sequenceDiagram`, …) after the front matter, or 0. */
function headerLine(doc: Text): number {
  let i = 1;
  if (doc.lines > 1 && /^---\s*$/.test(doc.line(1).text)) {
    for (i = 2; i <= doc.lines && !/^---\s*$/.test(doc.line(i).text); i++);
    i++;
  }
  for (; i <= doc.lines; i++) if (HEADER_LINE.test(doc.line(i).text)) return i;
  return 0;
}

/** The type of the header line, if any. */
function headerType(doc: Text, header: number): DiagramType | undefined {
  if (header === 0) return undefined;
  const keyword = HEADER_LINE.exec(doc.line(header).text)?.[1];
  return keyword ? typeOfKeyword(keyword) : undefined;
}

/** Icon names of the bundled packs, as `prefix:name`, loaded on first use. */
async function iconCompletions(prefix: string, labelForm: boolean): Promise<Completion[]> {
  const packs = await loadIconPacks();
  const names = new Set<string>();
  for (const pack of packs[prefix] ?? []) for (const name of Object.keys(pack.icons)) names.add(name);
  return [...names].map((name) => ({ label: labelForm ? `${prefix}:fa-${name}` : `${prefix}:${name}`, type: 'variable' }));
}

export function mermaidCompletion(data: () => CompletionData): Extension {
  return autocompletion({ override: [completionSource(data)], icons: true });
}

/** The completion source on its own (also used by the tests). */
export function completionSource(data: () => CompletionData): (cx: CompletionContext) => Promise<CompletionResult | null> {
  return async (cx: CompletionContext): Promise<CompletionResult | null> => {
    const line = cx.state.doc.lineAt(cx.pos);
    const before = line.text.slice(0, cx.pos - line.from);
    const header = headerLine(cx.state.doc);

    // Icons: `fa:fa-…` in a label, `icon: "fa:…"` in data.
    const labelIcon = /(fa[bsr]?):fa-[\w-]*$/.exec(before);
    if (labelIcon) return { from: cx.pos - labelIcon[0].length, options: await iconCompletions(labelIcon[1], true), validFor: /^[\w:-]*$/ };
    const dataIcon = /icon:\s*"((fa[bsr]?):[\w-]*)$/.exec(before);
    if (dataIcon) return { from: cx.pos - dataIcon[1].length, options: await iconCompletions(dataIcon[2], false), validFor: /^[\w:-]*$/ };

    const word = cx.matchBefore(/[\w-]*/);
    if (!word || (word.from === word.to && !cx.explicit && !/[:\s@{]$/.test(before))) return null;
    const from = word.from;

    // Front matter and lines before the `flowchart` line.
    if (header === 0 || line.number < header) {
      const value = /^\s*([\w-]+):\s*[\w-]*$/.exec(before);
      if (value && FRONT_VALUES[value[1]]) return { from, options: FRONT_VALUES[value[1]] };
      if (/^\s*[\w-]*$/.test(before)) return { from, options: header === 0 ? [...HEADER, ...FRONT_KEYS] : FRONT_KEYS };
      return null;
    }
    const type = headerType(cx.state.doc, header);
    if (line.number === header) {
      if (/^\s*[\w-]*$/.test(before)) return { from, options: HEADER };
      if (type && /^(Flowchart|Swimlane|Git graph)$/.test(type.name) && /^\s*[\w-]+\s+\w*$/.test(before)) return { from, options: DIRECTIONS };
      return null;
    }
    // Other types: their keywords at the start of a line.
    if (type && !FLOWCHART_MODE.has(type.name)) {
      if (!/^\s*[\w-]*$/.test(before) || type.words.length === 0) return null;
      return { from, options: [...new Set(type.words)].map((w) => ({ label: w, type: 'keyword' })) };
    }

    // `@{ key: value }` data.
    const open = before.lastIndexOf('@{');
    if (open >= 0 && before.indexOf('}', open) < 0) {
      const value = /([\w-]+):\s*"?[\w-]*$/.exec(before);
      if (value && /:\s*"?[\w-]*$/.test(before.slice(before.lastIndexOf(value[1])))) return value[1] in DATA_VALUES ? { from, options: DATA_VALUES[value[1]] } : null;
      return { from, options: DATA_KEYS };
    }

    const { ids, classes } = data();
    const idOptions: Completion[] = ids.map((id) => ({ label: id, type: 'variable' }));
    const classOptions: Completion[] = classes.map((c) => ({ label: c, type: 'class' }));

    if (/\bdirection\s+\w*$/.test(before)) return { from, options: DIRECTIONS };
    if (/:::[\w-]*$/.test(before)) return { from, options: classOptions };
    if (/^\s*class\s+\S+\s+[\w-]*$/.test(before)) return { from, options: classOptions };
    if (/^\s*(class|style|click)\s+[\w,-]*$/.test(before)) return { from, options: idOptions };
    if (/\binterpolate\s+\w*$/.test(before)) return { from, options: enumValues(CURVES) };
    if (/^\s*(classDef|style|linkStyle)\b.*[\s,][\w-]*$/.test(before)) return { from, options: STYLE_PROPERTIES };
    // At the start of a statement: keywords and ids. After an edge or &: ids.
    if (/^\s*[\w-]*$/.test(before)) return { from, options: [...STATEMENTS, ...idOptions] };
    if (/(-->|---|-\.->|-\.-|==>|===|~~~|--[ox]|&|\|)\s*[\w-]*$/.test(before)) return { from, options: idOptions };
    return null;
  };
}

/** The language on its own (also used by the tests). */
export { mermaidLanguage };

// ---------------------------------------------------------------------------------------------
// Error marks

/** Mermaid's comment removal before it parses (cleanupComments in Mermaid 12.3). */
const MERMAID_COMMENT = /^\s*%%(?!{)[^\n]+\n?/gm;

/**
 * The document line of a line number in a Mermaid parse error. Mermaid counts from the
 * `flowchart` line after it removed `%%` comment lines, together with any blank lines just before
 * them (the `\s*` of its pattern spans lines).
 */
export function mermaidLineToDocLine(doc: Text, header: number, mermaidLine: number): number {
  const start = doc.line(header).from;
  const body = doc.sliceString(start);
  // The original offset of each character Mermaid keeps.
  const kept: number[] = [];
  let last = 0;
  for (const m of body.matchAll(MERMAID_COMMENT)) {
    for (let i = last; i < m.index; i++) kept.push(i);
    last = m.index + m[0].length;
  }
  for (let i = last; i < body.length; i++) kept.push(i);
  // Line n starts after the (n-1)th kept newline.
  let line = 1;
  for (const offset of kept) {
    if (line === mermaidLine) return doc.lineAt(start + offset).number;
    if (body[offset] === '\n') line++;
  }
  return doc.lines;
}

/**
 * Where to mark a parse error. Mermaid counts lines from the `flowchart` line; the canvas's
 * own errors name a node (`(node A)`), an edge (`(edge A -> B)`) or a shape.
 */
export function errorDiagnostic(doc: Text, error: string): Diagnostic | null {
  const message = error.split('\n')[0];
  const lineMark = (n: number): Diagnostic | null => {
    if (n < 1 || n > doc.lines) return null;
    const line = doc.line(n);
    const start = line.from + (line.text.length - line.text.trimStart().length);
    return { from: start, to: Math.max(start, line.to), severity: 'error', message: error };
  };
  const parseError = /(?:Parse|Lexical|Lexer) error on line (\d+)/.exec(message);
  const header = headerLine(doc);
  if (parseError && header > 0) return lineMark(mermaidLineToDocLine(doc, header, Number(parseError[1])));

  // The first line (after the header) that mentions the id or the shape name.
  const name = /\((?:node|subgraph) ([^)\s]+)\)/.exec(message)?.[1] ?? /\(edge ([^\s]+) ->/.exec(message)?.[1] ?? /No such shape: ([\w-]+)/.exec(message)?.[1];
  if (!name) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let n = Math.max(1, header + 1); n <= doc.lines; n++) {
    if (new RegExp(`(^|[^\\w-])${escaped}([^\\w-]|$)`).test(doc.line(n).text)) return lineMark(n);
  }
  return null;
}
