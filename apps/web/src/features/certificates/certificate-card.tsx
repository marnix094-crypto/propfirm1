import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/layout/logo';
import type { Certificate } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';

/** Printable certificate (styled with tokens; prints on white). */
export function CertificateCard({ c, verifyUrl }: { c: Certificate; verifyUrl: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <article
      className="certificate relative overflow-hidden rounded-card border border-border bg-card p-6 sm:p-8"
      data-testid="certificate"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-[var(--brand-lime)]" />
      <div className="flex items-start justify-between gap-4">
        <Logo className="h-4 text-fg" />
        <span className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          {t('certificates.simulated')}
        </span>
      </div>
      <p className="mt-8 text-xs font-semibold tracking-[0.14em] text-muted uppercase">
        {t('certificates.title')}
      </p>
      <p className="mt-2 text-sm text-muted">{t('certificates.awardedTo')}</p>
      <p className="text-2xl font-semibold tracking-tight">{c.holder}</p>
      <p className="mt-4 text-sm text-muted">{t('certificates.for')}</p>
      <p className="text-3xl font-bold tracking-tight tabular-nums">
        {f.moneyWhole(c.accountSizeMinor, 'USD')}
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs">
        <div>
          <dt className="text-muted">{t('certificates.issued')}</dt>
          <dd className="mt-0.5 font-medium">
            {new Intl.DateTimeFormat(f.locale, { dateStyle: 'long' }).format(new Date(c.issuedAt))}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">{t('certificates.id')}</dt>
          <dd className="mt-0.5 truncate font-mono">{c.id}</dd>
        </div>
      </dl>
      <p className="mt-3 truncate text-[11px] text-muted">
        {t('certificates.verifyAt')} {verifyUrl}
      </p>
    </article>
  );
}
