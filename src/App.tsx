import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './Canvas';
import { extractMermaid } from './clipboard';
import { CodeEditor } from './CodeEditor';
import { Gallery } from './Gallery';
import { Preview } from './Preview';
import { hasStructuredEditor, StructuredEditor, structuredKind } from './StructuredEditor';
import type { DiagramType } from './diagramTypes';
import type { FlowModel } from './model';
import { parse } from './parse';
import { serialize } from './serialize';

const STORAGE_KEY = 'merbutler:code';
/** The key used before the app was renamed. Read once so saved code is not lost. */
const OLD_STORAGE_KEY = 'dutler:code';
const PARSE_DELAY_MS = 300;

const SAMPLE = `flowchart LR
  A[Start] --> B{Is it working?}
  B -->|yes| C([Ship it])
  B -.->|no| D(Debug)
  D ==> B
`;

function loadCode(): string {
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
  const [fontSize, setFontSize] = useState(loadFontSize);
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
      setCode(next);
      setNotice(null);
      void runParse(next);
    },
    [runParse],
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

  useEffect(() => {
    void runParse(code);
    // Parse the initial code once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => saveCode(code), [code]);

  const onOpenFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    clearTimeout(timer.current);
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
        <span className="spacer" />
        {notice && <span className="notice">{notice}</span>}
        <button onClick={() => setGalleryOpen((open) => !open)} aria-pressed={galleryOpen}>
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
            </div>
          ) : preview ? (
            <Preview code={preview.code} typeName={preview.type.name} stale={error !== null} reason={preview.reason} />
          ) : model ? (
            <ReactFlowProvider>
              <Canvas model={model} readOnly={error !== null} onChange={onModelChange} />
            </ReactFlowProvider>
          ) : (
            <div className="placeholder">{error ? 'No valid diagram yet.' : 'Loading…'}</div>
          )}
        </section>
        {galleryOpen && (
          <Gallery
            onOpen={(text) => {
              replaceFromPaste(text);
              setGalleryOpen(false);
            }}
            onClose={() => setGalleryOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
