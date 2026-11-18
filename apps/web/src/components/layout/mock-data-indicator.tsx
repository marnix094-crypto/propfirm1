import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/theme';
import { cn } from '@/lib/cn';

/** Always visible while MSW mock data is active, so example data is never mistaken for real data. */
export function MockDataIndicator() {
  const { t } = useTranslation();
  const demo = import.meta.env.VITE_DEMO_MODE === 'true';
  // On the platform (mobile) it sits above the bottom navigation and order button.
  const platform = useThemeStore((s) => s.surface === 'platform');
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed left-3 z-50 inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-full border border-dashed border-border-strong bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-accent shadow-card',
        'lg:bottom-3 lg:left-auto lg:right-3 lg:px-3 lg:py-1.5 lg:text-xs',
        platform ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))]' : 'bottom-3',
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{demo ? t('common.demoPreview') : t('common.mockData')}</span>
    </div>
  );
}
