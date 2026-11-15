/**
 * The diagrams saved in this browser (localStorage): named diagrams in a tree of folders, and which
 * one is open. Nothing leaves the browser.
 *
 * A folder is a path of names joined by `/` (`Work/Specs`); `''` is the top level. A diagram keeps
 * the path of its folder; the folders list keeps the folders, also empty ones. Names are unique
 * among the diagrams of one folder, and among the folders of one folder. The list functions are pure; load and store wrap storage,
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
  /** The path of its folder; missing or '' at the top level. */
  folder?: string;
}

export const LIST_KEY = 'merbutler:diagrams';
export const FOLDERS_KEY = 'merbutler:folders';
const OPEN_KEY = 'merbutler:open-diagram';

function isDiagram(value: unknown): value is SavedDiagram {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.code === 'string' &&
    typeof d.created === 'number' &&
    typeof d.updated === 'number' &&
    (d.folder === undefined || (typeof d.folder === 'string' && isFolderPath(d.folder)))
  );
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

/** A name for new code: its front matter title, else "Untitled" with a number that is not taken in the folder. */
export function suggestName(list: SavedDiagram[], code: string, base = 'Untitled', folder = ''): string {
  const title = readYamlMaps(frontMatterOf(preambleOf(code))).title;
  const wanted = typeof title === 'string' && title.trim() !== '' ? title.trim().replace(/\//g, '-') : base;
  return uniqueName(list, wanted, undefined, folder);
}

/** The name, or the name with " 2", " 3", … if it is taken. */
function freeName(taken: ReadonlySet<string>, name: string): string {
  if (!taken.has(name)) return name;
  const stem = name.replace(/ \d+$/, '');
  for (let n = 2; ; n++) if (!taken.has(`${stem} ${n}`)) return `${stem} ${n}`;
}

/** The name, or the name with " 2", " 3", … if another diagram of the folder has it. */
export function uniqueName(list: SavedDiagram[], name: string, except?: string, folder = ''): string {
  return freeName(new Set(list.filter((d) => d.id !== except && folderOf(d) === folder).map((d) => d.name)), name);
}

export function createDiagram(list: SavedDiagram[], name: string, code: string, now = Date.now(), folder = ''): { list: SavedDiagram[]; diagram: SavedDiagram } {
  const diagram: SavedDiagram = { id: newId(), name: uniqueName(list, name.trim() || 'Untitled', undefined, folder), code, created: now, updated: now };
  if (folder) diagram.folder = folder;
  return { list: sortDiagrams([diagram, ...list]), diagram };
}

/** Changes the code or the name of a diagram. A name is trimmed and kept unique; an empty one is ignored. */
export function updateDiagram(list: SavedDiagram[], id: string, patch: { name?: string; code?: string }, now = Date.now()): SavedDiagram[] {
  return sortDiagrams(
    list.map((d) => {
      if (d.id !== id) return d;
      const name = patch.name?.trim() ? uniqueName(list, patch.name.trim().replace(/\//g, '-'), id, folderOf(d)) : d.name;
      const code = patch.code ?? d.code;
      if (name === d.name && code === d.code) return d;
      return { ...d, name, code, updated: now };
    }),
  );
}

export function duplicateDiagram(list: SavedDiagram[], id: string, now = Date.now()): { list: SavedDiagram[]; diagram: SavedDiagram } | null {
  const source = list.find((d) => d.id === id);
  return source ? createDiagram(list, `${source.name.replace(/ copy( \d+)?$/, '')} copy`, source.code, now, folderOf(source)) : null;
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

// ---- Folders ----

/** The folder of a diagram ('' at the top level). */
export function folderOf(d: SavedDiagram): string {
  return d.folder ?? '';
}

/** The last name of a folder path. */
export function folderName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The folder that holds a folder ('' for one at the top level). */
export function parentFolder(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

function join(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** True for `path` itself and every folder inside it. */
export function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** A folder path: names without `/`, not empty, with no spaces around them. */
export function isFolderPath(path: string): boolean {
  return path === '' || path.split('/').every((name) => name !== '' && name === name.trim());
}

/** A folder name from what the user typed: trimmed, with `/` replaced. */
function cleanName(name: string): string {
  return name.trim().replace(/\//g, '-');
}

/** The stored folders. Broken entries are left out. */
export function loadFolders(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p !== '' && isFolderPath(p)) : [];
  } catch {
    return [];
  }
}

/** Stores the folders. False if the browser refused (storage full or blocked). */
export function storeFolders(folders: string[]): boolean {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    return true;
  } catch {
    return false;
  }
}

/** Every folder: the stored ones, those diagrams are in, and the folders that hold them; sorted. */
export function allFolders(diagrams: SavedDiagram[], folders: string[]): string[] {
  const all = new Set<string>();
  for (const path of [...folders, ...diagrams.map(folderOf)]) {
    for (let p = path; p !== ''; p = parentFolder(p)) all.add(p);
  }
  return [...all].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The folders and diagrams after a change to the folders. */
export interface Library {
  diagrams: SavedDiagram[];
  folders: string[];
}

/** A new folder in `parent`, named `name` or with a number if a folder there has it. */
export function createFolder(lib: Library, parent: string, name = 'New folder'): Library & { path: string } {
  const siblings = new Set(allFolders(lib.diagrams, lib.folders).filter((p) => parentFolder(p) === parent).map(folderName));
  const path = join(parent, freeName(siblings, cleanName(name) || 'New folder'));
  return { diagrams: lib.diagrams, folders: allFolders(lib.diagrams, [...lib.folders, path]), path };
}

/** Moves a folder and all it holds to `to` (a free path), keeping the diagrams' other fields. */
function relocate(lib: Library, from: string, to: string): Library {
  const moved = (p: string): string => (isInside(p, from) ? to + p.slice(from.length) : p);
  return {
    diagrams: lib.diagrams.map((d) => (d.folder && isInside(d.folder, from) ? { ...d, folder: moved(d.folder) } : d)),
    folders: allFolders([], allFolders(lib.diagrams, lib.folders).map(moved)),
  };
}

/** Renames a folder; its folders and diagrams follow. A name taken by a sibling folder gets a number. */
export function renameFolder(lib: Library, path: string, name: string): Library & { path: string } {
  const clean = cleanName(name);
  if (!clean || clean === folderName(path)) return { ...lib, path };
  const parent = parentFolder(path);
  const siblings = new Set(allFolders(lib.diagrams, lib.folders).filter((p) => p !== path && parentFolder(p) === parent).map(folderName));
  const to = join(parent, freeName(siblings, clean));
  return { ...relocate(lib, path, to), path: to };
}

/** Moves a folder into another one ('' : the top level). Null when that is the folder itself or inside it. */
export function moveFolder(lib: Library, path: string, into: string): (Library & { path: string }) | null {
  if (isInside(into, path)) return null;
  if (parentFolder(path) === into) return { ...lib, path };
  const siblings = new Set(allFolders(lib.diagrams, lib.folders).filter((p) => parentFolder(p) === into).map(folderName));
  const to = join(into, freeName(siblings, folderName(path)));
  return { ...relocate(lib, path, to), path: to };
}

/** Deletes a folder with everything in it. */
export function deleteFolder(lib: Library, path: string): Library {
  return {
    diagrams: lib.diagrams.filter((d) => !isInside(folderOf(d), path)),
    folders: allFolders([], allFolders(lib.diagrams, lib.folders).filter((p) => !isInside(p, path))),
  };
}

/** Moves a diagram into a folder; a name taken there gets a number. Its change time stays. */
export function moveDiagram(list: SavedDiagram[], id: string, folder: string): SavedDiagram[] {
  return list.map((d) => {
    if (d.id !== id || folderOf(d) === folder) return d;
    const { folder: _old, ...rest } = d;
    const name = uniqueName(list, d.name, id, folder);
    return folder ? { ...rest, name, folder } : { ...rest, name };
  });
}
