/**
 * The app's state in the URL after `#`, so a link opens the same diagram and view:
 *
 *   #gallery=state-diagram&code=<deflated, base64url>
 *
 * - `code`: the Mermaid code, compressed (deflate-raw) and base64url-encoded. Browsers without
 *   CompressionStream write `text=` (plain UTF-8, base64url) instead; both are read.
 * - `gallery`: the gallery is open, on the overview (`gallery=`) or a type's page (`gallery=<type id>`).
 *   Missing: the gallery is closed.
 * - `open`: the canvas panels that can be closed and are open, `.`-separated (`open=classes`).
 * - `move`: canvas panels the user dragged, as `name_x_y` in pixels, `.`-separated
 *   (`move=toolbar_40_0.inspector_-120_30`). A panel left out is in its own place.
 * - `split`: the width of the code editor, in percent of the window (`split=35.5`).
 * - `editorsplit`: the width of an outline or table editor, in percent of the area next to the code.
 *
 * Unknown keys are ignored, so later versions can add more.
 */

export interface UrlState {
  /** The Mermaid code, or undefined when the URL has none. */
  code?: string;
  /** null: the gallery is closed. '': the overview. Otherwise a type id. */
  gallery: string | null;
  /** The canvas panels; missing when all are closed and in their own place. */
  panels?: PanelLayout;
  /** Code editor width in percent; missing: the default. */
  split?: number;
  /** Outline or table editor width in percent; missing: the default. */
  editorSplit?: number;
}

/** An offset in pixels from a panel's own place. */
export interface PanelOffset {
  x: number;
  y: number;
}

/** Which canvas panels are open, and where the user dragged them. */
export interface PanelLayout {
  /** Names of the open panels among those that can be closed. */
  open: string[];
  /** Offsets of the dragged panels, by name. */
  at: Record<string, PanelOffset>;
}

export const NO_PANELS: PanelLayout = { open: [], at: {} };

const PANEL_NAME = /^[a-z][a-z0-9-]*$/;

function writePanels(panels: PanelLayout | undefined): string[] {
  if (!panels) return [];
  const params: string[] = [];
  const open = panels.open.filter((n) => PANEL_NAME.test(n));
  if (open.length > 0) params.push(`open=${open.join('.')}`);
  const moved = Object.entries(panels.at)
    .filter(([n, at]) => PANEL_NAME.test(n) && (Math.round(at.x) !== 0 || Math.round(at.y) !== 0))
    .map(([n, at]) => `${n}_${Math.round(at.x)}_${Math.round(at.y)}`);
  if (moved.length > 0) params.push(`move=${moved.join('.')}`);
  return params;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A width in percent, between 5 and 95; anything else is left out. */
function readPercent(text: string | null): number | undefined {
  if (text === null || !/^\d{1,2}(\.\d)?$/.test(text)) return undefined;
  const n = Number(text);
  return n >= 5 && n <= 95 ? n : undefined;
}

function readPanels(params: URLSearchParams): PanelLayout | undefined {
  const open = (params.get('open') ?? '').split('.').filter((n) => PANEL_NAME.test(n));
  const at: Record<string, PanelOffset> = {};
  for (const part of (params.get('move') ?? '').split('.')) {
    const m = /^([a-z][a-z0-9-]*)_(-?\d+)_(-?\d+)$/.exec(part);
    if (m && (m[2] !== '0' || m[3] !== '0')) at[m[1]] = { x: Number(m[2]), y: Number(m[3]) };
  }
  return open.length > 0 || Object.keys(at).length > 0 ? { open, at } : undefined;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = new Response(input.pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>));
  return new Uint8Array(await out.arrayBuffer());
}

const canCompress = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** The `#…` part of the URL for a state, without the `#`. */
export async function writeHash(state: UrlState): Promise<string> {
  const params: string[] = [];
  if (state.gallery !== null) params.push(`gallery=${encodeURIComponent(state.gallery)}`);
  params.push(...writePanels(state.panels));
  if (state.split !== undefined) params.push(`split=${round1(state.split)}`);
  if (state.editorSplit !== undefined) params.push(`editorsplit=${round1(state.editorSplit)}`);
  if (state.code !== undefined) {
    const bytes = new TextEncoder().encode(state.code);
    params.push(canCompress() ? `code=${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}` : `text=${toBase64Url(bytes)}`);
  }
  return params.join('&');
}

/** Reads the state from a URL hash (with or without the `#`). A part that cannot be read is left out. */
export async function readHash(hash: string): Promise<UrlState> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: UrlState = { gallery: params.has('gallery') ? params.get('gallery') ?? '' : null };
  const panels = readPanels(params);
  if (panels) state.panels = panels;
  const split = readPercent(params.get('split'));
  if (split !== undefined) state.split = split;
  const editorSplit = readPercent(params.get('editorsplit'));
  if (editorSplit !== undefined) state.editorSplit = editorSplit;
  try {
    const code = params.get('code');
    const text = params.get('text');
    if (code !== null && canCompress()) state.code = new TextDecoder().decode(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')));
    else if (text !== null) state.code = new TextDecoder().decode(fromBase64Url(text));
  } catch {
    // A broken link: keep the code the app already has.
  }
  return state;
}
