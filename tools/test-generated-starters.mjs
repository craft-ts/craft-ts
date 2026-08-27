#!/usr/bin/env node

import { execFile, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { appendJsExtensions, releasePackages } from './release.mjs';
import {
  cells,
  cellsForProfile,
  profiles,
} from './generated-starters-matrix.mjs';

const root = resolve(import.meta.dirname, '..');
const keep = process.argv.includes('--keep-fixtures');
const releaseVersion = process.env.CRAFT_RELEASE_VERSION;
const requestedCell = Number.parseInt(
  process.env.CRAFT_GENERATED_STARTER_CELL ?? '',
  10,
);
const fixtureRoot = mkdtempSync(join(tmpdir(), 'craft-generated-starters-'));

function profileFromArguments() {
  const profileArgument = process.argv.find((argument) =>
    argument.startsWith('--profile='),
  );
  if (profileArgument) {
    const profile = profileArgument.slice('--profile='.length);
    if (!profiles[profile])
      throw new Error(`Unknown generated starter profile "${profile}".`);
    return profile;
  }
  if (process.argv.includes('--static')) return 'static';
  if (process.argv.includes('--quick')) return 'smoke';
  return 'full';
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    [
      'Usage: node tools/test-generated-starters.mjs [--profile=static|smoke|release|full]',
      '       [--jobs=N] [--keep-fixtures]',
      '',
      'Profiles: static validates all 48 generated surfaces, smoke runs 13 full cells,',
      'release validates all 48 surfaces and runs the 13-cell release smoke, and',
      'full runs the complete 48-cell executable matrix.',
    ].join('\n'),
  );
  process.exit(0);
}

const profile = profileFromArguments();
const executableCells =
  profile === 'static'
    ? []
    : profile === 'release'
      ? cellsForProfile('smoke', requestedCell)
      : cellsForProfile(profile, requestedCell);
const executableCellKeys = new Set(
  executableCells.map((cell) => JSON.stringify(cell)),
);
const selected = cellsForProfile(
  profile === 'smoke' ? 'smoke' : profile,
  requestedCell,
);
const requestedJobs = Number.parseInt(
  process.argv
    .find((argument) => argument.startsWith('--jobs='))
    ?.slice('--jobs='.length) ??
    process.env.CRAFT_GENERATED_STARTER_JOBS ??
    '4',
  10,
);
if (!Number.isInteger(requestedJobs) || requestedJobs < 1) {
  throw new Error('Generated starter jobs must be a positive integer.');
}
const execFileAsync = promisify(execFile);

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

function runAsync(command, args, cwd = root, extraEnv = {}) {
  return execFileAsync(command, args, {
    cwd,
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      ...extraEnv,
      ...(releaseVersion ? { CRAFT_RELEASE_VERSION: releaseVersion } : {}),
    },
    stdio: 'inherit',
  });
}

function prepareLocalReleasePackages() {
  const preparedArtifacts = process.env.CRAFT_RELEASE_ARTIFACTS;
  if (preparedArtifacts) {
    const artifactRoot = resolve(preparedArtifacts);
    const indexPath = join(artifactRoot, 'manifest.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const overrides = Object.fromEntries(
      Object.entries(index).map(([name, filename]) => [
        name,
        `file:${join(artifactRoot, filename)}`,
      ]),
    );
    return { artifactRoot: undefined, overrides };
  }
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
  for (const section of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ]) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (overrides[name]) manifest[section][name] = overrides[name];
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function assertFile(directory, relativePath, expected, name) {
  const path = join(directory, relativePath);
  if (existsSync(path) !== expected) {
    throw new Error(
      `${name}: expected ${relativePath} to ${expected ? 'exist' : 'be absent'}`,
    );
  }
}

function assertStaticStarter(cell, directory, name) {
  const manifestPath = join(directory, 'package.json');
  if (!existsSync(manifestPath))
    throw new Error(`Missing generated package.json for ${name}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertFile(directory, 'AGENTS.md', true, name);
  const hasEffect =
    cell.frontendRuntime === 'effect' || cell.backendRuntime === 'effect';
  const hasServer = cell.backendRuntime !== 'none';

  assertFile(directory, 'src/i18n/catalog.ts', cell.i18n !== 'none', name);
  assertFile(
    directory,
    'src/app/ui/components.ts',
    cell.designSystem !== 'none',
    name,
  );
  assertFile(
    directory,
    'src/app/ui/ui.style.ts',
    cell.designSystem === 'basic' && cell.typedCss,
    name,
  );
  assertFile(
    directory,
    'src/app/ui/ui.ts',
    cell.designSystem === 'basic' && !cell.typedCss,
    name,
  );
  assertFile(directory, 'scripts/style-check.mjs', cell.typedCss, name);
  assertFile(directory, 'tsconfig.effect.json', hasEffect, name);
  assertFile(directory, 'tsconfig.server.json', hasServer, name);
  assertFile(directory, 'src/server/server.ts', hasServer, name);
  assertFile(directory, 'src/server/application.ts', hasServer, name);
  assertFile(directory, 'src/server/node-http.ts', hasServer, name);
  assertFile(directory, 'src/starter.fn-serveur.ts', hasServer, name);
  assertFile(
    directory,
    'src/starter.mw-serveur.ts',
    cell.backendRuntime === 'effect',
    name,
  );
  assertFile(
    directory,
    'src/server/i18n.ts',
    cell.backendRuntime === 'effect' && cell.i18n !== 'none',
    name,
  );
  assertFile(
    directory,
    'src/i18n/effect.ts',
    cell.frontendRuntime === 'effect' && cell.i18n !== 'none',
    name,
  );
  assertFile(
    directory,
    'src/app/domain.ts',
    cell.frontendRuntime === 'effect',
    name,
  );

  if (cell.i18n === 'none') {
    if (manifest.dependencies?.['@craft-ts/i18n']) {
      throw new Error(`${name}: i18n dependency present in disabled variant`);
    }
  } else if (
    !manifest.dependencies?.['@craft-ts/i18n'] ||
    !manifest.scripts?.['i18n:check']
  ) {
    throw new Error(
      `${name}: i18n dependency or scripts missing in enabled variant`,
    );
  }
  if (
    hasEffect &&
    (!manifest.dependencies?.effect ||
      !manifest.dependencies?.['@craft-ts/effect'])
  ) {
    throw new Error(`${name}: Effect dependencies missing in enabled variant`);
  }
  if (!hasEffect && manifest.dependencies?.effect) {
    throw new Error(`${name}: Effect dependency present in disabled variant`);
  }
  if (cell.typedCss && !manifest.scripts?.['style:check']) {
    throw new Error(`${name}: typed CSS script missing in enabled variant`);
  }
  if (hasServer && !manifest.scripts?.['server:test']) {
    throw new Error(`${name}: server test script missing in enabled variant`);
  }
}

async function runExecutableStarter(cell, directory, name, localRelease, port) {
  if (localRelease) useLocalReleasePackages(directory, localRelease.overrides);
  const environment = { CRAFT_STARTER_PORT: String(port) };
  await runAsync(
    'npm',
    ['install', '--no-audit', '--no-fund'],
    directory,
    environment,
  );
  for (const command of [
    'typecheck',
    'lint',
    'test',
    'architecture',
    'typecheck-architecture',
    'build',
    'e2e',
  ]) {
    await runAsync('npm', ['run', command], directory, environment);
  }
  if (cell.i18n !== 'none') {
    await runAsync('npm', ['run', 'i18n:check'], directory, environment);
    await runAsync('npm', ['run', 'i18n:test'], directory, environment);
  }
  if (cell.frontendRuntime === 'effect' || cell.backendRuntime === 'effect')
    await runAsync('npm', ['run', 'effect-check'], directory, environment);
  if (cell.backendRuntime !== 'none')
    await runAsync('npm', ['run', 'server:test'], directory, environment);
  if (cell.typedCss)
    await runAsync('npm', ['run', 'style:check'], directory, environment);
}

async function runWithConcurrency(items, worker, concurrency) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function runCell(cell, localRelease) {
  const cellIndex = cells.findIndex(
    (candidate) => JSON.stringify(candidate) === JSON.stringify(cell),
  );
  const name = `cell-${String(cellIndex + 1).padStart(2, '0')}`;
  const directory = join(fixtureRoot, name);
  const executable = executableCellKeys.has(JSON.stringify(cell));
  const port = 4173 + cellIndex;
  console.log(
    `\n[generated-starters] ${JSON.stringify({ profile, executable, jobs: requestedJobs, ...cell, releaseVersion, directory })}`,
  );
  const args = [
    'tsx',
    'libs/dev-tools/src/bin/craft.ts',
    'create',
    directory,
    '--workspace',
    'standalone',
    '--agents',
    'none',
    '--yes',
    '--json',
    '--frontend-runtime',
    cell.frontendRuntime,
    '--backend-runtime',
    cell.backendRuntime,
    '--i18n',
    cell.i18n,
    '--design-system',
    cell.designSystem,
    cell.typedCss ? '--typed-css' : '--no-typed-css',
  ];
  await runAsync('npx', args);
  assertStaticStarter(cell, directory, name);
  if (executable)
    await runExecutableStarter(cell, directory, name, localRelease, port);
}

async function main() {
  let localRelease;
  try {
    localRelease = releaseVersion ? prepareLocalReleasePackages() : undefined;
    await runWithConcurrency(
      selected,
      (cell) => runCell(cell, localRelease),
      requestedJobs,
    );
  } finally {
    // Local release tarballs are only used to validate packages before npm publish.
    // They live outside the generated fixture tree so every cell can share them.
    if (localRelease?.artifactRoot)
      rmSync(localRelease.artifactRoot, { recursive: true, force: true });
    if (keep)
      console.error(`Generated starter fixtures kept at ${fixtureRoot}`);
    else rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : error}\n`,
  );
  process.exitCode = 1;
});
