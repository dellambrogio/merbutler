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

/** `%%{init: {…}}%%` directives (JSON, often with single quotes), merged in order. They win over the front matter. */
export function directives(preamble: string): ConfigMap {
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

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

/**
 * Sets a value under `config:` in the front matter of a preamble, for example
 * `setConfigValue(preamble, ['elk', 'preset'], 'legacy')`; undefined removes it. Only the lines of
 * that value change: other keys, comments and the order stay. A missing front matter is added; one
 * left empty is removed, as are maps left empty.
 */
export function setConfigValue(preamble: string | undefined, path: string[], value: string | number | boolean | undefined): string {
  const text = preamble ?? '';
  const m = FRONT_MATTER.exec(text);
  const rest = m ? text.slice(m[0].length) : text;
  const yaml = setYamlValue(m ? m[1] : '', ['config', ...path], value);
  const front = yaml.trim() === '' ? '' : `---\n${yaml}\n---`;
  return front && rest ? `${front}\n${rest}` : front || rest;
}

const isContent = (line: string): boolean => line.trim() !== '' && !line.trim().startsWith('#');
const indentOf = (line: string): number => /^[ \t]*/.exec(line)![0].length;

function yamlScalar(value: string | number | boolean): string {
  return typeof value === 'string' && !/^[\w.-]+$/.test(value) ? JSON.stringify(value) : String(value);
}

/** Sets or removes a nested `key: value` in YAML text (indented maps, as readYamlMaps reads them). */
export function setYamlValue(text: string, path: string[], value: string | number | boolean | undefined): string {
  const lines = text === '' ? [] : text.split('\n');
  const unit = lines.find((l) => isContent(l) && indentOf(l) > 0)?.match(/^[ \t]*/)?.[0].length ?? 2;
  /** The end of the block that starts at line `at` (a key at `indent`): after its last indented content line. */
  const blockEnd = (at: number, indent: number): number => {
    let end = at + 1;
    for (let i = at + 1; i < lines.length; i++) {
      if (!isContent(lines[i])) continue;
      if (indentOf(lines[i]) <= indent) break;
      end = i + 1;
    }
    return end;
  };
  const headers: Array<{ at: number; indent: number }> = [];
  let start = 0;
  let end = lines.length;
  let parentIndent = -1;
  for (let depth = 0; depth < path.length; depth++) {
    const key = path[depth];
    const last = depth === path.length - 1;
    let childIndent = Infinity;
    for (let i = start; i < end; i++) if (isContent(lines[i])) childIndent = Math.min(childIndent, indentOf(lines[i]));
    if (childIndent === Infinity) childIndent = parentIndent < 0 ? 0 : parentIndent + unit;
    const keyLine = new RegExp(`^[ \\t]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*:(.*)$`);
    let found = -1;
    for (let i = start; i < end; i++) {
      if (isContent(lines[i]) && indentOf(lines[i]) === childIndent && keyLine.test(lines[i])) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      if (value === undefined) return text;
      const added = path.slice(depth).map((k, j) => `${' '.repeat(childIndent + j * unit)}${k}:${depth + j === path.length - 1 ? ` ${yamlScalar(value)}` : ''}`);
      lines.splice(end, 0, ...added);
      return lines.join('\n');
    }
    const blockStop = blockEnd(found, childIndent);
    if (last) {
      if (value === undefined) {
        lines.splice(found, blockStop - found);
        // Maps left without content go too, innermost first.
        for (const h of headers.reverse()) {
          const stop = blockEnd(h.at, h.indent);
          if (stop === h.at + 1) lines.splice(h.at, 1);
          else break;
        }
      } else {
        lines.splice(found, blockStop - found, `${' '.repeat(childIndent)}${key}: ${yamlScalar(value)}`);
      }
      return lines.join('\n');
    }
    // A scalar where a map is wanted: it becomes the map.
    const inline = keyLine.exec(lines[found])![1].replace(/\s+#.*$/, '').trim();
    if (inline !== '') {
      if (value === undefined) return text;
      lines[found] = `${' '.repeat(childIndent)}${key}:`;
    }
    headers.push({ at: found, indent: childIndent });
    start = found + 1;
    end = inline !== '' ? found + 1 : blockStop;
    parentIndent = childIndent;
  }
  return lines.join('\n');
}
