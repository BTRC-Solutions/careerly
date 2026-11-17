import type { JobPostingSummary } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { PlusIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useJobPostings } from '../api/job-postings-api';

const NEW_LINK =
  'inline-flex h-9 items-center gap-2 rounded-control bg-indigo-navy px-4 text-sm font-medium text-pure-white shadow-button hover:bg-midnight-ink';

/** The saved job descriptions, newest first (RF-JD-01). */
export function JobPostingsPage() {
  const { t } = useTranslation();
  const postings = useJobPostings();

  return (
    <div className="flex max-w-[52rem] flex-col gap-8">
      <PageHeader
        title={t('jobPostings.title')}
        description={t('jobPostings.subtitle')}
        actions={
          <Link to="/job-postings/new" className={NEW_LINK}>
            <PlusIcon aria-hidden="true" />
            {t('jobPostings.new')}
          </Link>
        }
      />

      {postings.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('jobPostings.loading')}
        </p>
      )}

      {postings.isError && (
        <Card>
          <InlineError>{t('jobPostings.loadError')}</InlineError>
          <Button variant="secondary" className="mt-4" onClick={() => void postings.refetch()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {postings.data?.length === 0 && (
        <Card className="flex flex-col items-start gap-4">
          <div>
            <h2 className="text-section-title text-indigo-navy">{t('jobPostings.emptyTitle')}</h2>
            <p className="mt-1 text-sm text-steel-text">{t('jobPostings.emptyDescription')}</p>
          </div>
          <Link to="/job-postings/new" className={NEW_LINK}>
            <PlusIcon aria-hidden="true" />
            {t('jobPostings.new')}
          </Link>
        </Card>
      )}

      {postings.data && postings.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {postings.data.map((posting) => (
            <li key={posting.id}>
              <PostingRow posting={posting} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostingRow({ posting }: { posting: JobPostingSummary }) {
  const { t, i18n } = useTranslation();
  const details = [
    posting.company,
    posting.location,
    posting.workMode && t(`profile.enums.workMode.${posting.workMode}`),
  ].filter(Boolean);

  return (
    <Link
      to={`/job-postings/${posting.id}`}
      className="block rounded-card border border-silver-lining bg-pure-white px-5 py-4 transition-colors hover:border-indigo-navy"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium text-indigo-navy">{posting.title ?? t('jobPostings.untitled')}</p>
        <p className="shrink-0 text-xs text-steel-text">
          {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
            new Date(posting.createdAt),
          )}
        </p>
      </div>
      {details.length > 0 && <p className="mt-1 text-sm text-slate-ink">{details.join(' · ')}</p>}
      <p className="mt-2 line-clamp-2 text-sm text-steel-text">{posting.excerpt}</p>
    </Link>
  );
}
