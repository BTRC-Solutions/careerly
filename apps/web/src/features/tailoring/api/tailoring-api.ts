import {
  type CreateTailoringSessionRequest,
  GapQuestionsSchema,
  type TailoringSessionView,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../../shared/api/client';
import { AI_STATUS_QUERY_KEY, AI_USAGE_QUERY_KEY } from '../../ai/api/useAiStatus';

/*
 * Tailoring sessions (RF-TAIL-01): starting one runs the match in the background (RF-TAIL-02); the session is
 * polled while its job runs.
 */

const POLL_MS = 1500;

export const TAILORING_QUERY_KEY = ['tailoring-sessions'] as const;
const sessionKey = (id: string) => [...TAILORING_QUERY_KEY, id] as const;

const isRunning = (view: TailoringSessionView | undefined) =>
  view?.session.status === 'ANALYZING' ||
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

/** The gap questions of a matched session (RF-TAIL-04). */
export function useGapQuestions(id: string, enabled = true) {
  return useQuery({
    queryKey: [...sessionKey(id), 'gaps'],
    queryFn: () => apiGet(`/tailoring-sessions/${id}/gaps`, GapQuestionsSchema),
    enabled,
  });
}
