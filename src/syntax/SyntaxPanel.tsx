import { useMemo, useState, type JSX } from 'react';
import { docForCode, findEntries } from './lookup';
import { SYNTAX_DOCS } from './syntaxDocs';
import { SyntaxReference } from './SyntaxReference';

const FOLLOW = '';

/**
 * The syntax reference next to the code: the reference of the code's diagram type (or one picked
 * from the list), with the entries for the token at the cursor or the selection marked.
 */
export function SyntaxPanel({ code, cursor }: { code: string; cursor: readonly string[] }): JSX.Element {
  const [picked, setPicked] = useState(FOLLOW);
  const codeDoc = useMemo(() => docForCode(code), [code]);
  const doc = picked === FOLLOW ? codeDoc : SYNTAX_DOCS.find((d) => d.id === picked);
  const match = useMemo(() => (cursor.length > 0 ? findEntries(doc, cursor) : null), [doc, cursor]);

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
        <span className="syntax-at muted" aria-live="polite">
          {match ? (
            <>
              <code>{match.token}</code> {match.entries.length === 1 ? '1 entry' : `${match.entries.length} entries`}
            </>
          ) : cursor.length > 0 ? (
            'Put the cursor on a keyword or arrow'
          ) : null}
        </span>
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
