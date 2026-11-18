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

  it('the platform is dark by default and remembers its own theme', () => {
    const s = useThemeStore.getState();
    s.setSurface('platform');
    expect(document.documentElement.dataset).toMatchObject({ surface: 'platform', theme: 'dark' });
    useThemeStore.getState().toggleTheme();
    expect(localStorage.getItem('df-platform-theme')).toBe('light');
    expect(localStorage.getItem('brand-theme')).toBeNull();

    useThemeStore.getState().setSurface('site');
    expect(document.documentElement.dataset).toMatchObject({ surface: 'site', theme: 'dark' });
    useThemeStore.getState().setSurface('platform');
    expect(useThemeStore.getState().theme).toBe('light');
  });
});
