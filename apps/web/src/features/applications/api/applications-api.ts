import {
  type AddApplicationEventRequest,
  type Application,
  ApplicationEventListSchema,
  ApplicationEventSchema,
  ApplicationListSchema,
  ApplicationSchema,
  type ContactInput,
  ContactListSchema,
  ContactSchema,
  type CreateApplicationRequest,
  type MoveApplicationRequest,
  ResumeVersionListSchema,
  type SendApplicationRequest,
  type UpdateApplicationRequest,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../../shared/api/client';

/*
 * Job applications (roadmap 7.3, RF-APP-01, RF-APP-02): one per job description, created saved or already
 * sent with finalized CVs of that job description, their timeline (roadmap 7.5, RF-APP-04), and their
 * contacts and extra data (roadmap 7.6, RF-APP-05, RF-APP-07).
 */

export const APPLICATIONS_QUERY_KEY = ['applications'] as const;
const listKey = [...APPLICATIONS_QUERY_KEY, 'list'] as const;
const applicationKey = (id: string) => [...APPLICATIONS_QUERY_KEY, id] as const;
const eventsKey = (id: string) => [...applicationKey(id), 'events'] as const;
const contactsKey = (id: string) => [...applicationKey(id), 'contacts'] as const;
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

/**
 * After any change: the application itself, its timeline (a change of state is recorded there), the list and the
 * lookup by job description.
 */
function useRefresh() {
  const queryClient = useQueryClient();
  return (application: Application) => {
    queryClient.setQueryData(applicationKey(application.id), application);
    void queryClient.invalidateQueries({ queryKey: eventsKey(application.id) });
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

/** Changes the extra data (RF-APP-07): `null` clears a field. */
export function useUpdateApplication(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (request: UpdateApplicationRequest) =>
      apiPatch(`/applications/${id}`, ApplicationSchema, request),
    onSuccess: refresh,
  });
}

/** The contacts (RF-APP-05), in the order they were added. */
export function useContacts(id: string) {
  return useQuery({
    queryKey: contactsKey(id),
    queryFn: () => apiGet(`/applications/${id}/contacts`, ContactListSchema),
  });
}

/** Adds a contact, or replaces one when `contactId` is given. */
export function useSaveContact(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, ...input }: ContactInput & { contactId?: string }) =>
      contactId
        ? apiPut(`/applications/${id}/contacts/${contactId}`, ContactSchema, input)
        : apiPost(`/applications/${id}/contacts`, ContactSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKey(id) }),
  });
}

export function useDeleteContact(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => apiDelete(`/applications/${id}/contacts/${contactId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKey(id) }),
  });
}

/** The timeline (RF-APP-04): oldest first. */
export function useApplicationEvents(id: string) {
  return useQuery({
    queryKey: eventsKey(id),
    queryFn: () => apiGet(`/applications/${id}/events`, ApplicationEventListSchema),
  });
}

/** Adds a note, an interview or a message to the timeline; it cannot be changed afterwards. */
export function useAddApplicationEvent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AddApplicationEventRequest) =>
      apiPost(`/applications/${id}/events`, ApplicationEventSchema, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventsKey(id) });
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
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
