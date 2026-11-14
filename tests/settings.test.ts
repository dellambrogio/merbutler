import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, loadSettings, resetSettings, saveSettings } from '../src/core/settings';

describe('settings', () => {
  beforeEach(() => localStorage.clear());

  test('defaults', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings().galleryPreviewScale).toBe(2);
    expect(loadSettings().theme).toBe('system');
    expect(loadSettings().syntaxFollowCursor).toBe(false);
  });

  test('stored values are kept when valid, and fall back to the default otherwise', () => {
    saveSettings({ galleryPreviewScale: 1.5 });
    expect(loadSettings().galleryPreviewScale).toBe(1.5);
    saveSettings({ galleryPreviewScale: 50 });
    expect(loadSettings().galleryPreviewScale).toBe(2);
    localStorage.setItem('merbutler:settings', '{broken');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem('merbutler:settings', '{"galleryPreviewScale":"big","theme":"pink","editorLineWrap":"yes","unknown":1}');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('every kind of setting is stored', () => {
    const changed = { theme: 'dark', editorFontSize: 16, editorLineWrap: false, syntaxTooltips: false, syntaxFollowCursor: true } as const;
    saveSettings(changed);
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, ...changed });
    expect(getSettings().theme).toBe('dark');
    resetSettings();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('the code font size stored before it was a setting is kept', () => {
    localStorage.setItem('merbutler:editorFontSize', '18');
    expect(loadSettings().editorFontSize).toBe(18);
    saveSettings({ theme: 'light' });
    expect(localStorage.getItem('merbutler:editorFontSize')).toBeNull();
    expect(loadSettings().editorFontSize).toBe(18);
  });
});
