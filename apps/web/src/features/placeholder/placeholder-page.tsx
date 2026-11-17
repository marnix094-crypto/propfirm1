import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Hammer } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SkipLink } from '@/components/layout/skip-link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';

/** Pages that arrive in later phases (auth, legal documents). */
export function PlaceholderPage({ kind }: { kind: 'legal' }) {
  const { t } = useTranslation();
  const { lang, doc } = useParams();
  void kind;
  const title = t(`legal.${doc ?? 'terms'}`, { defaultValue: t('placeholder.legalTitle') });
  return (
    <>
      <title>{title}</title>
      <SkipLink />
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex min-h-[60dvh] max-w-6xl items-center justify-center px-4 py-20 sm:px-6"
      >
        <Card padding="lg" className="max-w-lg text-center">
          <IconTile icon={Hammer} size="lg" className="mx-auto" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-muted">{t('placeholder.body')}</p>
          <Button asChild variant="secondary" className="mt-8">
            <Link to={`/${lang}`}>
              <ArrowLeft aria-hidden="true" /> {t('placeholder.back')}
            </Link>
          </Button>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
