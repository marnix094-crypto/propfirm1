import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import './styles/globals.css';
import './lib/i18n';
import { router } from './app/router';
import { isMockData } from './lib/api';
import { MockDataIndicator } from './components/layout/mock-data-indicator';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } },
});

async function enableMocks() {
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
          {isMockData() && <MockDataIndicator />}
        </MotionConfig>
      </QueryClientProvider>
    </StrictMode>,
  );
});
