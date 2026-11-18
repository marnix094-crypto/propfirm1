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

/** Firm admins and Daily Funded staff (admin panel only, D91). */
export const isStaffUser = (u: { firmRole?: string | null; roles: string[] } | null) =>
  !!u && (!!u.firmRole || u.roles.includes('ADMIN'));

/**
 * Restores the session from the refresh cookie once, then gates private routes.
 * Client area: staff are sent to the admin panel. Admin area: anonymous → admin login.
 */
export function RequireAuth({
  children,
  area = 'app',
}: {
  children: ReactNode;
  area?: 'app' | 'admin';
}) {
  const user = useSession((s) => s.user);
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
    const login = area === 'admin' ? 'admin/login' : 'login';
    return <Navigate to={`/${lang}/${login}?next=${next}`} replace />;
  }
  if (area === 'app' && isStaffUser(user)) return <Navigate to={`/${lang}/admin`} replace />;
  return <>{children}</>;
}

/** Login/register: send already-authenticated users to their area. */
export function GuestOnly({
  children,
  area = 'app',
}: {
  children: ReactNode;
  area?: 'app' | 'admin';
}) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const refresh = useSession((s) => s.refresh);
  const { lang } = useParams();
  const [params] = useSearchParams();
  useEffect(() => {
    if (status === 'unknown') void refresh();
  }, [status, refresh]);
  if (status === 'unknown') return <Splash />;
  if (status === 'authenticated') {
    // A signed-in client on the admin login (or staff on the client login) belongs elsewhere.
    const own = isStaffUser(user) ? 'admin' : 'app';
    return <Navigate to={safeNext(own === area ? params.get('next') : null, lang, own)} replace />;
  }
  return <>{children}</>;
}
