import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

const NAV = ['howItWorks', 'features', 'pricing', 'faq'] as const;

/** Sticky header with blur. Refined with real anchors in phase 2. */
export function SiteHeader() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [open, setOpen] = useState(false);

  return (
    <header className="glass sticky top-0 z-40 border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to={`/${lang}`} className="rounded-sm" aria-label={t('nav.home')}>
          <Logo />
        </Link>
        <nav aria-label={t('nav.main')} className="ml-6 hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((key) => (
              <li key={key}>
                <a
                  href={`#${key}`}
                  className="rounded-sm px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg"
                >
                  {t(`nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          <Button size="sm" className="hidden sm:inline-flex">
            {t('nav.toPlatform')}
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
            {NAV.map((key) => (
              <li key={key}>
                <a
                  href={`#${key}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-sm px-2 py-3 font-medium"
                >
                  {t(`nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button size="sm" className="flex-1">
              {t('nav.toPlatform')}
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
