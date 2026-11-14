/**
 * The app's state in the URL after `#`, so a link opens the same diagram and view:
 *
 *   #gallery=state-diagram&code=<deflated, base64url>
 *
 * - `code`: the Mermaid code, compressed (deflate-raw) and base64url-encoded. Browsers without
 *   CompressionStream write `text=` (plain UTF-8, base64url) instead; both are read.
 * - `gallery`: the gallery is open, on the overview (`gallery=`) or a type's page (`gallery=<type id>`).
 *   Missing: the gallery is closed.
 *
 * Unknown keys are ignored, so later versions can add more.
 */

export interface UrlState {
  /** The Mermaid code, or undefined when the URL has none. */
  code?: string;
  /** null: the gallery is closed. '': the overview. Otherwise a type id. */
  gallery: string | null;
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
