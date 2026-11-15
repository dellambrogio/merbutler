import { useMemo, useState, type JSX } from 'react';
import { saveSettings } from '../core/settings';
import { docForCode, findEntries } from '../syntax/lookup';
import { SYNTAX_DOCS } from '../syntax/syntaxDocs';
import { SyntaxReference } from '../syntax/SyntaxReference';

const FOLLOW = '';

/**
 * The syntax reference next to the code: for the code's diagram type, or one picked from the list.
 * With "Highlight syntax" on (`cursor` not null), the entries for the token at the cursor or the
 * selection are marked.
 */
export function SyntaxPanel({ code, cursor }: { code: string; cursor: readonly string[] | null }): JSX.Element {
  const [picked, setPicked] = useState(FOLLOW);
  const codeDoc = useMemo(() => docForCode(code), [code]);
  const doc = picked === FOLLOW ? codeDoc : SYNTAX_DOCS.find((d) => d.id === picked);
  const match = useMemo(() => (cursor && cursor.length > 0 ? findEntries(doc, cursor) : null), [doc, cursor]);

  return (
    <div className="syntax-panel">
      <div className="syntax-bar">
        <select value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Diagram type of the reference">
          <option value={FOLLOW}>{codeDoc ? `${codeDoc.title} (from the code)` : 'Type of the code'}</option>
          {SYNTAX_DOCS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        <label className="syntax-follow" title="Mark the entry for the keyword or arrow at the cursor, or the one you select">
          <input type="checkbox" checked={cursor !== null} onChange={(e) => saveSettings({ syntaxFollowCursor: e.target.checked })} />
          Highlight syntax
        </label>
        {match && (
          <span className="syntax-at muted" aria-live="polite">
            <code>{match.token}</code> {match.entries.length === 1 ? '1 entry' : `${match.entries.length} entries`}
          </span>
        )}
      </div>
      {doc ? (
        <SyntaxReference doc={doc} highlight={match?.entries} />
      ) : (
        <p className="muted syntax-none">
          No reference for this diagram type. Pick one above, or see{' '}
          <a href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noreferrer">
            Mermaid's docs ↗
          </a>
        </p>
      )}
    </div>
  );
}
