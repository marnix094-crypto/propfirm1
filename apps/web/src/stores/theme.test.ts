import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from './theme';

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: 'light', surface: 'site' });
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.surface = 'site';
  });

  it('toggles and persists', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('brand-theme')).toBe('dark');
  });

  it('the platform is light only and leaves the site theme alone', () => {
    const s = useThemeStore.getState();
    s.setSurface('platform');
    expect(document.documentElement.dataset).toMatchObject({ surface: 'platform', theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('brand-theme')).toBeNull();

    useThemeStore.getState().setSurface('site');
    expect(document.documentElement.dataset).toMatchObject({ surface: 'site', theme: 'dark' });
  });
});
