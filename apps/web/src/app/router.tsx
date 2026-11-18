import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
import { LangLayout } from './lang-layout';
import { RootRedirect } from './root-redirect';
import { SOON_FEATURES } from '@/features/app/nav';

const placeholder = (kind: 'legal') => () =>
  import('@/features/placeholder/placeholder-page').then((m) => ({
    Component: () => <m.PlaceholderPage kind={kind} />,
  }));

const routes: RouteObject[] = [
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
          {
            path: 'checkout',
            lazy: () =>
              import('@/features/checkout/checkout-page').then((m) => ({
                Component: m.CheckoutPage,
              })),
          },
          {
            path: 'checkout/:purchaseId',
            lazy: () =>
              import('@/features/checkout/purchase-page').then((m) => ({
                Component: m.PurchasePage,
              })),
          },
          {
            path: 'checkout/:purchaseId/pay',
            lazy: () =>
              import('@/features/checkout/test-payment-page').then((m) => ({
                Component: m.TestPaymentPage,
              })),
          },
          {
            path: 'new-account',
            lazy: () =>
              import('@/features/checkout/new-account-page').then((m) => ({
                Component: m.NewAccountPage,
              })),
          },
          {
            path: 'stats',
            lazy: () =>
              import('@/features/stats/stats-page').then((m) => ({ Component: m.StatsPage })),
          },
          {
            path: 'orders',
            lazy: () =>
              import('@/features/orders/orders-page').then((m) => ({ Component: m.OrdersPage })),
          },
          {
            path: 'withdrawal',
            lazy: () =>
              import('@/features/withdrawal/withdrawal-page').then((m) => ({
                Component: m.WithdrawalPage,
              })),
          },
          {
            path: 'track-record',
            lazy: () =>
              import('@/features/track-record/track-record-page').then((m) => ({
                Component: m.TrackRecordPage,
              })),
          },
          {
            path: 'notebook',
            lazy: () =>
              import('@/features/notebook/notebook-page').then((m) => ({
                Component: m.NotebookPage,
              })),
          },
          {
            path: 'tutorial',
            lazy: () =>
              import('@/features/tutorial/tutorial-page').then((m) => ({
                Component: m.TutorialPage,
              })),
          },
          ...SOON_FEATURES.map((feature) => ({
            path: feature,
            lazy: () =>
              import('@/features/soon/coming-soon-page').then((m) => ({
                Component: () => <m.ComingSoonPage feature={feature} />,
              })),
          })),
          // Unknown app routes fall back to the portfolio instead of rendering nothing.
          { path: '*', element: <Navigate to="portfolio" replace /> },
        ],
      },
      { path: '*', element: <Navigate to="." replace /> },
    ],
  },
];

/**
 * The shareable demo preview runs inside a sandboxed frame where the URL path cannot change,
 * so it routes in memory. The real app uses normal URLs.
 */
export const router =
  import.meta.env.VITE_DEMO_MODE === 'true'
    ? createMemoryRouter(routes, { initialEntries: ['/'] })
    : createBrowserRouter(routes);
