import type {
  MatchStatus,
  Profile,
  RequirementMatch,
  TailoringSessionView,
} from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ChevronLeftIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Tag } from '../../../shared/ui/Tag';
import { useJobPosting } from '../../job-postings/api/job-postings-api';
import { useProfile } from '../../profile/api/profile-api';
import { useRetryTailoring, useTailoringSession } from '../api/tailoring-api';
import { describeEvidence, summarizeMatch } from '../lib/match-summary';

/** Error codes with their own explanation; anything else gets the generic one. */
const KNOWN_ERRORS = new Set([
  'NOT_CONFIGURED',
  'KEY_REJECTED',
  'BLOCKED',
  'RATE_LIMITED',
  'JOB_POSTING_DELETED',
]);

/** Covered: a seafoam dot; partial: a seafoam ring; missing: an orange dot (STYLES.md color semantics). */
const STATUS_DOT: Record<MatchStatus, string> = {
  COVERED: 'bg-seafoam-600',
  PARTIAL: 'border-2 border-seafoam-600 bg-pure-white',
  MISSING: 'bg-signal-orange',
};

/** The match between a job description and the master profile (RF-TAIL-03). */
export function MatchSummaryPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const view = useTailoringSession(id);
  const jobPostingId = view.data?.session.jobPostingId;

  return (
    <div className="flex max-w-[52rem] flex-col gap-6">
      {jobPostingId && (
        <Link
          to={`/job-postings/${jobPostingId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-steel-text hover:text-indigo-navy"
        >
          <ChevronLeftIcon />
          {t('tailoring.backToJobPosting')}
        </Link>
      )}

      {view.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('tailoring.loading')}
        </p>
      )}
      {view.isError && (
        <Card>
          <InlineError>{t('tailoring.notFound')}</InlineError>
        </Card>
      )}
      {view.data && <Session view={view.data} />}
    </div>
  );
}

function Session({ view }: { view: TailoringSessionView }) {
  const { t } = useTranslation();
  const { session, job } = view;
  const posting = useJobPosting(session.jobPostingId);
  const retry = useRetryTailoring(session.id);
  const subtitle = posting.data
    ? [posting.data.title ?? t('jobPostings.untitled'), posting.data.company]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <>
      <PageHeader title={t('tailoring.match.title')} description={subtitle} />

      {session.status === 'ANALYZING' && (
        <Card>
          <p role="status" className="text-sm text-slate-ink">
            {job?.status === 'PENDING' && job.attempts > 0
              ? t('tailoring.match.retrying')
              : job?.progress?.step === 'matching'
                ? t('tailoring.match.matching')
                : t('tailoring.match.running')}
          </p>
        </Card>
      )}

      {session.status === 'FAILED' && (
        <Card className="flex items-start justify-between gap-4">
          <InlineError>
            {t(
              `tailoring.match.errors.${KNOWN_ERRORS.has(job?.lastError ?? '') ? job?.lastError : 'FAILED'}`,
            )}
          </InlineError>
          <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}
      {retry.error && <InlineError>{retry.error.message}</InlineError>}

      {session.match && <MatchResultView match={session.match} />}
    </>
  );
}

function MatchResultView({
  match,
}: {
  match: NonNullable<TailoringSessionView['session']['match']>;
}) {
  const { t, i18n } = useTranslation();
  const profile = useProfile();
  const summary = summarizeMatch(match);
  const groups: { status: MatchStatus; items: RequirementMatch[] }[] = [
    { status: 'COVERED', items: summary.covered },
    { status: 'PARTIAL', items: summary.partial },
    { status: 'MISSING', items: summary.missing },
  ];
  const matchedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(match.matchedAt));

  return (
    <>
      <Card className="flex items-center gap-8">
        <div className="shrink-0">
          <p className="text-page-title text-seafoam-700" aria-describedby="match-score-label">
            {summary.score === null ? '—' : `${summary.score}%`}
          </p>
          <p id="match-score-label" className="mt-1 text-sm text-steel-text">
            {t('tailoring.match.score')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-ink">
            {groups.map(({ status, items }) => (
              <li key={status} className="flex items-center gap-2">
                <StatusDot status={status} />
                {t(`tailoring.match.counts.${status}`, { count: items.length })}
              </li>
            ))}
          </ul>
          <p className="text-sm text-steel-text">{t('tailoring.match.scoreHint')}</p>
        </div>
      </Card>

      {match.requirements.length === 0 && (
        <Card>
          <p className="text-sm text-steel-text">{t('tailoring.match.noRequirements')}</p>
        </Card>
      )}

      {groups
        .filter(({ items }) => items.length > 0)
        .map(({ status, items }) => (
          <Card key={status} className="flex flex-col gap-3">
            <div>
              <h2 className="text-section-title text-indigo-navy">
                {t(`tailoring.match.groups.${status}.title`)}
              </h2>
              <p className="mt-1 text-sm text-steel-text">
                {t(`tailoring.match.groups.${status}.description`)}
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-silver-lining">
              {items.map((requirement) => (
                <RequirementRow
                  key={requirement.requirementId}
                  requirement={requirement}
                  profile={profile.data}
                />
              ))}
            </ul>
          </Card>
        ))}

      <p className="text-xs text-steel-text">
        {match.model
          ? t('tailoring.match.footer', { model: match.model, date: matchedAt })
          : t('tailoring.match.footerNoAi', { date: matchedAt })}
      </p>
    </>
  );
}

function RequirementRow({
  requirement,
  profile,
}: {
  requirement: RequirementMatch;
  profile: Profile | undefined;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="flex items-start gap-2 text-slate-ink">
          <StatusDot status={requirement.status} className="mt-1.5" />
          <span>
            <span className="sr-only">{t(`tailoring.match.statuses.${requirement.status}`)}: </span>
            {requirement.label}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {requirement.tool && requirement.tool.name !== requirement.label && (
            <Tag>{requirement.tool.name}</Tag>
          )}
          <span className="text-xs text-steel-text">
            {t(`tailoring.match.importance.${requirement.importance}`)}
          </span>
        </span>
      </div>
      {requirement.evidence.length > 0 && (
        <ul className="ml-4 flex flex-col gap-1.5 border-l border-silver-lining pl-4">
          {requirement.evidence.map((evidence) => {
            const described = profile ? describeEvidence(evidence, profile) : undefined;
            return (
              <li
                key={`${evidence.kind}:${evidence.id}`}
                // Achievements are detailed source material: two lines are enough to recognize them.
                className="line-clamp-2 text-slate-ink"
                title={described ? described.text : undefined}
              >
                <span className="text-steel-text">
                  {t(`tailoring.evidence.kinds.${evidence.kind}`)}:{' '}
                </span>
                {described === undefined ? (
                  t('tailoring.loading')
                ) : described === null ? (
                  <span className="text-steel-text">{t('tailoring.evidence.deleted')}</span>
                ) : (
                  <>
                    <Link
                      to={described.href}
                      className="underline decoration-silver-lining underline-offset-2 hover:text-indigo-navy hover:decoration-indigo-navy"
                    >
                      {described.text}
                      {described.level &&
                        ` · ${t(`profile.enums.languageLevel.${described.level}`)}`}
                    </Link>
                    {described.context && (
                      <span className="text-steel-text"> · {described.context}</span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {requirement.method === 'AI' && requirement.status !== 'MISSING' && (
        <p className="ml-4 text-xs text-steel-text">{t('tailoring.match.byAi')}</p>
      )}
    </li>
  );
}

function StatusDot({ status, className }: { status: MatchStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', STATUS_DOT[status], className)}
    />
  );
}
