import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { brand } from '@/config/brand';
import { Logo } from './logo';
import { SITE_NAV } from './site-header';
import { LEGAL_DOCS } from './storefront-footer';

/** Footer of the Daily Funded website. */
export function SiteFooter() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const year = new Date().getFullYear();
  const link = 'rounded-sm text-sm text-muted transition-colors hover:text-fg';
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo className="h-4 text-fg" />
            <p className="mt-4 max-w-sm text-sm text-muted">{t('site.footer.tagline')}</p>
            <a href={`mailto:${brand.supportEmail}`} className={`${link} mt-4 inline-block`}>
              {brand.supportEmail}
            </a>
          </div>
          <div>
            <h2 className="text-sm font-semibold">{t('site.footer.product')}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {SITE_NAV.map(({ id, key }) => (
                <li key={id}>
                  <a href={`/${lang}#${id}`} className={link}>
                    {t(`site.nav.${key}`)}
                  </a>
                </li>
              ))}
              <li>
                <Link to={`/${lang}/login`} className={link}>
                  {t('site.nav.liveDemo')}
                </Link>
              </li>
              <li>
                <Link to={`/${lang}/admin/login`} className={link}>
                  {t('site.nav.partnerLogin')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">{t('footer.legal')}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {LEGAL_DOCS.filter((d) => d !== 'refund' && d !== 'risk').map((doc) => (
                <li key={doc}>
                  <Link to={`/${lang}/legal/${doc}`} className={link}>
                    {t(`legal.${doc}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-12 max-w-4xl border-t border-border pt-6 text-xs leading-relaxed text-muted">
          {t('site.footer.disclaimer', { brand: brand.name })}
        </p>
        <p className="mt-4 text-xs text-muted">
          © {year} {brand.legalName}. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
