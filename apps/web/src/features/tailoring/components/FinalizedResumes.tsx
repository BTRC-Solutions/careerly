import type { ResumeVersion, TailoringSession } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { DownloadIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PdfFrame } from '../../../shared/ui/PdfFrame';
import {
  useDownloadResumeVersion,
  useResumeVersionPdf,
  useResumeVersions,
} from '../api/tailoring-api';
import { LanguageToggle } from './LanguageToggle';

/**
 * The CVs of a finalized session (RF-TAIL-14): exactly the PDF that was frozen, per language, to look at and
 * download. They no longer change, whatever happens to the profile or the template.
 */
export function FinalizedResumes({ session }: { session: TailoringSession }) {
  const { t } = useTranslation();
  const versions = useResumeVersions(session.id, true);
  const [language, setLanguage] = useState(session.languages[0] ?? 'es');

  if (versions.isPending) {
    return (
      <p role="status" className="text-sm text-steel-text">
        {t('tailoring.loading')}
      </p>
    );
  }
  const list = versions.data?.versions ?? [];
  const version = list.find((v) => v.language === language) ?? list[0];
  if (versions.isError || !version) {
    return (
      <Card>
        <InlineError>{t('tailoring.finalized.loadError')}</InlineError>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <LanguageToggle
        languages={list.map((v) => v.language)}
        value={version.language}
        onChange={setLanguage}
      />
      <FinalizedResume key={version.id} version={version} />
    </div>
  );
}

function FinalizedResume({ version }: { version: ResumeVersion }) {
  const { t, i18n } = useTranslation();
  const pdf = useResumeVersionPdf(version.id);
  const download = useDownloadResumeVersion();
  const languageName = t(`tailoring.review.languages.${version.language}`);
  const finalizedOn = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
    new Date(version.createdAt),
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section-title text-indigo-navy">
            {t('tailoring.finalize.cv', { language: languageName })}
          </h2>
          <p className="text-sm text-steel-text">
            {t('tailoring.finalized.details', {
              date: finalizedOn,
              count: version.pageCount,
              template: version.templateName,
            })}
          </p>
          <p className="text-sm text-steel-text">{t('tailoring.finalized.frozen')}</p>
        </div>
        <Button
          variant="secondary"
          disabled={download.isPending}
          onClick={() => download.mutate(version)}
        >
          <DownloadIcon />
          {t('tailoring.finalized.download')}
        </Button>
      </div>
      {download.isError && <InlineError>{t('tailoring.finalized.downloadError')}</InlineError>}
      <div className="h-[75vh] min-h-[32rem] overflow-hidden rounded-control border border-silver-lining bg-cloud-canvas">
        {pdf.isError && (
          <div className="p-6">
            <InlineError>{t('tailoring.finalized.pdfError')}</InlineError>
          </div>
        )}
        {pdf.data && (
          <PdfFrame
            pdf={pdf.data}
            title={t('tailoring.finalized.pdfTitle', { language: languageName })}
          />
        )}
      </div>
    </Card>
  );
}
