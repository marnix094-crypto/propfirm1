import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router';
import { DEFAULT_LOCALE, isLocale } from '@brand/shared';
import i18n from '@/lib/i18n';

/** Validates the :lang URL segment and syncs i18next + <html lang>. */
export function LangLayout() {
  const { lang } = useParams();
  const valid = isLocale(lang);

  useEffect(() => {
    if (!valid) return;
    document.documentElement.lang = lang;
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
  }, [lang, valid]);

  if (!valid) return <Navigate to={`/${DEFAULT_LOCALE}`} replace />;
  if (i18n.language !== lang) void i18n.changeLanguage(lang);

  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Outlet />
    </Suspense>
  );
}
