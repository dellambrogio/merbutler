import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './Canvas';
import { extractMermaid } from './clipboard';
import { CodeEditor } from './CodeEditor';
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
  const [fileName, setFileName] = useState('diagram.mmd');
  const [notice, setNotice] = useState<string | null>(null);
  const parseSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const runParse = useCallback(async (text: string): Promise<void> => {
    const seq = ++parseSeq.current;
    const result = await parse(text);
    if (seq !== parseSeq.current) return; // A newer parse or a canvas edit came first.
    if (result.ok) {
      setModel(result.model);
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
    setError(null);
    setCode(serialize(next));
  }, []);

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
        <span className="muted">Mermaid flowchart editor</span>
        <span className="spacer" />
        {notice && <span className="notice">{notice}</span>}
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
          <CodeEditor value={code} onChange={onCodeChange} />
          {error && (
            <div className="error" role="alert">
              <strong>Canvas is read-only until the code parses.</strong>
              <pre>{error}</pre>
            </div>
          )}
        </section>
        <section className="pane canvas-pane">
          {model ? (
            <ReactFlowProvider>
              <Canvas model={model} readOnly={error !== null} onChange={onModelChange} />
            </ReactFlowProvider>
          ) : (
            <div className="placeholder">{error ? 'No valid diagram yet.' : 'Loading…'}</div>
          )}
        </section>
      </main>
    </div>
  );
}
