import fs from 'node:fs';
import path from 'node:path';

/**
 * The newest Typst CLI downloaded by `npm run typst:fetch` (scripts/fetch-typst.mjs) for this platform, when
 * running from source. The installed app gets the packaged binary through `CAREERLY_TYPST_BIN` instead.
 */
export function findVendoredTypst(repoRoot: string): string | undefined {
  const root = path.join(repoRoot, 'vendor', 'typst');
  const binary = process.platform === 'win32' ? 'typst.exe' : 'typst';
  const versions = fs.existsSync(root)
    ? fs.readdirSync(root).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    : [];
  return versions
    .map((version) => path.join(root, version, `${process.platform}-${process.arch}`, binary))
    .find((candidate) => fs.existsSync(candidate));
}
