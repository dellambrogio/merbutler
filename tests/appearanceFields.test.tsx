import { act, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'vitest';
import { AppearanceFields } from '../src/canvas/styleControls';
import { SWATCHES } from '../src/flowchart/palette';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

/** The swatch colors of each color row, by the row's label. */
function rows(element: JSX.Element): Record<string, string[]> {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  const out: Record<string, string[]> = {};
  for (const field of host.querySelectorAll<HTMLElement>('.color-field')) {
    out[field.getAttribute('aria-label')!] = [...field.querySelectorAll<HTMLElement>('.color-swatch:not(.none)')].map((b) => b.title);
  }
  act(() => root.unmount());
  return out;
}

describe('color swatches', () => {
  test('the own style offers the border swatches in every row', () => {
    expect(rows(<AppearanceFields styles={[]} kind="box" sameSwatches onChange={() => {}} />)).toEqual({
      Fill: [...SWATCHES.line],
      Border: [...SWATCHES.line],
      Text: [...SWATCHES.line],
    });
    expect(rows(<AppearanceFields styles={[]} kind="edge" sameSwatches onChange={() => {}} />)).toEqual({
      'Line color': [...SWATCHES.line],
      'Label text': [...SWATCHES.line],
    });
  });

  test('a class keeps a set per row: tints, mid tones, deep tones', () => {
    expect(rows(<AppearanceFields styles={[]} kind="box" onChange={() => {}} />)).toEqual({
      Fill: [...SWATCHES.fill],
      Border: [...SWATCHES.line],
      Text: [...SWATCHES.text],
    });
  });

  test('a fill picked from the border swatches shows as selected', () => {
    const fill = SWATCHES.line[3];
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<AppearanceFields styles={[`fill:${fill}`]} kind="box" sameSwatches onChange={() => {}} />));
    const selected = host.querySelector('[aria-label="Fill"] .color-swatch.selected') as HTMLElement | null;
    expect(selected?.title).toBe(fill);
    act(() => root.unmount());
  });
});
