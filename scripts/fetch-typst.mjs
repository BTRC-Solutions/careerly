/**
 * Downloads the pinned Typst CLI for a platform and verifies its checksum (roadmap 3.2, ADR-14).
 *
 *   node scripts/fetch-typst.mjs                    # current platform
 *   node scripts/fetch-typst.mjs --target win32-x64 # another one (e.g. when packaging)
 *
 * The binary lands in vendor/typst/<version>/<target>/ (git-ignored), next to Typst's LICENSE and NOTICE,
 * and its path is printed. Already downloaded binaries are reused. Upgrading Typst = new version + checksums.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TYPST_VERSION = '0.15.1';

/** Release asset and its SHA-256 (from the GitHub release) per `<platform>-<arch>`. */
const ASSETS = {
  'win32-x64': {
    file: 'typst-x86_64-pc-windows-msvc.zip',
    sha256: '19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736',
  },
  'win32-arm64': {
    file: 'typst-aarch64-pc-windows-msvc.zip',
    sha256: '4ab28e1b71ec3184d38d580ab797f499b6770d952b6b19167be5cea5c2662e14',
  },
  'darwin-x64': {
    file: 'typst-x86_64-apple-darwin.tar.xz',
    sha256: '7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa',
  },
  'darwin-arm64': {
    file: 'typst-aarch64-apple-darwin.tar.xz',
    sha256: '48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a',
  },
  'linux-x64': {
    file: 'typst-x86_64-unknown-linux-musl.tar.xz',
    sha256: 'a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c',
  },
  'linux-arm64': {
    file: 'typst-aarch64-unknown-linux-musl.tar.xz',
    sha256: '5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee',
  },
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Folder with the binary, LICENSE and NOTICE for a target. */
export function typstDir(target = `${process.platform}-${process.arch}`) {
  return path.join(repoRoot, 'vendor', 'typst', TYPST_VERSION, target);
}

export function typstBinary(target = `${process.platform}-${process.arch}`) {
  return path.join(typstDir(target), target.startsWith('win32') ? 'typst.exe' : 'typst');
}

/** Ensures the binary for `target` is downloaded and verified; returns its path. */
export async function fetchTypst(target = `${process.platform}-${process.arch}`) {
  const asset = ASSETS[target];
  if (!asset) {
    throw new Error(
      `No Typst build for ${target}. Known targets: ${Object.keys(ASSETS).join(', ')}`,
    );
  }
  const binary = typstBinary(target);
  if (fs.existsSync(binary)) return binary;

  const url = `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${asset.file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Downloading ${url} failed: HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());

  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.file}: expected ${asset.sha256}, got ${actual}`);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-typst-'));
  try {
    const archivePath = path.join(work, asset.file);
    fs.writeFileSync(archivePath, archive);
    extract(archivePath, work);
    // Archives hold a single folder named like the asset, e.g. typst-x86_64-pc-windows-msvc/.
    const extracted = path.join(work, asset.file.replace(/\.(zip|tar\.xz)$/, ''));
    const dir = typstDir(target);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of [path.basename(binary), 'LICENSE', 'NOTICE']) {
      fs.copyFileSync(path.join(extracted, name), path.join(dir, name));
    }
    fs.chmodSync(binary, 0o755);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return binary;
}

function extract(archivePath, into) {
  // bsdtar ships with Windows 10+ and reads zip; elsewhere tar handles .tar.xz. Git Bash's GNU tar reads no zip,
  // so on Windows the system one is called explicitly.
  const tar =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  const result = spawnSync(tar, ['-xf', archivePath, '-C', into], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `Extracting ${path.basename(archivePath)} failed: ${result.stderr || result.error}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--target');
  const target = index > 0 ? process.argv[index + 1] : undefined;
  console.log(await fetchTypst(target));
}
