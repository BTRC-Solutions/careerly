import {
  CreateToolResponseSchema,
  type CreateToolRequestSchema,
  SearchToolsResponseSchema,
} from '@careerly/contracts';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiGet, apiPost } from '../../../shared/api/client';

/** Catalog search for the tool picker (`GET /tools`). Keeps the previous results while typing. */
export function useToolSearch(query: string, enabled: boolean) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['tools', 'search', trimmed],
    queryFn: () =>
      apiGet(
        `/tools?${new URLSearchParams({ query: trimmed, limit: '12' }).toString()}`,
        SearchToolsResponseSchema,
      ),
    enabled: enabled && trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Creates a user tool, or returns the existing one if the name already resolves (`POST /tools`). */
export function useCreateTool() {
  return useMutation({
    mutationFn: (body: z.input<typeof CreateToolRequestSchema>) =>
      apiPost('/tools', CreateToolResponseSchema, body),
  });
}
