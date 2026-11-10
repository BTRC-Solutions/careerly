import {
  CreateAchievementRequestSchema,
  CreateCertificationRequestSchema,
  CreateEducationRequestSchema,
  CreatePositionRequestSchema,
  CreateProjectRequestSchema,
  ToolRefSchema,
} from '@careerly/contracts';
import { z } from 'zod';

/*
 * Form schemas: the shared create schemas, plus what only the form needs
 * (selected tools with their names, the "current" checkbox) and cross-field date checks
 * so the user sees the error next to the field instead of after saving.
 */

const tools = z.array(ToolRefSchema);

function endNotBeforeStart(
  start: string | null,
  end: string | null,
  ctx: z.RefinementCtx,
  path: string,
) {
  if (start && end && end < start) {
    ctx.addIssue({ code: 'custom', path: [path], message: 'validation.endBeforeStart' });
  }
}

export const PositionFormSchema = CreatePositionRequestSchema.omit({ toolIds: true })
  .extend({ tools, current: z.boolean() })
  .superRefine((value, ctx) => {
    if (!value.current) endNotBeforeStart(value.startDate, value.endDate, ctx, 'endDate');
  });

export const ProjectFormSchema = CreateProjectRequestSchema.omit({ toolIds: true })
  .extend({ tools })
  .superRefine((value, ctx) => endNotBeforeStart(value.startDate, value.endDate, ctx, 'endDate'));

export const AchievementFormSchema = CreateAchievementRequestSchema.omit({ toolIds: true }).extend({
  tools,
});

export const EducationFormSchema = CreateEducationRequestSchema.superRefine((value, ctx) =>
  endNotBeforeStart(value.startDate, value.endDate, ctx, 'endDate'),
);

export const CertificationFormSchema = CreateCertificationRequestSchema.superRefine((value, ctx) =>
  endNotBeforeStart(value.issueDate, value.expirationDate, ctx, 'expirationDate'),
);

/** Form values → API body: tool references become ids. */
export function withToolIds<T extends { tools: { id: string }[] }>({
  tools: selected,
  ...rest
}: T) {
  return { ...rest, toolIds: selected.map((tool) => tool.id) };
}
