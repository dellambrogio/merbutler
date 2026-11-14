/**
 * Undo and redo for the diagram's code. The code is the one source every editor writes to (the code
 * editor, the canvas, the outline and table editors), so one history of code snapshots covers them all.
 */

export interface History {
  /** Code before each step, oldest first. */
  past: string[];
  /** Code after each undone step, the next redo last. */
  future: string[];
  /** The group of the last recorded change, while it may still grow. */
  group: string | null;
  /** When the last change was recorded (ms). */
  time: number;
}

export const EMPTY_HISTORY: History = { past: [], future: [], group: null, time: 0 };

/** Steps kept. Older ones are dropped. */
const LIMIT = 200;

/** How long a pause ends a group of changes (ms): typed characters, or a color picker dragged. */
const GROUP_PAUSE: Record<string, number> = { type: 1000, canvas: 400 };
const DEFAULT_PAUSE = 400;

/**
 * Records a change from `before` to new code. A change in the same `group` as the last one, soon after
 * it, joins its step (typing a word is one step). `group` null: always a step of its own.
 */
export function record(history: History, before: string, group: string | null, now: number): History {
  const joins = group !== null && group === history.group && now - history.time < (GROUP_PAUSE[group] ?? DEFAULT_PAUSE);
  if (joins) return { ...history, future: [], time: now };
  const past = [...history.past, before];
  return { past: past.length > LIMIT ? past.slice(past.length - LIMIT) : past, future: [], group, time: now };
}

/** The code before the last step, and the history after undoing it; null if there is nothing to undo. */
export function undo(history: History, current: string): { history: History; code: string } | null {
  const code = history.past.at(-1);
  if (code === undefined) return null;
  return { code, history: { past: history.past.slice(0, -1), future: [...history.future, current], group: null, time: 0 } };
}

/** The code after the last undone step, and the history after redoing it; null if there is nothing to redo. */
export function redo(history: History, current: string): { history: History; code: string } | null {
  const code = history.future.at(-1);
  if (code === undefined) return null;
  return { code, history: { past: [...history.past, current], future: history.future.slice(0, -1), group: null, time: 0 } };
}

/** True for Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z and Ctrl+Y are redo. */
export function undoKey(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'key'>): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !e.shiftKey) return 'redo';
  return null;
}
