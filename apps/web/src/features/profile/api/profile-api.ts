import {
  AchievementSchema,
  CertificationSchema,
  type CreateAchievementRequestSchema,
  type CreateCertificationRequestSchema,
  type CreateEducationRequestSchema,
  type CreateLanguageSkillRequestSchema,
  type CreatePositionRequestSchema,
  type CreateProjectRequestSchema,
  EducationSchema,
  LanguageSkillSchema,
  PersonalInfoSchema,
  PositionSchema,
  type Profile,
  ProfileSchema,
  ProjectSchema,
  ReorderAchievementsRequestSchema,
  type UpdateAchievementRequestSchema,
  type UpdateCertificationRequestSchema,
  type UpdateEducationRequestSchema,
  type UpdateLanguageSkillRequestSchema,
  type UpdatePersonalInfoRequestSchema,
  type UpdatePositionRequestSchema,
  type UpdateProjectRequestSchema,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../../shared/api/client';

/*
 * Data access for the master profile. Every screen reads the whole profile from one query
 * (`GET /profile`, already sorted by the API) and every change invalidates it.
 */

export const PROFILE_QUERY_KEY = ['profile'] as const;

/** Request bodies as the client sends them (before the API applies defaults). */
type Body<T extends z.ZodType> = z.input<T>;

export type ContainerKind = 'position' | 'project';
export type Section = 'education' | 'certifications' | 'languages';

const CONTAINER_PATH: Record<ContainerKind, string> = {
  position: '/profile/positions',
  project: '/profile/projects',
};

export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => apiGet('/profile', ProfileSchema),
  });
}

/** A mutation that refreshes the profile when it succeeds. */
function useProfileMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY }),
  });
}

export function useUpdatePersonalInfo() {
  return useProfileMutation((body: Body<typeof UpdatePersonalInfoRequestSchema>) =>
    apiPatch('/profile/personal-info', PersonalInfoSchema, body),
  );
}

// --- Positions and projects -------------------------------------------------------

export function useCreatePosition() {
  return useProfileMutation((body: Body<typeof CreatePositionRequestSchema>) =>
    apiPost(CONTAINER_PATH.position, PositionSchema, body),
  );
}

export function useUpdatePosition() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: Body<typeof UpdatePositionRequestSchema> }) =>
      apiPatch(`${CONTAINER_PATH.position}/${id}`, PositionSchema, body),
  );
}

export function useCreateProject() {
  return useProfileMutation((body: Body<typeof CreateProjectRequestSchema>) =>
    apiPost(CONTAINER_PATH.project, ProjectSchema, body),
  );
}

export function useUpdateProject() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: Body<typeof UpdateProjectRequestSchema> }) =>
      apiPatch(`${CONTAINER_PATH.project}/${id}`, ProjectSchema, body),
  );
}

export function useDeleteContainer(kind: ContainerKind) {
  return useProfileMutation((id: string) => apiDelete(`${CONTAINER_PATH[kind]}/${id}`));
}

// --- Achievements -------------------------------------------------------------------

export interface AchievementParent {
  kind: ContainerKind;
  id: string;
}

export function useCreateAchievement(parent: AchievementParent) {
  return useProfileMutation((body: Body<typeof CreateAchievementRequestSchema>) =>
    apiPost(`${CONTAINER_PATH[parent.kind]}/${parent.id}/achievements`, AchievementSchema, body),
  );
}

export function useUpdateAchievement() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: Body<typeof UpdateAchievementRequestSchema> }) =>
      apiPatch(`/profile/achievements/${id}`, AchievementSchema, body),
  );
}

export function useDeleteAchievement() {
  return useProfileMutation((id: string) => apiDelete(`/profile/achievements/${id}`));
}

/** Reorders optimistically so moving an achievement feels instant; rolls back on error. */
export function useReorderAchievements(parent: AchievementParent) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (achievementIds: string[]) =>
      apiPut(
        `${CONTAINER_PATH[parent.kind]}/${parent.id}/achievements/order`,
        ReorderAchievementsRequestSchema,
        { achievementIds },
      ),
    onMutate: async (achievementIds) => {
      await queryClient.cancelQueries({ queryKey: PROFILE_QUERY_KEY });
      const previous = queryClient.getQueryData<Profile>(PROFILE_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData(
          PROFILE_QUERY_KEY,
          reorderInProfile(previous, parent, achievementIds),
        );
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(PROFILE_QUERY_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY }),
  });
}

/** Returns a copy of the profile with the parent's achievements in the given order. */
export function reorderInProfile(
  profile: Profile,
  parent: AchievementParent,
  achievementIds: string[],
): Profile {
  const reorder = <T extends { id: string; achievements: { id: string }[] }>(items: T[]) =>
    items.map((item) => {
      if (item.id !== parent.id) return item;
      const byId = new Map(item.achievements.map((a) => [a.id, a]));
      const ordered = achievementIds.flatMap((id) => {
        const achievement = byId.get(id);
        return achievement ? [achievement] : [];
      });
      return { ...item, achievements: ordered as T['achievements'] };
    });
  return parent.kind === 'position'
    ? { ...profile, positions: reorder(profile.positions) }
    : { ...profile, projects: reorder(profile.projects) };
}

// --- Education, certifications, languages ---------------------------------------------

export function useCreateEducation() {
  return useProfileMutation((body: Body<typeof CreateEducationRequestSchema>) =>
    apiPost('/profile/education', EducationSchema, body),
  );
}

export function useUpdateEducation() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: Body<typeof UpdateEducationRequestSchema> }) =>
      apiPatch(`/profile/education/${id}`, EducationSchema, body),
  );
}

export function useCreateCertification() {
  return useProfileMutation((body: Body<typeof CreateCertificationRequestSchema>) =>
    apiPost('/profile/certifications', CertificationSchema, body),
  );
}

export function useUpdateCertification() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: Body<typeof UpdateCertificationRequestSchema> }) =>
      apiPatch(`/profile/certifications/${id}`, CertificationSchema, body),
  );
}

export function useCreateLanguage() {
  return useProfileMutation((body: Body<typeof CreateLanguageSkillRequestSchema>) =>
    apiPost('/profile/languages', LanguageSkillSchema, body),
  );
}

export function useUpdateLanguage() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: Body<typeof UpdateLanguageSkillRequestSchema> }) =>
      apiPatch(`/profile/languages/${id}`, LanguageSkillSchema, body),
  );
}

export function useDeleteFromSection(section: Section) {
  return useProfileMutation((id: string) => apiDelete(`/profile/${section}/${id}`));
}
