import {
  type CreateTailoringSessionRequest,
  type EditTailoredResumeRequest,
  type RegenerateResumesRequest,
  type ResumeLanguage,
  TailoredResumeSchema,
  type TailoredResumesView,
  TailoredResumesViewSchema,
  type TailoringSessionView,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetBlob, apiPatch, apiPost } from '../../../shared/api/client';
import { countGaps } from '../lib/match-summary';
import { AI_STATUS_QUERY_KEY, AI_USAGE_QUERY_KEY } from '../../ai/api/useAiStatus';

/*
 * Tailoring sessions (RF-TAIL-01): starting one runs the match in the background (RF-TAIL-02), generating runs
 * the writing of the CVs (RF-TAIL-10); the session is polled while its job runs. Under review, each change to a
 * CV is fitted again on the server and its preview reloaded (RF-TAIL-12).
 */

const POLL_MS = 1500;

export const TAILORING_QUERY_KEY = ['tailoring-sessions'] as const;
const sessionKey = (id: string) => [...TAILORING_QUERY_KEY, id] as const;

const resumesKey = (id: string) => [...sessionKey(id), 'resumes'] as const;
const previewKey = (id: string, language: ResumeLanguage) =>
  [...resumesKey(id), language, 'preview'] as const;

const isRunning = (view: TailoringSessionView | undefined) =>
  view?.session.status === 'ANALYZING' ||
  view?.session.status === 'GENERATING' ||
  view?.job?.status === 'PENDING' ||
  view?.job?.status === 'RUNNING';

export function useTailoringSession(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: sessionKey(id),
    queryFn: async () => {
      const view = await apiGet(`/tailoring-sessions/${id}`, TailoringSessionViewSchema);
      // When the match finishes, the AI status (a rejected key) and usage may have changed.
      if (!isRunning(view)) {
        void queryClient.invalidateQueries({ queryKey: AI_STATUS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: AI_USAGE_QUERY_KEY });
      }
      return view;
    },
    refetchInterval: (query) => (isRunning(query.state.data) ? POLL_MS : false),
  });
}

export function useStartTailoring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateTailoringSessionRequest) =>
      apiPost('/tailoring-sessions', TailoringSessionViewSchema, request),
    onSuccess: (view) => queryClient.setQueryData(sessionKey(view.session.id), view),
  });
}

export function useRetryTailoring(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/tailoring-sessions/${id}/retry`, TailoringSessionViewSchema, {}),
    onSuccess: (view) => queryClient.setQueryData(sessionKey(id), view),
  });
}

/**
 * Writes the CVs. Until the gap questions can be answered (roadmap 5.5), a session with gaps goes through them
 * skipping them all.
 */
export function useGenerateResumes(view: TailoringSessionView) {
  const queryClient = useQueryClient();
  const { session } = view;
  return useMutation({
    mutationFn: async () => {
      if (session.status === 'MATCHED' && session.match && countGaps(session.match) > 0) {
        await apiPost(`/tailoring-sessions/${session.id}/gaps`, TailoringSessionViewSchema, {});
      }
      return apiPost(`/tailoring-sessions/${session.id}/generate`, TailoringSessionViewSchema, {});
    },
    onSuccess: (next) => {
      queryClient.setQueryData(sessionKey(session.id), next);
      void queryClient.removeQueries({ queryKey: resumesKey(session.id) });
    },
  });
}

export function useTailoredResumes(id: string, enabled: boolean) {
  return useQuery({
    queryKey: resumesKey(id),
    queryFn: () => apiGet(`/tailoring-sessions/${id}/resumes`, TailoredResumesViewSchema),
    enabled,
  });
}

/** The PDF of a CV as it is now; the previous one stays on screen while the new one renders. */
export function useResumePreview(id: string, language: ResumeLanguage) {
  return useQuery({
    queryKey: previewKey(id, language),
    queryFn: () => apiGetBlob(`/tailoring-sessions/${id}/resumes/${language}/preview`),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** One change to a CV under review; the server fits it again, and the preview is reloaded. */
export function useEditResume(id: string, language: ResumeLanguage) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (edit: EditTailoredResumeRequest) =>
      apiPatch(`/tailoring-sessions/${id}/resumes/${language}`, TailoredResumeSchema, edit),
    onSuccess: (resume) => {
      queryClient.setQueryData<TailoredResumesView>(resumesKey(id), (current) =>
        current
          ? { resumes: current.resumes.map((r) => (r.language === language ? resume : r)) }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: previewKey(id, language) });
    },
  });
}

/** Writes the CVs again, whole or in part, with the candidate's indications (RF-TAIL-13). */
export function useRegenerateResumes(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RegenerateResumesRequest) =>
      apiPost(`/tailoring-sessions/${id}/regenerate`, TailoringSessionViewSchema, request),
    onSuccess: (next) => {
      queryClient.setQueryData(sessionKey(id), next);
      void queryClient.removeQueries({ queryKey: resumesKey(id) });
    },
  });
}
