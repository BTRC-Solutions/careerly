import type { ApplicationStatus } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Tag } from '../../../shared/ui/Tag';
import { useApplicationOf } from '../api/applications-api';
import { formatDay } from '../lib/dates';
import { SendApplicationDialog } from './SendApplicationDialog';

/** The state of an application, as a tag. */
export function StatusTag({ status }: { status: ApplicationStatus }) {
  const { t } = useTranslation();
  return <Tag>{t(`applications.statuses.${status}`)}</Tag>;
}

const LINK =
  'inline-flex h-9 items-center rounded-control border border-silver-lining px-4 text-sm font-medium text-indigo-navy hover:border-indigo-navy';

/**
 * The application of a job description (RF-APP-01), on its page and on a finalized session's: a link to it, or
 * the way to create it ("create or link" in ARCHITECTURE §12). From a session, its CVs come checked.
 */
export function ApplicationCard({
  jobPostingId,
  sessionId,
}: {
  jobPostingId: string;
  sessionId?: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const application = useApplicationOf(jobPostingId);
  const [creating, setCreating] = useState(false);

  if (application.isPending || application.isError) return null;
  const existing = application.data;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-title text-indigo-navy">{t('applications.card.title')}</h2>
        {existing ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-ink">
            <StatusTag status={existing.status} />
            {existing.appliedAt
              ? t('applications.sentOn', { date: formatDay(existing.appliedAt, i18n.language) })
              : t('applications.notSent')}
          </p>
        ) : (
          <p className="text-sm text-steel-text">{t('applications.card.none')}</p>
        )}
      </div>
      {existing ? (
        <Link to={`/applications/${existing.id}`} className={LINK}>
          {t('applications.card.open')}
        </Link>
      ) : (
        <Button onClick={() => setCreating(true)}>{t('applications.card.create')}</Button>
      )}
      {creating && (
        <SendApplicationDialog
          target={{ kind: 'create', jobPostingId }}
          sessionId={sessionId}
          onDone={(created) => void navigate(`/applications/${created.id}`)}
          onClose={() => setCreating(false)}
        />
      )}
    </Card>
  );
}
