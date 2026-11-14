import type { Theme } from '../core/settings';

/**
 * Forces light or dark colors with `data-theme` on the root element, or removes it to follow the
 * system (styles.css reads both).
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
