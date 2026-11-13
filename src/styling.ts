/**
 * How `classDef`, `class`, `style` and `linkStyle` look on the canvas.
 *
 * Mermaid applies the declarations as CSS. The canvas draws the common ones (colors, stroke width,
 * dashes, font) and keeps the others in the code only. Values that could load something
 * (`url(…)`) or leave the property (`;`, quotes, braces) are ignored: the code can come from a paste.
 */
import type { CSSProperties } from 'react';
import { sortClasses, type FlowEdge, type FlowModel, type FlowNode, type FlowSubgraph } from './model';

export interface Look {
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeDasharray?: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontSize?: string;
}

const PROPERTIES: Record<string, keyof Look> = {
  fill: 'fill',
  background: 'fill',
  'background-color': 'fill',
  stroke: 'stroke',
  'stroke-width': 'strokeWidth',
  'stroke-dasharray': 'strokeDasharray',
  color: 'color',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'font-size': 'fontSize',
};

/** Colors, lengths, numbers, keywords and color functions only. */
const SAFE_VALUE = /^[#\w\s.,%()+-]+$/;

/** Applies `name:value` declarations to a look, later ones winning. */
function applyDeclarations(look: Look, declarations: readonly string[] | undefined): Look {
  for (const declaration of declarations ?? []) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const key = PROPERTIES[declaration.slice(0, colon).trim().toLowerCase()];
    const value = declaration.slice(colon + 1).replace(/!important/i, '').trim();
    if (!key || !SAFE_VALUE.test(value) || /url\s*\(/i.test(value)) continue;
    // SVG takes a bare number as px; a CSS border (subgraphs) does not.
    look[key] = key === 'strokeWidth' && /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
  }
  return look;
}

function classStyles(model: FlowModel, name: string): readonly string[] {
  return model.classDefs?.find((c) => c.name === name)?.styles ?? [];
}

/** Classes apply in `classDef` order (as CSS rules do in Mermaid), so a later `classDef` wins. */
function fromClasses(model: FlowModel, classes: readonly string[] | undefined, styles: readonly string[] | undefined, base: Look = {}): Look {
  const look = { ...base };
  for (const name of sortClasses(classes ?? [], model.classDefs)) applyDeclarations(look, classStyles(model, name));
  return applyDeclarations(look, styles);
}

/** Mermaid: `classDef default` for nodes without a class, then the classes, then `style`. */
export function nodeLook(model: FlowModel, node: FlowNode): Look {
  const base = node.classes?.length ? {} : applyDeclarations({}, classStyles(model, 'default'));
  return fromClasses(model, node.classes, node.styles, base);
}

export function subgraphLook(model: FlowModel, subgraph: FlowSubgraph): Look {
  return fromClasses(model, subgraph.classes, subgraph.styles);
}

/** `linkStyle default`, then the edge's classes, then its own `linkStyle`. */
export function edgeLook(model: FlowModel, edge: FlowEdge): Look {
  return fromClasses(model, edge.classes, edge.styles, applyDeclarations({}, model.linkDefaults?.styles));
}

/** True when the look changes nothing. */
export function isPlain(look: Look): boolean {
  return Object.keys(look).length === 0;
}

/** Inspector text for a list of declarations: `fill:#f96; stroke:#333`. */
export function stylesToText(styles: readonly string[] | undefined): string {
  return (styles ?? []).join('; ');
}

/** The inverse of `stylesToText`. Empty parts are dropped. */
export function stylesFromText(text: string): string[] {
  return text
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.includes(':'));
}

/** Class names from inspector text: separated by spaces or commas. */
export function classesFromText(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((c) => /^[\w-]+$/.test(c)))];
}

/**
 * CSS variables for a node or subgraph box. The outline CSS reads them, so every part of
 * a shape (fills, strokes, solid parts) follows the look.
 */
export function boxVars(look: Look | undefined): CSSProperties {
  if (!look) return {};
  const vars: Record<string, string> = {};
  if (look.fill) {
    vars['--node-fill'] = look.fill;
    vars['--subgraph-fill'] = look.fill;
  }
  if (look.stroke) vars['--node-stroke'] = look.stroke;
  if (look.strokeWidth) vars['--node-stroke-width'] = look.strokeWidth;
  if (look.strokeDasharray) vars['--node-dash'] = look.strokeDasharray;
  return vars as CSSProperties;
}

const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', pink: '#ffc0cb', cyan: '#00ffff',
  magenta: '#ff00ff', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  lightblue: '#add8e6', lightgreen: '#90ee90', lightyellow: '#ffffe0', navy: '#000080', teal: '#008080',
  maroon: '#800000', olive: '#808000', silver: '#c0c0c0', gold: '#ffd700', beige: '#f5f5dc', ivory: '#fffff0',
};

/** Relative luminance (0 dark … 1 light) of a `#rgb`, `#rrggbb` or named color, or null. */
export function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(NAMED_COLORS[color.toLowerCase()] ?? color);
  if (!m) return null;
  // Drop the alpha digit(s) of #rgba / #rrggbbaa.
  const rgb = m[1].length <= 4 ? [...m[1].slice(0, 3)].map((c) => c + c).join('') : m[1].slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(rgb.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Label color and font. A fill without a `color` gets dark or light text by the fill's
 * brightness, so a light fill stays readable in dark mode and a dark fill in light mode.
 */
export function textStyle(look: Look | undefined): CSSProperties {
  if (!look) return {};
  const fill = look.fill ? luminance(look.fill) : null;
  const color = look.color ?? (fill === null ? undefined : fill > 0.4 ? '#1d2330' : '#f2f4f8');
  return { color, fontWeight: look.fontWeight, fontStyle: look.fontStyle, fontSize: look.fontSize };
}
