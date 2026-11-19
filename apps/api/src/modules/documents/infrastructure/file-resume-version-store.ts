import fs from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { ResumeVersionFileStore, type ResumeVersionFiles } from '../application/documents.ports.js';

const VERSION_ID = /^[0-9a-f-]{36}$/;

/**
 * The files of the finalized CVs (RNF-10): `files/snapshots/<id>/` holds `cv.pdf`, `data.json` (what the
 * template received) and `template.typ` (a copy of the template), so the CV can be opened and rendered again
 * even if the template changes or is deleted. Inside `files/`, so backups include them. The app writes them
 * once and only reads them afterwards.
 */
@Injectable()
export class FileResumeVersionStore extends ResumeVersionFileStore {
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.root = path.join(config.filesDir, 'snapshots');
  }

  async write(id: string, files: ResumeVersionFiles): Promise<void> {
    const dir = this.dir(id);
    await fs.mkdir(this.root, { recursive: true });
    // Fails if the folder exists: a version is written once.
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'cv.pdf'), files.pdf, { flag: 'wx' });
    await fs.writeFile(path.join(dir, 'data.json'), JSON.stringify(files.data, null, 2), {
      flag: 'wx',
    });
    await fs.copyFile(
      path.join(files.template.dir, 'template.typ'),
      path.join(dir, 'template.typ'),
      fs.constants.COPYFILE_EXCL,
    );
  }

  async readPdf(id: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(path.join(this.dir(id), 'cv.pdf')));
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.dir(id), { recursive: true, force: true });
  }

  private dir(id: string): string {
    if (!VERSION_ID.test(id)) throw new Error(`Invalid resume version id: ${id}`);
    return path.join(this.root, id);
  }
}
