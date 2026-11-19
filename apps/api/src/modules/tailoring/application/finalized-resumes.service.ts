import type { ResumeVersion } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ResumeVersionStore, TailoringSessionRepository } from './tailoring.ports.js';

/**
 * The finalized CVs of a job description, for the applications module (roadmap 7.3, RF-APP-02): the versions
 * of every finalized session of that job description, newest session first.
 */
@Injectable()
export class FinalizedResumesService {
  constructor(
    private readonly sessions: TailoringSessionRepository,
    private readonly versions: ResumeVersionStore,
  ) {}

  async forJobPosting(jobPostingId: string): Promise<ResumeVersion[]> {
    const sessions = await this.sessions.list({ jobPostingId });
    const finalized = sessions.filter((session) => session.status === 'FINALIZED');
    const lists = await Promise.all(
      finalized.map(async (session) => {
        const versions = await this.versions.list(session.id);
        // In the order of the session's languages.
        return session.languages.flatMap((language) =>
          versions.filter((version) => version.language === language),
        );
      }),
    );
    return lists.flat();
  }
}
