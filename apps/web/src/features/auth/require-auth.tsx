import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { safeNext } from '@/lib/safe-next';
import { useSession } from '@/stores/session';
import { Logo } from '@/components/layout/logo';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Logo className="opacity-80 motion-safe:animate-pulse" />
    </div>
  );
}

/** Restores the session from the refresh cookie once, then gates private routes. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const refresh = useSession((s) => s.refresh);
  const { lang } = useParams();
  const location = useLocation();
  useEffect(() => {
    if (status === 'unknown') void refresh();
  }, [status, refresh]);
  if (status === 'unknown') return <Splash />;
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/${lang}/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/** Login/register: send already-authenticated users to the app. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const refresh = useSession((s) => s.refresh);
  const { lang } = useParams();
  const [params] = useSearchParams();
  useEffect(() => {
    if (status === 'unknown') void refresh();
  }, [status, refresh]);
  if (status === 'unknown') return <Splash />;
  if (status === 'authenticated')
    return <Navigate to={safeNext(params.get('next'), lang)} replace />;
  return <>{children}</>;
}
