import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { useConnection } from '@/stores/trading';

/** Shows "connection lost — reconnecting" after 1.5s without a live connection. */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const down = useConnection((s) => s.market === 'disconnected' || s.account === 'disconnected');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!down) {
      const id = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(id);
  }, [down]);
  if (!visible) return null;
  return (
    <div
      role="status"
      className="sticky top-16 z-30 flex items-center justify-center gap-2 bg-[var(--meter-warn)] px-4 py-2 text-sm font-semibold text-[#0b2540]"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      {t('app.connection.lost')}
    </div>
  );
}

export function LiveDot() {
  const { t } = useTranslation();
  const live = useConnection((s) => s.market === 'connected');
  if (!live) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--badge-success-fg)]">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full rounded-full bg-[var(--profit)] opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-[var(--profit)]" />
      </span>
      {t('app.connection.live')}
    </span>
  );
}
