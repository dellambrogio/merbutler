import { useEffect, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';

/** One entry of a context menu: an action, a submenu, or a separator. */
export type MenuItem =
  | { kind: 'action'; label: string; onSelect: () => void; disabled?: boolean; danger?: boolean; checked?: boolean; hint?: string }
  | { kind: 'submenu'; label: string; items: MenuItem[]; disabled?: boolean }
  | { kind: 'separator' };

export const action = (label: string, onSelect: () => void, extra: { disabled?: boolean; danger?: boolean; checked?: boolean; hint?: string } = {}): MenuItem => ({ kind: 'action', label, onSelect, ...extra });
export const submenu = (label: string, items: MenuItem[], disabled = false): MenuItem => ({ kind: 'submenu', label, items, disabled: disabled || items.length === 0 });
export const separator: MenuItem = { kind: 'separator' };

interface ContextMenuProps {
  /** Position in the canvas, in px from its top left corner. */
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}

/** Drops separators at the start, at the end and next to each other. */
function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    if (item.kind === 'separator' && (out.length === 0 || out[out.length - 1].kind === 'separator')) continue;
    out.push(item);
  }
  while (out.length > 0 && out[out.length - 1].kind === 'separator') out.pop();
  return out;
}

/**
 * A context menu: a list of actions with submenus. Arrow keys move, Enter or Space chooses,
 * Right and Left open and close a submenu, Escape closes. A click outside closes it.
 */
export function ContextMenu({ x, y, title, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });

  // Keep the menu inside the canvas.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const left = Math.max(4, Math.min(x, parent.clientWidth - el.offsetWidth - 4));
    const top = Math.max(4, Math.min(y, parent.clientHeight - el.offsetHeight - 4));
    setPlace({ left, top });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onBlur = (): void => onClose();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose]);

  return (
    <div className="context-menu" ref={ref} style={place} role="menu" aria-label={title ?? 'Menu'} onContextMenu={(e) => e.preventDefault()}>
      {title && <div className="context-menu-title">{title}</div>}
      <MenuList items={tidy(items)} onClose={onClose} />
    </div>
  );
}

function MenuList({ items, onClose, onBack }: { items: MenuItem[]; onClose: () => void; onBack?: () => void }): JSX.Element {
  const [open, setOpen] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const focusable = (): HTMLElement[] => [...(list.current?.querySelectorAll<HTMLElement>(':scope > .context-menu-entry > [role^="menuitem"]') ?? [])];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const all = focusable();
    const index = all.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const move = (step: number): void => {
      e.preventDefault();
      e.stopPropagation();
      all[(index + step + all.length) % all.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onBack) onBack();
      else onClose();
    } else if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    }
  };

  return (
    <div className="context-menu-list" ref={list} onKeyDown={onKeyDown}>
      {items.map((item, i) => {
        if (item.kind === 'separator') return <div key={i} className="context-menu-separator" role="separator" />;
        if (item.kind === 'action') {
          return (
            <div key={i} className="context-menu-entry">
              <button
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                aria-disabled={item.disabled || undefined}
                className={`context-menu-item${item.danger ? ' danger' : ''}`}
                tabIndex={-1}
                onMouseEnter={(e) => {
                  setOpen(null);
                  e.currentTarget.focus();
                }}
                onClick={() => {
                  if (item.disabled) return;
                  onClose();
                  item.onSelect();
                }}
              >
                <span className="context-menu-check">{item.checked ? '✓' : ''}</span>
                <span className="context-menu-label">{item.label}</span>
                {item.hint && <span className="context-menu-hint">{item.hint}</span>}
              </button>
            </div>
          );
        }
        const opened = open === i && !item.disabled;
        return (
          <div key={i} className="context-menu-entry">
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={opened}
              aria-disabled={item.disabled || undefined}
              className="context-menu-item"
              tabIndex={-1}
              onMouseEnter={(e) => {
                setOpen(i);
                e.currentTarget.focus();
              }}
              onClick={() => setOpen(opened ? null : i)}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && !item.disabled) {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(i);
                  requestAnimationFrame(() => e.currentTarget.parentElement?.querySelector<HTMLElement>('.context-menu-sub [role^="menuitem"]')?.focus());
                }
              }}
            >
              <span className="context-menu-check" />
              <span className="context-menu-label">{item.label}</span>
              <span className="context-menu-hint">▸</span>
            </button>
            {opened && (
              <div className="context-menu context-menu-sub" role="menu" aria-label={item.label}>
                <MenuList
                  items={tidy(item.items)}
                  onClose={onClose}
                  onBack={() => {
                    setOpen(null);
                    focusable()[i]?.focus();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
