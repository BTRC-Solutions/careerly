import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ChevronLeftIcon, TrashIcon } from '../../../shared/ui/icons';
import {
  type ContainerKind,
  useDeleteContainer,
  useUpdatePosition,
  useUpdateProject,
} from '../api/profile-api';
import { AchievementList } from '../components/AchievementList';
import { PositionForm, ProjectForm } from '../components/ContainerForms';
import { EmptyState, SectionCard, WithProfile } from '../components/ProfileLayout';
import { formatMonthRange } from '../lib/dates';

/** One position or project: its details form and its achievements. */
export function ContainerDetailPage({ kind }: { kind: ContainerKind }) {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const updatePosition = useUpdatePosition();
  const updateProject = useUpdateProject();
  const deleteContainer = useDeleteContainer(kind);
  const keyPrefix = kind === 'position' ? 'profile.positions' : 'profile.projects';
  const listPath = kind === 'position' ? '/profile/experience' : '/profile/projects';

  return (
    <WithProfile>
      {(profile) => {
        const item =
          kind === 'position'
            ? profile.positions.find((p) => p.id === id)
            : profile.projects.find((p) => p.id === id);

        const back = (
          <Link
            to={listPath}
            className="inline-flex items-center gap-1 self-start text-sm text-steel-text hover:text-indigo-navy"
          >
            <ChevronLeftIcon /> {t(`${keyPrefix}.back`)}
          </Link>
        );

        if (!item) {
          return (
            <div className="flex flex-col gap-4">
              {back}
              <EmptyState>{t(`${keyPrefix}.notFound`)}</EmptyState>
            </div>
          );
        }

        const heading = 'company' in item ? `${item.title} · ${item.company}` : item.name;
        const range = formatMonthRange(
          item.startDate,
          item.endDate,
          i18n.language,
          t('profile.dates.present'),
        );

        return (
          <div className="flex flex-col gap-6">
            {back}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-medium tracking-tight text-indigo-navy">{heading}</h2>
                {range && <p className="mt-1 text-sm text-steel-text">{range}</p>}
              </div>
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                <TrashIcon /> {t('common.delete')}
              </Button>
            </div>

            <SectionCard title={t(`${keyPrefix}.details`)}>
              {'company' in item ? (
                <PositionForm
                  key={item.updatedAt}
                  initial={item}
                  pending={updatePosition.isPending}
                  error={updatePosition.error}
                  status={saved ? t('common.saved') : undefined}
                  onSubmit={async (body) => {
                    setSaved(false);
                    await updatePosition.mutateAsync({ id: item.id, body });
                    setSaved(true);
                  }}
                />
              ) : (
                <ProjectForm
                  key={item.updatedAt}
                  initial={item}
                  pending={updateProject.isPending}
                  error={updateProject.error}
                  status={saved ? t('common.saved') : undefined}
                  onSubmit={async (body) => {
                    setSaved(false);
                    await updateProject.mutateAsync({ id: item.id, body });
                    setSaved(true);
                  }}
                />
              )}
            </SectionCard>

            <AchievementList parent={{ kind, id: item.id }} achievements={item.achievements} />

            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={t(`${keyPrefix}.deleteTitle`)}
              description={t(`${keyPrefix}.deleteDescription`, {
                name: heading,
                count: item.achievements.length,
              })}
              confirmLabel={t('common.delete')}
              onConfirm={async () => {
                await deleteContainer.mutateAsync(item.id);
                void navigate(listPath);
              }}
            />
          </div>
        );
      }}
    </WithProfile>
  );
}
