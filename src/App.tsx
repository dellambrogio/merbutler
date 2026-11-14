import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './canvas/Canvas';
import { Splitter } from './Splitter';
import { extractMermaid } from './core/clipboard';
import { CodeEditor } from './editor/CodeEditor';
import { Gallery, loadView } from './gallery/Gallery';
import { GALLERY_TYPES } from './gallery/gallery';
import { NO_PANELS, readHash, writeHash, type PanelLayout, type UrlState } from './core/urlState';
import { Preview } from './preview/Preview';
import { hasStructuredEditor, StructuredEditor, structuredKind } from './structured/StructuredEditor';
import type { DiagramType } from './core/diagramTypes';
import type { FlowModel } from './core/model';
import { parse } from './core/parse';
import { serialize } from './core/serialize';
import {
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  loadDiagrams,
  loadOpenId,
  storeDiagrams,
  storeOpenId,
  suggestName,
  updateDiagram,
  type SavedDiagram,
} from './core/library';
import { DiagramLibrary } from './library/DiagramLibrary';

const STORAGE_KEY = 'merbutler:code';
/** The key used before the app was renamed. Read once so saved code is not lost. */
const OLD_STORAGE_KEY = 'dutler:code';
const PARSE_DELAY_MS = 300;
/** The open diagram is saved this long after the last change. */
const AUTOSAVE_MS = 400;
/** Code for a new diagram. */
const NEW_DIAGRAM = `flowchart TB
  A[Start] --> B[End]
`;

const SAMPLE = `flowchart LR
  A[Start] --> B{Is it working?}
  B -->|yes| C([Ship it])
  B -.->|no| D(Debug)
  D ==> B
`;

function loadCode(): string {
  // The open saved diagram, else the last code of this browser.
  const openId = loadOpenId();
  const saved = openId ? loadDiagrams().find((d) => d.id === openId) : undefined;
  if (saved) return saved.code;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(OLD_STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

const FONT_KEY = 'merbutler:editorFontSize';
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24];
const DEFAULT_FONT_SIZE = 13;

function loadFontSize(): number {
  try {
    const size = Number(localStorage.getItem(FONT_KEY));
    return FONT_SIZES.includes(size) ? size : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

/** The next size in FONT_SIZES, up or down. */
function stepFontSize(size: number, step: 1 | -1): number {
  const i = FONT_SIZES.indexOf(size);
  return FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? FONT_SIZES.indexOf(DEFAULT_FONT_SIZE) : i) + step))];
}

function saveCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Storage is a convenience only.
  }
}

export function App(): JSX.Element {
  const [code, setCode] = useState<string>(loadCode);
  const [model, setModel] = useState<FlowModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A diagram type the canvas does not edit: the code Mermaid last accepted, drawn by Mermaid. */
  const [preview, setPreview] = useState<{ code: string; type: DiagramType; reason?: string } | null>(null);
  const [fileName, setFileName] = useState('diagram.mmd');
  const [notice, setNotice] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // ---- Diagrams saved in this browser (core/library.ts) ----
  const [diagrams, setDiagrams] = useState<SavedDiagram[]>(loadDiagrams);
  /** The ref follows every change at once, so two changes in one event see each other. */
  const diagramsRef = useRef(diagrams);
  /** The saved diagram in the editor; null: the code is not saved. */
  const [openId, setOpenIdState] = useState<string | null>(() => {
    const id = loadOpenId();
    return id && diagramsRef.current.some((d) => d.id === id) ? id : null;
  });
  const openIdRef = useRef(openId);
  /** Stores a new list. Says so when the browser refuses (storage full or blocked). */
  const commitDiagrams = useCallback((list: SavedDiagram[]): boolean => {
    diagramsRef.current = list;
    setDiagrams(list);
    const ok = storeDiagrams(list);
    if (!ok) setNotice('This browser did not save the diagram: its storage is full or blocked.');
    return ok;
  }, []);
  /** Saves the open diagram now, without waiting for the autosave delay. */
  const flushOpen = useCallback((): void => {
    const id = openIdRef.current;
    const saved = id ? diagramsRef.current.find((d) => d.id === id) : undefined;
    if (id && saved && saved.code !== codeRef.current) commitDiagrams(updateDiagram(diagramsRef.current, id, { code: codeRef.current }));
  }, [commitDiagrams]);
  /** Changes the open diagram. The one that was open keeps its last edit. */
  const setOpenId = useCallback(
    (id: string | null): void => {
      flushOpen();
      openIdRef.current = id;
      setOpenIdState(id);
      storeOpenId(id);
    },
    [flushOpen],
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const closeLibrary = useCallback(() => setLibraryOpen(false), []);
  // Leaving the page saves the last edit too.
  useEffect(() => {
    window.addEventListener('pagehide', flushOpen);
    return () => window.removeEventListener('pagehide', flushOpen);
  }, [flushOpen]);
  // Another tab changed the list.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== null && e.key !== 'merbutler:diagrams') return;
      const list = loadDiagrams();
      diagramsRef.current = list;
      setDiagrams(list);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const closeGallery = useCallback(() => setGalleryOpen(false), []);
  /** The gallery's type page (null: the overview). */
  const [galleryView, setGalleryView] = useState<string | null>(loadView);
  const [fontSize, setFontSize] = useState(loadFontSize);
  /** The canvas panels: which are open, where they were dragged. Kept in the URL. */
  const [panels, setPanels] = useState<PanelLayout>(NO_PANELS);
  /** Widths in percent of the code editor and of an outline or table editor (null: default). Kept in the URL. */
  const [split, setSplit] = useState<number | null>(null);
  const [editorSplit, setEditorSplit] = useState<number | null>(null);
  const changeFont = useCallback((step: 1 | -1 | 0): void => {
    setFontSize((size) => {
      const next = step === 0 ? DEFAULT_FONT_SIZE : stepFontSize(size, step);
      try {
        localStorage.setItem(FONT_KEY, String(next));
      } catch {
        // Storage is a convenience only.
      }
      return next;
    });
  }, []);
  /** Ids and classes of the last parsed diagram, for autocompletion. */
  const completionData = useMemo(
    () => ({
      ids: model ? [...model.nodes.map((n) => n.id), ...model.subgraphs.map((s) => s.id)] : [],
      classes: (model?.classDefs ?? []).map((c) => c.name).filter((c) => c !== 'default'),
    }),
    [model],
  );

  // Ctrl+Alt+= / Ctrl+Alt+- / Ctrl+Alt+0: code font size (Ctrl+= alone is the browser's zoom).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey) return;
      const step = e.code === 'Equal' || e.code === 'NumpadAdd' ? 1 : e.code === 'Minus' || e.code === 'NumpadSubtract' ? -1 : e.code === 'Digit0' ? 0 : null;
      if (step === null) return;
      e.preventDefault();
      changeFont(step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeFont]);
  const parseSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const runParse = useCallback(async (text: string): Promise<void> => {
    const seq = ++parseSeq.current;
    const result = await parse(text);
    if (seq !== parseSeq.current) return; // A newer parse or a canvas edit came first.
    if (result.ok) {
      setModel(result.model);
      setPreview(null);
      setError(null);
    } else if (result.preview) {
      // A type the canvas edits, with something it cannot keep: say what.
      setPreview({ code: text, type: result.preview, ...(result.preview.support === 'canvas' ? { reason: result.error } : {}) });
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  /** Code -> canvas: parse after the user stops typing. */
  const onCodeChange = useCallback(
    (text: string): void => {
      setCode(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void runParse(text), PARSE_DELAY_MS);
    },
    [runParse],
  );

  /** Canvas -> code: the model is the source of truth, so regenerate the text. */
  const onModelChange = useCallback((next: FlowModel): void => {
    clearTimeout(timer.current);
    parseSeq.current++; // Drop any parse that is still running.
    setModel(next);
    setPreview(null);
    setError(null);
    setCode(serialize(next));
  }, []);

  /** A structured editor (outline, table) changed the diagram: the code follows at once. */
  const onStructuredChange = useCallback(
    (next: string): void => {
      clearTimeout(timer.current);
      setCode(next);
      void runParse(next);
    },
    [runParse],
  );

  /** Replaces the whole code with pasted text. Markdown code fences are removed. */
  const replaceFromPaste = useCallback(
    (text: string): void => {
      const { code: next } = extractMermaid(text);
      if (next.trim() === '') return;
      clearTimeout(timer.current);
      // New code from outside: a new, unsaved diagram, so a saved one is not overwritten.
      setOpenId(null);
      setCode(next);
      setNotice(null);
      void runParse(next);
    },
    [runParse, setOpenId],
  );

  const onPasteButton = async (): Promise<void> => {
    try {
      replaceFromPaste(await navigator.clipboard.readText());
    } catch {
      setNotice('The browser blocked clipboard access. Click the canvas and press Ctrl+V.');
    }
  };

  /** Ctrl+V outside a text field (for example on the canvas) replaces the diagram. */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) {
        return;
      }
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      replaceFromPaste(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [replaceFromPaste]);

  // ---- State in the URL after `#` (urlState.ts): code and gallery view ----
  /** The hash this app wrote last, so its own updates are not read back as a new link. */
  const writtenHash = useRef<string | null>(null);
  /** False until the URL has been read: no hash is written before, so an opened link is not overwritten. */
  const [urlRead, setUrlRead] = useState(false);
  const codeRef = useRef(code);
  codeRef.current = code;

  /** Applies a state from the URL. Returns true if it brought code. */
  const applyUrl = useCallback(
    (state: UrlState): boolean => {
      setGalleryOpen(state.gallery !== null);
      setPanels(state.panels ?? NO_PANELS);
      setSplit(state.split ?? null);
      setEditorSplit(state.editorSplit ?? null);
      if (state.gallery !== null) setGalleryView(GALLERY_TYPES.some((t) => t.id === state.gallery) ? state.gallery : null);
      if (state.code === undefined || state.code === codeRef.current) return false;
      clearTimeout(timer.current);
      // A link with other code: a new, unsaved diagram.
      setOpenId(null);
      setCode(state.code);
      void runParse(state.code);
      return true;
    },
    [runParse, setOpenId],
  );

  // On start: the URL's state wins over the code saved in this browser.
  useEffect(() => {
    void (async () => {
      const brought = applyUrl(await readHash(window.location.hash));
      if (!brought) void runParse(codeRef.current);
      setUrlRead(true);
    })();
    // Once, on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A link pasted into the address bar, or Back/Forward to another hash.
  useEffect(() => {
    const onHash = (): void => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash === writtenHash.current) return;
      void readHash(hash).then(applyUrl);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [applyUrl]);

  // Keep the URL up to date, shortly after changes. It replaces the history entry: typing does not fill Back.
  useEffect(() => {
    if (!urlRead) return;
    let alive = true;
    const t = setTimeout(() => {
      void writeHash({ code, gallery: galleryOpen ? (galleryView ?? '') : null, panels, split: split ?? undefined, editorSplit: editorSplit ?? undefined }).then((hash) => {
        if (!alive || hash === window.location.hash.replace(/^#/, '')) return;
        writtenHash.current = hash;
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${hash}`);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code, galleryOpen, galleryView, panels, split, editorSplit, urlRead]);

  useEffect(() => saveCode(code), [code]);

  // The open saved diagram follows the code, shortly after each change.
  useEffect(() => {
    if (openId === null) return;
    const t = setTimeout(() => {
      const saved = diagramsRef.current.find((d) => d.id === openId);
      if (!saved) return setOpenId(null); // Deleted in another tab: the code stays, unsaved.
      if (saved.code !== code) commitDiagrams(updateDiagram(diagramsRef.current, openId, { code }));
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [code, openId, commitDiagrams, setOpenId]);

  /** Puts code in the editor, as a diagram's own code (no parse delay). */
  const showCode = useCallback(
    (text: string): void => {
      clearTimeout(timer.current);
      setCode(text);
      setNotice(null);
      void runParse(text);
    },
    [runParse],
  );

  /** Saves the code in the editor as a new diagram, and makes it the open one. */
  const saveCurrent = useCallback((): void => {
    if (openIdRef.current !== null) return;
    const base = fileName === 'diagram.mmd' ? 'Untitled' : fileName.replace(/\.[^.]+$/, '');
    const { list, diagram } = createDiagram(diagramsRef.current, suggestName(diagramsRef.current, codeRef.current, base), codeRef.current);
    if (commitDiagrams(list)) setOpenId(diagram.id);
  }, [commitDiagrams, setOpenId, fileName]);

  const library = {
    onNew: (): void => {
      const { list, diagram } = createDiagram(diagramsRef.current, suggestName(diagramsRef.current, NEW_DIAGRAM), NEW_DIAGRAM);
      if (!commitDiagrams(list)) return;
      setOpenId(diagram.id);
      showCode(diagram.code);
      setLibraryOpen(false);
    },
    onOpen: (id: string): void => {
      const diagram = diagramsRef.current.find((d) => d.id === id);
      if (!diagram) return;
      setOpenId(id);
      showCode(diagram.code);
      setLibraryOpen(false);
    },
    onRename: (id: string, name: string): void => void commitDiagrams(updateDiagram(diagramsRef.current, id, { name })),
    onDuplicate: (id: string): void => {
      const copy = duplicateDiagram(diagramsRef.current, id);
      if (copy) commitDiagrams(copy.list);
    },
    onDelete: (id: string): void => {
      // The open diagram stays in the editor, unsaved.
      if (id === openIdRef.current) setOpenId(null);
      commitDiagrams(deleteDiagram(diagramsRef.current, id));
    },
  };
  const openDiagram = openId ? diagrams.find((d) => d.id === openId) : undefined;
  /** Unsaved code that opening a diagram would lose: not the starting sample, and not saved under any name. */
  const unsavedWork = openId === null && code.trim() !== SAMPLE.trim() && code.trim() !== '' && !diagrams.some((d) => d.code === code);

  // Ctrl/Cmd+S saves the open code here (an open saved diagram is saved already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      saveCurrent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveCurrent]);

  const onOpenFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    clearTimeout(timer.current);
    // A file is a new, unsaved diagram until it is saved here.
    setOpenId(null);
    setCode(text);
    void runParse(text);
  };

  const onSaveFile = (): void => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="app-header">
        <strong>Merbutler</strong>
        <span className="muted">Mermaid diagram editor</span>
        <button className="diagram-name" onClick={() => { setGalleryOpen(false); setLibraryOpen((o) => !o); }} aria-expanded={libraryOpen} title="Diagrams saved in this browser">
          {openDiagram ? openDiagram.name : 'Unsaved diagram'} ▾
        </button>
        {openDiagram ? (
          <span className="muted saved-state" title="Saved in this browser as you edit">
            saved
          </span>
        ) : (
          <button onClick={saveCurrent} title="Save in this browser (Ctrl+S)">
            Save
          </button>
        )}
        <span className="spacer" />
        {notice && <span className="notice">{notice}</span>}
        <button onClick={() => { setLibraryOpen(false); setGalleryOpen((open) => !open); }} aria-expanded={galleryOpen} title="Examples of every diagram type">
          Gallery
        </button>
        <button onClick={() => void onPasteButton()} title="Replace the code with the clipboard (Ctrl+V on the canvas)">
          Paste
        </button>
        <button onClick={() => fileInput.current?.click()}>Open .mmd</button>
        <button onClick={onSaveFile}>Save .mmd</button>
        <button onClick={() => void navigator.clipboard.writeText(code)}>Copy</button>
        <input ref={fileInput} type="file" accept=".mmd,.md,.txt" hidden onChange={(e) => void onOpenFile(e)} />
      </header>
      <main className="panes">
        <section className="pane code-pane">
          <div className="code-toolbar">
            <span className="muted">Mermaid</span>
            <span className="spacer" />
            <button onClick={() => changeFont(-1)} title="Smaller text (Ctrl+Alt+−)" aria-label="Smaller text" disabled={fontSize === FONT_SIZES[0]}>
              A−
            </button>
            <button className="font-size" onClick={() => changeFont(0)} title="Default size (Ctrl+Alt+0)">
              {fontSize}px
            </button>
            <button onClick={() => changeFont(1)} title="Larger text (Ctrl+Alt+=)" aria-label="Larger text" disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}>
              A+
            </button>
          </div>
          <CodeEditor value={code} onChange={onCodeChange} error={error} completionData={completionData} fontSize={fontSize} />
          {error && (
            <div className="error" role="alert">
              <strong>{preview ? 'The preview shows the last valid code until the code parses.' : 'Canvas is read-only until the code parses.'}</strong>
              <pre>{error}</pre>
            </div>
          )}
        </section>
        <section className="pane canvas-pane">
          {preview && hasStructuredEditor(preview.type.name) ? (
            <div className="structured-layout">
              <StructuredEditor code={preview.code} typeName={preview.type.name} editable={error === null} onChange={onStructuredChange} />
              <div className="structured-preview">
                <Preview code={preview.code} typeName={preview.type.name} stale={error !== null} reason={preview.reason} editor={structuredKind(preview.type.name) ?? undefined} />
              </div>
              <Splitter value={editorSplit} onChange={setEditorSplit} minFirst={200} minSecond={240} label="Editor width" />
            </div>
          ) : preview ? (
            <Preview code={preview.code} typeName={preview.type.name} stale={error !== null} reason={preview.reason} />
          ) : model ? (
            <ReactFlowProvider>
              <Canvas model={model} readOnly={error !== null} onChange={onModelChange} panels={panels} onPanelsChange={setPanels} />
            </ReactFlowProvider>
          ) : (
            <div className="placeholder">{error ? 'No valid diagram yet.' : 'Loading…'}</div>
          )}
        </section>
        <Splitter value={split} onChange={setSplit} minFirst={220} minSecond={320} label="Code editor width" />
        <DiagramLibrary open={libraryOpen} diagrams={diagrams} openId={openId} unsavedWork={unsavedWork} onSaveCurrent={saveCurrent} onClose={closeLibrary} {...library} />
        {/* Always mounted, so it slides in and out and keeps its previews. */}
        <Gallery
          open={galleryOpen}
          view={galleryView}
          onView={setGalleryView}
          onOpen={(text) => {
            replaceFromPaste(text);
            setGalleryOpen(false);
          }}
          onClose={closeGallery}
        />
      </main>
    </div>
  );
}
