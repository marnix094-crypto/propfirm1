import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { DEFAULT_LOCALE, isLocale } from '@brand/shared';

/**
 * Does this hostname belong to a Compete operator (own domain or subdomain, D108)? Then the
 * site home is that operator's competition instead of the Daily Funded website. One small
 * request, cached for the tab.
 */
function useOperatorHost(): boolean | null {
  const [onOwnHost, set] = useState<boolean | null>(() => {
    try {
      const v = sessionStorage.getItem('compete-own-host');
      return v === null ? null : v === '1';
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (onOwnHost !== null) return;
    let alive = true;
    fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/v1/compete/operator`)
      .then((r) => (r.ok ? (r.json() as Promise<{ onOwnHost?: boolean }>) : null))
      .catch(() => null)
      .then((op) => {
        const v = op?.onOwnHost === true;
        try {
          sessionStorage.setItem('compete-own-host', v ? '1' : '0');
        } catch {
          /* storage unavailable: ask again next time */
        }
        if (alive) set(v);
      });
    return () => {
      alive = false;
    };
  }, [onOwnHost]);
  return onOwnHost;
}

/** "/" → best matching supported language, falling back to English. */
export function RootRedirect() {
  const preferred = navigator.languages
    .map((l) => l.slice(0, 2).toLowerCase())
    .find((l) => isLocale(l));
  return <Navigate to={`/${preferred ?? DEFAULT_LOCALE}`} replace />;
}

/** Renders the website, or redirects to the competition on an operator's own host. */
export function OperatorHostGate({ children }: { children: ReactNode }) {
  const { lang } = useParams();
  const onOwnHost = useOperatorHost();
  if (onOwnHost === null) return <div className="min-h-dvh" aria-busy="true" />;
  if (onOwnHost) return <Navigate to={`/${lang}/compete`} replace />;
  return <>{children}</>;
}
