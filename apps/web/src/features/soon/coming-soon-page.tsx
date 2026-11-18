import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NAV_SECTIONS, type SoonFeature } from '@/features/app/nav';

/** Announced feature that is not built yet. Shows what it will do — never example data. */
export function ComingSoonPage({ feature }: { feature: SoonFeature }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.to === feature);
  const Icon = item?.icon;
  const points = t(`soon.${feature}.points`, { returnObjects: true }) as string[];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-4">
      <title>{t(`app.nav.${item?.key ?? feature}`)}</title>
      <Card padding="none" className="overflow-hidden" data-testid="coming-soon">
        <div className="flex items-start gap-4 border-b border-border p-6">
          {Icon && (
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border bg-card-muted">
              <Icon className="size-5 text-accent" aria-hidden="true" strokeWidth={1.75} />
            </span>
          )}
          <div className="min-w-0">
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {t('app.nav.soon')}
            </span>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {t(`app.nav.${item?.key ?? feature}`)}
            </h1>
            <p className="mt-1 text-sm text-muted">{t(`soon.${feature}.body`)}</p>
          </div>
        </div>
        {Array.isArray(points) && points.length > 0 && (
          <ul className="flex flex-col gap-2 p-6 text-sm">
            {points.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                {p}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-center text-xs text-muted">{t('soon.note')}</p>
      <Button variant="secondary" asChild className="self-center">
        <Link to={`/${lang}/app/portfolio`}>{t('soon.back')}</Link>
      </Button>
    </div>
  );
}
