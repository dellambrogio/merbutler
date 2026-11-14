import { describe, expect, test } from 'vitest';
import { addClassDef, classUsage, removeClassDef, renameClassDef, toggleClassOn, updateClassDef, type FlowModel } from '../src/core/model';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';
import { declarationValue, withDeclaration } from '../src/flowchart/styling';

async function parseOk(text: string): Promise<FlowModel> {
  const r = await parse(text);
  if (!r.ok) throw new Error(r.error);
  return r.model;
}

describe('style declarations', () => {
  test('read, set in place, remove', () => {
    const styles = ['fill:#f96', 'stroke:#333', 'stroke-width:2px'];
    expect(declarationValue(styles, 'stroke')).toBe('#333');
    expect(withDeclaration(styles, 'stroke', '#00f')).toEqual(['fill:#f96', 'stroke:#00f', 'stroke-width:2px']);
    expect(withDeclaration(styles, 'stroke', '')).toEqual(['fill:#f96', 'stroke-width:2px']);
    expect(withDeclaration(['background:red'], 'fill', '#fff')).toEqual(['fill:#fff']);
    expect(declarationValue(['background:red'], 'fill')).toBe('red');
  });
});

describe('style classes', () => {
  test('create, apply, rename, edit, delete', async () => {
    let model = await parseOk('flowchart LR\n  a --> b\n');
    model = addClassDef(model, 'hot', ['fill:#f96']);
    expect(addClassDef(model, 'hot')).toBe(model);
    expect(addClassDef(model, '1bad')).toBe(model);
    model = toggleClassOn(model, 'hot', { nodes: ['a', 'b'], edges: ['e1'] });
    expect(classUsage(model, 'hot')).toBe(3);
    model = updateClassDef(model, 'hot', ['fill:#f00', 'stroke:#333']);
    model = renameClassDef(model, 'hot', 'warm');
    const written = serialize(model);
    expect(written).toContain('classDef warm fill:#f00,stroke:#333');
    expect(written).toContain('class a,b,e1 warm');
    expect(serialize(await parseOk(written))).toBe(written);
    // Toggling on elements that all have the class removes it.
    expect(classUsage(toggleClassOn(model, 'warm', { nodes: ['a', 'b'] }), 'warm')).toBe(1);
    model = removeClassDef(model, 'warm');
    expect(model.classDefs).toBeUndefined();
    expect(serialize(model)).not.toContain('warm');
  });
});

describe('palette', () => {
  test('presets and fresh class looks', async () => {
    const { HUES, PALETTE_ROWS, nextClassStyles, presets, presetStyles } = await import('../src/flowchart/palette');
    expect(PALETTE_ROWS.every((row) => row.length === HUES.length + 1)).toBe(true);
    const soft = presets('soft')[1];
    expect(presetStyles(soft, 'box')).toEqual([`fill:${soft.fill}`, `stroke:${soft.stroke}`, `color:${soft.color}`]);
    expect(presetStyles(soft, 'edge')).toEqual([`stroke:${soft.stroke}`, `color:${soft.color}`]);
    // A new class takes a hue no class uses yet.
    const first = nextClassStyles([]);
    const second = nextClassStyles([first]);
    expect(second[0]).not.toBe(first[0]);
    expect(nextClassStyles(presets('soft').map((p) => presetStyles(p, 'box')))).toHaveLength(3);
  });
});
