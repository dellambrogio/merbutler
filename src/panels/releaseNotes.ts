/**
 * The release notes, read from CHANGELOG.md at build time, for the About dialog. CHANGELOG.md is the
 * one place they are written; `tests/releaseNotes.test.ts` checks that the version in package.json
 * has its section.
 */
import changelog from '../../CHANGELOG.md?raw';

export interface Release {
  /** `0.1.0`, or null for the Unreleased section. */
  version: string | null;
  /** `2026-11-14`, when released. */
  date: string | null;
  /** Paragraphs before the list. */
  intro: string[];
  /** The list items, each joined into one line. */
  items: string[];
}

/** Reads `## 0.1.0 — 2026-11-14` (or `## Unreleased`) sections: paragraphs, then `- ` items. */
export function parseReleaseNotes(text: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;
  let paragraph: string[] = [];
  const endParagraph = (): void => {
    if (current && paragraph.length > 0) current.intro.push(paragraph.join(' '));
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      endParagraph();
      const m = /^(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(\S+))?/.exec(heading[1].trim());
      current = { version: m ? m[1] : null, date: m?.[2] ?? null, intro: [], items: [] };
      releases.push(current);
      continue;
    }
    if (!current) continue;
    if (/^- /.test(line)) {
      endParagraph();
      current.items.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(line) && current.items.length > 0 && paragraph.length === 0) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() === '') {
      endParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  return releases;
}

export const RELEASES: readonly Release[] = parseReleaseNotes(changelog);

/** The released versions, newest first (not the Unreleased section). */
export const RELEASED: readonly Release[] = RELEASES.filter((r) => r.version !== null);
