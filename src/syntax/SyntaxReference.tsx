import { Fragment, useEffect, useRef, type JSX } from 'react';
import { COMMON, type SyntaxDoc, type SyntaxEntry } from './syntaxDocs';

/** Text with `code` in backticks, as React nodes. */
export function RichText({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

/**
 * A diagram type's syntax reference: its sections and the common one. Entries in `highlight`
 * are marked, and the first is scrolled into view inside its scroll container.
 */
export function SyntaxReference({ doc, highlight = [], showCommon = true }: { doc: SyntaxDoc; highlight?: readonly SyntaxEntry[]; showCommon?: boolean }): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const first = highlight[0];

  useEffect(() => {
    if (!first) return;
    root.current?.querySelector('.syntax-entry.match')?.scrollIntoView({ block: 'nearest' });
  }, [first]);

  const sections = showCommon ? [...doc.sections, COMMON] : doc.sections;
  return (
    <div className="syntax-reference" ref={root}>
      <p className="syntax-intro">
        <RichText text={doc.intro} />
        {doc.url && (
          <>
            {' '}
            <a href={doc.url} target="_blank" rel="noreferrer">
              Mermaid docs ↗
            </a>
          </>
        )}
      </p>
      {sections.map((section) => (
        <section key={section.title} className="syntax-section" aria-label={section.title}>
          <h4>{section.title}</h4>
          <dl>
            {section.entries.map((entry) => (
              <div key={entry.syntax} className={`syntax-entry${highlight.includes(entry) ? ' match' : ''}`}>
                <dt>
                  <pre>{entry.syntax}</pre>
                </dt>
                <dd>
                  <RichText text={entry.text} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
