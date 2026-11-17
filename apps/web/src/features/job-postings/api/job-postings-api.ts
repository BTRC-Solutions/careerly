import {
  type CreateJobPostingRequest,
  JobPostingSchema,
  JobPostingSummarySchema,
  type UpdateJobPostingRequest,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../../shared/api/client';

/* Job descriptions (RF-JD-01). */

export const JOB_POSTINGS_QUERY_KEY = ['job-postings'] as const;

export function useJobPostings() {
  return useQuery({
    queryKey: JOB_POSTINGS_QUERY_KEY,
    queryFn: () => apiGet('/job-postings', JobPostingSummarySchema.array()),
  });
}

export function useJobPosting(id: string) {
  return useQuery({
    queryKey: [...JOB_POSTINGS_QUERY_KEY, id],
    queryFn: () => apiGet(`/job-postings/${id}`, JobPostingSchema),
  });
}

function useJobPostingMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOB_POSTINGS_QUERY_KEY }),
  });
}

export function useCreateJobPosting() {
  return useJobPostingMutation((body: CreateJobPostingRequest) =>
    apiPost('/job-postings', JobPostingSchema, body),
  );
}

export function useUpdateJobPosting() {
  return useJobPostingMutation(({ id, body }: { id: string; body: UpdateJobPostingRequest }) =>
    apiPatch(`/job-postings/${id}`, JobPostingSchema, body),
  );
}

export function useDeleteJobPosting() {
  return useJobPostingMutation((id: string) => apiDelete(`/job-postings/${id}`));
}
