/**
 * Mermaid themes and looks on the canvas. The colors come from Mermaid 12.3 itself: its theme
 * variables, and the computed styles of a rendered diagram where the two differ.
 *
 * Applied only when the code asks for a theme, a look or theme variables. Otherwise the canvas
 * keeps the app's own colors, which follow light and dark mode.
 */
import type { CSSProperties } from 'react';
import { get, getString, readConfig, type ConfigMap } from './config';
import type { FlowModel } from './model';

export interface Palette {
  background: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  edge: string;
  clusterFill: string;
  clusterStroke: string;
  clusterTitle: string;
  edgeLabelBackground: string;
  /** Node stroke width in px. */
  strokeWidth: number;
  /** Node strokes go from one color to the other. */
  gradient?: readonly [string, string];
  font: string;
  /** Drop shadow of nodes with the `neo` look. */
  shadow: string;
}

const TREBUCHET = '"trebuchet ms", verdana, arial, sans-serif';
const ARIAL = 'arial, sans-serif';
const RECURSIVE = '"Recursive Variable", arial, sans-serif';
const GREY_SHADOW = 'drop-shadow(1px 2px 2px rgb(185 185 185))';
const SOFT_SHADOW = 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))';

const redux: Palette = {
  background: '#ffffff',
  nodeFill: '#ffffff',
  nodeStroke: '#28253D',
  nodeText: '#28253D',
  edge: '#000000',
  clusterFill: '#F9F9FB',
  clusterStroke: '#28253D',
  clusterTitle: '#000000',
  edgeLabelBackground: '#cccccc',
  strokeWidth: 2,
  font: RECURSIVE,
  shadow: SOFT_SHADOW,
};

const reduxDark: Palette = {
  ...redux,
  background: '#333333',
  nodeFill: '#111113',
  nodeStroke: '#ffffff',
  nodeText: '#e0dfdf',
  edge: '#cccccc',
  clusterFill: '#1E1A2E',
  clusterStroke: '#ffffff',
  clusterTitle: '#dfe0e0',
  edgeLabelBackground: '#474949',
  shadow: 'drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))',
};

export const THEMES: Record<string, Palette> = {
  default: {
    background: '#ffffff',
    nodeFill: '#ECECFF',
    nodeStroke: '#9370DB',
    nodeText: '#333333',
    edge: '#333333',
    clusterFill: '#ffffde',
    clusterStroke: '#9370DB',
    clusterTitle: '#333333',
    edgeLabelBackground: 'rgb(232 232 232 / 0.8)',
    strokeWidth: 1,
    font: TREBUCHET,
    shadow: GREY_SHADOW,
  },
  base: {
    background: '#f4f4f4',
    nodeFill: '#fff4dd',
    nodeStroke: 'hsl(40.6 60% 83.3%)',
    nodeText: '#333333',
    edge: '#0b0b0b',
    clusterFill: '#f7f9ff',
    clusterStroke: 'hsl(220.6 60% 88.3%)',
    clusterTitle: '#333333',
    edgeLabelBackground: '#f4ddff',
    strokeWidth: 1,
    gradient: ['hsl(40.6 60% 83.3%)', 'hsl(280.6 60% 83.3%)'],
    font: TREBUCHET,
    shadow: GREY_SHADOW,
  },
  dark: {
    background: '#333333',
    nodeFill: '#1f2020',
    nodeStroke: '#cccccc',
    nodeText: '#cccccc',
    edge: '#d3d3d3',
    clusterFill: '#474949',
    clusterStroke: 'rgb(255 255 255 / 0.25)',
    clusterTitle: '#F9FFFE',
    edgeLabelBackground: '#585858',
    strokeWidth: 1,
    gradient: ['#cccccc', 'hsl(180 0% 18.4%)'],
    font: TREBUCHET,
    shadow: GREY_SHADOW,
  },
  forest: {
    background: '#ffffff',
    nodeFill: '#cde498',
    nodeStroke: '#13540c',
    nodeText: '#000000',
    edge: '#000000',
    clusterFill: '#cdffb2',
    clusterStroke: '#6eaa49',
    clusterTitle: '#333333',
    edgeLabelBackground: '#e8e8e8',
    strokeWidth: 1,
    gradient: ['hsl(78.2 18.5% 64.5%)', 'hsl(99 60% 74.9%)'],
    font: TREBUCHET,
    shadow: 'drop-shadow(1px 2px 2px rgb(185 185 185 / 0.5))',
  },
  neutral: {
    background: '#ffffff',
    nodeFill: '#eeeeee',
    nodeStroke: '#999999',
    nodeText: '#000000',
    edge: '#666666',
    clusterFill: '#fcfcfc',
    clusterStroke: '#707070',
    clusterTitle: '#333333',
    edgeLabelBackground: '#ffffff',
    strokeWidth: 1,
    gradient: ['hsl(0 0% 83.3%)', 'hsl(0 0% 88.9%)'],
    font: TREBUCHET,
    shadow: GREY_SHADOW,
  },
  neo: {
    background: '#ffffff',
    nodeFill: '#ffffff',
    nodeStroke: '#0042eb',
    nodeText: '#333333',
    edge: '#000000',
    clusterFill: '#ffffff',
    clusterStroke: '#0042eb',
    clusterTitle: '#000000',
    edgeLabelBackground: '#cccccc',
    strokeWidth: 2,
    gradient: ['#0042eb', '#eb0042'],
    font: ARIAL,
    shadow: SOFT_SHADOW,
  },
  'neo-dark': {
    background: '#333333',
    nodeFill: '#2a2020',
    nodeStroke: '#0042eb',
    nodeText: '#e0dfdf',
    edge: '#cccccc',
    clusterFill: '#201f1f',
    clusterStroke: '#0042eb',
    clusterTitle: '#dfe0e0',
    edgeLabelBackground: '#474949',
    strokeWidth: 1,
    gradient: ['#0042eb', '#eb0042'],
    font: ARIAL,
    shadow: 'drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))',
  },
  redux,
  'redux-color': { ...redux, clusterFill: '#fdf4ff', clusterStroke: '#e879f9' },
  'redux-dark': reduxDark,
  'redux-dark-color': { ...reduxDark, clusterStroke: '#e879f9' },
};

/** Mermaid 12's default theme. */
export const DEFAULT_THEME = 'redux-color';

/** `themeVariables` that map to the canvas palette. */
const THEME_VARIABLES: Partial<Record<string, keyof Palette>> = {
  background: 'background',
  primaryColor: 'nodeFill',
  mainBkg: 'nodeFill',
  primaryBorderColor: 'nodeStroke',
  nodeBorder: 'nodeStroke',
  primaryTextColor: 'nodeText',
  nodeTextColor: 'nodeText',
  lineColor: 'edge',
  clusterBkg: 'clusterFill',
  clusterBorder: 'clusterStroke',
  titleColor: 'clusterTitle',
  edgeLabelBackground: 'edgeLabelBackground',
  fontFamily: 'font',
};

/** Colors, lengths and font names only: the values become CSS. */
const SAFE = /^[#\w\s.,%()/"'-]+$/;

export type Look = 'classic' | 'neo' | 'handDrawn';

export interface DiagramTheme {
  name: string;
  palette: Palette;
  look: Look;
}

/** The theme and look the code asks for, or null to keep the app's own colors. */
export function diagramTheme(model: FlowModel): DiagramTheme | null {
  const config = readConfig(model.preamble);
  const name = getString(config, 'theme');
  const lookName = getString(config, 'look');
  const variables = get(config, 'themeVariables');
  if (name === undefined && lookName === undefined && typeof variables !== 'object') return null;
  const theme = name && THEMES[name] ? name : DEFAULT_THEME;
  const palette: Palette = { ...THEMES[theme] };
  if (typeof variables === 'object') applyVariables(palette, variables);
  const look: Look = lookName === 'classic' || lookName === 'handDrawn' ? lookName : 'neo';
  return { name: theme, palette, look };
}

function applyVariables(palette: Palette, variables: ConfigMap): void {
  for (const [key, value] of Object.entries(variables)) {
    const target = THEME_VARIABLES[key];
    if (!target || typeof value !== 'string' || !SAFE.test(value) || /url\s*\(/i.test(value)) continue;
    (palette as unknown as Record<string, unknown>)[target] = value;
    // An own border color replaces the theme's gradient.
    if (target === 'nodeStroke') delete palette.gradient;
  }
}

export const GRADIENT_ID = 'theme-stroke-gradient';
export const HAND_DRAWN_ID = 'theme-hand-drawn';

/**
 * CSS variables for the diagram area (React Flow's root). They override the app's variables
 * there only, so the toolbar and the inspector keep the app's colors.
 */
export function themeVars(theme: DiagramTheme): CSSProperties {
  const p = theme.palette;
  const filter = theme.look === 'handDrawn' ? `url(#${HAND_DRAWN_ID})` : theme.look === 'neo' ? p.shadow : 'none';
  return {
    '--bg': p.background,
    '--node-fill': p.nodeFill,
    '--node-stroke': p.gradient ? `url(#${GRADIENT_ID})` : p.nodeStroke,
    // For borders and backgrounds, where a gradient cannot go.
    '--node-stroke-solid': p.nodeStroke,
    '--node-stroke-width': `${p.strokeWidth}px`,
    '--text': p.nodeText,
    '--edge-stroke': p.edge,
    '--subgraph-fill': p.clusterFill,
    '--subgraph-stroke': p.clusterStroke,
    '--subgraph-title': p.clusterTitle,
    '--edge-label-bg': p.edgeLabelBackground,
    '--node-filter': filter,
    // Mermaid draws subgraph borders solid; the app's own style dashes them.
    '--subgraph-border-style': 'solid',
    '--diagram-font': p.font,
    '--xy-background-color': p.background,
  } as CSSProperties;
}
