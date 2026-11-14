/**
 * The diagrams saved in this browser, in a drawer over the code: create, open, rename, duplicate
 * and delete. The open diagram saves itself as it changes (App.tsx); this drawer only lists them
 * and asks for the changes.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { diagramKind, type SavedDiagram } from '../core/library';

interface DiagramLibraryProps {
  open: boolean;
  diagrams: SavedDiagram[];
  /** The diagram in the editor, or null when it is not saved. */
  openId: string | null;
  /** True when the editor holds unsaved work that opening another diagram would replace. */
  unsavedWork: boolean;
  onNew: () => void;
  onSaveCurrent: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
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

export function DiagramLibrary({ open, diagrams, openId, unsavedWork, onNew, onSaveCurrent, onOpen, onRename, onDuplicate, onDelete, onClose }: DiagramLibraryProps): JSX.Element {
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  /** A diagram to open once the user decides about the unsaved one. */
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setRenaming(null);
      setDeleting(null);
      setPendingOpen(null);
      return;
    }
    search.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const words = filter.trim().toLowerCase();
  const shown = words ? diagrams.filter((d) => d.name.toLowerCase().includes(words) || d.code.toLowerCase().includes(words)) : diagrams;

  const startRename = (d: SavedDiagram): void => {
    setDeleting(null);
    setRenaming(d.id);
    setDraft(d.name);
  };
  const finishRename = (): void => {
    if (renaming && draft.trim()) onRename(renaming, draft);
    setRenaming(null);
  };
  const requestOpen = (id: string): void => {
    if (id === openId) return onClose();
    if (unsavedWork) return setPendingOpen(id);
    onOpen(id);
  };

  return (
    <aside className={`library${open ? ' open' : ''}`} role="dialog" aria-label="Diagrams saved in this browser" aria-hidden={!open} inert={!open}>
      <div className="library-head">
        <strong>Diagrams</strong>
        <span className="muted">{diagrams.length === 0 ? 'none saved' : diagrams.length}</span>
        <span className="spacer" />
        <button onClick={onNew} title="Start a new diagram and save it here">
          + New
        </button>
        <button onClick={onClose} title="Close (Esc)" aria-label="Close">
          ✕
        </button>
      </div>
      <p className="muted library-hint">Saved in this browser only. The open diagram saves itself as you edit.</p>
      {openId === null && (
        <div className="library-unsaved">
          <span>The open diagram is not saved.</span>
          <button onClick={onSaveCurrent} title="Save it here (Ctrl+S)">
            Save it
          </button>
        </div>
      )}
      {pendingOpen && (
        <div className="library-unsaved" role="alert">
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
      {diagrams.length > 0 && <input ref={search} className="library-search" type="search" placeholder="Find by name or content" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a diagram" />}
      <ul className="library-list">
        {shown.map((d) => {
          const kind = diagramKind(d.code);
          const current = d.id === openId;
          return (
            <li key={d.id} className={`library-item${current ? ' current' : ''}`}>
              {renaming === d.id ? (
                <input
                  className="library-rename"
                  value={draft}
                  autoFocus
                  aria-label="New name"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishRename();
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <button className="library-open" onClick={() => requestOpen(d.id)} title={current ? 'Open now' : 'Open'}>
                  <span className="library-name">{d.name}</span>
                  <span className="muted library-meta">
                    {current ? 'Open · ' : ''}
                    {kind ? `${kind} · ` : ''}
                    {changedText(d.updated)}
                  </span>
                </button>
              )}
              {deleting === d.id ? (
                <span className="library-actions">
                  <button className="danger" onClick={() => onDelete(d.id)}>
                    Delete
                  </button>
                  <button onClick={() => setDeleting(null)}>Keep</button>
                </span>
              ) : (
                <span className="library-actions">
                  <button className="link-button" onClick={() => startRename(d)} title="Rename">
                    Rename
                  </button>
                  <button className="link-button" onClick={() => onDuplicate(d.id)} title="Save a copy">
                    Copy
                  </button>
                  <button
                    className="link-button danger"
                    onClick={() => {
                      setRenaming(null);
                      setDeleting(d.id);
                    }}
                    title="Delete from this browser"
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          );
        })}
        {diagrams.length > 0 && shown.length === 0 && <li className="muted library-empty">No diagram matches.</li>}
        {diagrams.length === 0 && <li className="muted library-empty">No diagrams yet. Save the open one, or start a new one.</li>}
      </ul>
    </aside>
  );
}
