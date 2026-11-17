import { useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '@brand/shared';
import { Globe } from 'lucide-react';

const NAMES: Record<Locale, string> = { en: 'English', nl: 'Nederlands', es: 'Español' };

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t('language.label')}</span>
      <Globe className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden="true" />
      <select
        value={lang}
        onChange={(e) => {
          const rest = location.pathname.split('/').slice(2).join('/');
          void navigate(`/${e.target.value}/${rest}${location.search}${location.hash}`);
        }}
        className="h-10 cursor-pointer appearance-none rounded-sm border border-border bg-card pr-3 pl-9 text-sm font-medium text-fg hover:border-border-strong"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
