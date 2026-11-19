import type { ApplicationSummary } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useApplications } from '../api/applications-api';
import { StatusTag } from '../components/ApplicationCard';
import { formatDay } from '../lib/dates';

/** The applications, most recently changed first (roadmap 7.3; the kanban and table come in 7.4). */
export function ApplicationsPage() {
  const { t } = useTranslation();
  const applications = useApplications();
  const list = applications.data?.applications;

  return (
    <div className="flex max-w-[52rem] flex-col gap-8">
      <PageHeader title={t('applications.title')} description={t('applications.subtitle')} />

      {applications.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('applications.loading')}
        </p>
      )}
      {applications.isError && (
        <Card>
          <InlineError>{t('applications.loadError')}</InlineError>
          <Button variant="secondary" className="mt-4" onClick={() => void applications.refetch()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}
      {list?.length === 0 && (
        <Card className="flex flex-col items-start gap-2">
          <h2 className="text-section-title text-indigo-navy">{t('applications.emptyTitle')}</h2>
          <p className="text-sm text-steel-text">{t('applications.emptyDescription')}</p>
          <Link to="/job-postings" className="mt-2 text-sm font-medium text-indigo-navy underline">
            {t('applications.goToJobPostings')}
          </Link>
        </Card>
      )}
      {list && list.length > 0 && (
        <ul className="flex flex-col gap-3">
          {list.map((application) => (
            <li key={application.id}>
              <ApplicationRow application={application} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationRow({ application }: { application: ApplicationSummary }) {
  const { t, i18n } = useTranslation();
  return (
    <Link
      to={`/applications/${application.id}`}
      className="flex items-center justify-between gap-4 rounded-card border border-silver-lining bg-pure-white px-5 py-4 transition-colors hover:border-indigo-navy"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-indigo-navy">
          {application.title ?? t('jobPostings.untitled')}
        </p>
        <p className="mt-1 text-sm text-slate-ink">
          {[
            application.company,
            application.appliedAt
              ? t('applications.sentOn', { date: formatDay(application.appliedAt, i18n.language) })
              : t('applications.notSent'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <StatusTag status={application.status} />
    </Link>
  );
}
