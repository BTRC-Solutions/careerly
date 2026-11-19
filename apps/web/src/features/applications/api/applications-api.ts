import {
  type Application,
  ApplicationListSchema,
  ApplicationSchema,
  type CreateApplicationRequest,
  type MoveApplicationRequest,
  ResumeVersionListSchema,
  type SendApplicationRequest,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../../shared/api/client';

/*
 * Job applications (roadmap 7.3, RF-APP-01, RF-APP-02): one per job description, created saved or already
 * sent with finalized CVs of that job description.
 */

export const APPLICATIONS_QUERY_KEY = ['applications'] as const;
const listKey = [...APPLICATIONS_QUERY_KEY, 'list'] as const;
const applicationKey = (id: string) => [...APPLICATIONS_QUERY_KEY, id] as const;
const ofPostingKey = (jobPostingId: string) =>
  [...APPLICATIONS_QUERY_KEY, 'of', jobPostingId] as const;

export function useApplications() {
  return useQuery({
    queryKey: listKey,
    queryFn: () => apiGet('/applications', ApplicationListSchema),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKey(id),
    queryFn: () => apiGet(`/applications/${id}`, ApplicationSchema),
  });
}

/** The application of a job description, or `null` when it has none. */
export function useApplicationOf(jobPostingId: string) {
  return useQuery({
    queryKey: ofPostingKey(jobPostingId),
    queryFn: async () => {
      const { applications } = await apiGet(
        `/applications?jobPostingId=${encodeURIComponent(jobPostingId)}`,
        ApplicationListSchema,
      );
      return applications[0] ?? null;
    },
  });
}

/** The finalized CVs of a job description, which can be sent with its application. */
export function useSendableResumes(jobPostingId: string) {
  return useQuery({
    queryKey: [...APPLICATIONS_QUERY_KEY, 'sendable', jobPostingId],
    queryFn: () =>
      apiGet(
        `/applications/sendable-resumes?jobPostingId=${encodeURIComponent(jobPostingId)}`,
        ResumeVersionListSchema,
      ),
  });
}

/** After any change: the application itself, the list and the lookup by job description. */
function useRefresh() {
  const queryClient = useQueryClient();
  return (application: Application) => {
    queryClient.setQueryData(applicationKey(application.id), application);
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries({ queryKey: ofPostingKey(application.jobPostingId) });
  };
}

export function useCreateApplication() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (request: CreateApplicationRequest) =>
      apiPost('/applications', ApplicationSchema, request),
    onSuccess: refresh,
  });
}

/** It was sent: a saved application becomes `APPLIED`; one already sent gets the new CVs. */
export function useSendApplication(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (request: SendApplicationRequest) =>
      apiPost(`/applications/${id}/sent-resumes`, ApplicationSchema, request),
    onSuccess: refresh,
  });
}

/** Moves it to another state (kanban, RF-APP-03); the server checks the rules again. */
export function useMoveApplication() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...request }: MoveApplicationRequest & { id: string }) =>
      apiPost(`/applications/${id}/status`, ApplicationSchema, request),
    onSuccess: refresh,
  });
}

export function useDeleteApplication(application: Application) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete(`/applications/${application.id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: applicationKey(application.id) });
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ofPostingKey(application.jobPostingId) });
    },
  });
}
