/**
 * Node shapes: one entry per shape of the Mermaid flowchart syntax, with its names in the
 * code, its size and where its label goes. The outlines are in ShapeNodeView.tsx.
 *
 * Every alias was checked against Mermaid's own SVG output (Mermaid 12.3): an alias draws
 * exactly like the short name. The `@{ shape }` names of the first 14 shapes draw exactly like
 * their bracket forms.
 */

/** Size of the label text, in px. */
export interface TextBox {
  width: number;
  height: number;
}

/** Room around the label inside the node, in px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ShapeInfo {
  /** Short name in `id@{ shape: … }`. */
  at: string;
  /** Other names Mermaid accepts in `@{ shape: … }`. */
  aliases: readonly string[];
  /** Bracket syntax (`[`, `]`), and the type Mermaid's parser gives it. Missing: `@{}` only. */
  brackets?: readonly [string, string];
  bracketType?: string;
  /** Name in the inspector, and the group it is listed under. */
  title: string;
  group: ShapeGroup;
  /** Node size for a label of this size. `vertical` is true when ranks go top to bottom. */
  size: (text: TextBox, vertical: boolean) => { width: number; height: number };
  /** Where the label goes. 'none': Mermaid does not draw the label of this shape. Default: centered. */
  label?: 'none' | ((width: number, height: number) => Insets);
}

export type ShapeGroup = 'Basic' | 'Process' | 'Data and storage' | 'Documents' | 'Points and markers' | 'Notes and text' | 'Pictures';
export const SHAPE_GROUPS: readonly ShapeGroup[] = ['Basic', 'Process', 'Data and storage', 'Documents', 'Points and markers', 'Notes and text', 'Pictures'];

/** Horizontal room taken by a slanted side (hexagon, parallelogram, trapezoid). */
export const SLANT = 16;
/** Height of one line of label text. */
const LINE = 18;
/** Width of the label never below this, so short labels still give a usable node. */
const MIN_TEXT = 30;

/** A box with `x` px of room left and right, and the one-line height `h1` (taller labels grow it). */
const padded =
  (x: number, h1 = 44) =>
  (text: TextBox): { width: number; height: number } => ({
    width: Math.max(text.width, MIN_TEXT) + 2 * x,
    height: h1 + text.height - LINE,
  });

const fixed =
  (width: number, height = width) =>
  (): { width: number; height: number } => ({ width, height });

const inset = (top: number, right: number, bottom: number, left: number) => (): Insets => ({ top, right, bottom, left });

const SHAPE_TABLE = {
  // The 14 shapes of the bracket syntax.
  rect: { at: 'rect', aliases: ['proc', 'process', 'rectangle'], brackets: ['[', ']'], bracketType: 'square', title: 'Rectangle', group: 'Basic', size: padded(16) },
  round: { at: 'rounded', aliases: ['event'], brackets: ['(', ')'], bracketType: 'round', title: 'Rounded', group: 'Basic', size: padded(16) },
  stadium: { at: 'stadium', aliases: ['pill', 'terminal'], brackets: ['([', '])'], bracketType: 'stadium', title: 'Stadium', group: 'Basic', size: padded(24) },
  subroutine: { at: 'fr-rect', aliases: ['framed-rectangle', 'subproc', 'subprocess', 'subroutine'], brackets: ['[[', ']]'], bracketType: 'subroutine', title: 'Subroutine', group: 'Basic', size: padded(24) },
  cylinder: { at: 'cyl', aliases: ['cylinder', 'database', 'db'], brackets: ['[(', ')]'], bracketType: 'cylinder', title: 'Cylinder', group: 'Basic', size: padded(16, 54) },
  circle: {
    at: 'circle',
    aliases: ['circ'],
    brackets: ['((', '))'],
    bracketType: 'circle',
    title: 'Circle',
    group: 'Basic',
    size: (text) => {
      const d = Math.max(Math.max(text.width, MIN_TEXT) + 24, 60) + text.height - LINE;
      return { width: d, height: d };
    },
  },
  'double-circle': {
    at: 'dbl-circ',
    aliases: ['double-circle'],
    brackets: ['(((', ')))'],
    bracketType: 'doublecircle',
    title: 'Double circle',
    group: 'Basic',
    size: (text) => {
      const d = Math.max(Math.max(text.width, MIN_TEXT) + 36, 70) + text.height - LINE;
      return { width: d, height: d };
    },
  },
  flag: { at: 'odd', aliases: [], brackets: ['>', ']'], bracketType: 'odd', title: 'Asymmetric', group: 'Basic', size: padded(24) },
  diamond: {
    at: 'diam',
    aliases: ['decision', 'diamond', 'question'],
    brackets: ['{', '}'],
    bracketType: 'diamond',
    title: 'Diamond',
    group: 'Basic',
    size: (text) => {
      const extra = text.height - LINE;
      const w = Math.max(Math.max(text.width, MIN_TEXT) * 1.6 + 40, 90);
      return { width: w + extra, height: Math.max(w * 0.6, 70) + extra * 1.5 };
    },
  },
  hexagon: { at: 'hex', aliases: ['hexagon', 'prepare'], brackets: ['{{', '}}'], bracketType: 'hexagon', title: 'Hexagon', group: 'Basic', size: padded(16 + SLANT) },
  'lean-right': { at: 'lean-r', aliases: ['lean-right', 'in-out'], brackets: ['[/', '/]'], bracketType: 'lean_right', title: 'Lean right', group: 'Basic', size: padded(16 + SLANT) },
  'lean-left': { at: 'lean-l', aliases: ['lean-left', 'out-in'], brackets: ['[\\', '\\]'], bracketType: 'lean_left', title: 'Lean left', group: 'Basic', size: padded(16 + SLANT) },
  trapezoid: { at: 'trap-b', aliases: ['trapezoid', 'trapezoid-bottom', 'priority'], brackets: ['[/', '\\]'], bracketType: 'trapezoid', title: 'Trapezoid', group: 'Basic', size: padded(16 + SLANT) },
  'inv-trapezoid': { at: 'trap-t', aliases: ['inv-trapezoid', 'trapezoid-top', 'manual'], brackets: ['[\\', '/]'], bracketType: 'inv_trapezoid', title: 'Inverted trapezoid', group: 'Basic', size: padded(16 + SLANT) },

  // Shapes of the `@{ shape }` syntax only (Mermaid 11.3+).
  'notch-rect': { at: 'notch-rect', aliases: ['card', 'notched-rectangle'], title: 'Card', group: 'Process', size: padded(20) },
  'div-rect': { at: 'div-rect', aliases: ['div-proc', 'divided-process', 'divided-rectangle'], title: 'Divided process', group: 'Process', size: padded(16, 52), label: inset(8, 0, 0, 0) },
  'lin-rect': { at: 'lin-rect', aliases: ['lin-proc', 'lined-process', 'lined-rectangle', 'shaded-process'], title: 'Lined process', group: 'Process', size: padded(20), label: inset(0, 0, 0, 8) },
  'st-rect': { at: 'st-rect', aliases: ['processes', 'procs', 'stacked-rectangle'], title: 'Multi-process', group: 'Process', size: padded(21, 54), label: inset(10, 10, 0, 0) },
  'tag-rect': { at: 'tag-rect', aliases: ['tag-proc', 'tagged-process', 'tagged-rectangle'], title: 'Tagged process', group: 'Process', size: padded(16) },
  'notch-pent': { at: 'notch-pent', aliases: ['loop-limit', 'notched-pentagon'], title: 'Loop limit', group: 'Process', size: padded(24, 48) },
  'sl-rect': { at: 'sl-rect', aliases: ['manual-input', 'sloped-rectangle'], title: 'Manual input', group: 'Process', size: padded(16, 58), label: inset(14, 0, 0, 0) },
  'curv-trap': { at: 'curv-trap', aliases: ['curved-trapezoid', 'display'], title: 'Display', group: 'Process', size: padded(30), label: inset(0, 10, 0, 14) },
  delay: { at: 'delay', aliases: ['half-rounded-rectangle'], title: 'Delay', group: 'Process', size: padded(24), label: inset(0, 10, 0, 0) },
  hourglass: { at: 'hourglass', aliases: ['collate'], title: 'Collate', group: 'Process', size: fixed(30, 36), label: 'none' },
  tri: {
    at: 'tri',
    aliases: ['extract', 'triangle'],
    title: 'Extract',
    group: 'Process',
    size: (text) => {
      const w = Math.max(text.width, MIN_TEXT) * 1.6 + 40;
      return { width: w, height: w * 0.8 + text.height - LINE };
    },
    label: (_w, h) => ({ top: h * 0.55, right: 0, bottom: 4, left: 0 }),
  },
  'flip-tri': {
    at: 'flip-tri',
    aliases: ['flipped-triangle', 'manual-file'],
    title: 'Manual file',
    group: 'Process',
    size: (text) => {
      const w = Math.max(text.width, MIN_TEXT) * 1.6 + 40;
      return { width: w, height: w * 0.8 + text.height - LINE };
    },
    label: (_w, h) => ({ top: 4, right: 0, bottom: h * 0.55, left: 0 }),
  },
  fork: {
    at: 'fork',
    aliases: ['join'],
    title: 'Fork / join',
    group: 'Process',
    // A bar across the flow: wide when ranks go top to bottom, tall when they go left to right.
    size: (_text, vertical) => (vertical ? { width: 70, height: 10 } : { width: 10, height: 70 }),
    label: 'none',
  },

  'h-cyl': { at: 'h-cyl', aliases: ['das', 'horizontal-cylinder'], title: 'Direct access storage', group: 'Data and storage', size: padded(22), label: inset(0, 12, 0, 6) },
  'lin-cyl': { at: 'lin-cyl', aliases: ['disk', 'lined-cylinder'], title: 'Disk storage', group: 'Data and storage', size: padded(16, 64), label: inset(14, 0, 0, 0) },
  datastore: { at: 'datastore', aliases: ['data-store'], title: 'Data store', group: 'Data and storage', size: padded(16) },
  'bow-rect': { at: 'bow-rect', aliases: ['bow-tie-rectangle', 'stored-data'], title: 'Stored data', group: 'Data and storage', size: padded(22) },
  'win-pane': { at: 'win-pane', aliases: ['internal-storage', 'window-pane'], title: 'Internal storage', group: 'Data and storage', size: padded(20, 52), label: inset(8, 0, 0, 8) },
  bucket: { at: 'bucket', aliases: [], title: 'Bucket', group: 'Data and storage', size: padded(30, 58), label: inset(10, 0, 0, 0) },

  doc: { at: 'doc', aliases: ['document'], title: 'Document', group: 'Documents', size: padded(16, 54), label: inset(0, 0, 12, 0) },
  'lin-doc': { at: 'lin-doc', aliases: ['lined-document'], title: 'Lined document', group: 'Documents', size: padded(20, 54), label: inset(0, 0, 12, 8) },
  'tag-doc': { at: 'tag-doc', aliases: ['tagged-document'], title: 'Tagged document', group: 'Documents', size: padded(16, 54), label: inset(0, 0, 12, 0) },
  docs: { at: 'docs', aliases: ['documents', 'st-doc', 'stacked-document'], title: 'Multi-document', group: 'Documents', size: padded(21, 64), label: inset(10, 10, 12, 0) },
  'paper-tape': { at: 'flag', aliases: ['paper-tape'], title: 'Paper tape', group: 'Documents', size: padded(20, 56) },

  'sm-circ': { at: 'sm-circ', aliases: ['small-circle', 'start'], title: 'Start (small circle)', group: 'Points and markers', size: fixed(22), label: 'none' },
  'fr-circ': { at: 'fr-circ', aliases: ['framed-circle', 'stop'], title: 'Stop (framed circle)', group: 'Points and markers', size: fixed(26), label: 'none' },
  'f-circ': { at: 'f-circ', aliases: ['filled-circle', 'junction'], title: 'Junction', group: 'Points and markers', size: fixed(20), label: 'none' },
  'cross-circ': { at: 'cross-circ', aliases: ['crossed-circle', 'summary'], title: 'Summary', group: 'Points and markers', size: fixed(36), label: 'none' },
  bolt: { at: 'bolt', aliases: ['com-link', 'lightning-bolt'], title: 'Com link', group: 'Points and markers', size: fixed(26, 52), label: 'none' },

  brace: { at: 'brace', aliases: ['brace-l', 'comment'], title: 'Comment', group: 'Notes and text', size: padded(18), label: inset(0, 0, 0, 10) },
  'brace-r': { at: 'brace-r', aliases: [], title: 'Comment right', group: 'Notes and text', size: padded(18), label: inset(0, 10, 0, 0) },
  braces: { at: 'braces', aliases: [], title: 'Comment both', group: 'Notes and text', size: padded(22) },
  text: { at: 'text', aliases: [], title: 'Text block', group: 'Notes and text', size: padded(10, 30) },

  cloud: { at: 'cloud', aliases: [], title: 'Cloud', group: 'Pictures', size: padded(30, 64) },
  bang: { at: 'bang', aliases: [], title: 'Bang', group: 'Pictures', size: padded(34, 64) },
  person: { at: 'person', aliases: [], title: 'Person', group: 'Pictures', size: padded(18, 74), label: inset(30, 0, 0, 0) },
  folder: { at: 'folder', aliases: ['directory'], title: 'Folder', group: 'Pictures', size: padded(18, 52), label: inset(8, 0, 0, 0) },
  browser: { at: 'browser', aliases: [], title: 'Browser', group: 'Pictures', size: padded(18, 60), label: inset(16, 0, 0, 0) },
  console: { at: 'console', aliases: [], title: 'Console', group: 'Pictures', size: padded(18, 58), label: inset(14, 0, 0, 0) },
} as const satisfies Record<string, ShapeInfo>;

export type Shape = keyof typeof SHAPE_TABLE;
export const SHAPE_INFO: Record<Shape, ShapeInfo> = SHAPE_TABLE;
export const SHAPES = Object.keys(SHAPE_TABLE) as Shape[];

/** Shape for a type from the bracket syntax, such as `cylinder` for `A[(x)]`. */
export const SHAPE_FROM_BRACKETS: ReadonlyMap<string, Shape> = new Map(
  SHAPES.flatMap((shape) => {
    const type = SHAPE_INFO[shape].bracketType;
    return type ? [[type, shape] as const] : [];
  }),
);

/** Shape for a name or alias of the `@{ shape: … }` syntax. */
export const SHAPE_FROM_AT_NAME: ReadonlyMap<string, Shape> = new Map(
  SHAPES.flatMap((shape) => [SHAPE_INFO[shape].at, ...SHAPE_INFO[shape].aliases].map((name) => [name, shape] as const)),
);
