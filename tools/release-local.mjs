#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import {
  extractChangelogEntry,
  parseReleaseVersion,
  releasePackages,
} from './release.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const workspaceRoot = resolve(dirname(scriptPath), '..');
const supportedBumps = new Set(['patch', 'minor', 'major']);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, NX_DAEMON: 'false', ...options.env },
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function releasePeerDependencyRange(version) {
  const release = parseReleaseVersion(version);
  const base = `${release.major}.${release.minor}.${release.patch}`;
  return release.preid ? `^${base}-${release.preid}.0` : `^${base}`;
}

function syncInternalPeerDependencyRanges(version) {
  const releaseRange = releasePeerDependencyRange(version);
  const releasePackageNames = new Set(releasePackages.map(({ name }) => name));

  for (const pkg of releasePackages) {
    const manifest = readJson(join(workspaceRoot, pkg.sourceManifest));
    const peerDependencies = manifest.peerDependencies ?? {};
    let changed = false;

    for (const dependency of Object.keys(peerDependencies)) {
      if (!releasePackageNames.has(dependency)) continue;
      if (peerDependencies[dependency] === releaseRange) continue;
      peerDependencies[dependency] = releaseRange;
      changed = true;
    }

    if (changed) {
      manifest.peerDependencies = peerDependencies;
      writeJson(join(workspaceRoot, pkg.sourceManifest), manifest);
    }
  }
}

function syncDemoEslint(sourceDemoRoot, targetDemoRoot, targetManifest) {
  const sourceConfig = join(sourceDemoRoot, 'eslint.config.standalone.mjs');
  if (!existsSync(sourceConfig)) {
    throw new Error(`Missing standalone demo ESLint config: ${sourceConfig}`);
  }

  cpSync(sourceConfig, join(targetDemoRoot, 'eslint.config.mjs'));
  cpSync(
    join(sourceDemoRoot, 'craft-eslint-rules.mjs'),
    join(targetDemoRoot, 'craft-eslint-rules.mjs'),
  );
  rmSync(join(targetDemoRoot, 'eslint.config.js'), { force: true });

  const workspaceManifest = readJson(join(workspaceRoot, 'package.json'));
  targetManifest.devDependencies ??= {};
  for (const dependency of [
    '@eslint/js',
    'eslint',
    'typescript-eslint',
  ]) {
    const version = workspaceManifest.devDependencies?.[dependency];
    if (!version) {
      throw new Error(`Missing workspace ESLint dependency: ${dependency}`);
    }
    targetManifest.devDependencies[dependency] = version;
  }

  targetManifest.scripts ??= {};
  targetManifest.scripts.lint ??= 'eslint . --fix';
  targetManifest.scripts['lint:check'] ??= 'eslint .';
}

function disableTargetLogForwarding(targetDemoRoot) {
  const appConfigPath = join(targetDemoRoot, 'src/app/app.config.ts');
  if (!existsSync(appConfigPath)) {
    throw new Error(`Missing target demo app config: ${appConfigPath}`);
  }

  const contents = readFileSync(appConfigPath, 'utf8');
  const importPattern = /^(\s*)import \{ provideLogForwarding \} from '(\.\/log-forwarder)';(\s*)$/m;
  const providerPattern = /^(\s*)provideLogForwarding\(\),(\s*)$/m;
  const hasImport = importPattern.test(contents);
  const hasProvider = providerPattern.test(contents);

  if (!hasImport && !hasProvider) return;
  if (!hasImport || !hasProvider) {
    throw new Error(
      `Target demo app config has an incomplete provideLogForwarding setup: ${appConfigPath}`,
    );
  }

  const updated = contents
    .replace(
      importPattern,
      '$1// provideLogForwarding import disabled for the target demo.$2',
    )
    .replace(
      providerPattern,
      '$1// Disabled in the target demo: do not send logs to the local log server.\n$1// provideLogForwarding(),$2',
    );
  writeFileSync(appConfigPath, updated);
}

export function parseReleaseArgument(argument) {
  if (!argument) {
    throw new Error(
      'Missing release argument. Expected patch, minor, major, or an exact version.',
    );
  }

  return supportedBumps.has(argument)
    ? { bump: argument, version: '' }
    : { bump: '', version: argument };
}

export function syncDemoWorkspace(sourceDemoRoot, targetDemoRoot, version) {
  const targetManifestPath = join(targetDemoRoot, 'package.json');
  const targetManifest = readJson(targetManifestPath);
  if (targetManifest.name !== 'craft-ts-demo') {
    throw new Error(
      `${targetDemoRoot} is not the craft-ts-demo workspace (received ${targetManifest.name ?? 'no package name'}).`,
    );
  }

  for (const directory of ['src', 'public']) {
    const source = join(sourceDemoRoot, directory);
    const target = join(targetDemoRoot, directory);
    if (!existsSync(source)) {
      throw new Error(`Missing demo source directory: ${source}`);
    }
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }

  syncDemoEslint(sourceDemoRoot, targetDemoRoot, targetManifest);
  disableTargetLogForwarding(targetDemoRoot);

  targetManifest.dependencies ??= {};
  targetManifest.dependencies['@craft-ts/core'] = version;
  targetManifest.dependencies['@craft-ts/component'] = version;
  targetManifest.dependencies['@craft-ts/dev-tools'] = version;
  writeJson(targetManifestPath, targetManifest);

  removeDemoPackageLock(targetDemoRoot);
}

export function syncEffectDemoWorkspace(
  sourceDemoRoot,
  targetDemoRoot,
  version,
) {
  const targetManifestPath = join(targetDemoRoot, 'package.json');
  const targetManifest = readJson(targetManifestPath);
  if (targetManifest.name !== 'craft-ts-demo-effect') {
    throw new Error(
      `${targetDemoRoot} is not the craft-ts-demo-effect workspace (received ${targetManifest.name ?? 'no package name'}).`,
    );
  }

  const source = join(sourceDemoRoot, 'src');
  const target = join(targetDemoRoot, 'src');
  if (!existsSync(source)) {
    throw new Error(`Missing Effect demo source directory: ${source}`);
  }
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });

  const workspaceManifest = readJson(join(workspaceRoot, 'package.json'));
  const effectVersion =
    workspaceManifest.dependencies?.effect ??
    workspaceManifest.devDependencies?.effect;
  if (!effectVersion) {
    throw new Error('Missing workspace Effect dependency: effect');
  }

  targetManifest.dependencies ??= {};
  targetManifest.devDependencies ??= {};
  for (const legacyPackage of [
    '@craft-ng/core',
    '@craft-ng/component',
    '@craft-ng/effect',
    '@craft-ng/dev-tools',
  ]) {
    delete targetManifest.dependencies[legacyPackage];
    delete targetManifest.devDependencies[legacyPackage];
  }
  targetManifest.dependencies['@craft-ts/core'] = version;
  targetManifest.dependencies['@craft-ts/component'] = version;
  targetManifest.dependencies['@craft-ts/effect'] = version;
  targetManifest.dependencies.effect = effectVersion;
  delete targetManifest.dependencies['@craft-ts/dev-tools'];
  targetManifest.devDependencies['@craft-ts/dev-tools'] = version;
  writeJson(targetManifestPath, targetManifest);

  removeDemoPackageLock(targetDemoRoot);
}

function removeDemoPackageLock(targetDemoRoot) {
  rmSync(join(targetDemoRoot, 'package-lock.json'), { force: true });

  const gitignorePath = join(targetDemoRoot, '.gitignore');
  const gitignore = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf8')
    : '';
  if (!gitignore.split(/\r?\n/).includes('/package-lock.json')) {
    const separator = gitignore && !gitignore.endsWith('\n') ? '\n' : '';
    writeFileSync(
      gitignorePath,
      `${gitignore}${separator}/package-lock.json\n`,
    );
  }
}

export function syncBuiltDocumentation(buildRoot, targetDocsRoot) {
  if (!existsSync(join(buildRoot, 'index.html'))) {
    throw new Error(
      `Documentation build is missing index.html in ${buildRoot}.`,
    );
  }

  const preservedEntries = new Set(['.git', '.github', 'CNAME']);
  for (const entry of readdirSync(targetDocsRoot)) {
    if (!preservedEntries.has(entry)) {
      rmSync(join(targetDocsRoot, entry), { recursive: true, force: true });
    }
  }

  for (const entry of readdirSync(buildRoot)) {
    cpSync(join(buildRoot, entry), join(targetDocsRoot, entry), {
      recursive: lstatSync(join(buildRoot, entry)).isDirectory(),
    });
  }
}

function git(path, args, options = {}) {
  return run('git', args, { cwd: path, ...options });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function commitCount(count, qualifier) {
  return `${count} ${qualifier} commit${count === 1 ? '' : 's'}`;
}

export function gitSynchronizationError({
  path,
  branch,
  label,
  ahead,
  behind,
}) {
  const remoteBranch = `origin/${branch}`;
  const repository = shellQuote(path);

  if (ahead > 0 && behind === 0) {
    return new Error(
      `${label} has ${commitCount(ahead, 'local')} not pushed to ${remoteBranch}.\n` +
        `Push ${ahead === 1 ? 'it' : 'them'} before retrying:\n` +
        `  git -C ${repository} push origin ${branch}`,
    );
  }

  if (ahead === 0 && behind > 0) {
    return new Error(
      `${label} is ${commitCount(behind, 'remote')} behind ${remoteBranch}.\n` +
        `Update it before retrying:\n` +
        `  git -C ${repository} pull --ff-only origin ${branch}`,
    );
  }

  return new Error(
    `${label} has diverged from ${remoteBranch} ` +
      `(${commitCount(ahead, 'local')}, ${commitCount(behind, 'remote')}).\n` +
      `Inspect and reconcile both histories before retrying:\n` +
      `  git -C ${repository} log --oneline --left-right HEAD...${remoteBranch}`,
  );
}

function assertGitWorkspace(path, expectedBranch, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} workspace does not exist: ${path}`);
  }

  const root = git(path, ['rev-parse', '--show-toplevel'], {
    capture: true,
  }).trim();
  if (resolve(root) !== resolve(path)) {
    throw new Error(`${label} must be a Git workspace root: ${path}`);
  }

  const branch = git(path, ['branch', '--show-current'], {
    capture: true,
  }).trim();
  if (branch !== expectedBranch) {
    throw new Error(
      `${label} must be on ${expectedBranch}; it is currently on ${branch || 'detached HEAD'}.`,
    );
  }

  if (git(path, ['status', '--porcelain'], { capture: true }).trim()) {
    throw new Error(`${label} contains uncommitted changes: ${path}`);
  }

  git(path, ['fetch', 'origin', expectedBranch]);
  const divergence = git(
    path,
    ['rev-list', '--left-right', '--count', `HEAD...origin/${expectedBranch}`],
    { capture: true },
  ).trim();
  const [ahead, behind] = divergence.split(/\s+/).map(Number);
  if (ahead !== 0 || behind !== 0) {
    throw gitSynchronizationError({
      path,
      branch: expectedBranch,
      label,
      ahead,
      behind,
    });
  }
}

function parseMetadata(output) {
  return Object.fromEntries(
    output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function resolveRelease(argument) {
  const request = parseReleaseArgument(argument);
  const output = run(
    'node',
    ['tools/release.mjs', 'resolve', request.version, request.bump],
    { capture: true },
  );
  return parseMetadata(output);
}

function releaseIsAlreadyPrepared(version) {
  try {
    for (const pkg of releasePackages) {
      const manifest = readJson(join(workspaceRoot, pkg.sourceManifest));
      if (manifest.version !== version) return false;
    }
    extractChangelogEntry(
      readFileSync(join(workspaceRoot, 'CHANGELOG.md'), 'utf8'),
      version,
    );
    return true;
  } catch {
    return false;
  }
}

function hasChanges(path) {
  return Boolean(
    git(path, ['status', '--porcelain'], { capture: true }).trim(),
  );
}

function commitAll(path, message) {
  if (!hasChanges(path)) return false;
  git(path, ['add', '--all']);
  git(path, ['commit', '--message', message]);
  return true;
}

function gitTagExists(path, tag) {
  return Boolean(git(path, ['tag', '--list', tag], { capture: true }).trim());
}

async function askForConfirmation(
  version,
  docsRepo,
  demoRepo,
  effectDemoRepo,
) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Use --yes when running release:local non-interactively.');
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await prompt.question(
    `\nPublish ${version}, push ${workspaceRoot}, ${docsRepo}, ${demoRepo}, and ${effectDemoRepo}? [y/N] `,
  );
  prompt.close();
  const value = answer.trim().toLowerCase();
  if (value !== 'y' && value !== 'yes' && value !== 'o' && value !== 'oui') {
    throw new Error('Release cancelled.');
  }
}

export function npmPublishArguments(packageRoot, channel) {
  return ['publish', packageRoot, '--tag', channel, '--access', 'public'];
}

function publishPackage(packageRoot, channel) {
  run('npm', npmPublishArguments(packageRoot, channel));
}

function verifyPublishedArtifacts(version, manifestPath) {
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const verification = parseMetadata(
      run(
        'node',
        ['tools/release.mjs', 'registry-plan', version, manifestPath],
        { capture: true },
      ),
    );
    if (
      releasePackages.every((pkg) => verification[pkg.key] === 'skip')
    ) {
      return;
    }

    if (attempt < attempts) {
      process.stdout.write(
        `npm registry is still propagating ${version}; retrying verification (${attempt}/${attempts - 1})...\n`,
      );
      run('sleep', ['2']);
    }
  }

  throw new Error('npm registry verification failed after publication.');
}

async function main(args) {
  const [argument, ...flags] = args;
  const allowedFlags = new Set(['--dry-run', '--yes']);
  const unknownFlag = flags.find((flag) => !allowedFlags.has(flag));
  if (unknownFlag) {
    throw new Error(`Unknown release option: ${unknownFlag}`);
  }

  const dryRun = flags.includes('--dry-run');
  const assumeYes = flags.includes('--yes');
  const docsRepo = resolve(
    process.env.CRAFT_DOCS_REPO ?? join(workspaceRoot, '../craft'),
  );
  const demoRepo = resolve(
    process.env.CRAFT_DEMO_REPO ?? join(workspaceRoot, '../craft-ts-demo'),
  );
  const effectDemoRepo = resolve(
    process.env.CRAFT_EFFECT_DEMO_REPO ??
      join(workspaceRoot, '../craft-ts-demo-effect'),
  );

  assertGitWorkspace(workspaceRoot, 'main', 'craft-ts');
  assertGitWorkspace(docsRepo, 'main', 'documentation');
  assertGitWorkspace(demoRepo, 'main', 'StackBlitz demo');
  assertGitWorkspace(effectDemoRepo, 'main', 'Effect StackBlitz demo');

  run('npm', ['ci']);
  const release = resolveRelease(argument);
  const releaseIsPrepared = releaseIsAlreadyPrepared(release.version);
  run('node', ['tools/release.mjs', 'assert-target', release.version]);
  run('npm', ['run', 'release:check']);
  if (!dryRun) syncInternalPeerDependencyRanges(release.version);
  run('npx', [
    'nx',
    'run-many',
    '-t',
    'build',
    '-p',
    ...releasePackages.map(({ project }) => project),
  ]);
  run('npx', ['nx', 'build', 'demo-effect']);
  run('npx', ['nx', 'build', 'docs']);

  process.stdout.write(
    `\nRelease plan\n- version: ${release.version}\n- npm channel: ${release.channel}\n- docs: ${docsRepo}\n- StackBlitz: ${demoRepo}\n- Effect StackBlitz: ${effectDemoRepo}\n`,
  );
  if (dryRun) {
    process.stdout.write('\nDry run complete. No files were changed.\n');
    return;
  }

  run('npm', ['whoami']);
  run('gh', ['auth', 'status']);
  if (!assumeYes) {
    await askForConfirmation(
      release.version,
      docsRepo,
      demoRepo,
      effectDemoRepo,
    );
  }

  if (releaseIsPrepared) {
    process.stdout.write(
      `\n${release.version} is already present in package manifests and CHANGELOG.md; reusing it for the first npm publication of the new scope.\n`,
    );
  } else {
    run('npx', ['nx', 'release', 'version', release.version]);
    run('npx', ['nx', 'release', 'changelog', release.version]);
  }
  run('npx', [
    'nx',
    'run-many',
    '-t',
    'build',
    '-p',
    ...releasePackages.map(({ project }) => project),
  ]);
  run('npx', ['nx', 'build', 'demo-effect']);
  run('npx', ['nx', 'build', 'docs']);
  run('node', ['tools/release.mjs', 'assert-manifests', release.version]);
  run('node', [
    'tools/release.mjs',
    'assert-changes',
    ...(releaseIsPrepared ? ['--allow-subset'] : []),
  ]);

  syncDemoWorkspace(
    join(workspaceRoot, 'apps/demo'),
    demoRepo,
    release.version,
  );
  syncEffectDemoWorkspace(
    join(workspaceRoot, 'apps/demo-effect'),
    effectDemoRepo,
    release.version,
  );
  syncBuiltDocumentation(
    join(workspaceRoot, 'apps/docs/.vitepress/dist'),
    docsRepo,
  );

  const artifactsDirectory = mkdtempSync(join(tmpdir(), 'craft-ts-release-'));
  run('node', [
    'tools/release.mjs',
    'pack',
    release.version,
    artifactsDirectory,
  ]);

  commitAll(workspaceRoot, `chore(release): publish ${release.version}`);
  const docsChanged = commitAll(
    docsRepo,
    `docs: deploy craft-ts ${release.version}`,
  );
  const demoChanged = commitAll(
    demoRepo,
    `chore: sync examples for craft-ts ${release.version}`,
  );
  const effectDemoChanged = commitAll(
    effectDemoRepo,
    `chore: sync Effect examples for craft-ts ${release.version}`,
  );

  const plan = parseMetadata(
    run(
      'node',
      [
        'tools/release.mjs',
        'registry-plan',
        release.version,
        join(artifactsDirectory, 'manifest.json'),
      ],
      { capture: true },
    ),
  );
  for (const pkg of releasePackages) {
    if (plan[pkg.key] === 'publish') {
      publishPackage(resolve(workspaceRoot, pkg.distRoot), release.channel);
    }
  }

  verifyPublishedArtifacts(
    release.version,
    join(artifactsDirectory, 'manifest.json'),
  );

  const existingReleaseTag = gitTagExists(workspaceRoot, release.tag);
  if (existingReleaseTag) {
    process.stdout.write(
      `\nReusing existing Git tag ${release.tag}; it already belongs to the previous-scope release.\n`,
    );
    git(workspaceRoot, ['push', 'origin', 'main']);
  } else {
    git(workspaceRoot, [
      'tag',
      '--annotate',
      release.tag,
      '--message',
      release.tag,
    ]);
    git(workspaceRoot, ['push', '--atomic', 'origin', 'main', release.tag]);
  }

  const notesPath = join(artifactsDirectory, 'release-notes.md');
  run('node', [
    'tools/release.mjs',
    'extract-changelog',
    release.version,
    notesPath,
  ]);
  if (!existingReleaseTag) {
    const releaseArguments = [
      'release',
      'create',
      release.tag,
      '--repo',
      'craft-ts/craft-ts',
      '--verify-tag',
      '--title',
      release.tag,
      '--notes-file',
      notesPath,
    ];
    if (release.prerelease === 'true') releaseArguments.push('--prerelease');
    run('gh', releaseArguments);
  }

  if (docsChanged) git(docsRepo, ['push', 'origin', 'main']);
  if (demoChanged) git(demoRepo, ['push', 'origin', 'main']);
  if (effectDemoChanged) git(effectDemoRepo, ['push', 'origin', 'main']);

  rmSync(artifactsDirectory, { recursive: true, force: true });
  process.stdout.write(
    `\nPublished ${release.version}. Documentation and StackBlitz sources are up to date.\n`,
  );
}

if (process.argv[1] === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
