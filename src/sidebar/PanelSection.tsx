import { useState, type JSX, type ReactNode } from 'react';

const KEY = 'merbutler:closedSections';

function loadClosed(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether a section is open, remembered in this browser. */
function useSectionOpen(id: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => !loadClosed().includes(id));
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    try {
      const closed = loadClosed().filter((x) => x !== id);
      localStorage.setItem(KEY, JSON.stringify(next ? closed : [...closed, id]));
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
export function PanelSection({ id, title, actions, grow = false, children }: {
  id: string;
  title: string;
  /** Controls shown in the header while the section is open. */
  actions?: ReactNode;
  grow?: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, toggle] = useSectionOpen(id);
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
