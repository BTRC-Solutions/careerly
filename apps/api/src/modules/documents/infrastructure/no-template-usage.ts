import { Injectable } from '@nestjs/common';
import { TemplateUsage } from '../application/documents.ports.js';

/** Until snapshots exist (phase 7), no template is in use, so any user template can be deleted. */
@Injectable()
export class NoTemplateUsage extends TemplateUsage {
  async isUsed(): Promise<boolean> {
    return false;
  }
}
