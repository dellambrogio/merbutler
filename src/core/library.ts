/**
 * The diagrams saved in this browser (localStorage): a list of named diagrams, and which one is
 * open. Nothing leaves the browser. The list functions are pure; load and store wrap storage,
 * which can be missing or full (private windows, blocked site data), so they never throw.
 */
import { frontMatterOf, readYamlMaps } from './config';
import { HEADER_LINE, typeOfKeyword } from './diagramTypes';
import { preambleOf } from './mermaid';

export interface SavedDiagram {
  id: string;
  name: string;
  code: string;
  /** Milliseconds since 1970. */
  created: number;
  updated: number;
}

const LIST_KEY = 'merbutler:diagrams';
const OPEN_KEY = 'merbutler:open-diagram';

function isDiagram(value: unknown): value is SavedDiagram {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return typeof d.id === 'string' && typeof d.name === 'string' && typeof d.code === 'string' && typeof d.created === 'number' && typeof d.updated === 'number';
}

/** The saved diagrams, most recently changed first. Broken entries are left out. */
export function loadDiagrams(): SavedDiagram[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
    return Array.isArray(parsed) ? sortDiagrams(parsed.filter(isDiagram)) : [];
  } catch {
    return [];
  }
}

/** Stores the list. False if the browser refused (storage full or blocked). */
export function storeDiagrams(list: SavedDiagram[]): boolean {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The id of the open diagram, or null for an unsaved one. */
export function loadOpenId(): string | null {
  try {
    return localStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}

export function storeOpenId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(OPEN_KEY);
    else localStorage.setItem(OPEN_KEY, id);
  } catch {
    // The open diagram is a convenience only.
  }
}

export function sortDiagrams(list: SavedDiagram[]): SavedDiagram[] {
  return [...list].sort((a, b) => b.updated - a.updated);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A name for new code: its front matter title, else "Untitled" with a number that is not taken. */
export function suggestName(list: SavedDiagram[], code: string, base = 'Untitled'): string {
  const title = readYamlMaps(frontMatterOf(preambleOf(code))).title;
  const wanted = typeof title === 'string' && title.trim() !== '' ? title.trim() : base;
  return uniqueName(list, wanted);
}

/** The name, or the name with " 2", " 3", … if another diagram has it. */
export function uniqueName(list: SavedDiagram[], name: string, except?: string): string {
  const taken = new Set(list.filter((d) => d.id !== except).map((d) => d.name));
  if (!taken.has(name)) return name;
  const stem = name.replace(/ \d+$/, '');
  for (let n = 2; ; n++) if (!taken.has(`${stem} ${n}`)) return `${stem} ${n}`;
}

export function createDiagram(list: SavedDiagram[], name: string, code: string, now = Date.now()): { list: SavedDiagram[]; diagram: SavedDiagram } {
  const diagram: SavedDiagram = { id: newId(), name: uniqueName(list, name.trim() || 'Untitled'), code, created: now, updated: now };
  return { list: sortDiagrams([diagram, ...list]), diagram };
}

/** Changes the code or the name of a diagram. A name is trimmed and kept unique; an empty one is ignored. */
export function updateDiagram(list: SavedDiagram[], id: string, patch: { name?: string; code?: string }, now = Date.now()): SavedDiagram[] {
  return sortDiagrams(
    list.map((d) => {
      if (d.id !== id) return d;
      const name = patch.name?.trim() ? uniqueName(list, patch.name.trim(), id) : d.name;
      const code = patch.code ?? d.code;
      if (name === d.name && code === d.code) return d;
      return { ...d, name, code, updated: now };
    }),
  );
}

export function duplicateDiagram(list: SavedDiagram[], id: string, now = Date.now()): { list: SavedDiagram[]; diagram: SavedDiagram } | null {
  const source = list.find((d) => d.id === id);
  return source ? createDiagram(list, `${source.name.replace(/ copy( \d+)?$/, '')} copy`, source.code, now) : null;
}

export function deleteDiagram(list: SavedDiagram[], id: string): SavedDiagram[] {
  return list.filter((d) => d.id !== id);
}

/** The diagram type of the code, by its header line ("Flowchart", "Sequence", …), or null. */
export function diagramKind(code: string): string | null {
  for (const line of code.slice(preambleOf(code).length).split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('%%')) continue;
    const keyword = HEADER_LINE.exec(line)?.[1];
    return keyword ? (typeOfKeyword(keyword)?.name ?? keyword) : null;
  }
  return null;
}
