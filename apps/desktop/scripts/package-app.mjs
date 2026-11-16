/**
 * Builds the Windows installer (roadmap 1.4). Run `npm run build` first (the root `package:win` does both).
 *
 * electron-builder does not cope well with npm workspaces, so nothing is packaged from node_modules:
 * 1. The compiled main process and API (`dist/`, emitted by tsc with decorator metadata, which Nest's DI
 *    needs) are bundled with esbuild into self-contained ES modules.
 * 2. release/app/       → the Electron app (inside app.asar): package.json, main.mjs, preload.cjs
 *    release/resources/ → next to it, outside the asar: api/main.mjs, api/drizzle/ (migrations), web/ (UI)
 * 3. electron-builder turns that into an NSIS installer in release/installer/.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { Arch, build as buildInstaller, Platform } from 'electron-builder';

const require = createRequire(import.meta.url);
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = path.resolve(desktopDir, '..');
const releaseDir = path.join(desktopDir, 'release');
const stageApp = path.join(releaseDir, 'app');
const stageResources = path.join(releaseDir, 'resources');

const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
const electronVersion = require('electron/package.json').version;

// ESM output: CommonJS dependencies (NestJS, pino…) still need `require`, `__filename` and `__dirname`.
const esmBanner = [
  "import { createRequire as __careerlyCreateRequire } from 'node:module';",
  "import { fileURLToPath as __careerlyFileURLToPath } from 'node:url';",
  "import { dirname as __careerlyDirname } from 'node:path';",
  'const require = __careerlyCreateRequire(import.meta.url);',
  'const __filename = __careerlyFileURLToPath(import.meta.url);',
  'const __dirname = __careerlyDirname(__filename);',
].join('\n');

/** Optional NestJS integrations, loaded lazily only when used; Careerly uses none of them. */
const NEST_OPTIONAL = [
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@fastify/static',
  '@fastify/view',
  'class-transformer',
  'class-transformer/*',
  'class-validator',
];

function requireBuilt(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`${path.relative(appsDir, file)} is missing. Run "npm run build" first.`);
  }
  return file;
}

async function bundleEsm(entry, outfile, external) {
  await bundle({
    entryPoints: [requireBuilt(entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external,
    banner: { js: esmBanner },
    // Keep class names: Nest uses them for DI tokens and log contexts.
    keepNames: true,
    legalComments: 'none',
    logLevel: 'warning',
  });
}

fs.rmSync(releaseDir, { recursive: true, force: true });

// 1. Electron app (main + preload).
await bundleEsm(path.join(desktopDir, 'dist', 'main.js'), path.join(stageApp, 'main.mjs'), [
  'electron',
]);
fs.copyFileSync(
  requireBuilt(path.join(desktopDir, 'dist', 'preload.cjs')),
  path.join(stageApp, 'preload.cjs'),
);
fs.writeFileSync(
  path.join(stageApp, 'package.json'),
  JSON.stringify(
    {
      name: 'careerly',
      productName: desktopPackage.productName,
      version: desktopPackage.version,
      description: 'Tailor your CV to each job with AI and track your applications.',
      author: 'BTRC Solutions',
      type: 'module',
      main: 'main.mjs',
    },
    null,
    2,
  ),
);

// 2. Resources: API, migrations and UI.
await bundleEsm(
  path.join(appsDir, 'api', 'dist', 'main.js'),
  path.join(stageResources, 'api', 'main.mjs'),
  NEST_OPTIONAL,
);
fs.cpSync(path.join(appsDir, 'api', 'drizzle'), path.join(stageResources, 'api', 'drizzle'), {
  recursive: true,
});
requireBuilt(path.join(appsDir, 'web', 'dist', 'index.html'));
fs.cpSync(path.join(appsDir, 'web', 'dist'), path.join(stageResources, 'web'), { recursive: true });

// 3. Installer.
await buildInstaller({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    appId: 'com.btrcsolutions.careerly',
    productName: desktopPackage.productName,
    copyright: 'Copyright © BTRC Solutions',
    electronVersion,
    directories: { app: stageApp, output: path.join(releaseDir, 'installer') },
    files: ['**/*'],
    extraResources: [{ from: stageResources, to: '.' }],
    asar: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    win: { artifactName: '${productName}-Setup-${version}.${ext}' },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      // User data (<appData>/Careerly) is kept on uninstall; deleting it is an explicit action in the app.
      deleteAppDataOnUninstall: false,
    },
  },
});

console.log(
  `Installer written to ${path.relative(process.cwd(), path.join(releaseDir, 'installer'))}`,
);
