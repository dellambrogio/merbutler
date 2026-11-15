import type { JSX } from 'react';
import { RichText } from '../syntax/SyntaxReference';
import { APP_VERSION, MERMAID_VERSION } from '../version';
import { RELEASED, type Release } from './releaseNotes';
import { WindowPanel } from './Panel';

const REPO = 'https://github.com/dellambrogio/merbutler';

/** The About panel: what Merbutler is, its versions and release notes, the libraries it builds on, and its license. */
export function AboutPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  return (
    <WindowPanel open={open} onClose={onClose} className="about" title="Merbutler" meta={`v${APP_VERSION}`}>
      <p>
        <strong>A visual editor for Mermaid diagrams.</strong> Edit the code or the canvas, and the other side follows.
      </p>
      <p className="muted">
        Everything runs in this browser: no server, no account. Saved diagrams stay in this browser's storage, and a link
        carries the diagram in its URL.
      </p>
      <dl className="about-facts">
        <dt>Mermaid</dt>
        <dd>{MERMAID_VERSION}</dd>
        <dt>Source</dt>
        <dd>
          <a href={REPO} target="_blank" rel="noreferrer">
            github.com/dellambrogio/merbutler
          </a>
        </dd>
        <dt>Issues</dt>
        <dd>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
            Report a bug or ask for a feature
          </a>
        </dd>
        <dt>License</dt>
        <dd>MIT © 2026 Michele Dell'Ambrogio</dd>
      </dl>
      <ReleaseNotes />
      <p className="about-credits muted">
        Built on <a href="https://mermaid.js.org/" target="_blank" rel="noreferrer">Mermaid</a>,{' '}
        <a href="https://reactflow.dev/" target="_blank" rel="noreferrer">React Flow</a>,{' '}
        <a href="https://eclipse.dev/elk/" target="_blank" rel="noreferrer">ELK</a>,{' '}
        <a href="https://github.com/dagrejs/dagre" target="_blank" rel="noreferrer">dagre</a> and{' '}
        <a href="https://codemirror.net/" target="_blank" rel="noreferrer">CodeMirror</a>.
      </p>
      <p className="about-thanks">
        Thanks to <a href="https://claude.ai/" target="_blank" rel="noreferrer">Claude</a>, who helped write it.
      </p>
    </WindowPanel>
  );
}

function ReleaseBody({ release }: { release: Release }): JSX.Element {
  return (
    <>
      {release.intro.map((p) => (
        <p key={p}>
          <RichText text={p} />
        </p>
      ))}
      {release.items.length > 0 && (
        <ul>
          {release.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** What is new in this version, and the notes of the earlier ones (CHANGELOG.md). */
function ReleaseNotes(): JSX.Element | null {
  const current = RELEASED.find((r) => r.version === APP_VERSION);
  const earlier = RELEASED.filter((r) => r !== current);
  if (!current && earlier.length === 0) return null;
  return (
    <section className="about-notes" aria-label="Release notes">
      {current && (
        <details>
          <summary>
            What's new in v{current.version}
            {current.date && <span className="muted"> · {current.date}</span>}
          </summary>
          <ReleaseBody release={current} />
        </details>
      )}
      {earlier.map((r) => (
        <details key={r.version}>
          <summary>
            v{r.version}
            {r.date && <span className="muted"> · {r.date}</span>}
          </summary>
          <ReleaseBody release={r} />
        </details>
      ))}
    </section>
  );
}
