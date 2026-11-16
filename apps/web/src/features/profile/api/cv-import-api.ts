import {
  type ConfirmCvImportRequest,
  ConfirmCvImportResponseSchema,
  CreateToolResponseSchema,
  CvImportDraftSchema,
} from '@careerly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, apiUpload } from '../../../shared/api/client';
import { PROFILE_QUERY_KEY } from './profile-api';

/*
 * CV import (RF-PROF-09): the AI reads the file into a draft (nothing is saved), the user reviews
 * it, and the confirmation saves everything at once with origin IMPORT.
 */

/** `POST /profile/import`: reads the CV. It can take a while (the AI reads the whole file). */
export function useReadCv() {
  return useMutation({
    mutationFn: (file: File) => apiUpload('/profile/import', CvImportDraftSchema, file),
  });
}

/**
 * Saves the reviewed draft. Tools the catalog did not know are created first (`POST /tools`,
 * which returns the existing tool if the name already resolves), then the import is confirmed.
 */
export function useConfirmCvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      newTools,
      build,
    }: {
      /** Tool names as written in the CV, without a catalog id. */
      newTools: string[];
      build: (toolIds: ReadonlyMap<string, string>) => ConfirmCvImportRequest;
    }) => {
      const toolIds = new Map<string, string>();
      for (const name of newTools) {
        const { tool } = await apiPost('/tools', CreateToolResponseSchema, { name });
        toolIds.set(name.toLowerCase(), tool.id);
      }
      return apiPost('/profile/import/confirm', ConfirmCvImportResponseSchema, build(toolIds));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY }),
  });
}
