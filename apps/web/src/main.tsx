import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import './styles/globals.css';
import { router } from './app/router';
import { isMockData } from './lib/api';
import { MockDataIndicator } from './components/layout/mock-data-indicator';
import { Toaster } from './components/ui/toaster';
import { realtime } from './lib/realtime';
import i18n from './lib/i18n';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } },
});
if (import.meta.env.VITE_DEMO_MODE !== 'true') realtime.init(queryClient);

async function enableMocks() {
  // Shareable preview: backend + realtime run in the browser (no server, no service worker).
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { installDemo } = await import('./demo/install');
    installDemo();
    realtime.init(queryClient);
    return;
  }
  // MSW only runs in development and in test builds (VITE_ENABLE_MSW=true). Never in production.
  // The literal env check lets Vite drop the mock chunk from production bundles entirely.
  if (import.meta.env.VITE_ENABLE_MSW === 'true') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
  }
}

void enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
          <Toaster closeLabel={i18n.t('common.close')} />
          {(isMockData() || import.meta.env.VITE_DEMO_MODE === 'true') && <MockDataIndicator />}
        </MotionConfig>
      </QueryClientProvider>
    </StrictMode>,
  );
});
