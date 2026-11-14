import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/core/settings';

describe('settings', () => {
  beforeEach(() => localStorage.clear());

  test('defaults: gallery previews at double size', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings().galleryPreviewScale).toBe(2);
  });

  test('stored values are kept when valid, and fall back to the default otherwise', () => {
    saveSettings({ galleryPreviewScale: 1.5 });
    expect(loadSettings().galleryPreviewScale).toBe(1.5);
    saveSettings({ galleryPreviewScale: 50 });
    expect(loadSettings().galleryPreviewScale).toBe(2);
    localStorage.setItem('merbutler:settings', '{broken');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem('merbutler:settings', '{"galleryPreviewScale":"big","unknown":1}');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
