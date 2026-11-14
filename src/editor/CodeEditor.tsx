import { useEffect, useRef, type JSX } from 'react';
import { EditorView } from 'codemirror';
import { Annotation, Compartment, EditorState, Prec, type Text } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import { errorDiagnostic, mermaidCompletion, mermaidSyntax, type CompletionData } from './mermaidEditor';
import { extractMermaid } from '../core/clipboard';
import { cursorTokens, syntaxHover } from '../syntax/syntaxHover';

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
 * CodeMirror's basicSetup without its undo history: the app keeps one history for the code editor,
 * the canvas and the other editors (core/history.ts), and Ctrl+Z here uses it.
 */
const setup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap]),
];

/** The part of `doc` that differs from `text`: replace from..to in doc with `insert`. */
export function diffText(doc: string, text: string): { from: number; to: number; insert: string } | null {
  if (doc === text) return null;
  let start = 0;
  const max = Math.min(doc.length, text.length);
  while (start < max && doc.charCodeAt(start) === text.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && doc.charCodeAt(doc.length - 1 - end) === text.charCodeAt(text.length - 1 - end)) end++;
  return { from: start, to: doc.length - end, insert: text.slice(start, text.length - end) };
}

/** Text documents compare by content. */
const docText = (doc: Text): string => doc.toString();

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
  /** `typing`: typed or deleted characters, which join one undo step. */
  onChange: (value: string, typing: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Parse error of the current code, marked on its line. */
  error: string | null;
  /** Ids and class names of the last parsed diagram, for autocompletion. */
  completionData: CompletionData;
  /** Font size in px. */
  fontSize: number;
  /** The tokens at the cursor, or the selected text, for the syntax reference. Called when they may have changed. */
  onCursor?: (tokens: string[]) => void;
}

export function CodeEditor({ value, onChange, onUndo, onRedo, error, completionData, fontSize, onCursor }: CodeEditorProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const historyRef = useRef({ onUndo, onRedo });
  historyRef.current = { onUndo, onRedo };
  const completionRef = useRef(completionData);
  completionRef.current = completionData;
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        setup,
        Prec.highest(
          keymap.of([
            { key: 'Mod-z', run: () => (historyRef.current.onUndo(), true), preventDefault: true },
            { key: 'Mod-y', run: () => (historyRef.current.onRedo(), true), preventDefault: true },
            { key: 'Mod-Shift-z', run: () => (historyRef.current.onRedo(), true), preventDefault: true },
          ]),
        ),
        appTheme,
        fontTheme.of(fontSizeTheme(fontSize)),
        EditorView.lineWrapping,
        mermaidSyntax(),
        mermaidCompletion(() => completionRef.current),
        syntaxHover(),
        lintGutter(),
        // Tab indents (Escape, then Tab, leaves the editor, as CodeMirror documents).
        keymap.of([indentWithTab]),
        EditorView.domEventHandlers({
          paste: replaceOnFencedPaste,
          // Undo and redo from the browser's Edit menu.
          beforeinput: (event) => {
            if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return false;
            event.preventDefault();
            if (event.inputType === 'historyUndo') historyRef.current.onUndo();
            else historyRef.current.onRedo();
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) onCursorRef.current?.(cursorTokens(update.state));
          const external = update.transactions.some((t) => t.annotation(External));
          if (!update.docChanged || external) return;
          const typing = update.transactions.every((t) => !t.docChanged || t.isUserEvent('input.type') || t.isUserEvent('delete'));
          onChangeRef.current(docText(update.state.doc), typing);
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
    // Only the part that changed, so the cursor and the scroll stay where they were.
    const change = diffText(docText(v.state.doc), value);
    if (!change) return;
    // In the editor (undo, redo), the cursor goes to the change.
    const focused = v.hasFocus;
    v.dispatch({
      changes: change,
      annotations: External.of(true),
      ...(focused ? { selection: { anchor: change.from + change.insert.length }, scrollIntoView: true } : {}),
    });
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
