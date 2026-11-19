import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ChevronLeftIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import {
  useCreateJobPosting,
  useDeleteJobPosting,
  useJobPosting,
  useUpdateJobPosting,
} from '../api/job-postings-api';
import { useApplicationOf } from '../../applications/api/applications-api';
import { ApplicationCard } from '../../applications/components/ApplicationCard';
import { JobAnalysisCard } from '../components/JobAnalysisCard';
import { JobPostingForm } from '../components/JobPostingForm';

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/job-postings"
      className="inline-flex w-fit items-center gap-1 text-sm text-steel-text hover:text-indigo-navy"
    >
      <ChevronLeftIcon />
      {t('jobPostings.back')}
    </Link>
  );
}

/** Paste a new job description (RF-JD-01). */
export function NewJobPostingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateJobPosting();

  return (
    <div className="flex max-w-[52rem] flex-col gap-6">
      <BackLink />
      <PageHeader title={t('jobPostings.newTitle')} description={t('jobPostings.newSubtitle')} />
      <Card>
        <JobPostingForm
          submitLabel={t('jobPostings.save')}
          pending={create.isPending}
          error={create.error}
          onSubmit={async (body) => {
            const posting = await create.mutateAsync(body);
            await navigate(`/job-postings/${posting.id}`, { replace: true });
          }}
        />
      </Card>
    </div>
  );
}

/** See and edit a saved job description, or delete it. */
export function JobPostingPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const posting = useJobPosting(id);
  const update = useUpdateJobPosting();
  const remove = useDeleteJobPosting();
  // A job description with an application cannot be deleted: the application goes first.
  const application = useApplicationOf(id);
  const deletable = application.data === null;
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex max-w-[52rem] flex-col gap-6">
      <BackLink />

      {posting.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('jobPostings.loading')}
        </p>
      )}

      {posting.isError && (
        <Card>
          <InlineError>{t('jobPostings.notFound')}</InlineError>
        </Card>
      )}

      {posting.data && (
        <>
          <PageHeader
            title={posting.data.title ?? t('jobPostings.untitled')}
            description={posting.data.company ?? undefined}
            actions={
              deletable && (
                <Button variant="secondary" onClick={() => setConfirming(true)}>
                  {t('common.delete')}
                </Button>
              )
            }
          />
          <ApplicationCard jobPostingId={id} />
          {application.data && (
            <p className="-mt-3 text-sm text-steel-text">{t('jobPostings.deleteBlocked')}</p>
          )}
          <JobAnalysisCard jobPostingId={id} />
          <Card>
            <JobPostingForm
              // Remount after saving so the form starts from what was stored.
              key={posting.data.updatedAt}
              initial={posting.data}
              submitLabel={t('common.save')}
              pending={update.isPending}
              error={update.error}
              status={saved ? t('common.saved') : undefined}
              onSubmit={async (body) => {
                setSaved(false);
                await update.mutateAsync({ id, body });
                setSaved(true);
              }}
            />
          </Card>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t('jobPostings.deleteTitle')}
            description={t('jobPostings.deleteDescription')}
            confirmLabel={t('common.delete')}
            onConfirm={async () => {
              await remove.mutateAsync(id);
              await navigate('/job-postings', { replace: true });
            }}
          />
        </>
      )}
    </div>
  );
}
