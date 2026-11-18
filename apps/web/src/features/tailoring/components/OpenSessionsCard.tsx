import type { TailoringSessionSummary } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../../shared/ui/Card';
import { Tag } from '../../../shared/ui/Tag';
import { useJobPosting } from '../../job-postings/api/job-postings-api';
import { useOpenSessions } from '../api/tailoring-api';

/**
 * The tailoring sessions left in progress (RF-TAIL-15), to pick them up where they were after closing the app.
 * Hidden when there are none.
 */
export function OpenSessionsCard() {
  const { t } = useTranslation();
  const sessions = useOpenSessions();
  const list = sessions.data?.sessions ?? [];
  if (list.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-section-title text-indigo-navy">{t('tailoring.open.title')}</h2>
      <ul className="flex flex-col divide-y divide-silver-lining">
        {list.map((session) => (
          <OpenSessionRow key={session.id} session={session} />
        ))}
      </ul>
    </Card>
  );
}

function OpenSessionRow({ session }: { session: TailoringSessionSummary }) {
  const { t, i18n } = useTranslation();
  const posting = useJobPosting(session.jobPostingId);
  const name = posting.data
    ? [posting.data.title ?? t('jobPostings.untitled'), posting.data.company]
        .filter(Boolean)
        .join(' · ')
    : t('tailoring.loading');
  const updated = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(session.updatedAt));

  return (
    <li className="flex items-center justify-between gap-4 py-3 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to={`/tailoring/${session.id}`}
          className="truncate font-medium text-slate-ink underline decoration-silver-lining underline-offset-2 hover:text-indigo-navy hover:decoration-indigo-navy"
        >
          {name}
        </Link>
        <span className="text-xs text-steel-text">
          {t('tailoring.open.updated', { date: updated })}
        </span>
      </div>
      <Tag>{t(`tailoring.statuses.${session.status}`)}</Tag>
    </li>
  );
}
