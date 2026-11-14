import { Fragment, useEffect, useState, type JSX } from 'react';
import { GALLERY, type GalleryExample } from './gallery';
import { parse } from './parse';
import { renderMermaid, type RenderResult } from './render';
import { structuredKind } from './StructuredEditor';

/**
 * What the app does with an example: edit it on the canvas, show Mermaid's preview of a type the
 * canvas does not edit, or show a flowchart read-only with a reason.
 */
type Status = { kind: 'editable' } | { kind: 'preview'; typeName: string } | { kind: 'read-only'; reason: string };

/** Rendered SVG (or an error) per example id. Kept between openings of the gallery. */
const previews = new Map<string, RenderResult>();
const statuses = new Map<string, Status>();

async function renderPreview(example: GalleryExample): Promise<void> {
  if (previews.has(example.id)) return;
  previews.set(example.id, await renderMermaid(example.code));
}

async function statusOf(example: GalleryExample): Promise<Status> {
  const cached = statuses.get(example.id);
  if (cached) return cached;
  const result = await parse(example.code);
  const status: Status = result.ok
    ? { kind: 'editable' }
    : result.preview
      ? { kind: 'preview', typeName: result.preview.name }
      : { kind: 'read-only', reason: result.error.replace(/^Not supported by the visual editor: /, '') };
  statuses.set(example.id, status);
  return status;
}

const PARTS = [...new Set(GALLERY.map((g) => g.part))];
const anchor = (title: string): string => `gallery-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

interface GalleryProps {
  onOpen: (code: string) => void;
  onClose: () => void;
}

export function Gallery({ onOpen, onClose }: GalleryProps): JSX.Element {
  // Bumped when a preview or status arrives, to re-render with the module-level caches.
  const [, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const bump = (): void => {
      if (alive) setVersion((v) => v + 1);
    };
    void (async () => {
      const all = GALLERY.flatMap((g) => g.examples);
      // Statuses are fast; get them all first, then the previews in page order.
      for (const ex of all) await statusOf(ex);
      bump();
      for (const ex of all) {
        if (!alive) return;
        await renderPreview(ex);
        bump();
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = GALLERY.flatMap((g) => g.examples);
  const known = all.filter((ex) => statuses.has(ex.id));
  const editable = known.filter((ex) => statuses.get(ex.id)?.kind === 'editable').length;
  const previewOnly = known.filter((ex) => statuses.get(ex.id)?.kind === 'preview').length;
  const structured = known.filter((ex) => {
    const s = statuses.get(ex.id);
    return s?.kind === 'preview' && structuredKind(s.typeName) !== null;
  }).length;

  return (
    <div className="gallery" role="dialog" aria-label="Gallery">
      <div className="gallery-head">
        <strong>Gallery</strong>
        <span className="muted">
          Examples of the flowchart syntax and of every Mermaid diagram type, drawn by Mermaid.
          {known.length === all.length &&
            ` The canvas can edit ${editable} of ${all.length}; ${structured} more have an outline or table editor; ${previewOnly - structured} are a preview only.`}
        </span>
        <span className="spacer" />
        <select
          aria-label="Jump to a group"
          value=""
          onChange={(e) => document.getElementById(e.target.value)?.scrollIntoView({ block: 'start' })}
        >
          <option value="">Jump to…</option>
          {PARTS.map((part) => (
            <optgroup key={part} label={part}>
              {GALLERY.filter((g) => g.part === part).map((g) => (
                <option key={g.title} value={anchor(`${part} ${g.title}`)}>
                  {g.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="muted gallery-hint">Click an example to open it. Ctrl+Z in the code panel goes back.</span>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="gallery-body">
        {PARTS.map((part) => (
          <Fragment key={part}>
            <h1 className="gallery-part">{part}</h1>
            {GALLERY.filter((g) => g.part === part).map((group) => (
              <section key={group.title} id={anchor(`${part} ${group.title}`)}>
                <h2>{group.title}</h2>
                <div className="gallery-grid">
                  {group.examples.map((ex) => (
                    <Card key={ex.id} example={ex} onOpen={onOpen} />
                  ))}
                </div>
              </section>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Card({ example, onOpen }: { example: GalleryExample; onOpen: (code: string) => void }): JSX.Element {
  const status = statuses.get(example.id);
  const preview = previews.get(example.id);
  const caveat = example.caveat;
  return (
    <button className="gallery-card" onClick={() => onOpen(example.code)} title="Open in the editor">
      <span className="gallery-card-head">
        <span className="gallery-card-title">{example.title}</span>
        {status?.kind === 'editable' && <span className={`badge ${caveat ? 'warn' : 'ok'}`}>{caveat ? 'Editable, lossy' : 'Editable'}</span>}
        {status?.kind === 'preview' && structuredKind(status.typeName) && (
          <span className="badge ok" title={`${status.typeName}: edit it in the ${structuredKind(status.typeName)} next to Mermaid's drawing, or in the code.`}>
            {structuredKind(status.typeName) === 'outline' ? 'Outline editor' : 'Table editor'}
          </span>
        )}
        {status?.kind === 'preview' && !structuredKind(status.typeName) && (
          <span className="badge preview-badge" title={`${status.typeName}: the canvas does not edit this type yet. Edit it in the code.`}>
            Preview
          </span>
        )}
        {status?.kind === 'read-only' && <span className="badge no">Read-only</span>}
      </span>
      <span className="gallery-preview">
        {!preview && <span className="muted">Rendering…</span>}
        {preview && 'svg' in preview && (
          // Mermaid renders with securityLevel 'strict', and the examples are fixed text in this app.
          <span className="gallery-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} />
        )}
        {preview && 'error' in preview && <span className="gallery-error">Mermaid error: {preview.error}</span>}
      </span>
      {status?.kind === 'read-only' && <span className="gallery-note no">{status.reason}</span>}
      {caveat && <span className="gallery-note warn">{caveat}</span>}
      {example.note && <span className="gallery-note muted">{example.note}</span>}
      <pre className="gallery-code">{example.code}</pre>
    </button>
  );
}
