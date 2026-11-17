import { createBrowserRouter, Navigate } from 'react-router';
import { LangLayout } from './lang-layout';
import { RootRedirect } from './root-redirect';

const placeholder = (kind: 'login' | 'register' | 'legal') => () =>
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
      { path: 'login', lazy: placeholder('login') },
      { path: 'register', lazy: placeholder('register') },
      { path: 'legal/:doc', lazy: placeholder('legal') },
      { path: '*', element: <Navigate to="." replace /> },
    ],
  },
]);
