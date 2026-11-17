import fs from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { TemplateStarterKit } from '../application/documents.ports.js';
import { DEFAULT_TEMPLATE_ID } from '../application/resume-render.service.js';

/**
 * The default template and the examples as a `.zip`. The layout matches what the template expects:
 * `typst compile template.typ --input data=/examples/example.es.json` works from the unpacked folder.
 */
@Injectable()
export class ZipTemplateStarterKit extends TemplateStarterKit {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async build(): Promise<Uint8Array> {
    const zip = new JSZip();
    const templatesDir = this.config.templatesDir;
    zip.file(
      'template.typ',
      await fs.readFile(path.join(templatesDir, DEFAULT_TEMPLATE_ID, 'template.typ')),
    );
    const examplesDir = path.join(templatesDir, 'examples');
    for (const name of (await fs.readdir(examplesDir)).filter((file) => file.endsWith('.json'))) {
      zip.file(`examples/${name}`, await fs.readFile(path.join(examplesDir, name)));
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
}
