import { useState, type JSX } from 'react';
import { FAMILIES, GALLERY_EXAMPLES, GALLERY_TYPES, typeExamples, type Family, type GalleryType } from '../gallery/gallery';
import { typeVisual, useTypeVisuals } from '../gallery/Gallery';

/** Families the user opened, remembered in this browser. */
const OPEN_KEY = 'merbutler:galleryFamilies';

function loadOpen(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const GRID = (
  <svg className="explorer-icon" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
);

/**
 * The Gallery section of the sidebar: every diagram type, by family, each with a small preview
 * and a dot for how the app edits it. A click opens the gallery at that type (or at the
 * overview); the type the gallery shows is marked.
 */
export function GalleryNav({ open, view, onShow, onClose }: {
  /** The gallery is open. */
  open: boolean;
  /** The gallery's type page (null: the overview). */
  view: string | null;
  /** Open the gallery at a type, or at the overview (null); closes it if that is what it shows. */
  onShow: (typeId: string | null) => void;
  onClose: () => void;
}): JSX.Element {
  const [openFamilies, setOpenFamilies] = useState(loadOpen);
  // The family of the type on show stays open, so its mark is visible.
  const current = open ? GALLERY_TYPES.find((t) => t.id === view) ?? null : null;
  const toggle = (family: Family): void => {
    const next = new Set(openFamilies);
    // The family of the type on show: closing it closes the gallery too.
    if (current?.family === family) {
      next.delete(family);
      onClose();
    } else if (!next.delete(family)) next.add(family);
    setOpenFamilies(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
    } catch {
      // Storage is a convenience only.
    }
  };
  const isExpanded = (family: Family): boolean => openFamilies.has(family) || current?.family === family;
  useTypeVisuals(GALLERY_TYPES.filter((t) => isExpanded(t.family)));

  return (
    <nav className="gallery-nav" aria-label="Gallery of examples">
      <button type="button" className={`explorer-row gallery-row${open && view === null ? ' current' : ''}`} onClick={() => onShow(null)} title={open && view === null ? 'Close the gallery' : 'Every diagram type, with previews'}>
        {GRID}
        <span className="explorer-name">All examples</span>
        <span className="explorer-meta">{GALLERY_EXAMPLES.length}</span>
      </button>
      {FAMILIES.map((family) => {
        const types = GALLERY_TYPES.filter((t) => t.family === family);
        const expanded = isExpanded(family);
        return (
          <div key={family} role="group" aria-label={family}>
            <button type="button" className="explorer-row gallery-row family" aria-expanded={expanded} onClick={() => toggle(family)}>
              <span className="explorer-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              <span className="explorer-name">{family}</span>
              <span className="explorer-meta">{types.length}</span>
            </button>
            {expanded &&
              types.map((t) => <TypeRow key={t.id} type={t} current={current?.id === t.id} onShow={onShow} />)}
          </div>
        );
      })}
    </nav>
  );
}

function TypeRow({ type, current, onShow }: { type: GalleryType; current: boolean; onShow: (typeId: string) => void }): JSX.Element {
  const { preview, support, hint } = typeVisual(type);
  const count = typeExamples(type).length;
  return (
    <button
      type="button"
      className={`explorer-row gallery-row type${current ? ' current' : ''}`}
      onClick={() => onShow(type.id)}
      aria-current={current ? 'page' : undefined}
      title={current ? 'Close the gallery' : `${type.title}: ${count} example${count === 1 ? '' : 's'}${hint ? ` · ${hint}` : ''}`}
    >
      <span className="gallery-thumb" aria-hidden="true">
        {preview && 'svg' in preview ? (
          // Mermaid renders with securityLevel 'strict', and the examples are fixed text in this app.
          <span className="gallery-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} />
        ) : preview ? (
          '—'
        ) : (
          '…'
        )}
      </span>
      <span className="explorer-name">{type.title}</span>
      {support && (
        <span className={`gallery-support-dot chip-${support.toLowerCase()}`}>
          <span className="gallery-dot" aria-hidden="true" />
        </span>
      )}
      <span className="explorer-meta">{count}</span>
    </button>
  );
}
