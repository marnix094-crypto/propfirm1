import { createBrowserRouter, Navigate } from 'react-router';
import { LangLayout } from './lang-layout';
import { RootRedirect } from './root-redirect';

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  {
    path: '/:lang',
    element: <LangLayout />,
    children: [
      // Landing page arrives in phase 2; until then the index shows the design system.
      { index: true, element: <Navigate to="design" replace /> },
      {
        path: 'design',
        lazy: () =>
          import('@/features/design/design-page').then((m) => ({ Component: m.DesignPage })),
      },
      { path: '*', element: <Navigate to="." replace /> },
    ],
  },
]);
