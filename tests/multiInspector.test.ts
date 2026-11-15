import { describe, expect, test } from 'vitest';
import { applyDeclarationChange, sharedDeclarations } from '../src/panels/SelectionPanel';

describe('editing the style of several elements', () => {
  test('only declarations with the same value everywhere are shown', () => {
    expect(sharedDeclarations([['fill:#f00', 'stroke:#000'], ['stroke:#000', 'fill:#0f0'], ['stroke:#000']])).toEqual(['stroke:#000']);
    expect(sharedDeclarations([undefined, []])).toEqual([]);
  });

  test('a change sets or removes only the changed property, keeping the others of each element', () => {
    const shown = ['stroke:#000'];
    expect(applyDeclarationChange(['fill:#f00', 'stroke:#000'], shown, ['stroke:#000', 'fill:#00f'])).toEqual(['fill:#00f', 'stroke:#000']);
    expect(applyDeclarationChange(['stroke:#000', 'font-size:20px'], shown, [])).toEqual(['font-size:20px']);
    expect(applyDeclarationChange(undefined, [], ['color:#fff'])).toEqual(['color:#fff']);
  });
});
