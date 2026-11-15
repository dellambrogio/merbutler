import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseReleaseNotes, RELEASED, RELEASES } from '../src/panels/releaseNotes';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

describe('release notes (CHANGELOG.md)', () => {
  test('the version in package.json has its notes, with a date and at least one item', () => {
    const release = RELEASED.find((r) => r.version === pkg.version);
    expect(release, `CHANGELOG.md needs a "## ${pkg.version} — YYYY-MM-DD" section`).toBeDefined();
    expect(release!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(release!.items.length).toBeGreaterThan(0);
  });

  test('an Unreleased section comes first, then versions from newest to oldest', () => {
    expect(RELEASES[0].version).toBeNull();
    const versions = RELEASED.map((r) => r.version!.split('.').map(Number));
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [versions[i - 1], versions[i]];
      const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      expect(newer, `${RELEASED[i - 1].version} before ${RELEASED[i].version}`).toBeGreaterThan(0);
    }
  });

  test('parsing: headings, paragraphs and items over several lines', () => {
    const notes = parseReleaseNotes('# Notes\n\nIntro.\n\n## Unreleased\n\n- Soon\n\n## 1.2.0 — 2026-12-01\n\nThe best.\n\n- One\n  and more\n- Two\n');
    expect(notes).toEqual([
      { version: null, date: null, intro: [], items: ['Soon'] },
      { version: '1.2.0', date: '2026-12-01', intro: ['The best.'], items: ['One and more', 'Two'] },
    ]);
  });
});
