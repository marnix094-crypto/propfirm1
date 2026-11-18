import { Link, useNavigate, useParams } from 'react-router';
import { SectionLink } from '@/components/layout/section-link';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  CirclePlay,
  FileText,
  Headphones,
  HelpCircle,
  LogOut,
  Moon,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { brand } from '@/config/brand';
import { realtime } from '@/lib/realtime';
import { useSession } from '@/stores/session';
import { useThemeStore } from '@/stores/theme';
import { LEGAL_DOCS } from '@/components/layout/site-footer';
import { NAV_SECTIONS } from '@/features/app/nav';

const row =
  'flex w-full items-center gap-4 px-5 py-4 text-left text-[15px] font-medium transition-colors hover:bg-primary-tint/20';

export function MorePage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <title>{t('app.more.title')}</title>
      <h1 className="text-xl font-semibold tracking-tight">{t('app.more.title')}</h1>

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <span
            className="inline-flex size-11 items-center justify-center rounded-full bg-primary-tint/60 text-lg font-bold text-accent"
            aria-hidden="true"
          >
            {user?.email.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{t('app.more.account')}</p>
            <p className="truncate font-semibold">{user?.email}</p>
          </div>
          <button
            type="button"
            aria-label={t('app.more.logout')}
            className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-primary-tint/30 hover:text-fg"
            onClick={async () => {
              realtime.disconnectAccount();
              await logout();
              qc.clear();
              void navigate(`/${lang}/login`, { replace: true });
            }}
          >
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </div>
        <Link
          to={`/${lang}/app/new-account`}
          className="btn-primary mx-5 mb-4 flex items-center justify-center gap-2 rounded-btn px-4 py-3 font-semibold"
        >
          {t('app.nav.newAccount')}
        </Link>
      </Card>

      {/* Full menu on mobile (the desktop sidebar already shows it). */}
      {NAV_SECTIONS.map((section) => (
        <section
          key={section.key}
          className="lg:hidden"
          aria-label={t(`app.nav.sections.${section.key}`)}
        >
          <p className="px-1 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            {t(`app.nav.sections.${section.key}`)}
          </p>
          <Card padding="none" className="overflow-hidden divide-y divide-border">
            {section.items
              .filter((i) => i.to !== 'portfolio' && i.to !== 'trade')
              .map(({ to, key, icon: Icon, soon }) => (
                <Link key={to} to={`/${lang}/app/${to}`} className={row}>
                  <Icon className="size-5 text-muted" aria-hidden="true" strokeWidth={1.75} />
                  <span className="flex-1">{t(`app.nav.${key}`)}</span>
                  {soon && (
                    <span className="rounded-full border border-border px-1.5 text-[10px] font-semibold text-muted uppercase">
                      {t('app.nav.soon')}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted" aria-hidden="true" />
                </Link>
              ))}
          </Card>
        </section>
      ))}

      <Card padding="none" className="overflow-hidden divide-y divide-border">
        <Link to={`/${lang}/app/tutorial`} className={row}>
          <CirclePlay className="size-5 text-muted" aria-hidden="true" />
          <span className="flex-1">{t('app.nav.tutorial')}</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </Link>
        <Link to={`/${lang}/app/security`} className={row}>
          <ShieldCheck className="size-5 text-muted" aria-hidden="true" />
          <span className="flex-1">{t('app.more.security')}</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </Link>
        <label className={row}>
          <Moon className="size-5 text-muted" aria-hidden="true" />
          <span className="flex-1">{t('app.more.theme')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={theme === 'dark'}
            onChange={toggleTheme}
            className="h-6 w-11 cursor-pointer appearance-none rounded-full bg-[var(--meter-track)] transition-colors before:block before:size-5 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-[22px]"
          />
        </label>
        <div className={row}>
          <span className="flex-1">{t('app.more.language')}</span>
          <LanguageSwitcher />
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden divide-y divide-border">
        <SectionLink id="faq" className={row}>
          <HelpCircle className="size-5 text-muted" aria-hidden="true" />
          <span className="flex-1">{t('app.more.help')}</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </SectionLink>
        <a href={`mailto:${brand.supportEmail}`} className={row}>
          <Headphones className="size-5 text-muted" aria-hidden="true" />
          <span className="flex-1">{t('app.more.support')}</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </a>
        {LEGAL_DOCS.map((doc) => (
          <a key={doc} href={`/${lang}/legal/${doc}`} className={row}>
            <FileText className="size-5 text-muted" aria-hidden="true" />
            <span className="flex-1">{t(`legal.${doc}`)}</span>
            <ChevronRight className="size-4 text-muted" aria-hidden="true" />
          </a>
        ))}
      </Card>

      <p className="px-1 text-xs leading-relaxed text-muted">{t('app.more.risk')}</p>
    </div>
  );
}
