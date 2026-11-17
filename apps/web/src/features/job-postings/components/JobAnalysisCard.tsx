import type { JobAnalysis, JobRequirement, JobView } from '@careerly/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useAiAvailability } from '../../ai/useAiAvailability';
import { useAnalyzeJobPosting, useJobAnalysis } from '../api/job-analysis-api';

/** Error codes with their own explanation; anything else gets the generic one. */
const KNOWN_ERRORS = new Set(['NOT_CONFIGURED', 'KEY_REJECTED', 'BLOCKED', 'RATE_LIMITED']);

/** The AI analysis of a job description (RF-JD-02): start it, follow it, read the result. */
export function JobAnalysisCard({ jobPostingId }: { jobPostingId: string }) {
  const { t } = useTranslation();
  const state = useJobAnalysis(jobPostingId);
  const analyze = useAnalyzeJobPosting(jobPostingId);
  const ai = useAiAvailability();
  const job = state.data?.job ?? null;
  const analysis = state.data?.analysis ?? null;
  const running = job?.status === 'PENDING' || job?.status === 'RUNNING' || analyze.isPending;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title text-indigo-navy">{t('jobPostings.analysis.title')}</h2>
          <p className="mt-1 text-sm text-steel-text">{t('jobPostings.analysis.description')}</p>
        </div>
        <Button
          variant={analysis ? 'secondary' : 'primary'}
          disabled={running || !ai.available}
          onClick={() => analyze.mutate()}
        >
          {analysis ? t('jobPostings.analysis.again') : t('jobPostings.analysis.start')}
        </Button>
      </div>

      {ai.reason && !running && (
        <p className="text-sm text-steel-text">{t(`ai.unavailable.${ai.reason}`)}</p>
      )}

      {running && <Progress job={job} />}

      {!running && job?.status === 'FAILED' && (
        <InlineError>
          {t(
            `jobPostings.analysis.errors.${KNOWN_ERRORS.has(job.lastError ?? '') ? job.lastError : 'FAILED'}`,
          )}
        </InlineError>
      )}
      {analyze.error && <InlineError>{analyze.error.message}</InlineError>}

      {analysis && <AnalysisResult analysis={analysis} />}
    </Card>
  );
}

function Progress({ job }: { job: JobView | null }) {
  const { t } = useTranslation();
  const retrying = job?.status === 'PENDING' && job.attempts > 0;
  const step = job?.progress?.step;
  return (
    <p role="status" className="text-sm text-slate-ink">
      {retrying
        ? t('jobPostings.analysis.retrying')
        : step === 'matching'
          ? t('jobPostings.analysis.matching')
          : t('jobPostings.analysis.running')}
    </p>
  );
}

function AnalysisResult({ analysis }: { analysis: JobAnalysis }) {
  const { t, i18n } = useTranslation();
  const required = analysis.requirements.filter((r) => r.importance === 'REQUIRED');
  const niceToHave = analysis.requirements.filter((r) => r.importance === 'NICE_TO_HAVE');
  const country = analysis.country
    ? new Intl.DisplayNames(i18n.language, { type: 'region' }).of(analysis.country)
    : null;
  const language =
    analysis.language === 'und'
      ? null
      : new Intl.DisplayNames(i18n.language, { type: 'language' }).of(analysis.language);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <Fact label={t('jobPostings.analysis.roleCategory')}>
          {t(`jobPostings.analysis.roleCategories.${analysis.roleCategory}`)}
        </Fact>
        <Fact label={t('jobPostings.analysis.seniority')}>
          {t(`jobPostings.analysis.seniorities.${analysis.seniority}`)}
        </Fact>
        <Fact label={t('jobPostings.analysis.workMode')}>
          {t(`jobPostings.analysis.workModes.${analysis.workMode}`)}
        </Fact>
        <Fact label={t('jobPostings.analysis.country')}>{country ?? t('common.notSpecified')}</Fact>
        <Fact label={t('jobPostings.analysis.years')}>
          {analysis.yearsOfExperience === null
            ? t('common.notSpecified')
            : t('jobPostings.analysis.yearsValue', { count: analysis.yearsOfExperience })}
        </Fact>
        <Fact label={t('jobPostings.analysis.language')}>
          {language ?? t('common.notSpecified')}
        </Fact>
      </dl>

      <RequirementList title={t('jobPostings.analysis.required')} requirements={required} />
      <RequirementList title={t('jobPostings.analysis.niceToHave')} requirements={niceToHave} />

      {analysis.keywords.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-ink">
            {t('jobPostings.analysis.keywords')}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {analysis.keywords.map((keyword) => (
              <Tag key={keyword}>{keyword}</Tag>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-steel-text">
        {t('jobPostings.analysis.footer', {
          model: analysis.model,
          date: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(analysis.analyzedAt)),
        })}
      </p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-steel-text">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-ink">{children}</dd>
    </div>
  );
}

function RequirementList({
  title,
  requirements,
}: {
  title: string;
  requirements: JobRequirement[];
}) {
  const { t } = useTranslation();
  if (requirements.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-ink">{title}</h3>
      <ul className="mt-2 flex flex-col divide-y divide-silver-lining">
        {requirements.map((requirement) => (
          <li key={requirement.id} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-slate-ink">{requirement.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              {requirement.tool && requirement.tool.name !== requirement.label && (
                <Tag>{requirement.tool.name}</Tag>
              )}
              <span className="text-xs text-steel-text">
                {t(`jobPostings.analysis.kinds.${requirement.kind}`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
