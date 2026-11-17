import fs from 'node:fs/promises';
import path from 'node:path';
import { type TemplateData, TemplateDataSchema } from '@careerly/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import {
  type ResumeTemplate,
  TemplateCatalog,
  TemplateNotFoundError,
  UserTemplateStore,
} from '../application/documents.ports.js';

const TemplateManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1),
  version: z.number().int().positive(),
});

/**
 * All the templates the user can pick: the built-in ones (each folder of `templatesDir` with a `template.json`
 * next to its `template.typ`) and the user's own (see {@link UserTemplateStore}).
 */
@Injectable()
export class FileTemplateCatalog extends TemplateCatalog {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly userTemplates: UserTemplateStore,
  ) {
    super();
  }

  async list(): Promise<ResumeTemplate[]> {
    const entries = await fs.readdir(this.config.templatesDir, { withFileTypes: true });
    const builtIn = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => this.read(entry.name)),
    );
    const templates = [
      ...builtIn.filter((template) => template !== null),
      ...(await this.userTemplates.list()),
    ];
    return templates.sort(
      (a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name),
    );
  }

  async get(id: string): Promise<ResumeTemplate> {
    const template = (await this.list()).find((candidate) => candidate.id === id);
    if (!template) throw new TemplateNotFoundError(id);
    return template;
  }

  async examples(): Promise<TemplateData[]> {
    const dir = path.join(this.config.templatesDir, 'examples');
    const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
    return Promise.all(
      files.map(async (name) =>
        TemplateDataSchema.parse(JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))),
      ),
    );
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
    return { ...parsed, builtIn: true, dir };
  }
}
