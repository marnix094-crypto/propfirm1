import { Navigate } from 'react-router';
import { DEFAULT_LOCALE, isLocale } from '@brand/shared';

/** "/" → best matching supported language, falling back to English. */
export function RootRedirect() {
  const preferred = navigator.languages
    .map((l) => l.slice(0, 2).toLowerCase())
    .find((l) => isLocale(l));
  return <Navigate to={`/${preferred ?? DEFAULT_LOCALE}`} replace />;
}
