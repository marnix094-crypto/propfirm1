import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Temporary: the spec'd primary button (white on #38BDF8→#0EA5E9) does not meet WCAG AA.
 * These variants let the product owner choose. Remove after the decision.
 */
const VARIANTS: { key: 'spec' | 'navy' | 'deep'; ratio: string; style: CSSProperties }[] = [
  { key: 'spec', ratio: '2.1–2.8 : 1', style: {} },
  { key: 'navy', ratio: '5.6–7.3 : 1', style: { '--btn-primary-fg': '#0B2540' } as CSSProperties },
  {
    key: 'deep',
    ratio: '5.2–5.9 : 1',
    style: { '--btn-primary-from': '#0369A1', '--btn-primary-to': '#2563EB' } as CSSProperties,
  },
];

export function ContrastLab() {
  const { t } = useTranslation();
  return (
    <div className="rounded-[20px] border border-dashed border-border-strong p-4 sm:p-5">
      <p className="text-sm font-semibold">{t('design.contrast.title')}</p>
      <p className="mt-1 text-sm text-muted">{t('design.contrast.body')}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {VARIANTS.map((v) => (
          <div key={v.key} style={v.style} className="flex flex-col items-start gap-2">
            <Button>{t(`design.contrast.${v.key}`)}</Button>
            <span className="text-xs text-muted tabular-nums">
              {t('design.contrast.ratio')}: {v.ratio}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
