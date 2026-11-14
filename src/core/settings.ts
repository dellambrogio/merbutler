/**
 * App settings: values with defaults, stored per browser in localStorage. Each entry describes
 * itself (label, kind, range or choices), so the Settings dialog lists them all.
 */
import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** Light or dark colors, or follow the system. */
  theme: Theme;
  /** Text size of the code editor, in px. */
  editorFontSize: number;
  /** Long lines in the code editor wrap instead of scrolling sideways. */
  editorLineWrap: boolean;
  /** Hovering over a keyword or arrow in the code shows its syntax reference. */
  syntaxTooltips: boolean;
  /** The Syntax panel marks the entry for the keyword or arrow at the cursor, or the selected one. */
  syntaxFollowCursor: boolean;
  /** Size of the gallery previews (tiles and example cards), as a multiple of the base size. */
  galleryPreviewScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  editorFontSize: 13,
  editorLineWrap: true,
  syntaxTooltips: true,
  syntaxFollowCursor: false,
  galleryPreviewScale: 2,
};

interface Info {
  label: string;
  description: string;
  /** The Settings dialog's group. */
  group: 'Appearance' | 'Code editor' | 'Syntax panel' | 'Gallery';
}
export type SettingInfo =
  | (Info & { kind: 'number'; min: number; max: number; step: number; unit?: string })
  | (Info & { kind: 'boolean' })
  | (Info & { kind: 'choice'; choices: ReadonlyArray<{ value: string; label: string }> });

/** What the Settings dialog shows, and what a stored value must be to be kept. In the dialog's order. */
export const SETTING_INFO: { [K in keyof Settings]: SettingInfo } = {
  theme: {
    kind: 'choice',
    group: 'Appearance',
    label: 'Theme',
    description: 'Light or dark colors for the app. System follows the setting of your computer.',
    choices: [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
  editorFontSize: {
    kind: 'number',
    group: 'Code editor',
    label: 'Font size',
    description: 'Text size of the code. Ctrl+Alt+= and Ctrl+Alt+− change it too.',
    min: 10,
    max: 24,
    step: 1,
    unit: 'px',
  },
  editorLineWrap: {
    kind: 'boolean',
    group: 'Code editor',
    label: 'Wrap long lines',
    description: 'Long lines continue on the next line instead of scrolling sideways.',
  },
  syntaxTooltips: {
    kind: 'boolean',
    group: 'Code editor',
    label: 'Syntax tooltips',
    description: 'Hovering over a keyword or arrow in the code shows what it means.',
  },
  syntaxFollowCursor: {
    kind: 'boolean',
    group: 'Syntax panel',
    label: 'Highlight syntax',
    description: 'The Syntax panel marks and scrolls to the entry for the keyword or arrow at the cursor, or the one you select. Off: the panel is a plain reference.',
  },
  galleryPreviewScale: {
    kind: 'number',
    group: 'Gallery',
    label: 'Preview size',
    description: 'Size of the previews in the gallery, as a multiple of the base size (tiles 200 × 140 px, examples 340 × 240 px).',
    min: 0.75,
    max: 3,
    step: 0.25,
    unit: '×',
  },
};

const SETTINGS_KEY = 'merbutler:settings';
/** Where the code font size was kept before it was a setting. Read once, so it is not lost. */
const OLD_FONT_KEY = 'merbutler:editorFontSize';

/** Keeps a stored value only if it fits its setting; otherwise the default. */
function valid<K extends keyof Settings>(key: K, value: unknown): Settings[K] {
  const info = SETTING_INFO[key];
  const ok =
    info.kind === 'number'
      ? typeof value === 'number' && Number.isFinite(value) && value >= info.min && value <= info.max
      : info.kind === 'boolean'
        ? typeof value === 'boolean'
        : info.choices.some((c) => c.value === value);
  return (ok ? value : DEFAULT_SETTINGS[key]) as Settings[K];
}

function validAll(values: Record<string, unknown>): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) (settings as Record<keyof Settings, unknown>)[key] = valid(key, values[key]);
  return settings;
}

/** The settings: stored values where they are valid, defaults for the rest. */
export function loadSettings(): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') stored = { ...(parsed as Record<string, unknown>) };
    if (stored.editorFontSize === undefined) {
      const old = localStorage.getItem(OLD_FONT_KEY);
      if (old !== null) stored.editorFontSize = Number(old);
    }
  } catch {
    // Missing or broken storage: the defaults.
  }
  return validAll(stored);
}

// ---- A store, so every component sees changes at once ----

let current: Settings | null = null;
const listeners = new Set<() => void>();

/** The settings now (read from storage once). */
export function getSettings(): Settings {
  current ??= loadSettings();
  return current;
}

/** Stores changed settings and tells every user of them. Values that do not fit fall back to their defaults. */
export function saveSettings(patch: Partial<Settings>): Settings {
  const next = validAll({ ...loadSettings(), ...patch });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    localStorage.removeItem(OLD_FONT_KEY);
  } catch {
    // Storage is a convenience only: the change still applies until the page is closed.
  }
  current = next;
  for (const listener of listeners) listener();
  return next;
}

/** Puts every setting back to its default. */
export function resetSettings(): Settings {
  return saveSettings({ ...DEFAULT_SETTINGS });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the settings.
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== null && e.key !== SETTINGS_KEY) return;
    current = loadSettings();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The settings, in a component: it renders again when they change (here or in another tab). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
