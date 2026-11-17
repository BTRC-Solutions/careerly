import { JobAnalysisStateSchema, JobViewSchema } from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../../shared/api/client';
import { AI_STATUS_QUERY_KEY, AI_USAGE_QUERY_KEY } from '../../ai/api/useAiStatus';
import { JOB_POSTINGS_QUERY_KEY } from './job-postings-api';

/* Job description analysis (RF-JD-02): it runs in the background; the state is polled while it does. */

const POLL_MS = 1500;

const analysisKey = (id: string) => [...JOB_POSTINGS_QUERY_KEY, id, 'analysis'] as const;

export function useJobAnalysis(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: analysisKey(id),
    queryFn: async () => {
      const state = await apiGet(`/job-postings/${id}/analysis`, JobAnalysisStateSchema);
      // When it finishes, the AI status (a rejected key) and usage may have changed.
      if (state.job && (state.job.status === 'SUCCEEDED' || state.job.status === 'FAILED')) {
        void queryClient.invalidateQueries({ queryKey: AI_STATUS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: AI_USAGE_QUERY_KEY });
      }
      return state;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'PENDING' || status === 'RUNNING' ? POLL_MS : false;
    },
  });
}

export function useAnalyzeJobPosting(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/job-postings/${id}/analyze`, JobViewSchema, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analysisKey(id) }),
  });
}
