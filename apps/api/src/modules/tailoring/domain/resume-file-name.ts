import type { ResumeLanguage } from '@careerly/contracts';

/** Characters Windows, macOS or Linux do not accept in a file name. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Longest name before `.pdf`, well inside every file system's limit. */
const MAX_LENGTH = 150;

/**
 * The name offered when downloading a finalized CV: "Name - Job title - Company (EN).pdf". The parts that
 * are missing are left out; characters a file name cannot have become spaces.
 */
export function resumeFileName(parts: {
  name: string;
  jobTitle: string | null;
  company: string | null;
  language: ResumeLanguage;
}): string {
  const stem = [parts.name, parts.jobTitle, parts.company]
    .map((part) => (part ?? '').replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(' - ')
    .slice(0, MAX_LENGTH)
    // Windows does not accept a name that ends with a dot.
    .replace(/[\s.]+$/, '');
  return `${stem || 'CV'} (${parts.language.toUpperCase()}).pdf`;
}
