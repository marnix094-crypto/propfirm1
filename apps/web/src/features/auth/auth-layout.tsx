import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { SkipLink } from '@/components/layout/skip-link';
import { Card } from '@/components/ui/card';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { lang } = useParams();
  return (
    <div className="flex min-h-dvh flex-col">
      <title>{title}</title>
      <SkipLink />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to={`/${lang}`} className="rounded-sm" aria-label={t('nav.home')}>
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0"
      >
        <Card padding="lg" className="w-full max-w-md">
          <h1 className="text-gradient text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-6 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            {t('auth.simulatedNote')}
          </p>
        </Card>
      </main>
    </div>
  );
}
