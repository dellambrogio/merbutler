import { useEffect, useRef, type JSX } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { Annotation, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab, isolateHistory } from '@codemirror/commands';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { errorDiagnostic, mermaidCompletion, mermaidSyntax, type CompletionData } from './mermaidEditor';
import { extractMermaid } from '../core/clipboard';

/**
 * The text size, as part of the editor's theme. CodeMirror measures line heights itself: a size set
 * from outside (CSS) leaves the gutter's line numbers at the old heights. Reconfiguring this
 * compartment makes it measure again.
 */
const fontTheme = new Compartment();
const fontSizeTheme = (px: number) => EditorView.theme({ '&': { fontSize: `${px}px` } });

/** Marks a change that comes from the `value` prop, so it is not reported back through onChange. */
const External = Annotation.define<boolean>();

/**
 * If the pasted text has a Markdown code fence and the paste replaces the whole document
 * (the editor is empty or all text is selected), insert only the code inside the fence.
 * Other pastes use the default behavior.
 */
function replaceOnFencedPaste(event: ClipboardEvent, view: EditorView): boolean {
  const text = event.clipboardData?.getData('text/plain');
  if (!text) return false;
  const { code, fenced } = extractMermaid(text);
  if (!fenced) return false;
  const { state } = view;
  const sel = state.selection.main;
  const replacesAll = state.doc.length === 0 || (sel.from === 0 && sel.to === state.doc.length);
  if (!replacesAll) return false;
  event.preventDefault();
  view.dispatch({
    changes: { from: 0, to: state.doc.length, insert: code },
    selection: { anchor: code.length },
    userEvent: 'input.paste',
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
  });
  return true;
}

/**
 * The default CodeMirror theme is light only (black cursor, white gutter). This theme uses
 * the app's CSS variables, so the editor follows light and dark mode.
 */
const appTheme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--bg)' },
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--selection)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--selection-match)', outline: '1px solid var(--border)' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)' },
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Parse error of the current code, marked on its line. */
  error: string | null;
  /** Ids and class names of the last parsed diagram, for autocompletion. */
  completionData: CompletionData;
  /** Font size in px. */
  fontSize: number;
}

export function CodeEditor({ value, onChange, error, completionData, fontSize }: CodeEditorProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const completionRef = useRef(completionData);
  completionRef.current = completionData;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        basicSetup,
        appTheme,
        fontTheme.of(fontSizeTheme(fontSize)),
        EditorView.lineWrapping,
        mermaidSyntax(),
        mermaidCompletion(() => completionRef.current),
        lintGutter(),
        // Tab indents (Escape, then Tab, leaves the editor, as CodeMirror documents).
        keymap.of([indentWithTab]),
        EditorView.domEventHandlers({ paste: replaceOnFencedPaste }),
        EditorView.updateListener.of((update) => {
          const external = update.transactions.some((t) => t.annotation(External));
          if (update.docChanged && !external) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    view.current = v;
    return () => v.destroy();
    // The editor is created once. Later values arrive through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      // A separate undo step, so Ctrl+Z restores the code before a paste or a canvas edit.
      v.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: [External.of(true), isolateHistory.of('full')],
      });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: fontTheme.reconfigure(fontSizeTheme(fontSize)) });
  }, [fontSize]);

  // Mark the parse error on its line. The error comes from the app's parse, after the code settles.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const mark = error ? errorDiagnostic(v.state.doc, error) : null;
    v.dispatch(setDiagnostics(v.state, mark ? [mark] : []));
  }, [error, value]);

  return <div className="code-editor" ref={host} />;
}
