import { createBrowserRouter, Navigate } from 'react-router';
import { LangLayout } from './lang-layout';
import { RootRedirect } from './root-redirect';

const placeholder = (kind: 'legal') => () =>
  import('@/features/placeholder/placeholder-page').then((m) => ({
    Component: () => <m.PlaceholderPage kind={kind} />,
  }));

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  {
    path: '/:lang',
    element: <LangLayout />,
    children: [
      {
        index: true,
        lazy: () =>
          import('@/features/landing/landing-page').then((m) => ({ Component: m.LandingPage })),
      },
      {
        path: 'design',
        lazy: () =>
          import('@/features/design/design-page').then((m) => ({ Component: m.DesignPage })),
      },
      {
        path: 'login',
        lazy: () => import('@/features/auth/login-page').then((m) => ({ Component: m.LoginPage })),
      },
      {
        path: 'register',
        lazy: () =>
          import('@/features/auth/register-page').then((m) => ({ Component: m.RegisterPage })),
      },
      {
        path: 'forgot-password',
        lazy: () =>
          import('@/features/auth/recovery-pages').then((m) => ({
            Component: m.ForgotPasswordPage,
          })),
      },
      {
        path: 'reset-password',
        lazy: () =>
          import('@/features/auth/recovery-pages').then((m) => ({
            Component: m.ResetPasswordPage,
          })),
      },
      {
        path: 'verify-email',
        lazy: () =>
          import('@/features/auth/recovery-pages').then((m) => ({ Component: m.VerifyEmailPage })),
      },
      { path: 'legal/:doc', lazy: placeholder('legal') },
      {
        path: 'app',
        lazy: () =>
          Promise.all([
            import('@/features/app/app-layout'),
            import('@/features/auth/require-auth'),
          ]).then(([layout, guard]) => ({
            Component: () => (
              <guard.RequireAuth>
                <layout.AppLayout />
              </guard.RequireAuth>
            ),
          })),
        children: [
          { index: true, element: <Navigate to="portfolio" replace /> },
          {
            path: 'portfolio',
            lazy: () =>
              import('@/features/portfolio/portfolio-page').then((m) => ({
                Component: m.PortfolioPage,
              })),
          },
          {
            path: 'trade/:symbol?',
            lazy: () =>
              import('@/features/trade/trade-page').then((m) => ({ Component: m.TradePage })),
          },
          {
            path: 'more',
            lazy: () =>
              import('@/features/more/more-page').then((m) => ({ Component: m.MorePage })),
          },
          {
            path: 'security',
            lazy: () =>
              import('@/features/security/security-page').then((m) => ({
                Component: m.SecurityPage,
              })),
          },
          // Unknown app routes fall back to the portfolio instead of rendering nothing.
          { path: '*', element: <Navigate to="portfolio" replace /> },
        ],
      },
      { path: '*', element: <Navigate to="." replace /> },
    ],
  },
]);
