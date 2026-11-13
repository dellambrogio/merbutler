import { describe, expect, test } from 'vitest';
import { iconSvg, loadIconPacks, mermaidIconPacks, splitIcons } from '../src/icons';
import { textSize } from '../src/layout';

describe('icons', () => {
  test('labels: fa tokens as Mermaid matches them', () => {
    expect(splitIcons('fa:fa-twitter for peace, fab:fa-github and fal:fa-x')).toEqual([
      { icon: 'fa:twitter', source: 'fa:fa-twitter' },
      { text: ' for peace, ' },
      { icon: 'fab:github', source: 'fab:fa-github' },
      { text: ' and ' },
      { icon: 'fal:x', source: 'fal:fa-x' },
    ]);
    expect(splitIcons('no icons: fa-user')).toEqual([{ text: 'no icons: fa-user' }]);
  });

  test('bundled packs: fa searches solid, brands, regular; others are not bundled', async () => {
    expect(iconSvg('fa:user')).toBeNull(); // not loaded yet
    await loadIconPacks();
    expect(iconSvg('fa:user')?.body).toContain('<path');
    expect(iconSvg('fa:twitter')?.body).toContain('<path'); // a brand in FontAwesome 6
    expect(iconSvg('fab:github')?.viewBox).toMatch(/^0 0 \d+ \d+$/);
    expect(iconSvg('far:user')?.body).not.toBe(iconSvg('fas:user')?.body);
    expect(iconSvg('fas:twitter')).toBeNull(); // brands are not in the solid pack
    expect(iconSvg('fal:user')).toBeNull();
    expect(iconSvg('mdi:cloud')).toBeNull();
    expect(iconSvg('fa:no-such-icon')).toBeNull();
  });

  test('packs for Mermaid: one per prefix, fa merges all three', async () => {
    const packs = await mermaidIconPacks();
    expect(packs.map((p) => p.name).sort()).toEqual(['fa', 'fab', 'far', 'fas']);
    const fa = packs.find((p) => p.name === 'fa')!.icons;
    expect(fa.prefix).toBe('fa');
    expect(fa.icons.twitter && fa.icons.user).toBeTruthy();
  });

  test('a bundled icon takes 1em in the layout, other tokens their text', () => {
    expect(textSize('fa:fa-twitter', false).width).toBeLessThan(textSize('fal:fa-twitter', false).width);
  });
});
