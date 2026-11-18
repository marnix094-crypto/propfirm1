import { useEffect } from 'react';
import { useFirmBranding } from '@/hooks/use-firm';
import { brandPalette, isHexColor } from '@/lib/brand-color';
import { cn } from '@/lib/cn';
import { Logo, LogoMark } from './logo';

/** CSS variables a firm's brand colour overrides on the platform surface. */
const BRAND_VARS = [
  '--brand-lime',
  '--primary',
  '--primary-light',
  '--primary-tint',
  '--btn-primary-from',
  '--btn-primary-to',
  '--btn-primary-fg',
  '--accent-deep',
  '--text-link',
  '--focus-ring',
  '--card-highlight',
  '--brand-on-ink',
] as const;

/** Applies the firm's colour to the platform (white-label, D89). The website keeps our brand. */
export function applyBrandColor(hex: string | null | undefined, root = document.documentElement) {
  for (const v of BRAND_VARS) root.style.removeProperty(v);
  if (!hex || !isHexColor(hex)) return;
  const p = brandPalette(hex);
  const set = (k: (typeof BRAND_VARS)[number], v: string) => root.style.setProperty(k, v);
  set('--brand-lime', p.fill);
  set('--primary', p.fill);
  set('--primary-light', p.fill);
  set('--primary-tint', p.tint);
  set('--btn-primary-from', p.fill);
  set('--btn-primary-to', p.fill);
  set('--btn-primary-fg', p.onFill);
  set('--accent-deep', p.deep);
  set('--text-link', p.deep);
  set('--focus-ring', p.deep);
  set('--brand-on-ink', p.onInk);
  set(
    '--card-highlight',
    `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${p.fill} 28%, transparent) 0%, transparent 55%), #ffffff`,
  );
}

/** Mount inside platform layouts: brand colour on while mounted, removed on exit. */
export function useFirmTheme() {
  const firm = useFirmBranding();
  const color = firm.data?.primaryColor ?? null;
  useEffect(() => {
    applyBrandColor(color);
    return () => applyBrandColor(null);
  }, [color]);
}

/** The firm's logo: uploaded image, else its name, else (default firm) the Daily Funded logo. */
export function FirmLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const firm = useFirmBranding().data;
  if (!firm || firm.isDefault) {
    return compact ? <LogoMark className={className} /> : <Logo className={className} />;
  }
  if (firm.logoDataUrl) {
    return (
      <img
        src={firm.logoDataUrl}
        alt={firm.name}
        className={cn(
          'w-auto max-w-[180px] shrink-0 object-contain object-left',
          className,
          compact ? 'size-8' : 'h-8',
        )}
      />
    );
  }
  return compact ? (
    <span
      role="img"
      aria-label={firm.name}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-ink)] text-sm font-bold text-[var(--brand-on-ink)]',
        className,
      )}
    >
      {firm.name.slice(0, 1).toUpperCase()}
    </span>
  ) : (
    <span className="truncate text-lg leading-none font-extrabold tracking-tight">{firm.name}</span>
  );
}
