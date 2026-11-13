/**
 * Icons for labels (`fa:fa-twitter`) and icon shapes (`@{ icon: "fa:user" }`).
 *
 * Mermaid looks icons up in registered icon packs (`prefix:name`). The app bundles the free
 * FontAwesome 6 packs and loads them on first use, so no icon ever comes from the network:
 * `fas` solid, `far` regular, `fab` brands, and `fa` all three (solid first), because
 * FontAwesome 4 names such as `fa:fa-twitter` are brands in FontAwesome 6. Paid packs
 * (`fal`, `fak`, `fad`) and other icon sets are not bundled: their names stay as text.
 */
import { useSyncExternalStore } from 'react';
import type { IconifyJSON } from '@iconify/types';
import { getIconData, iconToSVG } from '@iconify/utils';

/** `fa:fa-name` in a label, as Mermaid matches it. */
export const LABEL_ICON = /(fa[bklrs]?):fa-([\w-]+)/g;

/** Prefixes the bundled packs answer. */
export const BUNDLED_PREFIXES = new Set(['fa', 'fas', 'far', 'fab']);

type Packs = Record<string, IconifyJSON[]>;

let packs: Packs | null = null;
let loading: Promise<Packs> | null = null;
const listeners = new Set<() => void>();

/** Loads the packs once (as their own chunks) and tells the components that wait for them. */
export function loadIconPacks(): Promise<Packs> {
  loading ??= Promise.all([
    import('@iconify-json/fa6-solid/icons.json'),
    import('@iconify-json/fa6-regular/icons.json'),
    import('@iconify-json/fa6-brands/icons.json'),
  ]).then(([solid, regular, brands]) => {
    const [s, r, b] = [solid, regular, brands].map((m) => ((m as { default?: IconifyJSON }).default ?? m) as IconifyJSON);
    packs = { fa: [s, b, r], fas: [s], far: [r], fab: [b] };
    for (const listener of listeners) listener();
    return packs;
  });
  return loading;
}

export interface IconSvg {
  body: string;
  viewBox: string;
}

/** The SVG of `prefix:name` from loaded packs, or null (not bundled, unknown, or not loaded yet). */
export function iconSvg(name: string): IconSvg | null {
  const colon = name.indexOf(':');
  if (colon < 0 || !packs) return null;
  for (const pack of packs[name.slice(0, colon)] ?? []) {
    const data = getIconData(pack, name.slice(colon + 1));
    if (data) {
      const svg = iconToSVG(data);
      return { body: svg.body, viewBox: svg.attributes.viewBox };
    }
  }
  return null;
}

/** True if the name could be one of the bundled icons (decided before the packs load). */
export function maybeBundled(name: string): boolean {
  return BUNDLED_PREFIXES.has(name.slice(0, name.indexOf(':')));
}

/**
 * The SVG of an icon for a component, or null. Starts loading the packs when a bundled
 * prefix is asked for; the component renders again when they are loaded.
 */
export function useIcon(name: string | null): IconSvg | null {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => packs,
  );
  if (!name) return null;
  if (!packs && maybeBundled(name)) void loadIconPacks();
  return iconSvg(name);
}

/** Label text split into text and `fa:fa-name` icons, in order. */
export function splitIcons(text: string): Array<{ text: string } | { icon: string; source: string }> {
  const parts: Array<{ text: string } | { icon: string; source: string }> = [];
  let last = 0;
  for (const m of text.matchAll(LABEL_ICON)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ icon: `${m[1]}:${m[2]}`, source: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Packs for Mermaid's own rendering (the gallery previews), in Mermaid's format. */
export async function mermaidIconPacks(): Promise<Array<{ name: string; icons: IconifyJSON }>> {
  const loaded = await loadIconPacks();
  return Object.entries(loaded).map(([name, list]) => ({
    name,
    // Several packs under one name (`fa`): the first that has an icon wins, as on the canvas.
    icons: {
      ...list[0],
      prefix: name,
      icons: Object.assign({}, ...[...list].reverse().map((p) => p.icons)),
      aliases: Object.assign({}, ...[...list].reverse().map((p) => p.aliases ?? {})),
    },
  }));
}
