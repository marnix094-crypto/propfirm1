import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '@brand/shared';
import { brand } from '@/config/brand';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
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
      <title>{t('landing.seo.title', { brand: brand.name })}</title>
      <meta name="description" content={t('landing.seo.description', { brand: brand.name })} />
      <link rel="canonical" href={`${origin}/${i18n.language}`} />
      {SUPPORTED_LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={`${origin}/${l}`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${origin}/en`} />
    </>
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
      <SiteHeader />
      <main id="main">
        <Hero />
        <Partners />
        <Steps />
        <Features />
        <Pricing />
        <FinalCta />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
