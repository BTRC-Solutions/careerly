import type {
  ConfirmCvImportRequest,
  CvImportDraft,
  DraftAchievement,
  PersonalInfo,
} from '@careerly/contracts';
import type { NewElement } from './profile.repositories.js';

/** A CV file as uploaded, already identified by its content (not by its name or MIME type). */
export interface CvFile {
  kind: 'pdf' | 'docx';
  data: Buffer;
}

type WithToolNames<T> = Omit<T, 'tools' | 'achievements'> & { tools: string[] };
type RawAchievement = Omit<DraftAchievement, 'tools'> & { tools: string[] };

/**
 * What the AI extracted, before tools are resolved against the catalog: tools are plain names as
 * written in the CV.
 */
export interface RawCvDraft {
  personalInfo: CvImportDraft['personalInfo'];
  positions: (WithToolNames<CvImportDraft['positions'][number]> & {
    achievements: RawAchievement[];
  })[];
  projects: (WithToolNames<CvImportDraft['projects'][number]> & {
    achievements: RawAchievement[];
  })[];
  education: CvImportDraft['education'];
  certifications: CvImportDraft['certifications'];
  languages: CvImportDraft['languages'];
}

/** Why a CV could not be turned into a draft. Mapped to clear HTTP errors. */
export type CvImportFailure =
  | 'UNREADABLE_FILE'
  | 'AI_NOT_CONFIGURED'
  | 'AI_KEY_REJECTED'
  | 'AI_RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'AI_FAILED';

export class CvImportError extends Error {
  constructor(
    readonly reason: CvImportFailure,
    message: string,
  ) {
    super(message);
    this.name = 'CvImportError';
  }
}

/** Port: reads a CV with AI. Never stores or logs the file or what it contains. */
export abstract class CvExtractor {
  /** Throws `CvImportError` when the file cannot be read or the AI cannot be used. */
  abstract extract(file: CvFile): Promise<RawCvDraft>;
}

/** Everything a confirmed import creates, ready to be written in one transaction. */
export interface ProfileImportPlan {
  element: (id: string) => NewElement;
  personalInfo: Omit<PersonalInfo, 'updatedAt'> | null;
  request: ConfirmCvImportRequest;
}

/** Port: writes a confirmed import atomically (all or nothing). */
export abstract class ProfileImportRepository {
  abstract save(plan: ProfileImportPlan): Promise<void>;
}
