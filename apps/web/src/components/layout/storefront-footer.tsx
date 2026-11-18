import { Link, useParams } from 'react-router';
import { SectionLink } from './section-link';
import { useTranslation } from 'react-i18next';
import { brand, exampleFirm, socials } from '@/config/brand';
import { ExampleFirmLogo } from './logo';
import { SOCIAL_NAMES, SocialIcon } from './social-icons';
import { NAV_ITEMS } from './storefront-header';

export const LEGAL_DOCS = ['terms', 'privacy', 'cookies', 'risk', 'refund', 'aml'] as const;
const RISK_PARAGRAPHS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

export function StorefrontFooter() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const year = new Date().getFullYear();
  const linkClass = 'rounded-sm text-sm text-muted transition-colors hover:text-fg';

  return (
    <footer className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <ExampleFirmLogo />
            <p className="mt-4 max-w-sm text-sm text-muted">{t('footer.tagline')}</p>
            <ul className="mt-6 flex gap-2" aria-label={t('footer.social')}>
              {socials.map(({ network, href }) => (
                <li key={network}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_NAMES[network]}
                      className="inline-flex size-10 items-center justify-center rounded-sm border border-border bg-card text-muted transition-colors hover:border-border-strong hover:text-fg"
                    >
                      <SocialIcon network={network} className="size-4" />
                    </a>
                  ) : (
                    <span
                      title={t('footer.comingSoon')}
                      className="inline-flex size-10 items-center justify-center rounded-sm border border-dashed border-border text-muted"
                    >
                      <SocialIcon network={network} className="size-4" />
                      <span className="sr-only">
                        {SOCIAL_NAMES[network]} — {t('footer.comingSoon')}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <nav aria-labelledby="footer-platform">
            <h2 id="footer-platform" className="text-sm font-semibold">
              {t('footer.platform')}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {NAV_ITEMS.map(({ id, key }) => (
                <li key={id}>
                  <SectionLink id={id} className={linkClass}>
                    {t(`nav.${key}`)}
                  </SectionLink>
                </li>
              ))}
              <li>
                <Link to={`/${lang}/login`} className={linkClass}>
                  {t('nav.toPlatform')}
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal" className="text-sm font-semibold">
              {t('footer.legal')}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {LEGAL_DOCS.map((doc) => (
                <li key={doc}>
                  <Link to={`/${lang}/legal/${doc}`} className={linkClass}>
                    {t(`legal.${doc}`)}
                  </Link>
                </li>
              ))}
              <li>
                <a href={`mailto:${brand.supportEmail}`} className={linkClass}>
                  {brand.supportEmail}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <section
          aria-labelledby="risk-title"
          className="mt-12 rounded-[20px] border border-border bg-card p-5 sm:p-6"
        >
          <h2 id="risk-title" className="text-sm font-semibold">
            {t('risk.title')}
          </h2>
          <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted">
            {RISK_PARAGRAPHS.map((p) => (
              <p key={p}>{t(`risk.${p}`, { brand: exampleFirm.name })}</p>
            ))}
          </div>
        </section>

        <p className="mt-8 text-xs text-muted">
          © {year} {exampleFirm.legalName}. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
