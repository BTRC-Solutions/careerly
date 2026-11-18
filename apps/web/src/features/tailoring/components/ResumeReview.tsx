import type {
  BulletInclusion,
  EditTailoredResumeRequest,
  ResumeLanguage,
  TailoredResume,
  TailoringSession,
} from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Select, Textarea } from '../../../shared/ui/form';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PdfFrame } from '../../../shared/ui/PdfFrame';
import { Tag } from '../../../shared/ui/Tag';
import { useProfile } from '../../profile/api/profile-api';
import { useEditResume, useResumePreview, useTailoredResumes } from '../api/tailoring-api';
import {
  type BulletState,
  type ReviewBullet,
  type ReviewExperience,
  reviewExperiences,
} from '../lib/resume-review';

type Edit = (edit: EditTailoredResumeRequest) => void;

/**
 * Review of the tailored CVs (roadmap 6.6, RF-TAIL-12): the PDF preview next to every bullet with its source,
 * to edit, include or leave out and reorder. Each change is fitted to the pages again on the server (RN-04) and
 * the preview reloads.
 */
export function ResumeReview({ session }: { session: TailoringSession }) {
  const { t } = useTranslation();
  const resumes = useTailoredResumes(session.id, true);
  const [language, setLanguage] = useState<ResumeLanguage>(session.languages[0] ?? 'es');
  const resume = resumes.data?.resumes.find((r) => r.language === language);

  if (resumes.isPending) {
    return (
      <p role="status" className="text-sm text-steel-text">
        {t('tailoring.loading')}
      </p>
    );
  }
  if (resumes.isError || !resume) {
    return (
      <Card>
        <InlineError>{t('tailoring.review.loadError')}</InlineError>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {session.languages.length > 1 && (
        <div
          role="group"
          aria-label={t('tailoring.review.language')}
          className="flex w-fit rounded-control border border-silver-lining p-0.5"
        >
          {session.languages.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === language}
              onClick={() => setLanguage(option)}
              className={cn(
                'rounded-[6px] px-3 py-1 text-sm font-medium transition-colors',
                option === language
                  ? 'bg-indigo-navy text-pure-white'
                  : 'text-steel-text hover:text-indigo-navy',
              )}
            >
              {t(`tailoring.review.languages.${option}`)}
            </button>
          ))}
        </div>
      )}
      <ResumeEditor key={language} session={session} resume={resume} />
    </div>
  );
}

function ResumeEditor({ session, resume }: { session: TailoringSession; resume: TailoredResume }) {
  const { t } = useTranslation();
  const profile = useProfile();
  const edit = useEditResume(session.id, resume.language);
  const preview = useResumePreview(session.id, resume.language);
  const busy = edit.isPending;
  const apply: Edit = (change) => edit.mutate(change);
  const experiences = profile.data ? reviewExperiences(resume.data, profile.data) : [];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <FitStatus resume={resume} />
        {edit.error && (
          <InlineError>
            {t('tailoring.review.editError', { message: edit.error.message })}
          </InlineError>
        )}
        <SummaryCard resume={resume} busy={busy} apply={apply} />
        {profile.isPending && (
          <p role="status" className="text-sm text-steel-text">
            {t('tailoring.loading')}
          </p>
        )}
        {experiences.map((experience) => (
          <ExperienceCard
            key={`${experience.kind}:${experience.id}`}
            experience={experience}
            busy={busy}
            apply={apply}
          />
        ))}
        <GuardNotes resume={resume} />
      </div>

      <Card className="flex flex-col gap-3 lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-section-title text-indigo-navy">{t('tailoring.review.preview')}</h2>
          {(busy || preview.isFetching) && (
            <span role="status" className="text-sm text-steel-text">
              {t('tailoring.review.updating')}
            </span>
          )}
        </div>
        <div className="h-[75vh] min-h-[32rem] overflow-hidden rounded-control border border-silver-lining bg-cloud-canvas">
          {preview.isError && !preview.data && (
            <div className="p-6">
              <InlineError>{t('tailoring.review.previewError')}</InlineError>
            </div>
          )}
          {preview.data && (
            <PdfFrame
              pdf={preview.data}
              title={t('tailoring.review.previewTitle', {
                language: t(`tailoring.review.languages.${resume.language}`),
              })}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function FitStatus({ resume }: { resume: TailoredResume }) {
  const { t } = useTranslation();
  const fit = resume.data.fit;
  if (!fit) return null;
  const leftOut = fit.log.filter((entry) => entry.action === 'LEFT_OUT' && entry.bulletId).length;
  return (
    <Card className="flex flex-col gap-1">
      {fit.fits ? (
        <p className="text-sm text-slate-ink">
          {t('tailoring.review.fit.fits', { count: fit.pageCount, budget: fit.pageBudget })}
        </p>
      ) : (
        <InlineError>
          {t('tailoring.review.fit.over', { count: fit.pageBudget, pages: fit.pageCount })}
        </InlineError>
      )}
      <p className="text-sm text-steel-text">
        {leftOut > 0
          ? t('tailoring.review.fit.leftOut', { count: leftOut })
          : t('tailoring.review.fit.allIn')}
      </p>
    </Card>
  );
}

function SummaryCard({
  resume,
  busy,
  apply,
}: {
  resume: TailoredResume;
  busy: boolean;
  apply: Edit;
}) {
  const { t } = useTranslation();
  const summary = resume.data.summary?.text ?? '';
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-section-title text-indigo-navy">{t('tailoring.review.summary')}</h2>
        {draft === null && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(summary)}>
            <PencilIcon />
            {t('tailoring.review.edit')}
          </Button>
        )}
      </div>
      {draft === null ? (
        <p className={cn('text-sm', summary ? 'text-slate-ink' : 'text-steel-text')}>
          {summary || t('tailoring.review.noSummary')}
        </p>
      ) : (
        <TextEditor
          label={t('tailoring.review.summary')}
          value={draft}
          onChange={setDraft}
          busy={busy}
          onCancel={() => setDraft(null)}
          onSave={() => {
            apply({ op: 'EDIT_SUMMARY', text: draft });
            setDraft(null);
          }}
        />
      )}
    </Card>
  );
}

function ExperienceCard({
  experience,
  busy,
  apply,
}: {
  experience: ReviewExperience;
  busy: boolean;
  apply: Edit;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-section-title text-indigo-navy">{experience.title}</h2>
      {experience.bullets.length === 0 ? (
        <p className="text-sm text-steel-text">{t('tailoring.review.headerOnly')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-silver-lining">
          {experience.bullets.map((item) => (
            <BulletRow
              key={item.bullet.id}
              item={item}
              count={experience.bullets.length}
              busy={busy}
              apply={apply}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BulletRow({
  item,
  count,
  busy,
  apply,
}: {
  item: ReviewBullet;
  count: number;
  busy: boolean;
  apply: Edit;
}) {
  const { t } = useTranslation();
  const { bullet, index, state, sources } = item;
  const [draft, setDraft] = useState<string | null>(null);
  const out = state.kind !== 'IN';

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StateTag state={state} />
        {bullet.editedByUser && <Tag>{t('tailoring.review.edited')}</Tag>}
      </div>

      {draft === null ? (
        <p className={cn(out ? 'text-steel-text' : 'text-slate-ink')}>{bullet.text}</p>
      ) : (
        <TextEditor
          label={t('tailoring.review.bulletText')}
          value={draft}
          onChange={setDraft}
          busy={busy}
          required
          onCancel={() => setDraft(null)}
          onSave={() => {
            apply({ op: 'EDIT_BULLET', bulletId: bullet.id, text: draft });
            setDraft(null);
          }}
        />
      )}

      {sources.length > 0 && (
        <ul className="flex flex-col gap-1 border-l border-silver-lining pl-3 text-xs">
          {sources.map((source, position) => (
            <li key={bullet.sourceIds[position]} className="line-clamp-2 text-steel-text">
              {t('tailoring.review.source')}{' '}
              {source ? (
                <Link
                  to={source.href}
                  className="text-slate-ink underline decoration-silver-lining underline-offset-2 hover:text-indigo-navy hover:decoration-indigo-navy"
                >
                  {source.text}
                </Link>
              ) : (
                t('tailoring.evidence.deleted')
              )}
            </li>
          ))}
        </ul>
      )}

      {draft === null && (
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(bullet.text)}>
            <PencilIcon />
            {t('tailoring.review.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || index === 0}
            aria-label={t('tailoring.review.moveUp')}
            onClick={() => apply({ op: 'MOVE_BULLET', bulletId: bullet.id, toIndex: index - 1 })}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || index === count - 1}
            aria-label={t('tailoring.review.moveDown')}
            onClick={() => apply({ op: 'MOVE_BULLET', bulletId: bullet.id, toIndex: index + 1 })}
          >
            <ArrowDownIcon />
          </Button>
          <Select
            aria-label={t('tailoring.review.inclusion.label')}
            className="ml-auto h-8 w-auto text-sm"
            value={bullet.inclusion}
            disabled={busy}
            onChange={(event) =>
              apply({
                op: 'SET_INCLUSION',
                bulletId: bullet.id,
                inclusion: event.target.value as BulletInclusion,
              })
            }
          >
            {(['AUTO', 'INCLUDED', 'EXCLUDED'] as const).map((option) => (
              <option key={option} value={option}>
                {t(`tailoring.review.inclusion.${option}`)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </li>
  );
}

function StateTag({ state }: { state: BulletState }) {
  const { t } = useTranslation();
  const label =
    state.kind === 'LEFT_OUT'
      ? t(`tailoring.review.states.LEFT_OUT.${state.reason}`)
      : t(`tailoring.review.states.${state.kind}`);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-steel-text">
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-2 rounded-full',
          state.kind === 'IN' ? 'bg-seafoam-600' : 'border-2 border-silver-lining bg-pure-white',
        )}
      />
      {label}
    </span>
  );
}

function TextEditor({
  label,
  value,
  onChange,
  onSave,
  onCancel,
  busy,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  required?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label={label}
        value={value}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" disabled={busy || (required && value.trim() === '')} onClick={onSave}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function GuardNotes({ resume }: { resume: TailoredResume }) {
  const { t } = useTranslation();
  const { rewritten, dropped } = resume.data.guard;
  if (rewritten === 0 && dropped.length === 0) return null;
  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-sm text-slate-ink">
          {t('tailoring.review.guard.summary', { rewritten, count: dropped.length })}
        </summary>
        <p className="mt-2 text-sm text-steel-text">{t('tailoring.review.guard.description')}</p>
        {dropped.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {dropped.map((drop, index) => (
              <li key={index} className="flex flex-col gap-0.5">
                <span className="text-slate-ink">{drop.text}</span>
                <span className="text-xs text-steel-text">
                  {drop.reasons
                    .map((reason) => t(`tailoring.review.guard.reasons.${reason}`))
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </Card>
  );
}
