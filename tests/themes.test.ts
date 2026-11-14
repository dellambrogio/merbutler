import { describe, expect, test } from 'vitest';
import { readConfig, readYamlMaps } from '../src/core/config';
import { textSettings } from '../src/canvas/layout';
import type { FlowModel } from '../src/core/model';
import { diagramTheme, THEMES, themeVars } from '../src/flowchart/themes';

const model = (preamble?: string): FlowModel => ({ direction: 'TB', nodes: [], subgraphs: [], edges: [], preamble });

describe('config', () => {
  test('nested maps, scalars, comments and quotes', () => {
    expect(readYamlMaps('title: "A: b"\nconfig:\n  theme: forest # comment\n  flowchart:\n    curve: linear\n    wrappingWidth: 150\n  look: classic\n')).toEqual({
      title: 'A: b',
      config: { theme: 'forest', flowchart: { curve: 'linear', wrappingWidth: 150 }, look: 'classic' },
    });
  });

  test('a directive wins over the front matter', () => {
    const config = readConfig("---\nconfig:\n  theme: forest\n  flowchart:\n    curve: linear\n---\n%%{init: {'theme': 'dark', 'flowchart': {'htmlLabels': false}}}%%");
    expect(config).toEqual({ theme: 'dark', flowchart: { curve: 'linear', htmlLabels: false } });
  });
});

describe('themes', () => {
  test('no theme, look or theme variables: the app keeps its own colors', () => {
    expect(diagramTheme(model())).toBeNull();
    expect(diagramTheme(model('---\ntitle: x\nconfig:\n  layout: dagre\n---'))).toBeNull();
  });

  test('a named theme, with the neo look by default', () => {
    const theme = diagramTheme(model('---\nconfig:\n  theme: forest\n---'));
    expect(theme).toMatchObject({ name: 'forest', look: 'neo', palette: THEMES.forest });
    expect(themeVars(theme!)).toMatchObject({ '--node-fill': '#cde498', '--node-filter': THEMES.forest.shadow });
  });

  test('look alone uses the default theme; classic has no shadow', () => {
    const theme = diagramTheme(model('---\nconfig:\n  look: classic\n---'));
    expect(theme).toMatchObject({ name: 'redux-color', look: 'classic' });
    expect(themeVars(theme!)['--node-filter' as keyof object]).toBe('none');
  });

  test('gradient themes stroke nodes with the gradient, and give borders a solid color', () => {
    const vars = themeVars(diagramTheme(model('---\nconfig:\n  theme: neo\n---'))!) as Record<string, string>;
    expect(vars['--node-stroke']).toBe('url(#theme-stroke-gradient)');
    expect(vars['--node-stroke-solid']).toBe('#0042eb');
  });

  test('theme variables override the theme; unsafe values are ignored', () => {
    const theme = diagramTheme(
      model('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#ff0000", "primaryBorderColor": "#00f", "lineColor": "url(https://x)", "clusterBkg": "red;}"}}}%%'),
    )!;
    expect(theme.palette).toMatchObject({ nodeFill: '#ff0000', nodeStroke: '#00f', edge: THEMES.base.edge, clusterFill: THEMES.base.clusterFill });
    // An own border color replaces the gradient.
    expect(theme.palette.gradient).toBeUndefined();
  });

  test('an unknown theme name falls back to the default theme', () => {
    expect(diagramTheme(model('---\nconfig:\n  theme: nonsense\n---'))?.name).toBe('redux-color');
  });
});

describe('text settings', () => {
  test('wrapping from the config, font from the theme', () => {
    expect(textSettings(model())).toEqual({ font: 'system-ui, sans-serif', wrapWidth: 200, markdownWrap: true });
    expect(textSettings(model('---\nconfig:\n  theme: neo\n  markdownAutoWrap: false\n  flowchart:\n    wrappingWidth: 120\n---'))).toEqual({
      font: 'arial, sans-serif',
      wrapWidth: 120,
      markdownWrap: false,
    });
  });
});

describe('text size', () => {
  test('long lines wrap at the wrap width; Markdown only if markdownWrap', async () => {
    const { textSize, DEFAULT_TEXT } = await import('../src/canvas/layout');
    const long = 'word '.repeat(30).trim();
    expect(textSize(long, false).lines).toBeGreaterThan(1);
    expect(textSize(long, false).width).toBe(200);
    expect(textSize(long, true, { ...DEFAULT_TEXT, markdownWrap: false })).toMatchObject({ lines: 1 });
    expect(textSize(long, false, { ...DEFAULT_TEXT, wrapWidth: 100 }).lines).toBeGreaterThan(textSize(long, false).lines);
  });
});
