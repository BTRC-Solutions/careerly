import type { Position, Project } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { PlusIcon } from '../../../shared/ui/icons';
import { Tag } from '../../../shared/ui/Tag';
import { type ContainerKind, useCreatePosition, useCreateProject } from '../api/profile-api';
import { PositionForm, ProjectForm } from '../components/ContainerForms';
import { EmptyState, SectionCard, WithProfile } from '../components/ProfileLayout';
import { formatMonthRange } from '../lib/dates';

const MAX_TOOLS_SHOWN = 8;

/** List of positions or projects; each one opens its detail page with the achievements. */
export function ContainerListPage({ kind }: { kind: ContainerKind }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const createPosition = useCreatePosition();
  const createProject = useCreateProject();
  const keyPrefix = kind === 'position' ? 'profile.positions' : 'profile.projects';
  const basePath = kind === 'position' ? '/profile/experience' : '/profile/projects';

  return (
    <WithProfile>
      {(profile) => {
        const items: (Position | Project)[] =
          kind === 'position' ? profile.positions : profile.projects;
        return (
          <SectionCard
            title={t(`${keyPrefix}.title`)}
            actions={
              <Button onClick={() => setAdding(true)}>
                <PlusIcon /> {t(`${keyPrefix}.add`)}
              </Button>
            }
          >
            {items.length === 0 ? (
              <EmptyState>{t(`${keyPrefix}.empty`)}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((item) => {
                  const range = formatMonthRange(
                    item.startDate,
                    item.endDate,
                    i18n.language,
                    t('profile.dates.present'),
                  );
                  const heading = 'company' in item ? item.title : item.name;
                  const subheading =
                    'company' in item ? item.company : t(`profile.enums.projectKind.${item.kind}`);
                  return (
                    <li key={item.id}>
                      <Link
                        to={`${basePath}/${item.id}`}
                        className="block rounded-control border border-silver-lining px-4 py-3 transition-colors hover:border-indigo-navy hover:bg-cloud-canvas"
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <p className="text-sm font-medium text-indigo-navy">
                            {heading}
                            <span className="font-normal text-slate-ink"> · {subheading}</span>
                          </p>
                          {range && <p className="shrink-0 text-sm text-steel-text">{range}</p>}
                        </div>
                        <p className="mt-1 text-sm text-steel-text">
                          {t('profile.achievements.count', { count: item.achievements.length })}
                        </p>
                        {item.tools.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {item.tools.slice(0, MAX_TOOLS_SHOWN).map((tool) => (
                              <li key={tool.id}>
                                <Tag>{tool.name}</Tag>
                              </li>
                            ))}
                            {item.tools.length > MAX_TOOLS_SHOWN && (
                              <li className="text-xs text-steel-text">
                                +{item.tools.length - MAX_TOOLS_SHOWN}
                              </li>
                            )}
                          </ul>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <Dialog open={adding} onOpenChange={setAdding} title={t(`${keyPrefix}.add`)} size="lg">
              {kind === 'position' ? (
                <PositionForm
                  submitLabel={t('common.create')}
                  pending={createPosition.isPending}
                  error={createPosition.error}
                  onCancel={() => setAdding(false)}
                  onSubmit={async (body) => {
                    const created = await createPosition.mutateAsync(body);
                    setAdding(false);
                    void navigate(`${basePath}/${created.id}`);
                  }}
                />
              ) : (
                <ProjectForm
                  submitLabel={t('common.create')}
                  pending={createProject.isPending}
                  error={createProject.error}
                  onCancel={() => setAdding(false)}
                  onSubmit={async (body) => {
                    const created = await createProject.mutateAsync(body);
                    setAdding(false);
                    void navigate(`${basePath}/${created.id}`);
                  }}
                />
              )}
            </Dialog>
          </SectionCard>
        );
      }}
    </WithProfile>
  );
}
