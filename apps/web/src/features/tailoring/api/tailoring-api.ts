import {
  TailoringSessionListSchema,
  type CreateTailoringSessionRequest,
  type EditTailoredResumeRequest,
  type GapAnswer,
  GapQuestionsSchema,
  type RegenerateResumesRequest,
  type ResumeLanguage,
  type RevertProfileChangesRequest,
  RevertProfileChangesResultSchema,
  SessionProfileChangesSchema,
  TailoredResumeSchema,
  type TailoredResumesView,
  TailoredResumesViewSchema,
  type TailoringSessionView,
  TailoringSessionViewSchema,
  type UpdateTailoringOptionsRequest,
} from '@careerly/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetBlob, apiPatch, apiPost, apiPut } from '../../../shared/api/client';
import { AI_STATUS_QUERY_KEY, AI_USAGE_QUERY_KEY } from '../../ai/api/useAiStatus';
import { PROFILE_QUERY_KEY } from '../../profile/api/profile-api';

/*
 * Tailoring sessions (RF-TAIL-01): starting one runs the match in the background (RF-TAIL-02), generating runs
 * the writing of the CVs (RF-TAIL-10); the session is polled while its job runs. Under review, each change to a
 * CV is fitted again on the server and its preview reloaded (RF-TAIL-12).
 */

const POLL_MS = 1500;

export const TAILORING_QUERY_KEY = ['tailoring-sessions'] as const;
const sessionKey = (id: string) => [...TAILORING_QUERY_KEY, id] as const;
const gapsKey = (id: string) => [...sessionKey(id), 'gaps'] as const;
const profileChangesKey = (id: string) => [...sessionKey(id), 'profile-changes'] as const;

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
    onSuccess: (view) => {
      queryClient.setQueryData(sessionKey(view.session.id), view);
      void queryClient.invalidateQueries({ queryKey: [...TAILORING_QUERY_KEY, 'list'] });
    },
  });
}

export function useRetryTailoring(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/tailoring-sessions/${id}/retry`, TailoringSessionViewSchema, {}),
    onSuccess: (view) => queryClient.setQueryData(sessionKey(id), view),
  });
}

/** What the session added to or changed in the master profile (RF-TAIL-05). */
export function useSessionProfileChanges(id: string) {
  return useQuery({
    queryKey: profileChangesKey(id),
    queryFn: () => apiGet(`/tailoring-sessions/${id}/profile-changes`, SessionProfileChangesSchema),
  });
}

/** Undoes the session's profile changes, all or only `changeIds` (RF-TAIL-06). */
export function useRevertProfileChanges(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RevertProfileChangesRequest) =>
      apiPost(
        `/tailoring-sessions/${id}/revert-profile-changes`,
        RevertProfileChangesResultSchema,
        request,
      ),
    onSuccess: ({ changes }) => {
      queryClient.setQueryData(profileChangesKey(id), { changes });
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });
}

/** Writes the CVs: from a match without gaps, or after the gap questions. */
export function useGenerateResumes(view: TailoringSessionView) {
  const queryClient = useQueryClient();
  const { session } = view;
  return useMutation({
    mutationFn: () =>
      apiPost(`/tailoring-sessions/${session.id}/generate`, TailoringSessionViewSchema, {}),
    onSuccess: (next) => {
      queryClient.setQueryData(sessionKey(session.id), next);
      void queryClient.removeQueries({ queryKey: resumesKey(session.id) });
    },
  });
}

/** The gap questions of a matched session (RF-TAIL-04). */
export function useGapQuestions(id: string, enabled = true) {
  return useQuery({
    queryKey: gapsKey(id),
    queryFn: () => apiGet(`/tailoring-sessions/${id}/gaps`, GapQuestionsSchema),
    enabled,
  });
}

export function useTailoredResumes(id: string, enabled: boolean) {
  return useQuery({
    queryKey: resumesKey(id),
    queryFn: () => apiGet(`/tailoring-sessions/${id}/resumes`, TailoredResumesViewSchema),
    enabled,
  });
}

/** Goes to the gap questions (the session moves to `AWAITING_ANSWERS`). */
export function useAskGaps(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/tailoring-sessions/${id}/ask-gaps`, GapQuestionsSchema, {}),
    onSuccess: (gaps) => {
      queryClient.setQueryData(gapsKey(id), gaps);
      void queryClient.invalidateQueries({ queryKey: sessionKey(id), exact: true });
    },
  });
}

/** Answers one gap question (RF-GAP-01). */
export function useAnswerGap(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requirementId, answer }: { requirementId: string; answer: GapAnswer }) =>
      apiPut(`/tailoring-sessions/${id}/gaps/${requirementId}`, GapQuestionsSchema, answer),
    onSuccess: (gaps) => {
      queryClient.setQueryData(gapsKey(id), gaps);
      // An affirmative answer adds to the profile and changes the match (RF-TAIL-05, RF-GAP-05).
      void queryClient.invalidateQueries({ queryKey: sessionKey(id), exact: true });
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
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

const openSessionsKey = [...TAILORING_QUERY_KEY, 'list', 'open'] as const;

/** The sessions left in progress (RF-TAIL-15), most recently updated first. */
export function useOpenSessions() {
  return useQuery({
    queryKey: openSessionsKey,
    queryFn: () => apiGet('/tailoring-sessions?open=true', TailoringSessionListSchema),
  });
}

/** The open sessions of one job description, to continue one instead of starting over. */
export function useOpenSessionsOf(jobPostingId: string) {
  return useQuery({
    queryKey: [...TAILORING_QUERY_KEY, 'list', 'open', jobPostingId],
    queryFn: () =>
      apiGet(
        `/tailoring-sessions?open=true&jobPostingId=${encodeURIComponent(jobPostingId)}`,
        TailoringSessionListSchema,
      ),
  });
}

/** Leaves the session (RF-TAIL-15): it is kept, but no longer listed as open. */
export function useAbandonSession(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/tailoring-sessions/${id}/abandon`, TailoringSessionViewSchema, {}),
    onSuccess: (view) => {
      queryClient.setQueryData(sessionKey(id), view);
      void queryClient.invalidateQueries({ queryKey: [...TAILORING_QUERY_KEY, 'list'] });
    },
  });
}

/** Changes the CV options of the session (RF-TAIL-07 to RF-TAIL-09). */
export function useUpdateTailoringOptions(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateTailoringOptionsRequest) =>
      apiPatch(`/tailoring-sessions/${id}/options`, TailoringSessionViewSchema, changes),
    onSuccess: (view) => queryClient.setQueryData(sessionKey(id), view),
  });
}
