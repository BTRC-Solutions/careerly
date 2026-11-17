import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import i18n from '../shared/i18n';
import { TEST_API_URL, TEST_API_TOKEN } from './api-server';

/**
 * Renders a screen the way the app does (React Query, router, i18n) against the API mocked with MSW
 * (see `api-server.ts`). Spanish by default, the language the docs and most users use.
 */
export async function renderScreen(
  ui: ReactElement,
  {
    path = '/',
    language = 'es',
    userOptions,
  }: {
    path?: string;
    language?: 'es' | 'en';
    /** E.g. `{ applyAccept: false }` to pick a file the input's `accept` would hide. */
    userOptions?: Parameters<typeof userEvent.setup>[0];
  } = {},
): Promise<RenderResult & { user: UserEvent; queryClient: QueryClient }> {
  // What Electron's preload exposes; read once by `shared/desktop.ts`.
  window.careerly = { apiBaseUrl: TEST_API_URL, apiToken: TEST_API_TOKEN };
  await i18n.changeLanguage(language);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup(userOptions);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, user, queryClient };
}
