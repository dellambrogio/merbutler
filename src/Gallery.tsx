import { Fragment, useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { GALLERY, type GalleryExample, type GalleryGroup } from './gallery';
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
const groupKey = (g: GalleryGroup): string => `${g.part}/${g.title}`;

const GROUP_KEY = 'merbutler:galleryGroup';

function loadGroup(): string {
  try {
    const saved = localStorage.getItem(GROUP_KEY);
    if (GALLERY.some((g) => groupKey(g) === saved)) return saved!;
  } catch {
    // Storage is a convenience only.
  }
  return groupKey(GALLERY[0]);
}

function saveGroup(key: string): void {
  try {
    localStorage.setItem(GROUP_KEY, key);
  } catch {
    // Storage is a convenience only.
  }
}

/** How the app edits a group's examples, once their statuses are known: one kind, or mixed. */
function groupKind(group: GalleryGroup): Status['kind'] | 'mixed' | null {
  const known = group.examples.map((ex) => statuses.get(ex.id)).filter((s): s is Status => s !== undefined);
  if (known.length < group.examples.length) return null;
  const kinds = new Set(known.map((s) => s.kind));
  return kinds.size === 1 ? [...kinds][0] : 'mixed';
}

const KIND_TEXT: Record<Status['kind'] | 'mixed', string> = {
  editable: 'Editable on the canvas',
  preview: 'Preview, outline or table',
  'read-only': 'Read-only',
  mixed: 'Mixed support',
};

interface GalleryProps {
  /** The gallery is always mounted, so it can slide in and out and keep its previews. */
  open: boolean;
  onOpen: (code: string) => void;
  onClose: () => void;
}

/**
 * The gallery, over the whole editor: on the left a list of groups, each with a preview of its
 * first example (scrolls top to bottom); on the right, larger, the chosen group's examples as a
 * grid. Previews are drawn by Mermaid, the chosen group's first.
 */
export function Gallery({ open, onOpen, onClose }: GalleryProps): JSX.Element {
  // Bumped when a preview or status arrives, to re-render with the module-level caches.
  const [, setVersion] = useState(0);
  const [active, setActive] = useState<string>(loadGroup);
  const group = GALLERY.find((g) => groupKey(g) === active) ?? GALLERY[0];
  /** The chosen group, for the render loop (it reads it between renders). */
  const activeGroup = useRef(group);
  activeGroup.current = group;
  const list = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  // One loop renders what is missing, one preview at a time: the chosen group's examples
  // first, then the first example of each group for the list.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const bump = (): void => {
      if (alive) setVersion((v) => v + 1);
    };
    void (async () => {
      for (const ex of GALLERY.flatMap((g) => g.examples)) await statusOf(ex);
      bump();
      while (alive) {
        const next = activeGroup.current.examples.find((ex) => !previews.has(ex.id)) ?? GALLERY.map((g) => g.examples[0]).find((ex) => ex && !previews.has(ex.id));
        if (!next) return;
        await renderPreview(next);
        bump();
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('.cm-editor, input, textarea, .context-menu'))) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // A new group starts at its top; the chosen group stays in view in the list.
  useEffect(() => {
    if (grid.current) grid.current.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      const box = list.current;
      const item = box?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!box || !item) return;
      const outer = box.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      if (r.top < outer.top) box.scrollTop -= outer.top - r.top + 8;
      else if (r.bottom > outer.bottom) box.scrollTop += r.bottom - outer.bottom + 8;
    });
    return () => cancelAnimationFrame(frame);
  }, [active, open]);

  const choose = (key: string): void => {
    setActive(key);
    saveGroup(key);
  };

  /** Up and down arrows move through the groups, as in a list box. */
  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const index = GALLERY.findIndex((g) => groupKey(g) === active);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? GALLERY.length - 1 : Math.min(GALLERY.length - 1, Math.max(0, index + step));
    choose(groupKey(GALLERY[next]));
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  const all = GALLERY.flatMap((g) => g.examples);
  const known = all.filter((ex) => statuses.has(ex.id));
  const editable = known.filter((ex) => statuses.get(ex.id)?.kind === 'editable').length;
  const kind = groupKind(group);

  return (
    <div className={`gallery${open ? ' open' : ''}`} role="dialog" aria-label="Gallery" aria-hidden={!open} inert={!open}>
      <div className="gallery-head">
        <strong>Gallery</strong>
        <span className="muted gallery-summary">
          {known.length === all.length ? `${all.length} examples in ${GALLERY.length} groups, ${editable} editable on the canvas.` : 'Examples drawn by Mermaid.'} Click
          one to open it; Ctrl+Z in the code goes back.
        </span>
        <span className="spacer" />
        <button onClick={onClose} title="Close (Esc)">
          Close
        </button>
      </div>
      <div className="gallery-split">
        <div className="gallery-groups" role="listbox" aria-label="Groups" ref={list} onKeyDown={onListKey}>
          {PARTS.map((part) => (
            <Fragment key={part}>
              <div className="gallery-groups-part" role="presentation">
                {part}
              </div>
              {GALLERY.filter((g) => g.part === part).map((g) => {
                const key = groupKey(g);
                const selected = key === active;
                const first = g.examples[0];
                const preview = first ? previews.get(first.id) : undefined;
                const gk = groupKind(g);
                return (
                  <button
                    key={key}
                    role="option"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    className={`gallery-group${selected ? ' selected' : ''}`}
                    onClick={() => choose(key)}
                  >
                    <span className="gallery-group-head">
                      <span className={`gallery-dot dot-${gk ?? 'unknown'}`} title={gk ? KIND_TEXT[gk] : undefined} aria-hidden="true" />
                      <span className="gallery-group-title">{g.title}</span>
                      <span className="gallery-count">{g.examples.length}</span>
                    </span>
                    <span className="gallery-thumb" aria-hidden="true">
                      {preview && 'svg' in preview ? (
                        // Mermaid renders with securityLevel 'strict', and the examples are fixed text in this app.
                        <span className="gallery-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} />
                      ) : (
                        <span className="muted">{preview ? 'No preview' : '…'}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="gallery-main" ref={grid}>
          <div className="gallery-main-head">
            <h2>{group.title}</h2>
            <span className="muted">
              {group.examples.length} example{group.examples.length === 1 ? '' : 's'}
              {kind ? ` · ${KIND_TEXT[kind]}` : ''}
            </span>
          </div>
          <div className="gallery-grid" role="list" aria-label={`${group.title} examples`}>
            {group.examples.map((ex) => (
              <Card key={ex.id} example={ex} onOpen={onOpen} />
            ))}
          </div>
        </div>
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
