import {
  EducationKindSchema,
  LanguageLevelSchema,
  LinkKindSchema,
  ProjectKindSchema,
  WorkModeSchema,
} from '@careerly/contracts';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { Tag } from '../../../shared/ui/Tag';
import {
  type CvReview,
  PERSONAL_FIELDS,
  type ReviewAchievement,
  type ReviewIssue,
  type ReviewTool,
} from '../lib/cv-import-review';
import { formatMonthRange } from '../lib/dates';
import { SectionCard } from './ProfileLayout';

/** Edits the review state: the callback mutates a copy, which becomes the new state. */
export type UpdateReview = (change: (review: CvReview) => void) => void;

interface ReviewProps {
  review: CvReview;
  issues: Map<string, ReviewIssue[]>;
  update: UpdateReview;
}

/** The draft read from the CV, editable, one card per profile section (RF-PROF-09). */
export function CvImportReview(props: ReviewProps) {
  const { review } = props;
  return (
    <div className="flex flex-col gap-6">
      <PersonalInfoReview {...props} />
      {review.positions.length > 0 && <PositionsReview {...props} />}
      {review.projects.length > 0 && <ProjectsReview {...props} />}
      {review.education.length > 0 && <EducationReview {...props} />}
      {review.certifications.length > 0 && <CertificationsReview {...props} />}
      {review.languages.length > 0 && <LanguagesReview {...props} />}
    </div>
  );
}

// --- Building blocks ------------------------------------------------------------------

function IssueList({ issues }: { issues: ReviewIssue[] | undefined }) {
  const { t } = useTranslation();
  if (!issues?.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {issues.map((issue) => (
        <li key={issue} className="flex items-start gap-2 text-sm text-slate-ink">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-signal-orange"
          />
          {t(`profile.import.issues.${issue}`)}
        </li>
      ))}
    </ul>
  );
}

/** Tools as read from the CV. Unknown ones are created as user tools when saving. */
function ToolChips({
  tools,
  onRemove,
}: {
  tools: ReviewTool[];
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (tools.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('profile.tools.label')}>
      {tools.map((tool, index) => (
        <li key={`${tool.name}-${index}`}>
          <Tag
            onRemove={() => onRemove(index)}
            removeLabel={t('profile.tools.remove', { name: tool.label })}
            className={cn(tool.toolId === null && 'border-dashed bg-pure-white')}
          >
            {tool.label}
            {tool.toolId === null && (
              <span className="font-normal text-steel-text" title={t('profile.import.newToolHint')}>
                · {t('profile.import.newTool')}
              </span>
            )}
          </Tag>
        </li>
      ))}
    </ul>
  );
}

/**
 * One element of the draft: include checkbox, summary, issues, and its fields when editing.
 * Elements with problems open in edit mode so the fix is one click away.
 */
function ReviewItem({
  include,
  onInclude,
  primary,
  secondary,
  aside,
  issues,
  fields,
  children,
}: {
  include: boolean;
  onInclude: (include: boolean) => void;
  primary: string;
  secondary?: string;
  aside?: string | null;
  issues: ReviewIssue[] | undefined;
  fields: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const open = include && (editing || Boolean(issues?.length));

  return (
    <li className="rounded-control border border-silver-lining p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={include}
          onChange={(event) => onInclude(event.target.checked)}
          aria-label={t('profile.import.includeItem', { name: primary })}
          className="mt-1 size-4 shrink-0 accent-indigo-navy"
        />
        <div className={cn('min-w-0 flex-1', !include && 'opacity-50')}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-slate-ink">{primary || '—'}</p>
              {secondary && <p className="text-sm text-steel-text">{secondary}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {aside && <span className="text-sm text-steel-text">{aside}</span>}
              {include && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(!open)}>
                  {open ? t('profile.import.doneEditing') : t('profile.import.edit')}
                </Button>
              )}
            </div>
          </div>
          {include && <IssueList issues={issues} />}
          {open && <div className="mt-4 grid grid-cols-2 gap-4">{fields}</div>}
          {include && children}
        </div>
      </div>
    </li>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  className,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'month' | 'email' | 'url';
  className?: string;
  multiline?: boolean;
}) {
  return (
    <Field label={label} className={className}>
      {(control) =>
        multiline ? (
          <Textarea {...control} value={value} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <Input
            {...control}
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
  emptyLabel,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  labelOf: (option: T) => string;
  onChange: (value: T | null) => void;
  /** Adds a "not specified" option. */
  emptyLabel?: string;
}) {
  return (
    <Field label={label}>
      {(control) => (
        <Select
          {...control}
          value={value ?? ''}
          onChange={(event) => onChange((event.target.value || null) as T | null)}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {options.map((option) => (
            <option key={option} value={option}>
              {labelOf(option)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function sectionTitle(title: string, items: { include: boolean }[]) {
  const included = items.filter((item) => item.include).length;
  return `${title} · ${included}/${items.length}`;
}

// --- Personal information ------------------------------------------------------------

function PersonalInfoReview({ review, issues, update }: ReviewProps) {
  const { t } = useTranslation();
  const fields = PERSONAL_FIELDS.filter((field) => review.personal[field].value !== '');
  if (fields.length === 0 && review.links.length === 0) return null;

  return (
    <SectionCard title={t('profile.personal.title')}>
      <ul className="flex flex-col gap-3">
        {fields.map((field) => {
          const item = review.personal[field];
          const label = t(`profile.personal.${field}`);
          return (
            <li key={field} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={item.include}
                onChange={(event) =>
                  update((draft) => {
                    draft.personal[field].include = event.target.checked;
                  })
                }
                aria-label={t('profile.import.includeItem', { name: label })}
                className="mt-9 size-4 shrink-0 accent-indigo-navy"
              />
              <div className={cn('flex-1', !item.include && 'opacity-50')}>
                <TextField
                  label={label}
                  value={item.value}
                  multiline={field === 'summary'}
                  onChange={(value) =>
                    update((draft) => {
                      draft.personal[field].value = value;
                    })
                  }
                />
                {item.current && item.current !== item.value.trim() && (
                  <p className="mt-1 text-sm text-steel-text">
                    {t(item.include ? 'profile.import.replaces' : 'profile.import.keeps', {
                      value: item.current,
                    })}
                  </p>
                )}
                <IssueList issues={issues.get(`personal.${field}`)} />
              </div>
            </li>
          );
        })}
      </ul>

      {review.links.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-slate-ink">{t('profile.personal.links')}</h3>
          <ul className="flex flex-col gap-3">
            {review.links.map((link, index) => (
              <li key={link.key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={link.include}
                  onChange={(event) =>
                    update((draft) => {
                      draft.links[index]!.include = event.target.checked;
                    })
                  }
                  aria-label={t('profile.import.includeItem', { name: link.url })}
                  className="mt-2.5 size-4 shrink-0 accent-indigo-navy"
                />
                <div className={cn('flex-1', !link.include && 'opacity-50')}>
                  <div className="grid grid-cols-[10rem_1fr] gap-2">
                    <Select
                      aria-label={t('profile.personal.linkKind')}
                      value={link.kind}
                      onChange={(event) =>
                        update((draft) => {
                          draft.links[index]!.kind = LinkKindSchema.parse(event.target.value);
                        })
                      }
                    >
                      {LinkKindSchema.options.map((kind) => (
                        <option key={kind} value={kind}>
                          {t(`profile.enums.linkKind.${kind}`)}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="url"
                      aria-label={t('profile.personal.linkUrl')}
                      value={link.url}
                      onChange={(event) =>
                        update((draft) => {
                          draft.links[index]!.url = event.target.value;
                        })
                      }
                    />
                  </div>
                  <IssueList issues={link.include ? issues.get(link.key) : undefined} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

// --- Positions and projects -------------------------------------------------------------

function AchievementsReview({
  items,
  issues,
  onChange,
}: {
  items: ReviewAchievement[];
  issues: Map<string, ReviewIssue[]>;
  onChange: (change: (items: ReviewAchievement[]) => void) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-medium text-slate-ink">
        {t('profile.achievements.title', { count: items.length })}
      </h3>
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.key} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={item.include}
              onChange={(event) =>
                onChange((draft) => {
                  draft[index]!.include = event.target.checked;
                })
              }
              aria-label={t('profile.import.includeAchievement', { position: index + 1 })}
              className="mt-2.5 size-4 shrink-0 accent-indigo-navy"
            />
            <div className={cn('flex-1', !item.include && 'opacity-50')}>
              <Textarea
                aria-label={t('profile.achievements.text')}
                value={item.text}
                rows={2}
                className="min-h-0"
                onChange={(event) =>
                  onChange((draft) => {
                    draft[index]!.text = event.target.value;
                  })
                }
              />
              <Input
                aria-label={t('profile.achievements.metrics')}
                placeholder={t('profile.achievements.metrics')}
                value={item.metrics}
                className="mt-1.5"
                onChange={(event) =>
                  onChange((draft) => {
                    draft[index]!.metrics = event.target.value;
                  })
                }
              />
              <ToolChips
                tools={item.tools}
                onRemove={(tool) =>
                  onChange((draft) => {
                    draft[index]!.tools.splice(tool, 1);
                  })
                }
              />
              <IssueList issues={item.include ? issues.get(item.key) : undefined} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PositionsReview({ review, issues, update }: ReviewProps) {
  const { t, i18n } = useTranslation();
  return (
    <SectionCard title={sectionTitle(t('profile.positions.title'), review.positions)}>
      <ul className="flex flex-col gap-3">
        {review.positions.map((item, index) => {
          const set = (change: (position: CvReview['positions'][number]) => void) =>
            update((draft) => change(draft.positions[index]!));
          return (
            <ReviewItem
              key={item.key}
              include={item.include}
              onInclude={(include) => set((position) => void (position.include = include))}
              primary={item.title}
              secondary={[item.company, item.location].filter(Boolean).join(' · ')}
              aside={formatMonthRange(
                item.startDate || null,
                item.endDate || null,
                i18n.language,
                t('profile.dates.present'),
              )}
              issues={issues.get(item.key)}
              fields={
                <>
                  <TextField
                    label={t('profile.position.title')}
                    value={item.title}
                    onChange={(value) => set((position) => void (position.title = value))}
                  />
                  <TextField
                    label={t('profile.position.company')}
                    value={item.company}
                    onChange={(value) => set((position) => void (position.company = value))}
                  />
                  <TextField
                    label={t('profile.dates.start')}
                    type="month"
                    value={item.startDate}
                    onChange={(value) => set((position) => void (position.startDate = value))}
                  />
                  <TextField
                    label={t('profile.import.endOrCurrent')}
                    type="month"
                    value={item.endDate}
                    onChange={(value) => set((position) => void (position.endDate = value))}
                  />
                  <TextField
                    label={t('profile.position.location')}
                    value={item.location}
                    onChange={(value) => set((position) => void (position.location = value))}
                  />
                  <SelectField
                    label={t('profile.position.workMode')}
                    value={item.workMode}
                    options={WorkModeSchema.options}
                    labelOf={(mode) => t(`profile.enums.workMode.${mode}`)}
                    emptyLabel={t('common.notSpecified')}
                    onChange={(mode) => set((position) => void (position.workMode = mode))}
                  />
                  <TextField
                    label={t('profile.position.context')}
                    value={item.context}
                    multiline
                    className="col-span-2"
                    onChange={(value) => set((position) => void (position.context = value))}
                  />
                </>
              }
            >
              <ToolChips
                tools={item.tools}
                onRemove={(tool) => set((position) => void position.tools.splice(tool, 1))}
              />
              <AchievementsReview
                items={item.achievements}
                issues={issues}
                onChange={(change) => set((position) => change(position.achievements))}
              />
            </ReviewItem>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function ProjectsReview({ review, issues, update }: ReviewProps) {
  const { t, i18n } = useTranslation();
  return (
    <SectionCard title={sectionTitle(t('profile.projects.title'), review.projects)}>
      <ul className="flex flex-col gap-3">
        {review.projects.map((item, index) => {
          const set = (change: (project: CvReview['projects'][number]) => void) =>
            update((draft) => change(draft.projects[index]!));
          return (
            <ReviewItem
              key={item.key}
              include={item.include}
              onInclude={(include) => set((project) => void (project.include = include))}
              primary={item.name}
              secondary={[t(`profile.enums.projectKind.${item.kind}`), item.role]
                .filter(Boolean)
                .join(' · ')}
              aside={formatMonthRange(
                item.startDate || null,
                item.endDate || null,
                i18n.language,
                t('profile.dates.inProgress'),
              )}
              issues={issues.get(item.key)}
              fields={
                <>
                  <TextField
                    label={t('profile.project.name')}
                    value={item.name}
                    onChange={(value) => set((project) => void (project.name = value))}
                  />
                  <SelectField
                    label={t('profile.project.kind')}
                    value={item.kind}
                    options={ProjectKindSchema.options}
                    labelOf={(kind) => t(`profile.enums.projectKind.${kind}`)}
                    onChange={(kind) => set((project) => void (project.kind = kind ?? 'PERSONAL'))}
                  />
                  <TextField
                    label={t('profile.project.role')}
                    value={item.role}
                    onChange={(value) => set((project) => void (project.role = value))}
                  />
                  <TextField
                    label={t('profile.project.url')}
                    type="url"
                    value={item.url}
                    onChange={(value) => set((project) => void (project.url = value))}
                  />
                  <TextField
                    label={t('profile.dates.start')}
                    type="month"
                    value={item.startDate}
                    onChange={(value) => set((project) => void (project.startDate = value))}
                  />
                  <TextField
                    label={t('profile.dates.end')}
                    type="month"
                    value={item.endDate}
                    onChange={(value) => set((project) => void (project.endDate = value))}
                  />
                  <TextField
                    label={t('profile.project.description')}
                    value={item.description}
                    multiline
                    className="col-span-2"
                    onChange={(value) => set((project) => void (project.description = value))}
                  />
                </>
              }
            >
              <ToolChips
                tools={item.tools}
                onRemove={(tool) => set((project) => void project.tools.splice(tool, 1))}
              />
              <AchievementsReview
                items={item.achievements}
                issues={issues}
                onChange={(change) => set((project) => change(project.achievements))}
              />
            </ReviewItem>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// --- Education, certifications and languages -----------------------------------------------

function EducationReview({ review, issues, update }: ReviewProps) {
  const { t, i18n } = useTranslation();
  return (
    <SectionCard title={sectionTitle(t('profile.education.title'), review.education)}>
      <ul className="flex flex-col gap-3">
        {review.education.map((item, index) => {
          const set = (change: (education: CvReview['education'][number]) => void) =>
            update((draft) => change(draft.education[index]!));
          return (
            <ReviewItem
              key={item.key}
              include={item.include}
              onInclude={(include) => set((education) => void (education.include = include))}
              primary={item.title}
              secondary={[item.institution, t(`profile.enums.educationKind.${item.kind}`)]
                .filter(Boolean)
                .join(' · ')}
              aside={formatMonthRange(
                item.startDate || null,
                item.endDate || null,
                i18n.language,
                t('profile.dates.inProgress'),
              )}
              issues={issues.get(item.key)}
              fields={
                <>
                  <TextField
                    label={t('profile.education.titleField')}
                    value={item.title}
                    onChange={(value) => set((education) => void (education.title = value))}
                  />
                  <TextField
                    label={t('profile.education.institution')}
                    value={item.institution}
                    onChange={(value) => set((education) => void (education.institution = value))}
                  />
                  <SelectField
                    label={t('profile.education.kind')}
                    value={item.kind}
                    options={EducationKindSchema.options}
                    labelOf={(kind) => t(`profile.enums.educationKind.${kind}`)}
                    onChange={(kind) =>
                      set((education) => void (education.kind = kind ?? 'DEGREE'))
                    }
                  />
                  <TextField
                    label={t('profile.education.field')}
                    value={item.field}
                    onChange={(value) => set((education) => void (education.field = value))}
                  />
                  <TextField
                    label={t('profile.dates.start')}
                    type="month"
                    value={item.startDate}
                    onChange={(value) => set((education) => void (education.startDate = value))}
                  />
                  <TextField
                    label={t('profile.dates.end')}
                    type="month"
                    value={item.endDate}
                    onChange={(value) => set((education) => void (education.endDate = value))}
                  />
                </>
              }
            />
          );
        })}
      </ul>
    </SectionCard>
  );
}

function CertificationsReview({ review, issues, update }: ReviewProps) {
  const { t, i18n } = useTranslation();
  return (
    <SectionCard title={sectionTitle(t('profile.certifications.title'), review.certifications)}>
      <ul className="flex flex-col gap-3">
        {review.certifications.map((item, index) => {
          const set = (change: (certification: CvReview['certifications'][number]) => void) =>
            update((draft) => change(draft.certifications[index]!));
          return (
            <ReviewItem
              key={item.key}
              include={item.include}
              onInclude={(include) =>
                set((certification) => void (certification.include = include))
              }
              primary={item.name}
              secondary={item.issuer}
              aside={formatMonthRange(item.issueDate || null, null, i18n.language, null)}
              issues={issues.get(item.key)}
              fields={
                <>
                  <TextField
                    label={t('profile.certifications.name')}
                    value={item.name}
                    onChange={(value) => set((certification) => void (certification.name = value))}
                  />
                  <TextField
                    label={t('profile.certifications.issuer')}
                    value={item.issuer}
                    onChange={(value) =>
                      set((certification) => void (certification.issuer = value))
                    }
                  />
                  <TextField
                    label={t('profile.certifications.issueDate')}
                    type="month"
                    value={item.issueDate}
                    onChange={(value) =>
                      set((certification) => void (certification.issueDate = value))
                    }
                  />
                  <TextField
                    label={t('profile.certifications.expirationDate')}
                    type="month"
                    value={item.expirationDate}
                    onChange={(value) =>
                      set((certification) => void (certification.expirationDate = value))
                    }
                  />
                  <TextField
                    label={t('profile.certifications.credentialId')}
                    value={item.credentialId}
                    onChange={(value) =>
                      set((certification) => void (certification.credentialId = value))
                    }
                  />
                  <TextField
                    label={t('profile.certifications.url')}
                    type="url"
                    value={item.url}
                    onChange={(value) => set((certification) => void (certification.url = value))}
                  />
                </>
              }
            />
          );
        })}
      </ul>
    </SectionCard>
  );
}

function LanguagesReview({ review, issues, update }: ReviewProps) {
  const { t } = useTranslation();
  return (
    <SectionCard title={sectionTitle(t('profile.languages.title'), review.languages)}>
      <ul className="flex flex-col gap-3">
        {review.languages.map((item, index) => {
          const set = (change: (language: CvReview['languages'][number]) => void) =>
            update((draft) => change(draft.languages[index]!));
          return (
            <ReviewItem
              key={item.key}
              include={item.include}
              onInclude={(include) => set((language) => void (language.include = include))}
              primary={item.language}
              secondary={[t(`profile.enums.languageLevel.${item.level}`), item.notes]
                .filter(Boolean)
                .join(' · ')}
              issues={issues.get(item.key)}
              fields={
                <>
                  <TextField
                    label={t('profile.languages.language')}
                    value={item.language}
                    onChange={(value) => set((language) => void (language.language = value))}
                  />
                  <SelectField
                    label={t('profile.languages.level')}
                    value={item.level}
                    options={LanguageLevelSchema.options}
                    labelOf={(level) => t(`profile.enums.languageLevel.${level}`)}
                    onChange={(level) => set((language) => void (language.level = level ?? 'B1'))}
                  />
                  <TextField
                    label={t('profile.languages.notes')}
                    value={item.notes}
                    className="col-span-2"
                    onChange={(value) => set((language) => void (language.notes = value))}
                  />
                </>
              }
            />
          );
        })}
      </ul>
    </SectionCard>
  );
}
