import { useEffect, useState, type JSX, type ReactNode } from 'react';

/** 16×16 line icons in the current color. */
function Icon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg className="code-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      {children}
    </svg>
  );
}
const PASTE = (
  <Icon>
    <path d="M5.5 2.5h-2v12h9v-12h-2" />
    <rect x="5.5" y="1.5" width="5" height="2.5" rx=".6" />
    <path d="M8 6.5v5M6 9.5l2 2 2-2" />
  </Icon>
);
const COPY = (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 5.5v-3h-8v8h3" />
  </Icon>
);
const UNDO = (
  <Icon>
    <path d="M6 9.5 2.5 6 6 2.5" />
    <path d="M2.5 6h7a4 4 0 0 1 0 8H7.5" />
  </Icon>
);
const REDO = (
  <Icon>
    <path d="m10 9.5 3.5-3.5L10 2.5" />
    <path d="M13.5 6h-7a4 4 0 0 0 0 8h2" />
  </Icon>
);
/** A small check in a circle: the open diagram is saved. */
const SAVED = (
  <svg className="code-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M5.6 8.2 7.2 9.8 10.4 6.4" />
  </svg>
);
const DONE = (
  <Icon>
    <path d="M3 8.5l3 3 7-7" />
  </Icon>
);

/**
 * The strip under the Code header: the open diagram's name and whether it is saved (a check, or a dot) on the left; on the right undo and redo (the app's one history, for the code
 * and the canvas), Paste and Copy, and the text size (a double click on it gives back the default).
 */
export function CodeToolbar({ name, folder, onUndo, onRedo, canUndo, canRedo, onPaste, onCopy, fontSize, canShrink, canGrow, onFont }: {
  /** The open saved diagram, or null for unsaved code. */
  name: string | null;
  folder: string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onPaste: () => void;
  onCopy: () => Promise<void>;
  fontSize: number;
  canShrink: boolean;
  canGrow: boolean;
  /** -1 smaller, 1 larger, 0 default. */
  onFont: (step: 1 | -1 | 0) => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (): void => {
    void onCopy().then(() => setCopied(true), () => undefined);
  };

  return (
    <div className="code-toolbar" role="toolbar" aria-label="Code">
      {name !== null ? (
        <>
          <span className="code-toolbar-name" title={`Saved in local storage${folder ? `, in ${folder}` : ''}`}>
            {name}
          </span>
          <span className="code-toolbar-saved" role="img" aria-label="Saved" title="Saved in this browser as you edit">
            {SAVED}
          </span>
        </>
      ) : (
        <>
          <span className="code-toolbar-name unsaved" title="Not saved: see Explorer">
            Unsaved diagram
          </span>
          <span className="code-toolbar-unsaved" role="img" aria-label="Not saved" title="Not saved: see Explorer" />
        </>
      )}
      <span className="spacer" />
      <button type="button" className="code-toolbar-button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        {UNDO}
      </button>
      <button type="button" className="code-toolbar-button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z or Ctrl+Y)" aria-label="Redo">
        {REDO}
      </button>
      <span className="code-toolbar-sep" aria-hidden="true" />
      <button type="button" className="code-toolbar-button" onClick={onPaste} title="Replace the code with the clipboard (Ctrl+V on the canvas)" aria-label="Paste">
        {PASTE}
      </button>
      <button type="button" className={`code-toolbar-button${copied ? ' done' : ''}`} onClick={copy} title={copied ? 'Copied' : 'Copy the code to the clipboard'} aria-label="Copy">
        {copied ? DONE : COPY}
      </button>
      <span className="code-toolbar-sep" aria-hidden="true" />
      <div className="code-font" role="group" aria-label="Text size">
        <button type="button" className="code-toolbar-button" onClick={() => onFont(-1)} disabled={!canShrink} title="Smaller text (Ctrl+Alt+−)" aria-label="Smaller text">
          −
        </button>
        <span className="code-font-size" onDoubleClick={() => onFont(0)} title="Text size; double-click for the default (Ctrl+Alt+0)">
          {fontSize}
        </span>
        <button type="button" className="code-toolbar-button" onClick={() => onFont(1)} disabled={!canGrow} title="Larger text (Ctrl+Alt+=)" aria-label="Larger text">
          +
        </button>
      </div>
    </div>
  );
}
