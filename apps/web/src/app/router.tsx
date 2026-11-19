import type { ComponentType } from 'react';
import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
import { LangLayout } from './lang-layout';
import { OperatorHostGate, RootRedirect } from './root-redirect';

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
        // On a Compete operator's own (sub)domain the home is that operator's competition (D108).
        index: true,
        lazy: () =>
          import('@/features/site/site-page').then((m) => ({
            Component: () => (
              <OperatorHostGate>
                <m.SitePage />
              </OperatorHostGate>
            ),
          })),
      },
      {
        // Example prop-firm storefront built on the platform (what a client's traders see).
        path: 'storefront',
        lazy: () =>
          import('@/features/landing/landing-page').then((m) => ({ Component: m.LandingPage })),
      },
      {
        // Compete admin panel (D104): own login + shell; never linked from player pages.
        path: 'compete/admin/login',
        lazy: () =>
          import('@/features/compete/admin/auth-pages').then((m) => ({
            Component: m.CompeteAdminLoginPage,
          })),
      },
      {
        path: 'compete/admin/setup',
        lazy: () =>
          import('@/features/compete/admin/auth-pages').then((m) => ({
            Component: m.CompeteAdminSetupPage,
          })),
      },
      {
        path: 'compete/admin',
        lazy: () =>
          import('@/features/compete/admin/layout').then((m) => ({
            Component: () => (
              <m.RequireCompeteAdmin>
                <m.CompeteAdminLayout />
              </m.RequireCompeteAdmin>
            ),
          })),
        children: [
          ['', 'CompeteAdminOverviewPage'],
          ['rounds', 'CompeteAdminRoundsPage'],
          ['rounds/:id', 'CompeteAdminRoundPage'],
          ['players', 'CompeteAdminPlayersPage'],
          ['payouts', 'CompeteAdminPayoutsPage'],
          ['settings', 'CompeteAdminSettingsPage'],
          ['integration', 'CompeteAdminIntegrationPage'],
          ['audit', 'CompeteAdminAuditPage'],
          ['operators', 'CompeteAdminOperatorsPage'],
          ['security', 'CompeteAdminSecurityPage'],
        ].map(([path, name]) => ({
          ...(path ? { path } : { index: true }),
          lazy: () =>
            (name === 'CompeteAdminSecurityPage'
              ? import('@/features/compete/admin/auth-pages')
              : name === 'CompeteAdminIntegrationPage'
                ? import('@/features/compete/admin/integration-page')
                : import('@/features/compete/admin/pages')
            ).then((m) => ({ Component: (m as unknown as Record<string, ComponentType>)[name!]! })),
        })) as RouteObject[],
      },
      {
        // Daily Funded website: product page of the compete software (B2B).
        path: 'products/compete',
        lazy: () =>
          import('@/features/site/compete-product-page').then((m) => ({
            Component: m.CompeteProductPage,
          })),
      },
      {
        // Embeddable Compete widgets for operator websites (D108): no shell, iframe only.
        path: 'compete/widget/:kind',
        lazy: () =>
          import('@/features/compete/widget-page').then((m) => ({
            Component: m.CompeteWidgetPage,
          })),
      },
      {
        // Compete — separate product (D97/D103): own layout, session and API client.
        path: 'compete',
        lazy: () =>
          import('@/features/compete/layout').then((m) => ({ Component: m.CompeteLayout })),
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/compete/home-page').then((m) => ({
                Component: m.CompeteHomePage,
              })),
          },
          {
            path: 'login',
            lazy: () =>
              import('@/features/compete/auth-pages').then((m) => ({
                Component: m.CompeteLoginPage,
              })),
          },
          {
            path: 'register',
            lazy: () =>
              import('@/features/compete/auth-pages').then((m) => ({
                Component: m.CompeteRegisterPage,
              })),
          },
          {
            // Single sign-on from the operator's own website (D109).
            path: 'sso',
            lazy: () =>
              import('@/features/compete/auth-pages').then((m) => ({
                Component: m.CompeteSsoPage,
              })),
          },
          {
            path: 'app',
            lazy: () =>
              Promise.all([
                import('@/features/compete/layout'),
                import('@/features/compete/dashboard-page'),
              ]).then(([l, p]) => ({
                Component: () => (
                  <l.RequireCompeteAuth>
                    <p.CompeteDashboardPage />
                  </l.RequireCompeteAuth>
                ),
              })),
          },
          {
            path: 'pay/:entryId',
            lazy: () =>
              Promise.all([
                import('@/features/compete/layout'),
                import('@/features/compete/pay-page'),
              ]).then(([l, p]) => ({
                Component: () => (
                  <l.RequireCompeteAuth>
                    <p.CompetePayPage />
                  </l.RequireCompeteAuth>
                ),
              })),
          },
        ],
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
        path: 'verify/:id',
        lazy: () =>
          import('@/features/certificates/verify-page').then((m) => ({
            Component: m.VerifyCertificatePage,
          })),
      },
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
          {
            path: 'points',
            lazy: () =>
              import('@/features/points/points-page').then((m) => ({ Component: m.PointsPage })),
          },
          {
            path: 'offers',
            lazy: () =>
              import('@/features/offers/offers-page').then((m) => ({ Component: m.OffersPage })),
          },
          {
            path: 'leaderboard',
            lazy: () =>
              import('@/features/leaderboard/leaderboard-page').then((m) => ({
                Component: m.LeaderboardPage,
              })),
          },
          {
            path: 'competitions',
            lazy: () =>
              import('@/features/competitions/competitions-page').then((m) => ({
                Component: m.CompetitionsPage,
              })),
          },
          {
            path: 'transparency',
            lazy: () =>
              import('@/features/transparency/transparency-page').then((m) => ({
                Component: m.TransparencyPage,
              })),
          },
          {
            path: 'copier',
            lazy: () =>
              import('@/features/copier/copier-page').then((m) => ({ Component: m.CopierPage })),
          },
          {
            path: 'backtesting',
            lazy: () =>
              import('@/features/backtesting/backtesting-page').then((m) => ({
                Component: m.BacktestingPage,
              })),
          },
          {
            path: 'certificates',
            lazy: () =>
              import('@/features/certificates/certificates-page').then((m) => ({
                Component: m.CertificatesPage,
              })),
          },
          // Unknown app routes fall back to the portfolio instead of rendering nothing.
          { path: '*', element: <Navigate to="portfolio" replace /> },
        ],
      },
      {
        // Separate login for firm admins and Daily Funded staff (D91).
        path: 'admin/login',
        lazy: () =>
          import('@/features/auth/login-page').then((m) => ({
            Component: () => <m.LoginPage audience="admin" />,
          })),
      },
      {
        path: 'admin',
        lazy: () =>
          Promise.all([
            import('@/features/admin/admin-layout'),
            import('@/features/auth/require-auth'),
          ]).then(([layout, guard]) => ({
            Component: () => (
              <guard.RequireAuth area="admin">
                <layout.AdminLayout />
              </guard.RequireAuth>
            ),
          })),
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/admin/overview-page').then((m) => ({
                Component: m.AdminOverviewPage,
              })),
          },
          {
            path: 'traders',
            lazy: () =>
              import('@/features/admin/traders-page').then((m) => ({
                Component: m.AdminTradersPage,
              })),
          },
          {
            path: 'traders/:id',
            lazy: () =>
              import('@/features/admin/traders-page').then((m) => ({
                Component: m.AdminTraderPage,
              })),
          },
          {
            path: 'accounts',
            lazy: () =>
              import('@/features/admin/accounts-page').then((m) => ({
                Component: m.AdminAccountsPage,
              })),
          },
          {
            path: 'products',
            lazy: () =>
              import('@/features/admin/products-page').then((m) => ({
                Component: m.AdminProductsPage,
              })),
          },
          {
            path: 'rule-sets',
            lazy: () =>
              import('@/features/admin/rule-sets-page').then((m) => ({
                Component: m.AdminRuleSetsPage,
              })),
          },
          {
            path: 'branding',
            lazy: () =>
              import('@/features/admin/branding-page').then((m) => ({
                Component: m.AdminBrandingPage,
              })),
          },
          {
            path: 'alerts',
            lazy: () =>
              import('@/features/admin/alerts-page').then((m) => ({
                Component: m.AdminAlertsPage,
              })),
          },
          {
            path: 'audit',
            lazy: () =>
              import('@/features/admin/audit-page').then((m) => ({ Component: m.AdminAuditPage })),
          },
          {
            path: 'dashboard',
            lazy: () =>
              import('@/features/admin/client-dashboard-page').then((m) => ({
                Component: m.AdminClientDashboardPage,
              })),
          },
          {
            path: 'security',
            lazy: () =>
              import('@/features/security/security-page').then((m) => ({
                Component: m.SecurityPage,
              })),
          },
          {
            path: 'firms',
            lazy: () =>
              import('@/features/admin/firms-page').then((m) => ({ Component: m.AdminFirmsPage })),
          },
          {
            path: 'menu',
            lazy: () =>
              import('@/features/admin/admin-layout').then((m) => ({ Component: m.AdminMenuPage })),
          },
          { path: '*', element: <Navigate to="." replace /> },
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
/** Demo preview: `?demo-path=/en/compete/widget/…` opens a page directly (widget previews). */
function demoStartPath(): string {
  const p = new URLSearchParams(window.location.search).get('demo-path');
  return p && /^\/[a-z]{2}\/compete\/widget\/[a-z]+(\?[\w=&-]*)?$/.test(p) ? p : '/';
}

export const router =
  import.meta.env.VITE_DEMO_MODE === 'true'
    ? createMemoryRouter(routes, { initialEntries: [demoStartPath()] })
    : createBrowserRouter(routes);
