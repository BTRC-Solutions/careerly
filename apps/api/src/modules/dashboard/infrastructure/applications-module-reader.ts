import { Injectable } from '@nestjs/common';
import { ApplicationsHistoryService } from '../../applications/index.js';
import { type ApplicationTrack, ApplicationTracksReader } from '../application/dashboard.ports.js';

/** The applications, through the public service of the applications module. */
@Injectable()
export class ApplicationsModuleReader extends ApplicationTracksReader {
  constructor(private readonly history: ApplicationsHistoryService) {
    super();
  }

  all(): Promise<ApplicationTrack[]> {
    return this.history.histories();
  }
}
