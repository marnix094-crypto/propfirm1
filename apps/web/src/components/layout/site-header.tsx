import { useState } from 'react';
import { SectionLink } from './section-link';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

export const NAV_ITEMS = [
  { id: 'how-it-works', key: 'howItWorks' },
  { id: 'features', key: 'features' },
  { id: 'pricing', key: 'pricing' },
  { id: 'faq', key: 'faq' },
] as const;

/** Sticky header with blur: logo, section navigation, language, theme toggle, platform button. */
export function SiteHeader() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [open, setOpen] = useState(false);

  return (
    <header className="glass sticky top-0 z-40 border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link to={`/${lang}`} className="min-w-0 shrink rounded-sm" aria-label={t('nav.home')}>
          <Logo className="h-3.5 max-w-full min-[380px]:h-4 sm:h-5" />
        </Link>
        <nav aria-label={t('nav.main')} className="ml-6 hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map(({ id, key }) => (
              <li key={id}>
                <SectionLink
                  id={id}
                  className="rounded-sm px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg"
                >
                  {t(`nav.${key}`)}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          <Button size="sm" className="hidden sm:inline-flex" asChild>
            <Link to={`/${lang}/login`}>{t('nav.toPlatform')}</Link>
          </Button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-sm border border-border bg-card md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
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
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label={t('nav.main')}
          className="border-t border-border px-4 pb-4 md:hidden"
        >
          <ul className="flex flex-col py-2">
            {NAV_ITEMS.map(({ id, key }) => (
              <li key={id}>
                <SectionLink
                  id={id}
                  onClick={() => setOpen(false)}
                  className="block rounded-sm px-2 py-3 font-medium"
                >
                  {t(`nav.${key}`)}
                </SectionLink>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button size="sm" className="flex-1" asChild>
              <Link to={`/${lang}/login`}>{t('nav.toPlatform')}</Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
