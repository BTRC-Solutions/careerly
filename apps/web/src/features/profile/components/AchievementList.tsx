import type { Achievement } from '@careerly/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useFieldError } from '../../../shared/lib/form-errors';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Field, Input, Textarea } from '../../../shared/ui/form';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, TrashIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import {
  type AchievementParent,
  useCreateAchievement,
  useDeleteAchievement,
  useReorderAchievements,
  useUpdateAchievement,
} from '../api/profile-api';
import { AchievementFormSchema, withToolIds } from '../lib/form-schemas';
import { FormActions } from './FormActions';
import { EmptyState, SectionCard } from './ProfileLayout';
import { ToolPicker } from './ToolPicker';

type FormInput = z.input<typeof AchievementFormSchema>;
type FormOutput = z.output<typeof AchievementFormSchema>;

/**
 * Achievements of a position or project (RF-PROF-03): unlimited, in the user's order.
 * Built for long lists (20+): fast entry that keeps focus in the composer, inline editing,
 * and move up/down buttons that work with the keyboard.
 */
export function AchievementList({
  parent,
  achievements,
}: {
  parent: AchievementParent;
  achievements: Achievement[];
}) {
  const { t } = useTranslation();
  const reorder = useReorderAchievements(parent);
  const [editingId, setEditingId] = useState<string>();
  const [toDelete, setToDelete] = useState<Achievement>();
  const deleteAchievement = useDeleteAchievement();

  // After moving, keep keyboard focus on the same button of the moved achievement.
  // The key of the button to focus is kept in a ref: it is consumed once the new order renders.
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterMove = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (focusAfterMove.current) {
      buttons.current.get(focusAfterMove.current)?.focus();
      focusAfterMove.current = undefined;
    }
  }, [achievements]);

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= achievements.length) return;
    const ids = achievements.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    // If the button reached the edge it will be disabled; focus the other direction instead.
    const edge = target === 0 || target === achievements.length - 1;
    const direction = edge ? (offset === -1 ? 'down' : 'up') : offset === -1 ? 'up' : 'down';
    focusAfterMove.current = `${achievements[index]!.id}:${direction}`;
    reorder.mutate(ids);
  }

  const registerButton = (key: string) => (element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(key, element);
    else buttons.current.delete(key);
  };

  return (
    <SectionCard title={t('profile.achievements.title', { count: achievements.length })}>
      <p className="-mt-2 mb-4 text-sm text-steel-text">{t('profile.achievements.description')}</p>
      {reorder.isError && (
        <InlineError className="mb-3">
          {t('profile.achievements.reorderError', { message: reorder.error.message })}
        </InlineError>
      )}

      {achievements.length === 0 ? (
        <EmptyState>{t('profile.achievements.empty')}</EmptyState>
      ) : (
        <ol className="flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
          {achievements.map((achievement, index) => (
            <li key={achievement.id} className="px-4 py-3">
              {editingId === achievement.id ? (
                <EditAchievement
                  achievement={achievement}
                  onDone={() => {
                    setEditingId(undefined);
                    // Return focus to the row's edit button once the row is rendered again.
                    requestAnimationFrame(() =>
                      buttons.current.get(`${achievement.id}:edit`)?.focus(),
                    );
                  }}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-[13px] text-steel-text">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm whitespace-pre-wrap text-slate-ink">{achievement.text}</p>
                    {achievement.metrics && (
                      <p className="mt-1 font-mono text-[13px] text-seafoam-700">
                        {achievement.metrics}
                      </p>
                    )}
                    {achievement.tools.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {achievement.tools.map((tool) => (
                          <li key={tool.id}>
                            <Tag>{tool.name}</Tag>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      ref={registerButton(`${achievement.id}:up`)}
                      variant="ghost"
                      size="sm"
                      aria-label={t('profile.achievements.moveUp', { position: index + 1 })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      ref={registerButton(`${achievement.id}:down`)}
                      variant="ghost"
                      size="sm"
                      aria-label={t('profile.achievements.moveDown', { position: index + 1 })}
                      disabled={index === achievements.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      ref={registerButton(`${achievement.id}:edit`)}
                      variant="ghost"
                      size="sm"
                      aria-label={t('profile.achievements.edit', { position: index + 1 })}
                      onClick={() => setEditingId(achievement.id)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('profile.achievements.delete', { position: index + 1 })}
                      onClick={() => setToDelete(achievement)}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <AchievementComposer parent={parent} />

      <ConfirmDialog
        open={toDelete !== undefined}
        onOpenChange={(open) => !open && setToDelete(undefined)}
        title={t('profile.achievements.deleteTitle')}
        description={toDelete?.text}
        confirmLabel={t('common.delete')}
        onConfirm={() => deleteAchievement.mutateAsync(toDelete!.id)}
      />
    </SectionCard>
  );
}

function AchievementFields({
  form,
  autoFocus,
}: {
  form: ReturnType<typeof useForm<FormInput, unknown, FormOutput>>;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const { errors } = form.formState;
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t('profile.achievements.text')}
        hint={t('profile.achievements.textHint')}
        error={fieldError(errors.text)}
      >
        {(control) => (
          <Textarea rows={3} autoFocus={autoFocus} {...control} {...form.register('text')} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t('profile.achievements.metrics')}
          hint={t('profile.achievements.metricsHint')}
          error={fieldError(errors.metrics)}
        >
          {(control) => <Input {...control} {...form.register('metrics')} />}
        </Field>
        <Field label={t('profile.tools.label')} labelsControl={false}>
          {({ id: _id, ...aria }) => (
            <Controller
              control={form.control}
              name="tools"
              render={({ field }) => (
                <ToolPicker value={field.value} onChange={field.onChange} {...aria} />
              )}
            />
          )}
        </Field>
      </div>
    </div>
  );
}

/** Adds achievements one after another; after saving, the text field is focused again. */
function AchievementComposer({ parent }: { parent: AchievementParent }) {
  const { t } = useTranslation();
  const create = useCreateAchievement(parent);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(AchievementFormSchema),
    defaultValues: { text: '', metrics: '', tools: [] },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(withToolIds(values));
    } catch {
      return;
    }
    form.reset({ text: '', metrics: '', tools: [] });
    form.setFocus('text');
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        // Ctrl/Cmd + Enter saves from the text area.
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit();
      }}
      noValidate
      className="mt-4 rounded-control border border-silver-lining bg-cloud-canvas/50 p-4"
      aria-label={t('profile.achievements.add')}
    >
      <h3 className="mb-3 text-sm font-medium text-indigo-navy">{t('profile.achievements.add')}</h3>
      <AchievementFields form={form} />
      <FormActions
        submitLabel={t('profile.achievements.addButton')}
        pending={create.isPending}
        error={create.error}
        status={t('profile.achievements.shortcut')}
      />
    </form>
  );
}

function EditAchievement({
  achievement,
  onDone,
}: {
  achievement: Achievement;
  onDone: () => void;
}) {
  const update = useUpdateAchievement();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(AchievementFormSchema),
    defaultValues: {
      text: achievement.text,
      metrics: achievement.metrics ?? '',
      tools: achievement.tools,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ id: achievement.id, body: withToolIds(values) });
      onDone();
    } catch {
      // Shown by FormActions.
    }
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone();
      }}
      noValidate
    >
      <AchievementFields form={form} autoFocus />
      <FormActions pending={update.isPending} error={update.error} onCancel={onDone} />
    </form>
  );
}
