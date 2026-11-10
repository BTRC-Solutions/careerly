import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import './shared/i18n';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // Local API: failures are not transient network blips, so retry once at most.
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element.');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
