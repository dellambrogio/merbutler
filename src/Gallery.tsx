import { Fragment, useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
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
const HEIGHT_KEY = 'merbutler:galleryHeight';
const MIN_HEIGHT = 220;
const DEFAULT_HEIGHT = 340;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is a convenience only.
  }
}

/** A short summary of a group's support, for its button: how many examples the canvas edits. */
function groupSummary(group: GalleryGroup): { editable: number; total: number; kind: Status['kind'] | 'mixed' | null } {
  const known = group.examples.map((ex) => statuses.get(ex.id)).filter((s): s is Status => s !== undefined);
  const editable = known.filter((s) => s.kind === 'editable').length;
  const kinds = new Set(known.map((s) => s.kind));
  const kind = known.length < group.examples.length ? null : kinds.size === 1 ? [...kinds][0] : 'mixed';
  return { editable, total: group.examples.length, kind };
}

interface GalleryProps {
  /** The drawer is always mounted, so it can slide in and out and keep its previews. */
  open: boolean;
  onOpen: (code: string) => void;
  onClose: () => void;
  /** The height the drawer takes at the bottom (0 when closed), so the panes can make room. */
  onSpace: (px: number) => void;
}

/**
 * The gallery: a drawer that slides up from the bottom. A row of group buttons (left to right);
 * the chosen group's examples are shown below them as a row of previews drawn by Mermaid.
 */
export function Gallery({ open, onOpen, onClose, onSpace }: GalleryProps): JSX.Element {
  // Bumped when a preview or status arrives, to re-render with the module-level caches.
  const [, setVersion] = useState(0);
  const [active, setActive] = useState<string>(() => {
    const saved = load(GROUP_KEY);
    return GALLERY.some((g) => groupKey(g) === saved) ? saved! : groupKey(GALLERY[0]);
  });
  const [height, setHeight] = useState<number>(() => Math.max(MIN_HEIGHT, Number(load(HEIGHT_KEY)) || DEFAULT_HEIGHT));
  const group = GALLERY.find((g) => groupKey(g) === active) ?? GALLERY[0];
  const tabs = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);

  // Statuses for the group buttons, once (they are fast).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      for (const ex of GALLERY.flatMap((g) => g.examples)) await statusOf(ex);
      if (alive) setVersion((v) => v + 1);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // Previews of the chosen group only, left to right.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      for (const ex of group.examples) {
        if (!alive) return;
        await statusOf(ex);
        await renderPreview(ex);
        if (alive) setVersion((v) => v + 1);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, group]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('.cm-editor, input, textarea, .context-menu'))) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // The chosen group's button stays in view; a new group starts at its first example. Only these
  // two rows scroll (scrollIntoView would also scroll the page while the drawer slides in).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const bar = tabs.current;
      const tab = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (bar && tab) {
        const barBox = bar.getBoundingClientRect();
        const box = tab.getBoundingClientRect();
        if (box.left < barBox.left + 16) bar.scrollLeft -= barBox.left + 16 - box.left;
        else if (box.right > barBox.right - 16) bar.scrollLeft += box.right - (barBox.right - 16);
      }
    });
    if (row.current) row.current.scrollLeft = 0;
    return () => cancelAnimationFrame(frame);
  }, [active, open]);

  // The panes make room for the open drawer, so it does not cover the diagram.
  useEffect(() => {
    onSpace(open ? height : 0);
  }, [open, height, onSpace]);

  const choose = (key: string): void => {
    setActive(key);
    save(GROUP_KEY, key);
  };

  /** Arrow keys move between group buttons, as in a tab list. */
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const index = GALLERY.findIndex((g) => groupKey(g) === active);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? GALLERY.length - 1 : (index + step + GALLERY.length) % GALLERY.length;
    choose(groupKey(GALLERY[next]));
    requestAnimationFrame(() => tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  /** A vertical wheel scrolls the row of previews sideways. */
  const onRowWheel = (e: ReactWheelEvent<HTMLDivElement>): void => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !row.current) return;
    row.current.scrollLeft += e.deltaY;
  };

  /** Drag the top edge to change the height. */
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    const parent = (e.currentTarget.parentElement?.parentElement as HTMLElement | null)?.clientHeight ?? 800;
    const onMove = (ev: PointerEvent): void => setHeight(Math.min(parent - 40, Math.max(MIN_HEIGHT, startHeight + startY - ev.clientY)));
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      save(HEIGHT_KEY, String(Math.min(parent - 40, Math.max(MIN_HEIGHT, startHeight + startY - ev.clientY))));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const all = GALLERY.flatMap((g) => g.examples);
  const known = all.filter((ex) => statuses.has(ex.id));
  const editable = known.filter((ex) => statuses.get(ex.id)?.kind === 'editable').length;

  return (
    <div
      className={`gallery-drawer${open ? ' open' : ''}`}
      style={{ height }}
      role="dialog"
      aria-label="Gallery"
      aria-hidden={!open}
      // A closed drawer takes no focus and no clicks.
      inert={!open}
    >
      <div className="gallery-resize" onPointerDown={onResizeStart} title="Drag to resize" aria-hidden="true" />
      <div className="gallery-head">
        <strong>Gallery</strong>
        <span className="muted gallery-summary">
          {known.length === all.length ? `${all.length} examples, ${editable} editable on the canvas.` : 'Examples drawn by Mermaid.'} Click one to open
          it; Ctrl+Z in the code goes back.
        </span>
        <span className="spacer" />
        <button onClick={onClose} aria-label="Close the gallery" title="Close (Esc)">
          ▾ Close
        </button>
      </div>
      <div className="gallery-tabs" role="tablist" aria-label="Groups" ref={tabs} onKeyDown={onTabKey}>
        {PARTS.map((part, pi) => (
          <Fragment key={part}>
            {pi > 0 && <span className="gallery-tabs-divider" aria-hidden="true" />}
            <span className="gallery-tabs-part">{part}</span>
            {GALLERY.filter((g) => g.part === part).map((g) => {
              const key = groupKey(g);
              const selected = key === active;
              const summary = groupSummary(g);
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={selected}
                  aria-controls="gallery-row"
                  tabIndex={selected ? 0 : -1}
                  className={`gallery-tab${selected ? ' selected' : ''}`}
                  onClick={() => choose(key)}
                  title={`${g.examples.length} example${g.examples.length === 1 ? '' : 's'}${summary.kind ? `, ${summary.editable} editable on the canvas` : ''}`}
                >
                  {/* Always there, so the buttons keep their width when the statuses arrive. */}
                  <span className={`gallery-dot ${summary.kind ?? 'unknown'}`} aria-hidden="true" />
                  {g.title}
                  <span className="gallery-count">{g.examples.length}</span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="gallery-row" id="gallery-row" role="tabpanel" aria-label={group.title} ref={row} onWheel={onRowWheel}>
        {group.examples.map((ex) => (
          <Card key={ex.id} example={ex} onOpen={onOpen} />
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
