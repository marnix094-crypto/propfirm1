import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/theme';

export interface ChartColors {
  text: string;
  muted: string;
  grid: string;
  border: string;
  primary: string;
  aqua: string;
  profit: string;
  loss: string;
  card: string;
}

const read = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Chart colours come from tokens.css so charts follow the palette and the theme. */
export function useChartColors(): ChartColors {
  const theme = useThemeStore((s) => s.theme);
  const surface = useThemeStore((s) => s.surface);
  const compute = (): ChartColors => ({
    text: read('--text'),
    muted: read('--text-muted'),
    grid: read('--border'),
    border: read('--border'),
    primary: read('--chart-line'),
    aqua: read('--glow-aqua'),
    profit: read('--profit'),
    loss: read('--loss'),
    card: read('--card'),
  });
  const [colors, setColors] = useState<ChartColors>(compute);
  useEffect(() => {
    // Wait a frame so the new theme's variables are applied (view transitions).
    const id = requestAnimationFrame(() => setColors(compute()));
    return () => cancelAnimationFrame(id);
  }, [theme, surface]);
  return colors;
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
