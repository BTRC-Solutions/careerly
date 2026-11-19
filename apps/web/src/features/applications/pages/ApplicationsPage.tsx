import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useApplications } from '../api/applications-api';
import { ApplicationsBoard } from '../components/ApplicationsBoard';
import { ApplicationsTable } from '../components/ApplicationsTable';

const VIEWS = ['board', 'table'] as const;
type View = (typeof VIEWS)[number];

/**
 * The applications (roadmap 7.4, RF-APP-06), as a kanban by state or a table with filters. The view is kept in
 * the address (`?view=table`), so going back to the list returns to it.
 */
export function ApplicationsPage() {
  const { t } = useTranslation();
  const applications = useApplications();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'table' ? 'table' : 'board';
  const list = applications.data?.applications;

  return (
    <div className="flex max-w-[70rem] flex-col gap-6">
      <PageHeader
        title={t('applications.title')}
        description={t('applications.subtitle')}
        actions={
          <div
            role="group"
            aria-label={t('applications.views.label')}
            className="flex rounded-control border border-silver-lining p-0.5"
          >
            {VIEWS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === view}
                onClick={() => setParams(option === 'board' ? {} : { view: option })}
                className={cn(
                  'rounded-[6px] px-3 py-1 text-sm font-medium transition-colors',
                  option === view
                    ? 'bg-indigo-navy text-pure-white'
                    : 'text-steel-text hover:text-indigo-navy',
                )}
              >
                {t(`applications.views.${option}`)}
              </button>
            ))}
          </div>
        }
      />

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
      {list &&
        list.length > 0 &&
        (view === 'board' ? (
          <ApplicationsBoard applications={list} />
        ) : (
          <ApplicationsTable applications={list} />
        ))}
    </div>
  );
}
