import {
  type ResumeLanguage,
  type TemplateSummary,
  TemplateSummarySchema,
} from '@careerly/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiGetBlob, apiPatch, apiUpload } from '../../../shared/api/client';
import { downloadBlob } from '../../../shared/lib/download';

/*
 * CV templates (RF-TAIL-09, roadmap 4.13): the built-in `classic` and the user's own `.typ` files.
 * Uploading validates the file by rendering the ES and EN examples, so it can take a few seconds.
 */

export const TEMPLATES_QUERY_KEY = ['templates'] as const;

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_QUERY_KEY,
    queryFn: () => apiGet('/templates', z.array(TemplateSummarySchema)),
  });
}

/**
 * The template rendered with the example in `language`. The version is part of the key: a template
 * version never changes, so its preview can be kept for the whole session.
 */
export function useTemplatePreview(template: TemplateSummary, language: ResumeLanguage) {
  return useQuery({
    queryKey: [...TEMPLATES_QUERY_KEY, template.id, template.version, 'preview', language],
    queryFn: () => apiGetBlob(`/templates/${template.id}/preview/${language}`),
    staleTime: Infinity,
    retry: false,
  });
}

/** Only the list: a template version never changes, so the previews already loaded stay valid. */
function refreshList(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY, exact: true });
}

export function useUploadTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiUpload('/templates', TemplateSummarySchema, file),
    onSuccess: () => refreshList(queryClient),
  });
}

export function useRenameTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiPatch(`/templates/${id}`, TemplateSummarySchema, { name }),
    onSuccess: () => refreshList(queryClient),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/templates/${id}`),
    onSuccess: async (_result, id) => {
      // First the list, so the screen moves off the template; then its previews, which would only fail now.
      await refreshList(queryClient);
      queryClient.removeQueries({ queryKey: [...TEMPLATES_QUERY_KEY, id] });
    },
  });
}

/** Downloads `classic` and the examples as a `.zip` (inside Electron, its save dialog asks where). */
export function useDownloadStarterKit() {
  return useMutation({
    mutationFn: async () => {
      downloadBlob(await apiGetBlob('/templates/starter-kit'), 'careerly-template-starter-kit.zip');
    },
  });
}
