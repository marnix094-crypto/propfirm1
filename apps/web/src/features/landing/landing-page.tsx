import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '@brand/shared';
import { exampleFirm } from '@/config/brand';
import { StorefrontHeader } from '@/components/layout/storefront-header';
import { StorefrontFooter } from '@/components/layout/storefront-footer';
import { SkipLink } from '@/components/layout/skip-link';
import { Hero } from './sections/hero';
import { Partners } from './sections/partners';
import { Steps } from './sections/steps';
import { Features } from './sections/features';
import { Pricing } from './sections/pricing';
import { FinalCta } from './sections/final-cta';
import { Faq } from './sections/faq';

function Seo() {
  const { t, i18n } = useTranslation();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <>
      <title>{t('landing.seo.title', { brand: exampleFirm.name })}</title>
      <meta
        name="description"
        content={t('landing.seo.description', { brand: exampleFirm.name })}
      />
      <link rel="canonical" href={`${origin}/${i18n.language}`} />
      {SUPPORTED_LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={`${origin}/${l}`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${origin}/en`} />
    </>
  );
}

/** Makes clear this page is an example of a client's storefront, not Daily Funded itself. */
function StorefrontBanner() {
  const { t } = useTranslation();
  const { lang } = useParams();
  return (
    <div className="relative z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-primary px-4 py-2 text-center text-sm font-medium text-[var(--btn-primary-fg)]">
      <span>{t('site.storefront.banner')}</span>
      <Link to={`/${lang}`} className="font-semibold underline underline-offset-2">
        {t('site.storefront.back')}
      </Link>
    </div>
  );
}

export function LandingPage() {
  const { hash, state } = useLocation();
  const section =
    (state as { section?: string } | null)?.section ??
    (hash ? decodeURIComponent(hash.slice(1)) : null);

  // Lazy-loaded route: scroll to the requested section once it exists.
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView();
  }, [section]);

  return (
    <>
      <Seo />
      <SkipLink />
      <StorefrontBanner />
      <StorefrontHeader />
      <main id="main">
        <Hero />
        <Partners />
        <Steps />
        <Features />
        <Pricing />
        <FinalCta />
        <Faq />
      </main>
      <StorefrontFooter />
    </>
  );
}
