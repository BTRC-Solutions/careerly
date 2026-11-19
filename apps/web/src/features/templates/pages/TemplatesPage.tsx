import {
  type ResumeLanguage,
  type TemplateSummary,
  USER_TEMPLATE_MAX_BYTES,
} from '@careerly/contracts';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Dialog, DialogActions } from '../../../shared/ui/Dialog';
import { Field, Input } from '../../../shared/ui/form';
import {
  ChevronLeftIcon,
  DownloadIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
} from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { PdfFrame } from '../../../shared/ui/PdfFrame';
import { Tag } from '../../../shared/ui/Tag';
import {
  useDeleteTemplate,
  useDownloadStarterKit,
  useRenameTemplate,
  useTemplatePreview,
  useTemplates,
  useUploadTemplate,
} from '../api/templates-api';
import { toUploadFailure, type UploadFailure } from '../lib/upload-errors';

const LANGUAGES: ResumeLanguage[] = ['es', 'en'];

/**
 * CV templates (RF-TAIL-09, roadmap 4.13): `classic` and the user's own `.typ` files, a preview of each
 * with the example CV in Spanish and English, and the starting point to write one.
 */
export function TemplatesPage() {
  const { t } = useTranslation();
  const templates = useTemplates();
  const upload = useUploadTemplate();
  const starterKit = useDownloadStarterKit();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const list = templates.data ?? [];
  const selected = list.find((template) => template.id === selectedId) ?? list[0];

  function uploadFile(file: File | undefined) {
    if (!file || upload.isPending) return;
    setFailure(null);
    setUploadedName(null);
    if (!/\.typ$/i.test(file.name) || file.size === 0 || file.size > USER_TEMPLATE_MAX_BYTES) {
      setFailure({ reason: 'file', diagnostics: null });
      return;
    }
    upload.mutate(file, {
      onSuccess: (created) => {
        setSelectedId(created.id);
        setUploadedName(created.name);
      },
      onError: (error) => setFailure(toUploadFailure(error)),
    });
  }

  return (
    <div className="flex max-w-[70rem] flex-col gap-6">
      <Link
        to="/settings"
        className="inline-flex w-fit items-center gap-1 text-sm text-steel-text hover:text-indigo-navy"
      >
        <ChevronLeftIcon />
        {t('templates.back')}
      </Link>
      <PageHeader
        title={t('templates.title')}
        description={t('templates.description')}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={starterKit.isPending}
              onClick={() => starterKit.mutate()}
            >
              <DownloadIcon />
              {t('templates.starterKit.download')}
            </Button>
            <Button disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
              <UploadIcon />
              {upload.isPending ? t('templates.upload.validating') : t('templates.upload.action')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".typ"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                uploadFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </>
        }
      />

      {starterKit.isError && <InlineError>{t('templates.starterKit.error')}</InlineError>}
      {upload.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('templates.upload.validatingDetail')}
        </p>
      )}
      {uploadedName && (
        <p role="status" className="text-sm text-slate-ink">
          {t('templates.upload.done', { name: uploadedName })}
        </p>
      )}
      {failure && <UploadFailureCard failure={failure} />}

      {templates.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('templates.loading')}
        </p>
      )}
      {templates.isError && (
        <Card>
          <InlineError>{t('templates.loadError')}</InlineError>
          <Button variant="secondary" className="mt-4" onClick={() => void templates.refetch()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {selected && (
        <div className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <TemplateList
              templates={list}
              selectedId={selected.id}
              onSelect={(id) => setSelectedId(id)}
            />
            <WritingGuide />
          </div>
          <TemplatePreview key={`${selected.id}@${selected.version}`} template={selected} />
        </div>
      )}
    </div>
  );
}

// --- Upload errors -----------------------------------------------------------------------

function UploadFailureCard({ failure }: { failure: UploadFailure }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-3">
      <InlineError>{t(`templates.upload.errors.${failure.reason}`)}</InlineError>
      {failure.diagnostics && (
        <>
          <p className="text-sm text-steel-text">{t('templates.upload.diagnostics')}</p>
          <pre className="max-h-64 overflow-auto rounded-control bg-cloud-canvas p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-slate-ink">
            {failure.diagnostics}
          </pre>
        </>
      )}
    </Card>
  );
}

// --- List --------------------------------------------------------------------------------

function TemplateList({
  templates,
  selectedId,
  onSelect,
}: {
  templates: TemplateSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<TemplateSummary | null>(null);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  const deleteTemplate = useDeleteTemplate();

  return (
    <Card className="p-2">
      <h2 className="sr-only">{t('templates.listTitle')}</h2>
      <ul className="flex flex-col gap-1">
        {templates.map((template) => {
          const active = template.id === selectedId;
          return (
            <li
              key={template.id}
              className={cn(
                'flex items-center gap-2 rounded-control pr-1',
                active ? 'bg-cloud-canvas' : 'hover:bg-cloud-canvas',
              )}
            >
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(template.id)}
                className="flex min-w-0 flex-1 flex-col items-start gap-1 px-3 py-2.5 text-left"
              >
                <span
                  className={cn(
                    'max-w-full truncate text-sm font-medium',
                    active ? 'text-indigo-navy' : 'text-slate-ink',
                  )}
                >
                  {template.name}
                </span>
                <span className="flex items-center gap-2 text-xs text-steel-text">
                  <Tag>{template.builtIn ? t('templates.builtIn') : t('templates.own')}</Tag>
                  {t('templates.version', { version: template.version })}
                </span>
              </button>
              {!template.builtIn && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('templates.rename.action', { name: template.name })}
                    onClick={() => setRenaming(template)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('templates.delete.action', { name: template.name })}
                    onClick={() => setDeleting(template)}
                  >
                    <TrashIcon />
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {renaming && <RenameDialog template={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('templates.delete.title', { name: deleting?.name ?? '' })}
        description={
          deleting && deleting.finalizedResumes > 0
            ? t('templates.delete.descriptionUsed', { count: deleting.finalizedResumes })
            : t('templates.delete.description')
        }
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          if (deleting) await deleteTemplate.mutateAsync(deleting.id);
        }}
      />
    </Card>
  );
}

function RenameDialog({ template, onClose }: { template: TemplateSummary; onClose: () => void }) {
  const { t } = useTranslation();
  const rename = useRenameTemplate();
  const [name, setName] = useState(template.name);
  const trimmed = name.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    rename.mutate({ id: template.id, name: trimmed }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('templates.rename.title')}
    >
      <form onSubmit={submit}>
        <Field label={t('templates.rename.label')}>
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        {rename.isError && (
          <InlineError className="mt-3">
            {t('common.saveError', { message: rename.error.message })}
          </InlineError>
        )}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!trimmed || rename.isPending}>
            {rename.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// --- Preview -----------------------------------------------------------------------------

function TemplatePreview({ template }: { template: TemplateSummary }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<ResumeLanguage>('es');
  const preview = useTemplatePreview(template, language);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="min-w-0 truncate text-section-title text-indigo-navy">
          {t('templates.preview.title', { name: template.name })}
        </h2>
        <div
          role="group"
          aria-label={t('templates.preview.language')}
          className="flex shrink-0 rounded-control border border-silver-lining p-0.5"
        >
          {LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === language}
              onClick={() => setLanguage(option)}
              className={cn(
                'rounded-[6px] px-3 py-1 text-sm font-medium transition-colors',
                option === language
                  ? 'bg-indigo-navy text-pure-white'
                  : 'text-steel-text hover:text-indigo-navy',
              )}
            >
              {t(`templates.preview.languages.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[75vh] min-h-[32rem] overflow-hidden rounded-control border border-silver-lining bg-cloud-canvas">
        {preview.isPending && (
          <p role="status" className="p-6 text-sm text-steel-text">
            {t('templates.preview.loading')}
          </p>
        )}
        {preview.isError && (
          <div className="p-6">
            <InlineError>{t('templates.preview.error')}</InlineError>
          </div>
        )}
        {preview.data && (
          <PdfFrame
            pdf={preview.data}
            title={t('templates.preview.frameTitle', {
              name: template.name,
              language: t(`templates.preview.languages.${language}`),
            })}
          />
        )}
      </div>
    </Card>
  );
}

// --- Guide -------------------------------------------------------------------------------

function WritingGuide() {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('templates.guide.title')}</h2>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-slate-ink">
        <li>{t('templates.guide.download')}</li>
        <li>{t('templates.guide.data')}</li>
        <li>
          {t('templates.guide.test')}
          <code className="mt-1.5 block rounded-control bg-cloud-canvas p-2 font-mono text-xs break-all text-slate-ink">
            typst compile template.typ cv.pdf --input data=/examples/example.es.json
          </code>
        </li>
        <li>{t('templates.guide.upload')}</li>
      </ol>
      <p className="mt-4 text-sm text-steel-text">{t('templates.guide.ats')}</p>
    </Card>
  );
}
