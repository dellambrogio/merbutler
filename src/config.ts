/**
 * Mermaid configuration from the code: the `config:` block of the front matter and
 * `%%{init: …}%%` directives (a directive wins, as in Mermaid).
 *
 * A small reader, not a YAML parser: nested maps of scalars, which is what the Mermaid docs use
 * for diagram config. Lists and multi-line values are skipped.
 */

export type ConfigValue = string | number | boolean | ConfigMap;
export interface ConfigMap {
  [key: string]: ConfigValue;
}

/** Front matter text (between the `---` lines) of a preamble, or ''. */
export function frontMatterOf(preamble: string | undefined): string {
  return /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(preamble ?? '')?.[1] ?? '';
}

function scalar(raw: string): ConfigValue {
  const text = raw.replace(/\s+#.*$/, '').trim();
  const quoted = /^(["'])(.*)\1$/.exec(text);
  if (quoted) return quoted[2];
  if (text === 'true' || text === 'false') return text === 'true';
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/** Nested maps from indented `key: value` lines. */
export function readYamlMaps(text: string): ConfigMap {
  const root: ConfigMap = {};
  const stack: Array<{ indent: number; map: ConfigMap }> = [{ indent: -1, map: root }];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const m = /^([ \t]*)([\w-]+)[ \t]*:(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].map;
    if (m[3].trim() === '') {
      const child: ConfigMap = {};
      parent[m[2]] = child;
      stack.push({ indent, map: child });
    } else {
      parent[m[2]] = scalar(m[3]);
    }
  }
  return root;
}

function merge(target: ConfigMap, source: ConfigMap): ConfigMap {
  for (const [key, value] of Object.entries(source)) {
    const old = target[key];
    target[key] = typeof value === 'object' && typeof old === 'object' ? merge({ ...old }, value) : value;
  }
  return target;
}

/** `%%{init: {…}}%%` directives (JSON, often with single quotes), merged in order. */
function directives(preamble: string): ConfigMap {
  const result: ConfigMap = {};
  for (const m of preamble.matchAll(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\s*\}%%/g)) {
    try {
      const parsed: unknown = JSON.parse(m[1].replace(/'/g, '"'));
      if (parsed && typeof parsed === 'object') merge(result, parsed as ConfigMap);
    } catch {
      // Not JSON: Mermaid would report it; the canvas ignores it.
    }
  }
  return result;
}

/** The diagram config from the preamble. */
export function readConfig(preamble: string | undefined): ConfigMap {
  const front = readYamlMaps(frontMatterOf(preamble));
  const config = typeof front.config === 'object' ? { ...front.config } : {};
  return merge(config, directives(preamble ?? ''));
}

/** A nested value, for example `get(config, 'flowchart', 'curve')`. */
export function get(config: ConfigMap, ...path: string[]): ConfigValue | undefined {
  let value: ConfigValue | undefined = config;
  for (const key of path) value = typeof value === 'object' ? value[key] : undefined;
  return value;
}

export function getString(config: ConfigMap, ...path: string[]): string | undefined {
  const value = get(config, ...path);
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
}
