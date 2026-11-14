import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { FAMILIES, GALLERY_EXAMPLES, GALLERY_TYPES, typeExamples, type GalleryExample, type GalleryType } from './gallery';
import { parse } from './parse';
import { renderMermaid, type RenderResult } from './render';
import { structuredKind } from './StructuredEditor';
import { loadSettings } from './settings';

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

/** How the app edits an example, in the gallery's words: the filter chips. */
type Support = 'Canvas' | 'Outline' | 'Table' | 'Preview' | 'Read-only';
const SUPPORTS: Support[] = ['Canvas', 'Outline', 'Table', 'Preview'];

function supportOf(status: Status | undefined): Support | null {
  if (!status) return null;
  if (status.kind === 'editable') return 'Canvas';
  if (status.kind === 'read-only') return 'Read-only';
  const kind = structuredKind(status.typeName);
  return kind === 'outline' ? 'Outline' : kind === 'table' ? 'Table' : 'Preview';
}

/** A type's support: the support of most of its examples (flowcharts have a few read-only ones). */
function typeSupport(type: GalleryType): Support | null {
  const counts = new Map<Support, number>();
  for (const ex of typeExamples(type)) {
    const s = supportOf(statuses.get(ex.id));
    if (!s) return null;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const SUPPORT_HINT: Record<Support, string> = {
  Canvas: 'Edited on the canvas',
  Outline: 'Edited in an outline next to the preview',
  Table: 'Edited in a table next to the preview',
  Preview: 'Drawn by Mermaid; edited in the code',
  'Read-only': 'The canvas shows it read-only',
};

const VIEW_KEY = 'merbutler:galleryView';

function loadView(): string | null {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return GALLERY_TYPES.some((t) => t.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveView(id: string | null): void {
  try {
    if (id) localStorage.setItem(VIEW_KEY, id);
    else localStorage.removeItem(VIEW_KEY);
  } catch {
    // Storage is a convenience only.
  }
}

/** True if the example matches the search words (in its title, its type or its code). */
function matches(example: GalleryExample, type: GalleryType, words: string[]): boolean {
  if (words.length === 0) return true;
  const text = `${type.title} ${example.title} ${example.code}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

interface GalleryProps {
  /** The gallery is always mounted, so it can fade in and out and keep its previews. */
  open: boolean;
  onOpen: (code: string) => void;
  onClose: () => void;
}

/**
 * The gallery, over the whole editor. The overview shows one tile per diagram type, by family,
 * with a preview and how the app edits it; a search box and filter chips narrow it. A tile opens
 * the type's page with all its examples. Previews are drawn by Mermaid.
 */
export function Gallery({ open, onOpen, onClose }: GalleryProps): JSX.Element {
  // Bumped when a preview or status arrives, to re-render with the module-level caches.
  const [, setVersion] = useState(0);
  const [typeId, setTypeId] = useState<string | null>(loadView);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<Support>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const type = GALLERY_TYPES.find((t) => t.id === typeId) ?? null;
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  const passes = (ex: GalleryExample, t: GalleryType): boolean => {
    if (!matches(ex, t, words)) return false;
    if (filters.size === 0) return true;
    const s = supportOf(statuses.get(ex.id));
    return s !== null && filters.has(s);
  };
  const shownTypes = GALLERY_TYPES.filter((t) => typeExamples(t).some((ex) => passes(ex, t)));

  /** What to render next: the open type's examples, else the shown tiles' previews, in order. */
  const wanted = useRef<GalleryExample[]>([]);
  wanted.current = type ? typeExamples(type).filter((ex) => passes(ex, type)) : shownTypes.map((t) => tileExample(t, passes));
  /** Wakes the render loop when it waits for the view to want more previews. */
  const wake = useRef<(() => void) | null>(null);
  useEffect(() => {
    wake.current?.();
  });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const bump = (): void => {
      if (alive) setVersion((v) => v + 1);
    };
    void (async () => {
      for (const ex of GALLERY_EXAMPLES) await statusOf(ex);
      bump();
      // One preview at a time; the list of wanted previews follows the view as it changes.
      while (alive) {
        const next = wanted.current.find((ex) => !previews.has(ex.id)) ?? GALLERY_TYPES.map((t) => typeExamples(t)[0]).find((ex) => !previews.has(ex.id));
        if (!next) {
          // Nothing to draw now: wait until the view changes (a type page, a search).
          await new Promise<void>((resolve) => (wake.current = resolve));
          wake.current = null;
          continue;
        }
        await renderPreview(next);
        bump();
      }
    })();
    return () => {
      alive = false;
      wake.current?.();
    };
  }, [open]);

  const show = (id: string | null): void => {
    setTypeId(id);
    saveView(id);
    if (body.current) body.current.scrollTop = 0;
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && e.target.closest('.cm-editor, textarea, .context-menu')) return;
      if (e.key === 'Escape') {
        // Esc clears the search, then goes back to the overview, then closes.
        if (e.target === search.current && query) setQuery('');
        else if (typeId) show(null);
        else onClose();
      } else if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggle = (s: Support): void =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const counts = new Map<Support, number>();
  for (const t of GALLERY_TYPES) {
    const s = typeSupport(t);
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  return (
    <div
      className={`gallery${open ? ' open' : ''}`}
      role="dialog"
      aria-label="Gallery"
      aria-hidden={!open}
      inert={!open}
      // Read when the gallery renders, so a later settings panel takes effect on the next opening.
      style={{ '--gallery-preview-scale': loadSettings().galleryPreviewScale } as CSSProperties}
    >
      <div className="gallery-head">
        {type ? (
          <button className="gallery-back" onClick={() => show(null)} title="Back to all diagram types (Esc)">
            ← All types
          </button>
        ) : (
          <strong>Gallery</strong>
        )}
        <input
          ref={search}
          className="gallery-search"
          type="search"
          placeholder="Search examples and code  ( / )"
          aria-label="Search the examples"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="gallery-chips" role="group" aria-label="Show types edited in">
          {SUPPORTS.map((s) => (
            <button key={s} className={`gallery-chip chip-${s.toLowerCase()}`} aria-pressed={filters.has(s)} title={SUPPORT_HINT[s]} onClick={() => toggle(s)}>
              <span className="gallery-dot" aria-hidden="true" />
              {s}
              {counts.has(s) && <span className="gallery-count">{counts.get(s)}</span>}
            </button>
          ))}
        </span>
        <span className="spacer" />
        <button onClick={onClose} title="Close (Esc)">
          Close
        </button>
      </div>
      <div className="gallery-body" ref={body}>
        {type ? (
          <TypePage type={type} passes={passes} onOpen={onOpen} />
        ) : (
          <>
            {shownTypes.length === 0 && <p className="muted gallery-empty">No example matches. Clear the search or the filters.</p>}
            {FAMILIES.map((family) => {
              const types = shownTypes.filter((t) => t.family === family);
              if (types.length === 0) return null;
              return (
                <section key={family} className="gallery-family" aria-label={family}>
                  <h2>{family}</h2>
                  <div className="gallery-tiles">
                    {types.map((t) => (
                      <Tile key={t.id} type={t} example={tileExample(t, passes)} count={typeExamples(t).filter((ex) => passes(ex, t)).length} onOpen={() => show(t.id)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** The example a tile shows: the type's first one that the search and filters let through. */
function tileExample(type: GalleryType, passes: (ex: GalleryExample, t: GalleryType) => boolean): GalleryExample {
  const all = typeExamples(type);
  return all.find((ex) => passes(ex, type)) ?? all[0];
}

function Tile({ type, example, count, onOpen }: { type: GalleryType; example: GalleryExample; count: number; onOpen: () => void }): JSX.Element {
  const preview = previews.get(example.id);
  const support = typeSupport(type);
  const total = typeExamples(type).length;
  return (
    <button className="gallery-tile" onClick={onOpen} title={`${type.title}: ${count === total ? total : `${count} of ${total}`} example${total === 1 ? '' : 's'}`}>
      <span className="gallery-tile-preview" aria-hidden="true">
        {preview && 'svg' in preview ? (
          // Mermaid renders with securityLevel 'strict', and the examples are fixed text in this app.
          <span className="gallery-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} />
        ) : (
          <span className="muted">{preview ? 'No preview' : 'Rendering…'}</span>
        )}
      </span>
      <span className="gallery-tile-foot">
        <span className="gallery-tile-title">{type.title}</span>
        {support && (
          <span className={`gallery-support chip-${support.toLowerCase()}`} title={SUPPORT_HINT[support]}>
            <span className="gallery-dot" aria-hidden="true" />
            {support}
          </span>
        )}
        <span className="gallery-count">{count === total ? total : `${count}/${total}`}</span>
      </span>
    </button>
  );
}

/** One type's page: its examples, by section when it has several (flowcharts). */
function TypePage({ type, passes, onOpen }: { type: GalleryType; passes: (ex: GalleryExample, t: GalleryType) => boolean; onOpen: (code: string) => void }): JSX.Element {
  const support = typeSupport(type);
  const total = typeExamples(type).length;
  const shown = type.sections.map((s) => ({ ...s, examples: s.examples.filter((ex) => passes(ex, type)) })).filter((s) => s.examples.length > 0);
  const count = shown.reduce((n, s) => n + s.examples.length, 0);
  return (
    <>
      <div className="gallery-type-head">
        <h2>{type.title}</h2>
        <span className="muted">
          {count === total ? `${total} example${total === 1 ? '' : 's'}` : `${count} of ${total} examples`} · {type.family}
          {support ? ` · ${SUPPORT_HINT[support]}` : ''}
        </span>
      </div>
      {count === 0 && <p className="muted gallery-empty">No example of this type matches. Clear the search or the filters.</p>}
      {type.sections.length > 1 && shown.length > 1 && (
        <nav className="gallery-toc" aria-label="Sections">
          {shown.map((s) => (
            <a key={s.title} href={`#gallery-${type.id}-${slug(s.title)}`} onClick={(e) => {
              e.preventDefault();
              document.getElementById(`gallery-${type.id}-${slug(s.title)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }}>
              {s.title} <span className="gallery-count">{s.examples.length}</span>
            </a>
          ))}
        </nav>
      )}
      {shown.map((s) => (
        <section key={s.title} id={`gallery-${type.id}-${slug(s.title)}`} className="gallery-section">
          {type.sections.length > 1 && <h3>{s.title}</h3>}
          <div className="gallery-grid">
            {s.examples.map((ex) => (
              <Card key={ex.id} example={ex} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
