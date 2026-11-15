/**
 * The diagrams saved in local storage, shown in the Save & open panel: create, open, rename,
 * duplicate and delete. The open diagram saves itself as it changes (App.tsx); this list only shows
 * them and asks for the changes.
 */
import { useState, type JSX } from 'react';
import { diagramKind, type SavedDiagram } from '../core/library';

interface DiagramLibraryProps {
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

export function DiagramLibrary({ diagrams, openId, unsavedWork, onNew, onSaveCurrent, onOpen, onRename, onDuplicate, onDelete }: DiagramLibraryProps): JSX.Element {
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  /** A diagram to open once the user decides about the unsaved one. */
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);

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
    if (id === openId) return;
    if (unsavedWork) return setPendingOpen(id);
    onOpen(id);
  };

  return (
    <div className="library" aria-label="Diagrams saved in local storage">
      <div className="library-head">
        <span className="io-label">Local storage</span>
        <span className="muted">{diagrams.length === 0 ? 'none saved' : `${diagrams.length} saved`}</span>
        <span className="spacer" />
        <button onClick={onNew} title="Start a new diagram and save it in local storage">
          + New
        </button>
      </div>
      {openId === null && (
        <div className="library-unsaved">
          <span>The open diagram is not saved.</span>
          <button onClick={onSaveCurrent} title="Save it in local storage (Ctrl+S)">
            Save
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
      {diagrams.length > 0 && <input className="library-search" type="search" placeholder="Find by name or content" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a diagram" />}
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
                    title="Delete from local storage"
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
    </div>
  );
}
