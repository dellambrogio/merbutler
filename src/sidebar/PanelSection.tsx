import { useState, type JSX, type ReactNode } from 'react';

/** Sections open by default that the user closed. */
const CLOSED_KEY = 'merbutler:closedSections';
/** Sections closed by default that the user opened. */
const OPENED_KEY = 'merbutler:openedSections';

function loadList(key: string): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether a section is open, remembered in this browser when it differs from the default. */
function useSectionOpen(id: string, defaultOpen: boolean): [boolean, () => void] {
  const key = defaultOpen ? CLOSED_KEY : OPENED_KEY;
  const [open, setOpen] = useState(() => loadList(key).includes(id) !== defaultOpen);
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    try {
      const others = loadList(key).filter((x) => x !== id);
      localStorage.setItem(key, JSON.stringify(next === defaultOpen ? others : [...others, id]));
    } catch {
      // Storage is a convenience only.
    }
  };
  return [open, toggle];
}

/**
 * One panel of the side column: a header with a triangle that opens and closes it, optional
 * actions on the right, and the content. A `grow` section takes the free height while open.
 */
export function PanelSection({ id, title, actions, grow = false, defaultOpen = true, children }: {
  id: string;
  title: string;
  /** Controls shown in the header while the section is open. */
  actions?: ReactNode;
  grow?: boolean;
  /** Open until the user closes it (the default), or closed until the user opens it. */
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  return (
    <section className={`side-section${open ? ' open' : ''}${grow && open ? ' grow' : ''}`} aria-label={title}>
      <div className="side-section-head">
        <button type="button" className="side-section-toggle" aria-expanded={open} onClick={toggle} title={open ? `Close ${title}` : `Open ${title}`}>
          <span className="side-section-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        <span className="spacer" />
        {open && actions}
      </div>
      {open && <div className="side-section-body">{children}</div>}
    </section>
  );
}
