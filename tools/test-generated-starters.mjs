#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const keep = process.argv.includes('--keep-fixtures');
const releaseVersion = process.env.CRAFT_RELEASE_VERSION;
const quick = process.argv.includes('--quick');
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
const selected = quick ? cells.filter((_cell, index) => index % 8 === 0) : cells;

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NX_DAEMON: 'false', ...(releaseVersion ? { CRAFT_RELEASE_VERSION: releaseVersion } : {}) },
  });
}

try {
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
  if (keep) console.error(`Generated starter fixtures kept at ${fixtureRoot}`);
  else rmSync(fixtureRoot, { recursive: true, force: true });
}
