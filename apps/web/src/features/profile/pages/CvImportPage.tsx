import {
  type ConfirmCvImportResponse,
  CV_IMPORT_MAX_BYTES,
  type Profile,
} from '@careerly/contracts';
import { type DragEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../../shared/api/client';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ChevronLeftIcon, UploadIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useAiKeysStatus } from '../../settings/api/useAiKeys';
import { useClaudeCode } from '../../settings/api/useClaudeCode';
import { useConfirmCvImport, useReadCv } from '../api/cv-import-api';
import { CvImportReview, type UpdateReview } from '../components/CvImportReview';
import { WithProfile } from '../components/ProfileLayout';
import {
  type CvReview,
  newToolNames,
  reviewIssues,
  selectionCount,
  toConfirmRequest,
  toReview,
} from '../lib/cv-import-review';

const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Import a CV into the master profile (RF-PROF-09): pick a file → the AI reads it into a draft →
 * the user reviews it → everything is saved at once. Nothing is saved before "Save all".
 */
export function CvImportPage() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-[70rem] flex-col gap-6">
      <Link
        to="/profile"
        className="inline-flex w-fit items-center gap-1 text-sm text-steel-text hover:text-indigo-navy"
      >
        <ChevronLeftIcon />
        {t('profile.import.back')}
      </Link>
      <PageHeader title={t('profile.import.title')} description={t('profile.import.subtitle')} />
      <WithProfile>{(profile) => <CvImportFlow profile={profile} />}</WithProfile>
    </div>
  );
}

function CvImportFlow({ profile }: { profile: Profile }) {
  const [review, setReview] = useState<CvReview | null>(null);
  const [saved, setSaved] = useState<ConfirmCvImportResponse | null>(null);

  if (saved) {
    return (
      <ImportDone
        result={saved}
        onAnother={() => {
          setSaved(null);
          setReview(null);
        }}
      />
    );
  }
  if (review) {
    return (
      <ReviewStep
        review={review}
        setReview={setReview}
        onSaved={setSaved}
        onDiscard={() => setReview(null)}
      />
    );
  }
  return <PickStep profile={profile} onRead={(draft) => setReview(toReview(draft, profile))} />;
}

// --- 1. Pick the file -------------------------------------------------------------------

function readErrorMessage(error: Error, t: (key: string) => string) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AI_NOT_CONFIGURED':
      case 'AI_KEY_REJECTED':
      case 'AI_RATE_LIMITED':
      case 'AI_UNAVAILABLE':
        return t(`profile.import.errors.${error.code}`);
      case 'VALIDATION_FAILED':
        return t('profile.import.errors.unreadable');
    }
  }
  return t('profile.import.errors.AI_FAILED');
}

function PickStep({
  profile,
  onRead,
}: {
  profile: Profile;
  onRead: (draft: Parameters<typeof toReview>[0]) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const readCv = useReadCv();
  const aiKeys = useAiKeysStatus();
  const claudeCode = useClaudeCode();
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Claude Code with the subscription (ADR-24) needs no API key.
  const usesClaudeCode = claudeCode.data?.enabled === true;
  // Inside the desktop app we know up front whether there is a key; in the browser the API says.
  const noAiKey =
    aiKeys.data !== undefined &&
    aiKeys.data.activeProvider === null &&
    !usesClaudeCode &&
    !claudeCode.isPending;
  const hasContent =
    profile.positions.length + profile.projects.length + profile.education.length > 0;

  function read(file: File | undefined) {
    if (!file || readCv.isPending) return;
    setFileError(null);
    readCv.reset();
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setFileError(t('profile.import.errors.fileType'));
      return;
    }
    if (file.size > CV_IMPORT_MAX_BYTES) {
      setFileError(t('profile.import.errors.fileSize'));
      return;
    }
    setFileName(file.name);
    readCv.mutate(file, { onSuccess: onRead });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!noAiKey) read(event.dataTransfer.files[0]);
  }

  if (noAiKey) {
    return (
      <Card className="flex flex-col items-start gap-4">
        <InlineError>{t('profile.import.noKey')}</InlineError>
        <Link
          to="/settings"
          className="inline-flex h-9 items-center rounded-control bg-indigo-navy px-4 text-sm font-medium text-pure-white shadow-button hover:bg-midnight-ink"
        >
          {t('profile.import.goToSettings')}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      {readCv.isPending ? (
        <div
          role="status"
          className="flex flex-col items-center gap-3 rounded-control border border-silver-lining bg-cloud-canvas px-6 py-12 text-center"
        >
          <span
            aria-hidden="true"
            className="size-6 animate-spin rounded-full border-2 border-silver-lining border-t-indigo-navy"
          />
          <p className="font-medium text-slate-ink">{t('profile.import.reading', { fileName })}</p>
          <p className="text-sm text-steel-text">{t('profile.import.readingHint')}</p>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 rounded-control border border-dashed px-6 py-12 text-center transition-colors',
            dragging
              ? 'border-indigo-navy bg-cloud-canvas'
              : 'border-mist hover:border-indigo-navy hover:bg-cloud-canvas',
          )}
        >
          <span className="rounded-full bg-cloud-canvas p-3 text-indigo-navy">
            <UploadIcon width={24} height={24} />
          </span>
          <span className="font-medium text-slate-ink">{t('profile.import.drop')}</span>
          <span className="text-sm text-steel-text">{t('profile.import.formats')}</span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              read(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      )}

      {fileError && <InlineError>{fileError}</InlineError>}
      {readCv.isError && (
        <div className="flex flex-col items-start gap-2">
          <InlineError>{readErrorMessage(readCv.error, t)}</InlineError>
          {readCv.error instanceof ApiError &&
            ['AI_NOT_CONFIGURED', 'AI_KEY_REJECTED'].includes(readCv.error.code) && (
              <Link to="/settings" className="text-sm text-indigo-navy underline">
                {t('profile.import.goToSettings')}
              </Link>
            )}
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm text-steel-text">
        <p>{t(usesClaudeCode ? 'profile.import.privacyClaudeCode' : 'profile.import.privacy')}</p>
        {hasContent && <p>{t('profile.import.addsToProfile')}</p>}
      </div>
    </Card>
  );
}

// --- 2. Review ---------------------------------------------------------------------------

function ReviewStep({
  review,
  setReview,
  onSaved,
  onDiscard,
}: {
  review: CvReview;
  setReview: (review: CvReview) => void;
  onSaved: (result: ConfirmCvImportResponse) => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirmCvImport();
  const issues = reviewIssues(review);
  const count = selectionCount(review);
  const newTools = newToolNames(review);

  const update: UpdateReview = (change) => {
    const next = structuredClone(review);
    change(next);
    setReview(next);
  };

  function save() {
    confirm.mutate(
      { newTools, build: (toolIds) => toConfirmRequest(review, toolIds) },
      { onSuccess: onSaved },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-1">
        <h2 className="text-section-title text-indigo-navy">{t('profile.import.reviewTitle')}</h2>
        <p className="text-sm text-steel-text">{t('profile.import.reviewHint')}</p>
      </Card>

      <CvImportReview review={review} issues={issues} update={update} />

      <div className="sticky bottom-0 -mx-1 rounded-card bg-pure-white px-6 py-4 shadow-md">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm">
            <p className="font-medium text-slate-ink">{t('profile.import.selected', { count })}</p>
            <p className="text-steel-text">
              {issues.size > 0
                ? t('profile.import.toFix', { count: issues.size })
                : newTools.length > 0
                  ? t('profile.import.newTools', { count: newTools.length })
                  : t('profile.import.readyToSave')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onDiscard} disabled={confirm.isPending}>
              {t('profile.import.discard')}
            </Button>
            <Button onClick={save} disabled={confirm.isPending || issues.size > 0 || count === 0}>
              {confirm.isPending ? t('common.saving') : t('profile.import.saveAll')}
            </Button>
          </div>
        </div>
        {confirm.isError && (
          <InlineError className="mt-3">
            {t('common.saveError', { message: confirm.error.message })}
          </InlineError>
        )}
      </div>
    </div>
  );
}

// --- 3. Done -----------------------------------------------------------------------------

function ImportDone({
  result,
  onAnother,
}: {
  result: ConfirmCvImportResponse;
  onAnother: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lines = (
    ['positions', 'achievements', 'projects', 'education', 'certifications', 'languages'] as const
  ).filter((kind) => result[kind] > 0);

  return (
    <Card className="flex flex-col items-start gap-4" role="status">
      <h2 className="text-section-title text-indigo-navy">{t('profile.import.doneTitle')}</h2>
      <ul className="flex flex-col gap-1 text-sm text-slate-ink">
        {result.personalInfoUpdated && <li>{t('profile.import.done.personalInfo')}</li>}
        {lines.map((kind) => (
          <li key={kind}>{t(`profile.import.done.${kind}`, { count: result[kind] })}</li>
        ))}
      </ul>
      <p className="text-sm text-steel-text">{t('profile.import.doneHint')}</p>
      <div className="flex gap-2">
        <Button onClick={() => void navigate('/profile/experience')}>
          {t('profile.import.viewProfile')}
        </Button>
        <Button variant="secondary" onClick={onAnother}>
          {t('profile.import.another')}
        </Button>
      </div>
    </Card>
  );
}
