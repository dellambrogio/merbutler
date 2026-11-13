import { useEffect, useState, type JSX } from 'react';
import mermaid from 'mermaid';
import { GALLERY, type GalleryExample } from './gallery';
import { parse } from './parse';

/** What the visual editor does with an example: edit it, or show it read-only with a reason. */
type Status = { editable: true } | { editable: false; reason: string };

/** Rendered SVG (or an error) per example id. Kept between openings of the gallery. */
const previews = new Map<string, { svg: string } | { error: string }>();
const statuses = new Map<string, Status>();
let renderQueue: Promise<void> = Promise.resolve();
let renderCount = 0;

/** Mermaid's render uses shared state, so previews render one at a time. */
function renderPreview(example: GalleryExample): Promise<void> {
  renderQueue = renderQueue.then(async () => {
    if (previews.has(example.id)) return;
    try {
      const { svg } = await mermaid.render(`gallery-${++renderCount}`, example.code);
      previews.set(example.id, { svg });
    } catch (err) {
      previews.set(example.id, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  return renderQueue;
}

async function statusOf(example: GalleryExample): Promise<Status> {
  const cached = statuses.get(example.id);
  if (cached) return cached;
  const result = await parse(example.code);
  const status: Status = result.ok
    ? { editable: true }
    : { editable: false, reason: result.error.replace(/^Not supported by the visual editor: /, '') };
  statuses.set(example.id, status);
  return status;
}

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
  const editable = known.filter((ex) => statuses.get(ex.id)?.editable).length;

  return (
    <div className="gallery" role="dialog" aria-label="Gallery">
      <div className="gallery-head">
        <strong>Gallery</strong>
        <span className="muted">
          Examples of the Mermaid flowchart syntax. Previews are drawn by Mermaid.
          {known.length === all.length && ` The canvas can edit ${editable} of ${all.length}.`}
        </span>
        <span className="spacer" />
        <span className="muted gallery-hint">Click an example to open it. Ctrl+Z in the code panel goes back.</span>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="gallery-body">
        {GALLERY.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <div className="gallery-grid">
              {group.examples.map((ex) => (
                <Card key={ex.id} example={ex} onOpen={onOpen} />
              ))}
            </div>
          </section>
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
        {status &&
          (status.editable ? (
            <span className={`badge ${caveat ? 'warn' : 'ok'}`}>{caveat ? 'Editable, lossy' : 'Editable'}</span>
          ) : (
            <span className="badge no">Read-only</span>
          ))}
      </span>
      <span className="gallery-preview">
        {!preview && <span className="muted">Rendering…</span>}
        {preview && 'svg' in preview && (
          // Mermaid renders with securityLevel 'strict', and the examples are fixed text in this app.
          <span className="gallery-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} />
        )}
        {preview && 'error' in preview && <span className="gallery-error">Mermaid error: {preview.error}</span>}
      </span>
      {status && !status.editable && <span className="gallery-note no">{status.reason}</span>}
      {caveat && <span className="gallery-note warn">{caveat}</span>}
      <pre className="gallery-code">{example.code}</pre>
    </button>
  );
}
