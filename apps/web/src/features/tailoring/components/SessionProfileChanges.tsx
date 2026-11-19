import type { Profile, SessionProfileChange } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useProfile } from '../../profile/api/profile-api';
import { useRevertProfileChanges, useSessionProfileChanges } from '../api/tailoring-api';
import { describeEvidence } from '../lib/match-summary';

/**
 * What the session added to or changed in the master profile (RF-TAIL-05), with undo for each change or for
 * all of them (RF-TAIL-06). Hidden while the session has not changed anything.
 */
export function SessionProfileChanges({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const changes = useSessionProfileChanges(sessionId);
  const revert = useRevertProfileChanges(sessionId);
  const profile = useProfile();
  const [confirming, setConfirming] = useState(false);
  const [keptCount, setKeptCount] = useState(0);

  const list = changes.data?.changes ?? [];
  if (list.length === 0) return null;
  const pending = list.filter((change) => change.revertedAt === null);

  const undo = async (changeIds?: string[]) => {
    const result = await revert.mutateAsync({ changeIds });
    setKeptCount(result.keptFields.reduce((sum, kept) => sum + kept.fields.length, 0));
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title text-indigo-navy">
            {t('tailoring.profileChanges.title')}
          </h2>
          <p className="mt-1 text-sm text-steel-text">
            {t('tailoring.profileChanges.description')}
          </p>
        </div>
        {pending.length > 0 && (
          <Button variant="secondary" className="shrink-0" onClick={() => setConfirming(true)}>
            {t('tailoring.profileChanges.undoAll')}
          </Button>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-silver-lining">
        {list.map((change) => (
          <ChangeRow
            key={change.id}
            change={change}
            profile={profile.data}
            disabled={revert.isPending}
            onUndo={() => void undo([change.id]).catch(() => {})}
          />
        ))}
      </ul>

      {keptCount > 0 && (
        <p role="status" className="text-sm text-slate-ink">
          {t('tailoring.profileChanges.kept', { count: keptCount })}
        </p>
      )}
      {revert.error && !confirming && <InlineError>{revert.error.message}</InlineError>}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('tailoring.profileChanges.confirmTitle')}
        description={t('tailoring.profileChanges.confirmDescription', { count: pending.length })}
        confirmLabel={t('tailoring.profileChanges.undoAll')}
        onConfirm={() => undo()}
      />
    </Card>
  );
}

function ChangeRow({
  change,
  profile,
  disabled,
  onUndo,
}: {
  change: SessionProfileChange;
  profile: Profile | undefined;
  disabled: boolean;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const described = profile
    ? describeEvidence({ kind: change.entity, id: change.entityId }, profile)
    : undefined;
  const name = described?.text ?? t(`tailoring.evidence.kinds.${change.entity}`);
  const undone = change.revertedAt !== null;

  return (
    <li className="flex items-start justify-between gap-4 py-3 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <Tag>{t(`tailoring.profileChanges.kinds.${change.kind}`)}</Tag>
          <span className="text-xs text-steel-text">
            {t(`tailoring.evidence.kinds.${change.entity}`)}
          </span>
        </span>
        <span className={undone ? 'text-steel-text line-through' : 'text-slate-ink'}>
          {described === undefined ? (
            t('tailoring.loading')
          ) : described === null ? (
            <span className="text-steel-text no-underline">
              {t('tailoring.profileChanges.gone')}
            </span>
          ) : (
            <Link
              to={described.href}
              className="line-clamp-2 underline decoration-silver-lining underline-offset-2 hover:text-indigo-navy hover:decoration-indigo-navy"
            >
              {described.text}
              {described.context && <span className="text-steel-text"> · {described.context}</span>}
            </Link>
          )}
        </span>
      </div>
      {undone ? (
        <span className="shrink-0 text-xs text-steel-text">
          {t('tailoring.profileChanges.undone')}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          aria-label={t('tailoring.profileChanges.undoOne', { name })}
          onClick={onUndo}
        >
          {t('tailoring.profileChanges.undo')}
        </Button>
      )}
    </li>
  );
}
