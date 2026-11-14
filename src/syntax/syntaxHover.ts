/**
 * Code editor support for the syntax reference: the tokens at the cursor or in the selection, and
 * a tooltip with the reference entries for the token under the mouse.
 */
import type { EditorState } from '@codemirror/state';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { docForCode, findEntries, selectionToken, tokensAt } from './lookup';

/** The tokens to look up for the main selection: the selected text, else the tokens at the cursor. */
export function cursorTokens(state: EditorState): string[] {
  const sel = state.selection.main;
  if (!sel.empty) {
    const token = selectionToken(state.sliceDoc(sel.from, sel.to));
    return token ? [token] : [];
  }
  const line = state.doc.lineAt(sel.head);
  return tokensAt(line.text, sel.head - line.from);
}

/** Appends text with `code` in backticks to an element, as text nodes (never HTML). */
function appendRich(parent: HTMLElement, text: string): void {
  for (const part of text.split(/(`[^`]+`)/)) {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else if (part) parent.append(document.createTextNode(part));
  }
}

/** At most this many entries in a tooltip; the Syntax panel shows them all. */
const MAX_ENTRIES = 3;

/** A tooltip with the reference entries for the token under the mouse, after a short pause. */
export function syntaxHover() {
  return hoverTooltip(
    (view, pos): Tooltip | null => {
      const line = view.state.doc.lineAt(pos);
      const match = findEntries(docForCode(view.state.doc.toString()), tokensAt(line.text, pos - line.from));
      if (!match) return null;
      const at = line.text.indexOf(match.token, Math.max(0, pos - line.from - match.token.length));
      const from = at >= 0 ? line.from + at : pos;
      return {
        pos: from,
        end: from + match.token.length,
        above: true,
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'cm-syntax-tooltip';
          for (const entry of match.entries.slice(0, MAX_ENTRIES)) {
            const item = document.createElement('div');
            item.className = 'cm-syntax-entry';
            const code = document.createElement('pre');
            code.textContent = entry.syntax;
            const text = document.createElement('div');
            appendRich(text, entry.text);
            item.append(code, text);
            dom.append(item);
          }
          if (match.entries.length > MAX_ENTRIES) {
            const more = document.createElement('div');
            more.className = 'cm-syntax-more';
            more.textContent = `${match.entries.length - MAX_ENTRIES} more in the Syntax panel`;
            dom.append(more);
          }
          return { dom };
        },
      };
    },
    { hoverTime: 400 },
  );
}
