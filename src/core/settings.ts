/**
 * App settings: values with defaults, stored per browser. There is no settings panel yet; each
 * entry describes itself (label, range) so one can list them later.
 */

export interface Settings {
  /** Size of the gallery previews (tiles and example cards), as a multiple of the base size. */
  galleryPreviewScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  galleryPreviewScale: 2,
};

/** What a settings panel needs to show and check each numeric setting. */
export const SETTING_INFO: Record<keyof Settings, { label: string; description: string; min: number; max: number; step: number }> = {
  galleryPreviewScale: {
    label: 'Gallery preview size',
    description: 'Size of the previews in the gallery, as a multiple of the base size (tiles 200 × 140 px, examples 340 × 240 px).',
    min: 0.75,
    max: 3,
    step: 0.25,
  },
};

const SETTINGS_KEY = 'merbutler:settings';

/** Keeps a stored value only if it is a number in its range; otherwise the default. */
function valid(key: keyof Settings, value: unknown): number {
  const { min, max } = SETTING_INFO[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : DEFAULT_SETTINGS[key];
}

/** The settings: stored values where they are valid, defaults for the rest. */
export function loadSettings(): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
  } catch {
    // Missing or broken storage: the defaults.
  }
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) settings[key] = valid(key, stored[key]);
  return settings;
}

/** Stores changed settings. Values out of range fall back to their defaults. */
export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  for (const key of Object.keys(next) as Array<keyof Settings>) next[key] = valid(key, next[key]);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage is a convenience only.
  }
  return next;
}
