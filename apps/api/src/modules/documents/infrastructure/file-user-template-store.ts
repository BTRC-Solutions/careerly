import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TemplateNameSchema } from '@careerly/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import {
  type ResumeTemplate,
  TemplateNotFoundError,
  UserTemplateStore,
} from '../application/documents.ports.js';

const TEMPLATE_ID = /^[a-z0-9-]{1,40}$/;

const MetaSchema = z.object({
  id: z.string().regex(TEMPLATE_ID),
  name: TemplateNameSchema,
  version: z.number().int().positive(),
});

/**
 * The user's templates in `files/templates/<id>/`: `meta.json` (id, name, current version) and one folder per
 * version with its `template.typ`. Versions are never edited, so a snapshot that used one can render again
 * (RNF-10). The folder is inside `files/`, so backups include it.
 */
@Injectable()
export class FileUserTemplateStore extends UserTemplateStore {
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.root = path.join(config.filesDir, 'templates');
  }

  async list(): Promise<ResumeTemplate[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const templates = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => this.read(entry.name)),
    );
    return templates.filter((template): template is ResumeTemplate => template !== null);
  }

  /** Only `template.typ`: without `meta.json` the folder is not listed until {@link publish}. */
  async stage(id: string, name: string, source: string): Promise<ResumeTemplate> {
    assertId(id);
    const version = 1;
    const dir = this.versionDir(id, version);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'template.typ'), source);
    return { id, name, version, builtIn: false, dir };
  }

  async publish(template: ResumeTemplate): Promise<void> {
    const { id, name, version } = template;
    assertId(id);
    await this.writeMeta(id, { id, name, version });
  }

  async rename(id: string, name: string): Promise<void> {
    const template = await this.require(id);
    await this.writeMeta(id, { id, name, version: template.version });
  }

  async delete(id: string): Promise<void> {
    assertId(id);
    await fs.rm(path.join(this.root, id), { recursive: true, force: true });
  }

  private async require(id: string): Promise<ResumeTemplate> {
    assertId(id);
    const template = await this.read(id);
    if (!template) throw new TemplateNotFoundError(id);
    return template;
  }

  /** Returns `null` for a folder that is not a complete template (e.g. one left by a failed upload). */
  private async read(id: string): Promise<ResumeTemplate | null> {
    if (!TEMPLATE_ID.test(id)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(path.join(this.root, id, 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
    const meta = MetaSchema.safeParse(parsed);
    if (!meta.success || meta.data.id !== id) return null;
    const { name, version } = meta.data;
    return { id, name, version, builtIn: false, dir: this.versionDir(id, version) };
  }

  /** Written to a temporary file and renamed, so a crash never leaves a half-written `meta.json`. */
  private async writeMeta(id: string, meta: z.infer<typeof MetaSchema>): Promise<void> {
    const file = path.join(this.root, id, 'meta.json');
    await fs.writeFile(`${file}.tmp`, JSON.stringify(meta, null, 2));
    await fs.rename(`${file}.tmp`, file);
  }

  private versionDir(id: string, version: number): string {
    return path.join(this.root, id, String(version));
  }
}

function assertId(id: string): void {
  if (!TEMPLATE_ID.test(id)) throw new TemplateNotFoundError(id);
}
