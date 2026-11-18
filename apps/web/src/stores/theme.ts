import { create } from 'zustand';

export type Theme = 'light' | 'dark';
/** Marketing site vs. trading platform: each has its own palette and remembered theme. */
export type Surface = 'site' | 'platform';

const STORAGE_KEY: Record<Surface, string> = { site: 'brand-theme', platform: 'df-platform-theme' };
const DEFAULT_THEME: Record<Surface, Theme> = { site: 'dark', platform: 'dark' };

function storedTheme(surface: Surface): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY[surface]);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THEME[surface];
}

function readInitial(): { theme: Theme; surface: Surface } {
  if (typeof document !== 'undefined') {
    const { theme, surface } = document.documentElement.dataset;
    return {
      theme: theme === 'dark' ? 'dark' : 'light',
      surface: surface === 'platform' ? 'platform' : 'site',
    };
  }
  return { theme: 'light', surface: 'site' };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function persist(surface: Surface, theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY[surface], theme);
  } catch {
    /* storage unavailable (private mode) — theme still applies for this session */
  }
}

interface ThemeState {
  theme: Theme;
  surface: Surface;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Switch palette when entering/leaving the platform; restores that surface's theme. */
  setSurface: (surface: Surface) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  ...readInitial(),
  setTheme: (theme) => {
    const commit = () => {
      document.documentElement.dataset.theme = theme;
      persist(get().surface, theme);
      set({ theme });
    };
    // Soft crossfade via the View Transitions API where supported.
    if (
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !prefersReducedMotion()
    ) {
      document.startViewTransition(commit);
    } else {
      commit();
    }
  },
  toggleTheme: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light'),
  setSurface: (surface) => {
    const theme = storedTheme(surface);
    document.documentElement.dataset.surface = surface;
    document.documentElement.dataset.theme = theme;
    set({ surface, theme });
  },
}));
