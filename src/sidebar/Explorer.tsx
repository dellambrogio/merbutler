/**
 * The Explorer: the diagrams saved in local storage as a tree of folders and files. Open, create,
 * rename, duplicate, move (drag onto a folder, or onto the empty part of the tree for the top level)
 * and delete diagrams and folders; add a `.mmd` file from disk, and download a diagram as one. The open diagram saves itself as it changes (App.tsx); the tree
 * only shows them and asks for the changes.
 */
import { useRef, useState, type ChangeEvent, type DragEvent, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import { allFolders, diagramKind, folderName, folderOf, isInside, parentFolder, type SavedDiagram } from '../core/library';

interface ExplorerProps {
  diagrams: SavedDiagram[];
  folders: string[];
  /** The diagram in the editor, or null when it is not saved. */
  openId: string | null;
  /** True when the editor holds unsaved work that opening another diagram would replace. */
  unsavedWork: boolean;
  onSaveCurrent: () => void;
  /** A new diagram in the folder ('' : the top level), opened. */
  onNew: (folder: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, folder: string) => void;
  /** Saves a file's code as a new diagram at the top level; returns its id (null: not saved). */
  onImport: (fileName: string, code: string) => string | null;
  /** A new folder in `parent`; returns its path. */
  onNewFolder: (parent: string) => string;
  onRenameFolder: (path: string, name: string) => void;
  onMoveFolder: (path: string, into: string) => void;
  onDeleteFolder: (path: string) => void;
}

const when = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** "2 minutes ago", "yesterday", or a date after a week. */
export function changedText(updated: number, now = Date.now()): string {
  const seconds = Math.round((updated - now) / 1000);
  if (seconds > -45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) return when.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return when.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days > -7) return when.format(days, 'day');
  return date.format(updated);
}

/** Folders the user closed, kept in this browser. Folders are open by default. */
const CLOSED_KEY = 'merbutler:closedFolders';

function loadClosed(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function storeClosed(closed: Set<string>): void {
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed]));
  } catch {
    // A convenience only.
  }
}

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** The drag data of a tree row. */
const DRAG_TYPE = 'application/x-merbutler-explorer';
type Item = { kind: 'file'; id: string } | { kind: 'folder'; path: string };
const sameItem = (a: Item | null, b: Item): boolean =>
  a !== null && a.kind === b.kind && (a.kind === 'file' ? a.id === (b as { id: string }).id : a.path === (b as { path: string }).path);

/** 16×16 line icons in the current color. */
function Icon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg className="explorer-icon" viewBox="0 0 16 16" aria-hidden="true">
      {children}
    </svg>
  );
}
const ICONS = {
  folder: (
    <Icon>
      <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
    </Icon>
  ),
  folderOpen: (
    <Icon>
      <path d="M1.5 12.5v-8a1 1 0 0 1 1-1h3.6l1.4 1.5h5a1 1 0 0 1 1 1V7" />
      <path d="M1.5 12.5 3.3 7.6a1 1 0 0 1 .9-.6h10.3l-2 5.5z" />
    </Icon>
  ),
  file: (
    <Icon>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3" />
      <rect x="5.5" y="7" width="2.5" height="2" rx=".4" />
      <rect x="5.5" y="11" width="2.5" height="2" rx=".4" />
      <path d="M8 8h1.5v4H8" />
    </Icon>
  ),
  newFile: (
    <Icon>
      <path d="M8.5 14.5h-5v-13h6l3 3V8" />
      <path d="M9.5 1.5v3h3M12.5 10.5v4M10.5 12.5h4" />
    </Icon>
  ),
  newFolder: (
    <Icon>
      <path d="M8 13.5H2.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1V9" />
      <path d="M12.5 10.5v4M10.5 12.5h4" />
    </Icon>
  ),
  rename: (
    <Icon>
      <path d="M10.5 2.5l3 3-8 8h-3v-3z" />
    </Icon>
  ),
  copy: (
    <Icon>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M10.5 5.5v-3h-8v8h3" />
    </Icon>
  ),
  trash: (
    <Icon>
      <path d="M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.7 9h6.6l.7-9" />
    </Icon>
  ),
  openFile: (
    <Icon>
      <path d="M1.5 12.5v-8a1 1 0 0 1 1-1h3.6l1.4 1.5h5a1 1 0 0 1 1 1V7" />
      <path d="M1.5 12.5 3.3 7.6a1 1 0 0 1 .9-.6h10.3l-2 5.5z" />
      <path d="M10 1.5v4M8.3 3.2 10 1.5l1.7 1.7" />
    </Icon>
  ),
  download: (
    <Icon>
      <path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11" />
    </Icon>
  ),
  collapse: (
    <Icon>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 8h5" />
    </Icon>
  ),
};

function ActionButton({ icon, label, onClick, danger = false }: { icon: JSX.Element; label: string; onClick: () => void; danger?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      className={`explorer-action${danger ? ' danger' : ''}`}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </button>
  );
}

/** Text field that renames a row: Enter or leaving it keeps the name, Escape cancels. */
function RenameField({ value, onDone }: { value: string; onDone: (name: string | null) => void }): JSX.Element {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="explorer-rename"
      value={draft}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      aria-label="New name"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft.trim() ? draft : null)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') onDone(null);
      }}
    />
  );
}

export function Explorer(props: ExplorerProps): JSX.Element {
  const { diagrams, folders, openId, unsavedWork, onSaveCurrent, onOpen } = props;
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  /** A diagram to open once the user decides about the unsaved one. */
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [closed, setClosed] = useState(loadClosed);
  const [dragging, setDragging] = useState<Item | null>(null);
  /** The folder a drop would move into ('' : the top level). */
  const [dropInto, setDropInto] = useState<string | null>(null);

  const setFolderOpen = (path: string, open: boolean): void => {
    setClosed((was) => {
      if (was.has(path) !== open) return was;
      const next = new Set(was);
      if (open) next.delete(path);
      else next.add(path);
      storeClosed(next);
      return next;
    });
  };

  const words = filter.trim().toLowerCase();
  const matches = (d: SavedDiagram): boolean => !words || d.name.toLowerCase().includes(words) || d.code.toLowerCase().includes(words);
  const shownFiles = diagrams.filter(matches);
  const everyFolder = allFolders(diagrams, folders);
  // While searching: the folders that hold a match, or whose name matches, all open.
  const shownFolders = words
    ? everyFolder.filter((p) => folderName(p).toLowerCase().includes(words) || shownFiles.some((d) => isInside(folderOf(d), p)))
    : everyFolder;
  const isOpen = (path: string): boolean => (words ? true : !closed.has(path));

  const requestOpen = (id: string): void => {
    if (id === openId) return;
    if (unsavedWork) return setPendingOpen(id);
    onOpen(id);
  };
  const newFolder = (parent: string): void => {
    if (parent) setFolderOpen(parent, true);
    setRenaming({ kind: 'folder', path: props.onNewFolder(parent) });
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const openFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const id = props.onImport(file.name, await file.text());
    if (id) requestOpen(id);
  };
  /** Downloads a diagram's code as `<name>.mmd`. */
  const download = (d: SavedDiagram): void => {
    const url = URL.createObjectURL(new Blob([d.code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d.name}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const newDiagram = (folder: string): void => {
    if (folder) setFolderOpen(folder, true);
    props.onNew(folder);
  };

  // ---- Drag and drop: a row onto a folder, or onto the empty part of the tree ----
  const canDropInto = (into: string): boolean => {
    if (!dragging) return false;
    if (dragging.kind === 'file') return folderOf(diagrams.find((d) => d.id === dragging.id) ?? ({} as SavedDiagram)) !== into;
    return !isInside(into, dragging.path) && parentFolder(dragging.path) !== into;
  };
  const dragProps = (item: Item) => ({
    draggable: renaming === null,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'move';
      setDragging(item);
    },
    onDragEnd: () => {
      setDragging(null);
      setDropInto(null);
    },
  });
  const dropProps = (into: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.stopPropagation();
      if (!canDropInto(into)) {
        setDropInto(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropInto(into);
    },
    onDrop: (e: DragEvent) => {
      if (!dragging || !canDropInto(into)) return;
      e.preventDefault();
      e.stopPropagation();
      if (dragging.kind === 'file') props.onMove(dragging.id, into);
      else props.onMoveFolder(dragging.path, into);
      if (into) setFolderOpen(into, true);
      setDragging(null);
      setDropInto(null);
    },
  });

  /** F2 renames the row; Delete asks to delete it. */
  const rowKeys = (item: Item) => (e: KeyboardEvent) => {
    if (e.key === 'F2') {
      e.preventDefault();
      setDeleting(null);
      setRenaming(item);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      setRenaming(null);
      setDeleting(item);
    }
  };

  const confirmRow = (item: Item, text: string, onYes: () => void, depth: number): JSX.Element => (
    <li className="explorer-confirm" role="alert" style={{ paddingLeft: 8 + depth * 14 }} key={`confirm-${item.kind === 'file' ? item.id : item.path}`}>
      <span>{text}</span>
      <button
        className="danger"
        autoFocus
        onClick={() => {
          setDeleting(null);
          onYes();
        }}
      >
        Delete
      </button>
      <button onClick={() => setDeleting(null)}>Keep</button>
    </li>
  );

  const fileRow = (d: SavedDiagram, depth: number): JSX.Element[] => {
    const item: Item = { kind: 'file', id: d.id };
    const current = d.id === openId;
    const kind = diagramKind(d.code);
    const rows = [
      <li
        key={d.id}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={current}
        tabIndex={0}
        className={`explorer-row file${current ? ' current' : ''}${sameItem(dragging, item) ? ' dragged' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 + 14 }}
        title={`${d.name}${kind ? ` · ${kind}` : ''} · changed ${changedText(d.updated)}${current ? ' · open' : ''}`}
        onClick={() => requestOpen(d.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) requestOpen(d.id);
          else rowKeys(item)(e);
        }}
        {...dragProps(item)}
        {...dropProps(folderOf(d))}
      >
        {ICONS.file}
        {sameItem(renaming, item) ? (
          <RenameField
            value={d.name}
            onDone={(name) => {
              setRenaming(null);
              if (name !== null) props.onRename(d.id, name);
            }}
          />
        ) : (
          <>
            <span className="explorer-name">{d.name}</span>
            <span className="explorer-meta">{changedText(d.updated)}</span>
            <span className="explorer-actions">
              <ActionButton icon={ICONS.rename} label="Rename (F2)" onClick={() => setRenaming(item)} />
              <ActionButton icon={ICONS.copy} label="Duplicate" onClick={() => props.onDuplicate(d.id)} />
              <ActionButton icon={ICONS.download} label={`Download as ${d.name}.mmd`} onClick={() => download(d)} />
              <ActionButton icon={ICONS.trash} label="Delete (Del)" danger onClick={() => setDeleting(item)} />
            </span>
          </>
        )}
      </li>,
    ];
    if (sameItem(deleting, item)) rows.push(confirmRow(item, `Delete ${d.name}?`, () => props.onDelete(d.id), depth));
    return rows;
  };

  const folderRows = (path: string, depth: number): JSX.Element[] => {
    const item: Item = { kind: 'folder', path };
    const open = isOpen(path);
    const inside = diagrams.filter((d) => isInside(folderOf(d), path)).length;
    const rows: JSX.Element[] = [
      <li
        key={`folder:${path}`}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={open}
        tabIndex={0}
        className={`explorer-row folder${dropInto === path ? ' drop' : ''}${sameItem(dragging, item) ? ' dragged' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setFolderOpen(path, !open)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || (e.key === 'ArrowRight' && !open) || (e.key === 'ArrowLeft' && open)) {
            e.preventDefault();
            setFolderOpen(path, !open);
          } else rowKeys(item)(e);
        }}
        {...dragProps(item)}
        {...dropProps(path)}
      >
        <span className="explorer-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {open ? ICONS.folderOpen : ICONS.folder}
        {sameItem(renaming, item) ? (
          <RenameField
            value={folderName(path)}
            onDone={(name) => {
              setRenaming(null);
              if (name !== null) props.onRenameFolder(path, name);
            }}
          />
        ) : (
          <>
            <span className="explorer-name">{folderName(path)}</span>
            <span className="explorer-meta">{inside === 0 ? '' : inside}</span>
            <span className="explorer-actions">
              <ActionButton icon={ICONS.newFile} label="New diagram in this folder" onClick={() => newDiagram(path)} />
              <ActionButton icon={ICONS.newFolder} label="New folder in this folder" onClick={() => newFolder(path)} />
              <ActionButton icon={ICONS.rename} label="Rename (F2)" onClick={() => setRenaming(item)} />
              <ActionButton icon={ICONS.trash} label="Delete (Del)" danger onClick={() => setDeleting(item)} />
            </span>
          </>
        )}
      </li>,
    ];
    if (sameItem(deleting, item)) {
      const what = inside === 0 ? `Delete the folder ${folderName(path)}?` : `Delete ${folderName(path)} and the ${inside} diagram${inside === 1 ? '' : 's'} in it?`;
      rows.push(confirmRow(item, what, () => props.onDeleteFolder(path), depth));
    }
    if (open) rows.push(...children(path, depth + 1));
    return rows;
  };

  /** The rows inside a folder: its folders, then its diagrams, by name. */
  const children = (folder: string, depth: number): JSX.Element[] => [
    ...shownFolders
      .filter((p) => parentFolder(p) === folder)
      .sort((a, b) => byName(folderName(a), folderName(b)))
      .flatMap((p) => folderRows(p, depth)),
    ...shownFiles
      .filter((d) => folderOf(d) === folder)
      .sort((a, b) => byName(a.name, b.name))
      .flatMap((d) => fileRow(d, depth)),
  ];

  const empty = diagrams.length === 0 && everyFolder.length === 0;
  return (
    <div className="explorer" aria-label="Diagrams saved in local storage">
      <div className="explorer-toolbar">
        <input className="explorer-search" type="search" placeholder="Find by name or content" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a diagram" />
        <ActionButton icon={ICONS.newFile} label="New diagram" onClick={() => newDiagram('')} />
        <ActionButton icon={ICONS.newFolder} label="New folder" onClick={() => newFolder('')} />
        <ActionButton icon={ICONS.openFile} label="Open a .mmd file from disk (saved here as a new diagram)" onClick={() => fileInput.current?.click()} />
        <input ref={fileInput} type="file" accept=".mmd,.md,.txt" hidden onChange={(e) => void openFile(e)} />
        <ActionButton
          icon={ICONS.collapse}
          label="Close all folders"
          onClick={() => {
            const all = new Set(everyFolder);
            storeClosed(all);
            setClosed(all);
          }}
        />
      </div>
      {openId === null && (
        <div className="explorer-note">
          <span>The open diagram is not saved.</span>
          <button onClick={onSaveCurrent} title="Save it in local storage (Ctrl+S)">
            Save
          </button>
        </div>
      )}
      {pendingOpen && (
        <div className="explorer-note" role="alert">
          <span>Opening another diagram replaces the unsaved one.</span>
          <button
            onClick={() => {
              onSaveCurrent();
              onOpen(pendingOpen);
              setPendingOpen(null);
            }}
          >
            Save, then open
          </button>
          <button
            className="danger"
            onClick={() => {
              onOpen(pendingOpen);
              setPendingOpen(null);
            }}
          >
            Open without saving
          </button>
          <button onClick={() => setPendingOpen(null)}>Cancel</button>
        </div>
      )}
      <ul className={`explorer-tree${dropInto === '' ? ' drop' : ''}`} role="tree" aria-label="Saved diagrams" {...dropProps('')}>
        {children('', 0)}
        {!empty && words && shownFiles.length === 0 && shownFolders.length === 0 && <li className="muted explorer-empty">No diagram matches.</li>}
        {empty && <li className="muted explorer-empty">No diagrams yet. Save the open one, or start a new one.</li>}
      </ul>
    </div>
  );
}
