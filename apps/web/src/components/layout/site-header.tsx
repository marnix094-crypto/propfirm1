import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/cn';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

/** Sections of the Daily Funded (B2B) website. */
export const SITE_NAV = [
  { id: 'product', key: 'product' },
  { id: 'brand-builder', key: 'builder' },
  { id: 'how', key: 'how' },
  { id: 'security', key: 'security' },
  { id: 'faq', key: 'faq' },
] as const;

/** Header of the Daily Funded website (white-label software for prop firms). */
export function SiteHeader() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));
  const go = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return; // other page: follow the href to the home page
    e.preventDefault();
    setOpen(false);
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 px-2 pt-2 sm:px-4 sm:pt-3">
      <div
        className={cn(
          'glass relative mx-auto flex h-16 max-w-7xl items-center gap-3 rounded-[18px] border px-4 transition-[border-color,box-shadow] duration-300 sm:px-5',
          scrolled || open
            ? 'border-border-strong shadow-[0_18px_50px_-24px_color-mix(in_srgb,var(--primary)_35%,transparent)]'
            : 'border-border',
        )}
      >
        <Link
          to={`/${lang}`}
          className="min-w-0 shrink rounded-sm text-fg"
          aria-label={t('nav.home')}
        >
          <Logo className="h-3.5 max-w-full min-[380px]:h-4 sm:h-[18px]" />
        </Link>
        <nav aria-label={t('nav.main')} className="ml-8 hidden lg:block">
          <ul className="flex items-center gap-1">
            {SITE_NAV.map(({ id, key }) => (
              <li key={id}>
                <a
                  href={`/${lang}#${id}`}
                  onClick={go(id)}
                  className="rounded-sm px-3 py-2 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-fg"
                >
                  {t(`site.nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          <Link
            to={`/${lang}/products/compete`}
            className="hidden rounded-sm px-2 py-2 text-sm font-medium whitespace-nowrap text-muted hover:text-fg xl:inline"
          >
            {t('site.nav.compete')}
          </Link>
          <Link
            to={`/${lang}/admin/login`}
            className="hidden rounded-sm px-2 py-2 text-sm font-medium whitespace-nowrap text-muted hover:text-fg 2xl:inline"
          >
            {t('site.nav.partnerLogin')}
          </Link>
          <Button size="sm" variant="secondary" className="hidden sm:inline-flex" asChild>
            <Link to={`/${lang}/login`}>{t('site.nav.liveDemo')}</Link>
          </Button>
          <Button size="sm" className="hidden sm:inline-flex" asChild>
            <a href={`/${lang}#contact`} onClick={go('contact')}>
              {t('site.nav.bookDemo')}
            </a>
          </Button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-sm border border-border bg-card xl:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {/* Reading progress */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-5 bottom-0 h-px origin-left bg-primary"
          style={{ scaleX: reduce ? 0 : scrollYProgress }}
        />
      </div>
      {open && (
        <nav
          id="site-mobile-nav"
          aria-label={t('nav.main')}
          className="glass mx-auto mt-2 max-w-7xl rounded-[18px] border border-border px-4 pb-5 xl:hidden"
        >
          <ul className="flex flex-col py-2">
            {SITE_NAV.map(({ id, key }) => (
              <li key={id}>
                <a
                  href={`/${lang}#${id}`}
                  onClick={go(id)}
                  className="block rounded-sm px-2 py-3 font-medium"
                >
                  {t(`site.nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <LanguageSwitcher />
            <Button variant="secondary" asChild>
              <Link to={`/${lang}/login`}>{t('site.nav.liveDemo')}</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to={`/${lang}/products/compete`}>{t('site.nav.compete')}</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to={`/${lang}/admin/login`}>{t('site.nav.partnerLogin')}</Link>
            </Button>
            <Button asChild>
              <a href={`/${lang}#contact`} onClick={go('contact')}>
                {t('site.nav.bookDemo')}
              </a>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
