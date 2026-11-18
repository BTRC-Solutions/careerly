import {
  type GapAnswer,
  type GapAnswerKind,
  type GapQuestion,
  type Profile,
  type ProjectKind,
  ProjectKindSchema,
  type TailoringSession,
} from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Checkbox, Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useProfile } from '../../profile/api/profile-api';
import { useAnswerGap, useAskGaps, useGapQuestions } from '../api/tailoring-api';
import { gapQuestionText } from '../lib/gap-question-text';
import { describeEvidence } from '../lib/match-summary';

/**
 * The gap questions of a session (RF-TAIL-04, RF-GAP-01): all together, answered in any order or skipped. With
 * the match ready it offers to start; while the session awaits answers it lists them.
 */
export function GapQuestionsCard({ session }: { session: TailoringSession }) {
  const { t } = useTranslation();
  const awaiting = session.status === 'AWAITING_ANSWERS';
  const gapCount =
    session.match?.requirements.filter((requirement) => requirement.status !== 'COVERED').length ??
    0;
  const ask = useAskGaps(session.id);
  const questions = useGapQuestions(session.id, awaiting);
  const profile = useProfile();

  if (session.status === 'MATCHED' && gapCount > 0) {
    return (
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-section-title text-indigo-navy">{t('tailoring.gaps.title')}</h2>
          <p className="mt-1 text-sm text-steel-text">
            {t('tailoring.gaps.intro', { count: gapCount })}
          </p>
          {ask.error && <InlineError className="mt-2">{ask.error.message}</InlineError>}
        </div>
        <Button className="shrink-0" disabled={ask.isPending} onClick={() => ask.mutate()}>
          {t('tailoring.gaps.start')}
        </Button>
      </Card>
    );
  }
  if (!awaiting) return null;

  const list = questions.data?.questions ?? [];
  const answered = list.filter((question) => question.answer !== null).length;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-section-title text-indigo-navy">{t('tailoring.gaps.title')}</h2>
        <p className="mt-1 text-sm text-steel-text">{t('tailoring.gaps.description')}</p>
        {list.length > 0 && (
          <p role="status" className="mt-1 text-sm text-slate-ink">
            {t('tailoring.gaps.progress', { answered, total: list.length })}
          </p>
        )}
      </div>
      {questions.isPending && <p className="text-sm text-steel-text">{t('tailoring.loading')}</p>}
      <ol className="flex flex-col divide-y divide-silver-lining">
        {list.map((question) => (
          <GapQuestionItem
            key={question.requirementId}
            sessionId={session.id}
            question={question}
            profile={profile.data}
          />
        ))}
      </ol>
    </Card>
  );
}

function GapQuestionItem({
  sessionId,
  question,
  profile,
}: {
  sessionId: string;
  question: GapQuestion;
  profile: Profile | undefined;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(question.answer === null);
  const text = gapQuestionText(question, t);
  const headingId = `gap-${question.requirementId}`;

  return (
    <li className="flex flex-col gap-3 py-4 text-sm" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-4">
        <h3 id={headingId} className="font-medium text-slate-ink">
          {text.question}
        </h3>
        <span className="shrink-0 text-xs text-steel-text">
          {t(`tailoring.match.importance.${question.importance}`)}
        </span>
      </div>

      {text.hint && (
        <div className="flex flex-col gap-1">
          <p className="text-steel-text">{text.hint}</p>
          <ul className="ml-4 flex flex-col gap-1 border-l border-silver-lining pl-4">
            {question.relatedEvidence.map((evidence) => {
              const described = profile ? describeEvidence(evidence, profile) : undefined;
              return (
                <li key={`${evidence.kind}:${evidence.id}`} className="line-clamp-2 text-slate-ink">
                  <span className="text-steel-text">
                    {t(`tailoring.evidence.kinds.${evidence.kind}`)}:{' '}
                  </span>
                  {described === undefined
                    ? t('tailoring.loading')
                    : described === null
                      ? t('tailoring.evidence.deleted')
                      : described.text}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing || question.answer === null ? (
        <AnswerForm
          sessionId={sessionId}
          question={question}
          profile={profile}
          onDone={() => setEditing(false)}
          onCancel={question.answer ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <AnswerSummary answer={question.answer} profile={profile} />
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t('tailoring.gaps.change')}
          </Button>
        </div>
      )}
    </li>
  );
}

function AnswerSummary({ answer, profile }: { answer: GapAnswer; profile: Profile | undefined }) {
  const { t } = useTranslation();
  let where: string | null = null;
  if (answer.answer === 'USED_AT_WORK') {
    where = answer.positionIds
      .map((id) => profile?.positions.find((position) => position.id === id))
      .filter((position) => position !== undefined)
      .map((position) => `${position.title} · ${position.company}`)
      .join(', ');
  } else if (answer.answer === 'USED_ELSEWHERE') {
    const project = answer.project;
    where =
      'id' in project
        ? (profile?.projects.find((candidate) => candidate.id === project.id)?.name ?? null)
        : project.name;
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <Tag>{t(`tailoring.gaps.answers.${answer.answer}`)}</Tag>
        {where && <span className="text-slate-ink">{where}</span>}
      </span>
      {'detail' in answer && <p className="text-steel-text">{answer.detail}</p>}
      {answer.answer === 'USED_ELSEWHERE' && !answer.includeInResume && (
        <p className="text-xs text-steel-text">{t('tailoring.gaps.notInThisResume')}</p>
      )}
    </div>
  );
}

const NEW_PROJECT = '__new__';
const CHOICES: GapAnswerKind[] = ['USED_AT_WORK', 'USED_ELSEWHERE', 'NOT_USED'];

function AnswerForm({
  sessionId,
  question,
  profile,
  onDone,
  onCancel,
}: {
  sessionId: string;
  question: GapQuestion;
  profile: Profile | undefined;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const save = useAnswerGap(sessionId);
  const previous = question.answer;
  const [choice, setChoice] = useState<GapAnswerKind | null>(
    previous && previous.answer !== 'SKIPPED' ? previous.answer : null,
  );
  const [positionIds, setPositionIds] = useState<string[]>(
    previous?.answer === 'USED_AT_WORK' ? previous.positionIds : [],
  );
  const [projectId, setProjectId] = useState<string>(
    previous?.answer === 'USED_ELSEWHERE' && 'id' in previous.project
      ? previous.project.id
      : NEW_PROJECT,
  );
  const [projectName, setProjectName] = useState(
    previous?.answer === 'USED_ELSEWHERE' && 'name' in previous.project
      ? previous.project.name
      : '',
  );
  const [projectKind, setProjectKind] = useState<ProjectKind>(
    previous?.answer === 'USED_ELSEWHERE' && 'kind' in previous.project
      ? previous.project.kind
      : 'PERSONAL',
  );
  const [detail, setDetail] = useState(previous && 'detail' in previous ? previous.detail : '');
  const [includeInResume, setIncludeInResume] = useState(
    previous?.answer === 'USED_ELSEWHERE' ? previous.includeInResume : true,
  );
  const [error, setError] = useState<string | null>(null);
  const name = `gap-answer-${question.requirementId}`;

  const submit = async (answer: GapAnswer) => {
    setError(null);
    try {
      await save.mutateAsync({ requirementId: question.requirementId, answer });
      onDone();
    } catch {
      // Shown through `save.error`.
    }
  };

  const confirm = () => {
    if (choice === 'NOT_USED') return void submit({ answer: 'NOT_USED' });
    if (!detail.trim()) return setError(t('tailoring.gaps.errors.detail'));
    if (choice === 'USED_AT_WORK') {
      if (positionIds.length === 0) return setError(t('tailoring.gaps.errors.positions'));
      return void submit({ answer: 'USED_AT_WORK', positionIds, detail: detail.trim() });
    }
    if (choice === 'USED_ELSEWHERE') {
      if (projectId === NEW_PROJECT && !projectName.trim()) {
        return setError(t('tailoring.gaps.errors.projectName'));
      }
      return void submit({
        answer: 'USED_ELSEWHERE',
        project:
          projectId === NEW_PROJECT
            ? { name: projectName.trim(), kind: projectKind }
            : { id: projectId },
        detail: detail.trim(),
        includeInResume,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="sr-only">{t('tailoring.gaps.answerLegend')}</legend>
        {CHOICES.map((value) => (
          <label key={value} className="inline-flex items-center gap-2 text-slate-ink">
            <input
              type="radio"
              name={name}
              checked={choice === value}
              onChange={() => setChoice(value)}
              className="size-4 accent-indigo-navy"
            />
            {t(`tailoring.gaps.answers.${value}`)}
          </label>
        ))}
      </fieldset>

      {choice === 'USED_AT_WORK' && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-slate-ink">
            {t('tailoring.gaps.positions')}
          </legend>
          {(profile?.positions ?? []).map((position) => (
            <Checkbox
              key={position.id}
              label={`${position.title} · ${position.company}`}
              checked={positionIds.includes(position.id)}
              onChange={(event) =>
                setPositionIds((ids) =>
                  event.target.checked
                    ? [...ids, position.id]
                    : ids.filter((id) => id !== position.id),
                )
              }
            />
          ))}
          {profile?.positions.length === 0 && (
            <p className="text-steel-text">{t('tailoring.gaps.noPositions')}</p>
          )}
        </fieldset>
      )}

      {choice === 'USED_ELSEWHERE' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('tailoring.gaps.project')}>
            {(control) => (
              <Select
                {...control}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {(profile?.projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
                <option value={NEW_PROJECT}>{t('tailoring.gaps.newProject')}</option>
              </Select>
            )}
          </Field>
          {projectId === NEW_PROJECT && (
            <div className="grid grid-cols-[1fr_10rem] gap-2">
              <Field label={t('tailoring.gaps.projectName')}>
                {(control) => (
                  <Input
                    {...control}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                )}
              </Field>
              <Field label={t('tailoring.gaps.projectKind')}>
                {(control) => (
                  <Select
                    {...control}
                    value={projectKind}
                    onChange={(event) => setProjectKind(event.target.value as ProjectKind)}
                  >
                    {ProjectKindSchema.options.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`profile.enums.projectKind.${kind}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}
        </div>
      )}

      {(choice === 'USED_AT_WORK' || choice === 'USED_ELSEWHERE') && (
        <>
          <Field label={t('tailoring.gaps.detail')} hint={t('tailoring.gaps.detailHint')}>
            {(control) => (
              <Textarea
                {...control}
                value={detail}
                maxLength={1000}
                onChange={(event) => setDetail(event.target.value)}
              />
            )}
          </Field>
          {choice === 'USED_ELSEWHERE' && (
            <Checkbox
              label={t('tailoring.gaps.includeInResume')}
              checked={includeInResume}
              onChange={(event) => setIncludeInResume(event.target.checked)}
            />
          )}
        </>
      )}

      {error && <InlineError>{error}</InlineError>}
      {save.error && <InlineError>{save.error.message}</InlineError>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={save.isPending}
          onClick={() => void submit({ answer: 'SKIPPED' })}
        >
          {t('tailoring.gaps.skip')}
        </Button>
        <Button size="sm" disabled={save.isPending || choice === null} onClick={confirm}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
