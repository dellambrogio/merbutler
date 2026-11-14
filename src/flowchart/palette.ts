/**
 * The color palette of the style controls: hues that go together, each in three shades (a light
 * tint for fills, a mid tone for borders and lines, a deep tone for text), plus neutrals. Presets
 * combine the shades of one hue into a look that is readable in light and dark mode.
 */

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
