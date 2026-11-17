import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { INTL_LOCALE, isLocale } from '@brand/shared';
import { formatBps, formatLeverage, formatMoneyMinor } from '@/lib/format';

/** Locale-aware formatters for the current UI language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = INTL_LOCALE[isLocale(i18n.language) ? i18n.language : 'en'];
  return useMemo(
    () => ({
      locale,
      money: (
        minor: bigint | string,
        currency: string,
        opts?: Parameters<typeof formatMoneyMinor>[3],
      ) => formatMoneyMinor(BigInt(minor), currency, locale, opts),
      /** Whole-unit money, e.g. "$25,000" — only for values that are whole by definition. */
      moneyWhole: (minor: bigint | string, currency: string) =>
        formatMoneyMinor(BigInt(minor) / 100n, currency, locale, { decimals: 0 }),
      bps: (bps: number) => formatBps(bps, locale),
      leverage: formatLeverage,
      relativeTime: (iso: string) => {
        const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        const abs = Math.abs(diffSec);
        if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
        if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
        return rtf.format(Math.round(diffSec / 86_400), 'day');
      },
    }),
    [locale],
  );
}
