import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, record, redo, undo, undoKey } from '../src/core/history';
import { diffText } from '../src/sidebar/CodeEditor';

describe('history', () => {
  it('undoes and redoes steps in order', () => {
    let h = record(EMPTY_HISTORY, 'a', null, 0);
    h = record(h, 'b', null, 10);
    // Code is now 'c'.
    const u1 = undo(h, 'c')!;
    expect(u1.code).toBe('b');
    const u2 = undo(u1.history, u1.code)!;
    expect(u2.code).toBe('a');
    expect(undo(u2.history, u2.code)).toBeNull();
    const r1 = redo(u2.history, u2.code)!;
    expect(r1.code).toBe('b');
    const r2 = redo(r1.history, r1.code)!;
    expect(r2.code).toBe('c');
    expect(redo(r2.history, r2.code)).toBeNull();
  });

  it('joins quick changes of one group into one step', () => {
    let h = record(EMPTY_HISTORY, 'f', 'type', 0);
    h = record(h, 'fl', 'type', 200);
    h = record(h, 'flo', 'type', 400);
    expect(h.past).toEqual(['f']);
    // A pause starts a new step.
    h = record(h, 'flow', 'type', 3000);
    expect(h.past).toEqual(['f', 'flow']);
    // Another group too.
    h = record(h, 'flowc', 'canvas', 3100);
    expect(h.past).toEqual(['f', 'flow', 'flowc']);
  });

  it('never joins changes without a group', () => {
    let h = record(EMPTY_HISTORY, 'a', null, 0);
    h = record(h, 'b', null, 1);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('starts a new step after undo, and a change clears redo', () => {
    let h = record(EMPTY_HISTORY, 'a', 'type', 0);
    const u = undo(h, 'ab')!;
    h = record(u.history, 'a', 'type', 10);
    expect(h.past).toEqual(['a']);
    expect(h.future).toEqual([]);
  });

  it('keeps at most 200 steps', () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < 250; i++) h = record(h, String(i), null, i);
    expect(h.past).toHaveLength(200);
    expect(h.past[0]).toBe('50');
  });

  it('reads the undo and redo keys', () => {
    const k = (key: string, mods: Partial<KeyboardEvent> = {}) => undoKey({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key, ...mods });
    expect(k('z')).toBe('undo');
    expect(k('Z', { shiftKey: true })).toBe('redo');
    expect(k('y')).toBe('redo');
    expect(k('z', { ctrlKey: false, metaKey: true })).toBe('undo');
    expect(k('z', { altKey: true })).toBeNull();
    expect(k('z', { ctrlKey: false })).toBeNull();
    expect(k('a')).toBeNull();
  });
});

describe('diffText', () => {
  it('finds the changed part', () => {
    expect(diffText('abc', 'abc')).toBeNull();
    expect(diffText('A --> B', 'A --> C')).toEqual({ from: 6, to: 7, insert: 'C' });
    expect(diffText('ab', 'aXb')).toEqual({ from: 1, to: 1, insert: 'X' });
    expect(diffText('aaa', 'aa')).toEqual({ from: 2, to: 3, insert: '' });
    expect(diffText('', 'x')).toEqual({ from: 0, to: 0, insert: 'x' });
  });
});
