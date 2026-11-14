/**
 * The color palette of the style controls: hues that go together, each in three shades (a light
 * tint for fills, a mid tone for borders and lines, a deep tone for text), plus neutrals. Presets
 * combine the shades of one hue into a look that is readable in light and dark mode. Class sets
 * turn ready-made six-color palettes into classes.
 */
import { luminance } from './styling';

export interface Hue {
  name: string;
  /** Light tint: a fill that keeps dark text readable. */
  tint: string;
  /** Mid tone: borders, lines, or a strong fill with white text. */
  mid: string;
  /** Deep tone: text on the tint, or the border of a strong fill. */
  deep: string;
}

export const HUES: readonly Hue[] = [
  { name: 'slate', tint: '#f1f5f9', mid: '#64748b', deep: '#1e293b' },
  { name: 'blue', tint: '#dbeafe', mid: '#3b82f6', deep: '#1e3a8a' },
  { name: 'teal', tint: '#ccfbf1', mid: '#14b8a6', deep: '#134e4a' },
  { name: 'green', tint: '#dcfce7', mid: '#22c55e', deep: '#14532d' },
  { name: 'amber', tint: '#fef3c7', mid: '#f59e0b', deep: '#78350f' },
  { name: 'orange', tint: '#ffedd5', mid: '#f97316', deep: '#7c2d12' },
  { name: 'red', tint: '#fee2e2', mid: '#ef4444', deep: '#7f1d1d' },
  { name: 'pink', tint: '#fce7f3', mid: '#ec4899', deep: '#831843' },
  { name: 'violet', tint: '#ede9fe', mid: '#8b5cf6', deep: '#4c1d95' },
];

/** White, mid gray, near black: the neutral swatches. */
export const NEUTRALS = { tint: '#ffffff', mid: '#9ca3af', deep: '#111827' } as const;

/** The swatches of a color field, one row: a neutral, then each hue in the field's shade. */
export const SWATCHES = {
  /** Fills: white and the tints. */
  fill: [NEUTRALS.tint, ...HUES.map((h) => h.tint)],
  /** Borders and lines: gray and the mid tones. */
  line: [NEUTRALS.mid, ...HUES.map((h) => h.mid)],
  /** Text: black, white, and the deep tones (slate's is close to black). */
  text: [NEUTRALS.deep, NEUTRALS.tint, ...HUES.slice(1).map((h) => h.deep)],
} as const;

/** A look made of palette colors. `fill` is absent for edges. */
export interface Preset {
  name: string;
  fill: string;
  stroke: string;
  color: string;
}

/** Soft: tint fill, mid border, deep text. Strong: mid fill, deep border, white text. */
export function presets(variant: 'soft' | 'strong'): Preset[] {
  return HUES.map((h) =>
    variant === 'soft'
      ? { name: `${h.name} (soft)`, fill: h.tint, stroke: h.mid, color: h.deep }
      : { name: `${h.name} (strong)`, fill: h.mid, stroke: h.deep, color: '#ffffff' },
  );
}

/** The declarations of a preset, for a box (fill, border, text) or an edge (line, label). */
export function presetStyles(preset: Preset, kind: 'box' | 'edge'): string[] {
  return kind === 'box' ? [`fill:${preset.fill}`, `stroke:${preset.stroke}`, `color:${preset.color}`] : [`stroke:${preset.stroke}`, `color:${preset.color}`];
}

/** A look for a new class: the first soft preset no class uses yet, so classes tell apart. */
export function nextClassStyles(used: ReadonlyArray<readonly string[]>): string[] {
  const fills = new Set(used.flatMap((styles) => styles.filter((d) => /^fill\s*:/i.test(d)).map((d) => d.slice(d.indexOf(':') + 1).trim().toLowerCase())));
  const soft = presets('soft');
  const pick = soft.slice(1).find((p) => !fills.has(p.fill)) ?? soft[(used.length % (soft.length - 1)) + 1];
  return presetStyles(pick, 'box');
}

/** A ready-made list of classes, added in one go from the Classes panel. */
export interface ClassSet {
  name: string;
  /** The colors, in order; class `prefix-n` gets the n-th. */
  colors: readonly string[];
  prefix: string;
  classes: ReadonlyArray<{ name: string; styles: string[] }>;
}

/** Mixes a #rrggbb color toward black by `amount` (0 … 1). */
function darken(color: string, amount: number): string {
  const n = parseInt(color.slice(1), 16);
  const channel = (shift: number): string => Math.round(((n >> shift) & 255) * (1 - amount)).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * The look of a palette color as a class: the color as fill, a darker border of the same hue,
 * and text that reads on it: a deep shade of the hue on light fills, white on dark ones.
 */
export function swatchStyles(fill: string): string[] {
  const light = (luminance(fill) ?? 1) > 0.4;
  return [`fill:${fill}`, `stroke:${darken(fill, 0.35)}`, `color:${light ? darken(fill, 0.75) : '#ffffff'}`];
}

const PALETTES: ReadonlyArray<[name: string, prefix: string, colors: string[]]> = [
  ['Rainbow', 'rainbow', ['#ff595d', '#ff924e', '#feca3a', '#8cc925', '#1982c4', '#6a4c92']],
  ['Berry night', 'berry', ['#fd0267', '#ce0a5e', '#9d1059', '#6a1552', '#3b1d49', '#0a2145']],
  ['Forest', 'forest', ['#abd577', '#72a942', '#538c1f', '#245601', '#1b4301', '#143501']],
  ['Neon', 'neon', ['#02befe', '#ff7e01', '#ffdd00', '#afff03', '#fe006d', '#9000ff']],
  ['Earth', 'earth', ['#8e4130', '#ba704e', '#e6cdbd', '#f6ebe3', '#a3a182', '#67725a']],
  ['Coral lagoon', 'coral', ['#f47169', '#feb4af', '#fff5f4', '#ffc34a', '#1397a5', '#0c606a']],
  ['Tropical', 'tropical', ['#06394d', '#0f8bb1', '#05d6a0', '#ffd068', '#f68c69', '#ef4770']],
  ['Blush', 'blush', ['#ffc5ba', '#fcd6cf', '#fae2dd', '#f8edea', '#e8e8e4', '#d8e2dc']],
  ['Sand', 'sand', ['#d6ccc2', '#ded6cd', '#e4dfd7', '#eeeae7', '#e4d6ca', '#f6ebe3']],
  ['Olive and clay', 'clay', ['#797d63', '#9b9c79', '#d9ae96', '#f2dda9', '#d08b60', '#9a7c66']],
  ['Candy mint', 'mint', ['#ff5983', '#ff92ac', '#fdc9d6', '#baeee1', '#79d3be', '#39b99b']],
  ['Coffee', 'coffee', ['#eee2d6', '#e6cdb3', '#dfb793', '#b08a69', '#9c6644', '#7e553a']],
  ['Dusk', 'dusk', ['#432680', '#34156f', '#28065a', '#660f55', '#ae2c68', '#f34950']],
  ['Citrus and teal', 'citrus', ['#fd5a00', '#f88105', '#faac35', '#249fa1', '#007f82', '#005f61']],
  ['Rose', 'rose', ['#b8345f', '#e0587f', '#fd7ba2', '#fe9eba', '#ffc1d4', '#ffe0e8']],
  ['Navy', 'navy', ['#00132d', '#001839', '#001d45', '#002558', '#002d69', '#00367f']],
  ['Harbor', 'harbor', ['#023d59', '#01537b', '#a9e8f9', '#f4a100', '#ffba42', '#ffd35c']],
  ['Meadow', 'meadow', ['#ec5e28', '#f9a03f', '#f2c054', '#a2c34a', '#86a52f', '#6a8531']],
];

export const CLASS_SETS: readonly ClassSet[] = PALETTES.map(([name, prefix, colors]) => ({
  name,
  prefix,
  colors,
  classes: colors.map((c, i) => ({ name: `${prefix}-${i + 1}`, styles: swatchStyles(c) })),
}));
