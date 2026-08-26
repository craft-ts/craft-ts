#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { appendJsExtensions, releasePackages } from './release.mjs';

const root = resolve(import.meta.dirname, '..');
const keep = process.argv.includes('--keep-fixtures');
const releaseVersion = process.env.CRAFT_RELEASE_VERSION;
const quick = process.argv.includes('--quick');
const requestedCell = Number.parseInt(process.env.CRAFT_GENERATED_STARTER_CELL ?? '', 10);
const fixtureRoot = mkdtempSync(join(tmpdir(), 'craft-generated-starters-'));

const frontends = ['plain', 'effect'];
const backends = ['none', 'promise', 'effect'];
const features = ['none', 'strict'].flatMap((i18n) =>
  ['none', 'basic'].flatMap((designSystem) =>
    [false, true].map((typedCss) => ({ i18n, designSystem, typedCss })),
  ),
);
const cells = frontends.flatMap((frontendRuntime) =>
  backends.flatMap((backendRuntime) =>
    features.map((feature) => ({ frontendRuntime, backendRuntime, ...feature })),
  ),
);
const selected = requestedCell > 0
  ? cells.filter((_cell, index) => index + 1 === requestedCell)
  : quick
    ? cells.filter((_cell, index) => index % 8 === 0)
    : cells;

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      ...(releaseVersion ? { CRAFT_RELEASE_VERSION: releaseVersion } : {}),
    },
  });
}

function prepareLocalReleasePackages() {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'craft-release-packages-'));
  run('npx', [
    'nx',
    'run-many',
    '-t',
    'build',
    '-p',
    ...releasePackages.map(({ project }) => project),
    '--skipSync',
    '--outputStyle=stream',
  ]);
  const overrides = {};
  for (const pkg of releasePackages) {
    const packageRoot = resolve(root, pkg.distRoot);
    appendJsExtensions(packageRoot);
    const output = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', artifactRoot],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    const [packed] = JSON.parse(output);
    overrides[pkg.name] = `file:${resolve(artifactRoot, packed.filename)}`;
  }

  return { artifactRoot, overrides };
}

function useLocalReleasePackages(directory, overrides) {
  const manifestPath = join(directory, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (overrides[name]) manifest[section][name] = overrides[name];
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

let localRelease;
try {
  localRelease = releaseVersion ? prepareLocalReleasePackages() : undefined;
  for (const [index, cell] of selected.entries()) {
    const name = `cell-${String(index + 1).padStart(2, '0')}`;
    const directory = join(fixtureRoot, name);
    console.log(`\n[generated-starters] ${JSON.stringify({ ...cell, releaseVersion, directory })}`);
    const args = [
      'tsx', 'libs/dev-tools/src/bin/craft.ts', 'create', directory,
      '--workspace', 'standalone', '--agents', 'none', '--yes', '--json',
      '--frontend-runtime', cell.frontendRuntime,
      '--backend-runtime', cell.backendRuntime,
      '--i18n', cell.i18n,
      '--design-system', cell.designSystem,
      cell.typedCss ? '--typed-css' : '--no-typed-css',
    ];
    run('npx', args);
    const manifest = join(directory, 'package.json');
    if (!existsSync(manifest)) throw new Error(`Missing generated package.json for ${name}`);
    if (localRelease) useLocalReleasePackages(directory, localRelease.overrides);
    run('npm', ['install', '--no-audit', '--no-fund'], directory);
    for (const command of ['typecheck', 'test', 'architecture', 'typecheck-architecture', 'build', 'e2e']) {
      run('npm', ['run', command], directory);
    }
    if (cell.i18n !== 'none') {
      run('npm', ['run', 'i18n:check'], directory);
      run('npm', ['run', 'i18n:test'], directory);
    }
    if (cell.frontendRuntime === 'effect' || cell.backendRuntime === 'effect') run('npm', ['run', 'effect-check'], directory);
    if (cell.backendRuntime !== 'none') run('npm', ['run', 'server:test'], directory);
    if (cell.typedCss) run('npm', ['run', 'style:check'], directory);
  }
} finally {
  // Local release tarballs are only used to validate packages before npm publish.
  // They live outside the generated fixture tree so every cell can share them.
  if (localRelease) rmSync(localRelease.artifactRoot, { recursive: true, force: true });
  if (keep) console.error(`Generated starter fixtures kept at ${fixtureRoot}`);
  else rmSync(fixtureRoot, { recursive: true, force: true });
}
