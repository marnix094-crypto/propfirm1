import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '@brand/shared';
import { brand } from '@/config/brand';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SkipLink } from '@/components/layout/skip-link';
import { SiteHero } from './hero';
import { Marquee } from './fx';
import { BrandBuilder } from './brand-builder';
import { Product } from './product';
import { ProductTour } from './showcase';
import { Setups } from './setups';
import { Contact, HowItWorks, Roadmap, Security, SiteFaq, Statement } from './sections';

/** Daily Funded website: white-label prop-firm software (B2B). */
export function SitePage() {
  const { t, i18n } = useTranslation();
  const { hash } = useLocation();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);
  return (
    <>
      <title>{t('site.seo.title', { brand: brand.name })}</title>
      <meta name="description" content={t('site.seo.description', { brand: brand.name })} />
      <link rel="canonical" href={`${origin}/${i18n.language}`} />
      {SUPPORTED_LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={`${origin}/${l}`} />
      ))}
      <SkipLink />
      <SiteHeader />
      <main id="main">
        <SiteHero />
        <Marquee items={t('site.marquee', { returnObjects: true }) as string[]} />
        <HowItWorks />
        <ProductTour />
        <Product />
        <BrandBuilder />
        <Setups />
        <Statement />
        <Security />
        <Roadmap />
        <SiteFaq />
        <Contact />
      </main>
      <SiteFooter />
    </>
  );
}
