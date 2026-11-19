import type { Application, SentResume } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ChevronLeftIcon, DownloadIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { PdfFrame } from '../../../shared/ui/PdfFrame';
import { useJobPosting } from '../../job-postings/api/job-postings-api';
import { useDownloadResumeVersion, useResumeVersionPdf } from '../../tailoring/api/tailoring-api';
import { useApplication, useDeleteApplication } from '../api/applications-api';
import { StatusTag } from '../components/ApplicationCard';
import { useMoveFlow } from '../components/MoveFlow';
import { MoveMenu } from '../components/MoveMenu';
import { SendApplicationDialog } from '../components/SendApplicationDialog';
import { Timeline } from '../components/Timeline';
import { formatDay } from '../lib/dates';

/**
 * One application (roadmap 7.3): the job it is for, its state, the finalized CVs sent with it, to open and
 * download exactly as they were sent (RF-APP-08), and its timeline (roadmap 7.5, RF-APP-04).
 */
export function ApplicationPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const application = useApplication(id);

  return (
    <div className="flex max-w-[52rem] flex-col gap-6">
      <Link
        to="/applications"
        className="inline-flex w-fit items-center gap-1 text-sm text-steel-text hover:text-indigo-navy"
      >
        <ChevronLeftIcon />
        {t('applications.back')}
      </Link>
      {application.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('applications.loading')}
        </p>
      )}
      {application.isError && (
        <Card>
          <InlineError>{t('applications.notFound')}</InlineError>
        </Card>
      )}
      {application.data && <ApplicationDetail application={application.data} />}
    </div>
  );
}

function ApplicationDetail({ application }: { application: Application }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const posting = useJobPosting(application.jobPostingId);
  const remove = useDeleteApplication(application);
  const flow = useMoveFlow();
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const saved = application.status === 'SAVED';

  return (
    <>
      <PageHeader
        title={posting.data?.title ?? t('jobPostings.untitled')}
        description={posting.data?.company ?? undefined}
        actions={
          <Button variant="secondary" onClick={() => setDeleting(true)}>
            {t('common.delete')}
          </Button>
        }
      />

      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-ink">
            <StatusTag status={application.status} />
            {application.appliedAt
              ? t('applications.sentOn', { date: formatDay(application.appliedAt, i18n.language) })
              : t('applications.notSent')}
          </p>
          <MoveMenu
            application={{ ...application, title: posting.data?.title ?? null }}
            onMove={(to) => flow.move({ ...application, title: posting.data?.title ?? null }, to)}
          />
        </div>
        {flow.message && (
          <p role="status" className="text-sm text-slate-ink">
            {flow.message}
          </p>
        )}
        {application.sentWithoutCareerlyCv && (
          <p className="text-sm text-steel-text">{t('applications.detail.withoutCv')}</p>
        )}
        <Link
          to={`/job-postings/${application.jobPostingId}`}
          className="w-fit text-sm font-medium text-indigo-navy underline"
        >
          {t('applications.detail.openJobPosting')}
        </Link>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-section-title text-indigo-navy">
            {t('applications.detail.sentCvs')}
          </h2>
          <Button variant={saved ? 'primary' : 'secondary'} onClick={() => setSending(true)}>
            {saved ? t('applications.send.mark') : t('applications.send.add')}
          </Button>
        </div>
        {application.sentResumes.length === 0 ? (
          <p className="text-sm text-steel-text">
            {saved ? t('applications.detail.noneYet') : t('applications.detail.noneSent')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-silver-lining">
            {application.sentResumes.map((sent) => (
              <SentResumeRow
                key={sent.resumeVersionId}
                sent={sent}
                open={open === sent.resumeVersionId}
                onToggle={() =>
                  setOpen(open === sent.resumeVersionId ? null : sent.resumeVersionId)
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <Timeline applicationId={application.id} />

      {flow.dialogs}
      {sending && (
        <SendApplicationDialog
          target={{ kind: 'send', application }}
          onClose={() => setSending(false)}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('applications.delete.title')}
        description={t('applications.delete.description')}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          await remove.mutateAsync();
          await navigate('/applications', { replace: true });
        }}
      />
    </>
  );
}

function SentResumeRow({
  sent,
  open,
  onToggle,
}: {
  sent: SentResume;
  open: boolean;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  const download = useDownloadResumeVersion();
  const language = t(`tailoring.review.languages.${sent.language}`);

  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-ink">{t('applications.cv', { language })}</p>
          <p className="truncate text-xs text-steel-text">
            {t('applications.detail.sentFile', {
              date: formatDay(sent.sentAt, i18n.language),
              file: sent.fileName,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
            {open ? t('applications.detail.hide') : t('applications.detail.view')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={download.isPending}
            onClick={() => download.mutate({ id: sent.resumeVersionId, fileName: sent.fileName })}
          >
            <DownloadIcon />
            {t('applications.detail.download')}
          </Button>
        </div>
      </div>
      {download.isError && <InlineError>{t('tailoring.finalized.downloadError')}</InlineError>}
      {open && <SentPdf sent={sent} language={language} />}
    </li>
  );
}

function SentPdf({ sent, language }: { sent: SentResume; language: string }) {
  const { t } = useTranslation();
  const pdf = useResumeVersionPdf(sent.resumeVersionId);
  return (
    <div className="h-[70vh] min-h-[28rem] overflow-hidden rounded-control border border-silver-lining bg-cloud-canvas">
      {pdf.isError && (
        <div className="p-6">
          <InlineError>{t('tailoring.finalized.pdfError')}</InlineError>
        </div>
      )}
      {pdf.data && (
        <PdfFrame pdf={pdf.data} title={t('applications.detail.pdfTitle', { language })} />
      )}
    </div>
  );
}
