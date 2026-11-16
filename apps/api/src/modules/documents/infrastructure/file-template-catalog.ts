import fs from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import {
  type ResumeTemplate,
  TemplateCatalog,
  TemplateNotFoundError,
} from '../application/documents.ports.js';

const TemplateManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1),
  version: z.number().int().positive(),
});

/** Built-in templates: each folder of `templatesDir` with a `template.json` next to its `template.typ`. */
@Injectable()
export class FileTemplateCatalog extends TemplateCatalog {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async list(): Promise<ResumeTemplate[]> {
    const entries = await fs.readdir(this.config.templatesDir, { withFileTypes: true });
    const templates = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => this.read(entry.name)),
    );
    return templates
      .filter((template) => template !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<ResumeTemplate> {
    const template = /^[a-z0-9-]{1,40}$/.test(id) ? await this.read(id) : null;
    if (!template) throw new TemplateNotFoundError(id);
    return template;
  }

  /** The template in `templatesDir/<folder>`, or `null` if the folder is not one (e.g. `fonts/`). */
  private async read(folder: string): Promise<ResumeTemplate | null> {
    const dir = path.join(this.config.templatesDir, folder);
    let manifest: unknown;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(dir, 'template.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const parsed = TemplateManifestSchema.parse(manifest);
    if (parsed.id !== folder) {
      throw new Error(`Template folder "${folder}" declares the id "${parsed.id}".`);
    }
    return { ...parsed, dir };
  }
}
