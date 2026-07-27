#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const releasePackages = [
  {
    key: 'core',
    name: '@craft-ng/core',
    project: 'ng-craft-core',
    sourceManifest: 'libs/core/package.json',
    distRoot: 'dist/libs/core',
  },
  {
    key: 'component',
    name: '@craft-ng/component',
    project: 'ng-craft-component',
    sourceManifest: 'libs/component/package.json',
    distRoot: 'dist/libs/component',
  },
  {
    key: 'dev_tools',
    name: '@craft-ng/dev-tools',
    project: 'dev-tools',
    sourceManifest: 'libs/dev-tools/package.json',
    distRoot: 'dist/libs/dev-tools',
  },
];

export const releaseTrackedFiles = [
  'CHANGELOG.md',
  ...releasePackages.map(({ sourceManifest }) => sourceManifest),
].sort();

export function parseReleaseVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|rc)\.(0|[1-9]\d*))?$/.exec(
      version,
    );

  if (!match) {
    throw new Error(
      `Invalid release version "${version}". Expected x.y.z, x.y.z-beta.N, or x.y.z-rc.N.`,
    );
  }

  const [, major, minor, patch, preid, prereleaseNumber] = match;
  const prerelease = Boolean(preid);

  return {
    version,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    preid: preid ?? null,
    prereleaseNumber:
      prereleaseNumber === undefined ? null : Number(prereleaseNumber),
    prerelease,
    channel: preid === 'beta' ? 'beta' : preid === 'rc' ? 'next' : 'latest',
    branch: `release/v${version}`,
    tag: `v${version}`,
  };
}

export function compareReleaseVersions(left, right) {
  const a = typeof left === 'string' ? parseReleaseVersion(left) : left;
  const b = typeof right === 'string' ? parseReleaseVersion(right) : right;

  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }

  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  if (a.preid !== b.preid) return a.preid < b.preid ? -1 : 1;
  if (a.prereleaseNumber === b.prereleaseNumber) return 0;
  return a.prereleaseNumber < b.prereleaseNumber ? -1 : 1;
}

export function bumpReleaseVersion(currentVersion, bump) {
  const current = parseReleaseVersion(currentVersion);

  switch (bump) {
    case 'patch':
      return current.prerelease
        ? `${current.major}.${current.minor}.${current.patch}`
        : `${current.major}.${current.minor}.${current.patch + 1}`;
    case 'minor':
      return `${current.major}.${current.minor + 1}.0`;
    case 'major':
      return `${current.major + 1}.0.0`;
    default:
      throw new Error(
        `Unsupported release bump "${bump}". Expected patch, minor, or major.`,
      );
  }
}

export function resolveReleaseVersion(version, bump, publishedVersions) {
  const exactVersion = version.trim();
  const requestedBump = bump.trim();

  if (Boolean(exactVersion) === Boolean(requestedBump)) {
    throw new Error('Provide exactly one of version or bump.');
  }

  if (exactVersion) {
    return parseReleaseVersion(exactVersion).version;
  }

  const supportedVersions = publishedVersions.filter((candidate) => {
    try {
      parseReleaseVersion(candidate);
      return true;
    } catch {
      return false;
    }
  });

  const latestVersion = supportedVersions.sort(compareReleaseVersions).at(-1);
  if (!latestVersion) {
    throw new Error('No supported published versions were found on npm.');
  }

  return bumpReleaseVersion(latestVersion, requestedBump);
}

export function extractChangelogEntry(contents, version) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(
    `^## ${escapedVersion}(?: \\([^\\n]+\\))?\\s*$`,
    'm',
  );
  const match = heading.exec(contents);

  if (!match) {
    throw new Error(`CHANGELOG.md does not contain a "## ${version}" entry.`);
  }

  const entryStart = match.index;
  const remaining = contents.slice(entryStart + match[0].length);
  const nextHeading = /^## /m.exec(remaining);
  const entryEnd = nextHeading
    ? entryStart + match[0].length + nextHeading.index
    : contents.length;

  return contents.slice(entryStart, entryEnd).trim() + '\n';
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
}

function npmViewJson(spec, field) {
  const result = spawnSync('npm', ['view', spec, field, '--json'], {
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return JSON.parse(result.stdout || 'null');
  }

  const failure = `${result.stdout}\n${result.stderr}`;
  if (failure.includes('E404')) return null;
  throw new Error(`npm view failed for ${spec}:\n${failure.trim()}`);
}

function publishedReleaseVersions() {
  return releasePackages.flatMap((pkg) => {
    const versions = npmViewJson(pkg.name, 'versions');
    if (versions === null) return [];
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error(`No published versions were found for ${pkg.name}.`);
    }
    return versions;
  });
}

function assertTargetVersion(version, allowExisting = false) {
  parseReleaseVersion(version);

  for (const pkg of releasePackages) {
    const versions = npmViewJson(pkg.name, 'versions');
    if (versions === null) continue;
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error(`No published versions were found for ${pkg.name}.`);
    }
    if (!allowExisting && versions.includes(version)) {
      throw new Error(`${pkg.name}@${version} is already published.`);
    }

    const supportedVersions = versions.filter((candidate) => {
      try {
        parseReleaseVersion(candidate);
        return true;
      } catch {
        return false;
      }
    });
    const latest = supportedVersions.sort(compareReleaseVersions).at(-1);
    if (!latest) continue;
    const order = compareReleaseVersions(version, latest);
    if (order < 0 || (!allowExisting && order === 0)) {
      throw new Error(
        `${version} must be greater than the latest ${pkg.name} version (${latest ?? 'unknown'}).`,
      );
    }
  }
}

function assertManifests(version) {
  parseReleaseVersion(version);
  for (const pkg of releasePackages) {
    const manifest = readJson(pkg.sourceManifest);
    if (manifest.name !== pkg.name) {
      throw new Error(
        `${pkg.sourceManifest} has package name ${manifest.name}; expected ${pkg.name}.`,
      );
    }
    if (manifest.version !== version) {
      throw new Error(
        `${pkg.sourceManifest} has version ${manifest.version}; expected ${version}.`,
      );
    }
  }

  extractChangelogEntry(readFileSync('CHANGELOG.md', 'utf8'), version);
}

function changedFiles(base, head) {
  const args = ['diff', '--name-only'];
  if (base && head) args.push(base, head);
  const unstaged = run('git', args, { capture: true })
    .split('\n')
    .filter(Boolean);

  if (base || head) return [...new Set(unstaged)].sort();

  const staged = run('git', ['diff', '--cached', '--name-only'], {
    capture: true,
  })
    .split('\n')
    .filter(Boolean);
  return [...new Set([...unstaged, ...staged])].sort();
}

function assertChangedFiles(base, head) {
  const actual = changedFiles(base, head);
  assertFileNames(actual);
}

function assertFileNames(actual) {
  actual = [...new Set(actual)].sort();
  if (JSON.stringify(actual) !== JSON.stringify(releaseTrackedFiles)) {
    throw new Error(
      `Release changes must be exactly ${releaseTrackedFiles.join(', ')}; received ${actual.join(', ') || 'none'}.`,
    );
  }
}

function assertFileList(path) {
  assertFileNames(readFileSync(path, 'utf8').split('\n').filter(Boolean));
}

function packRelease(version, outputDirectory) {
  assertManifests(version);
  const absoluteOutput = resolve(outputDirectory);
  mkdirSync(absoluteOutput, { recursive: true });
  const artifacts = [];

  for (const pkg of releasePackages) {
    const distManifest = readJson(`${pkg.distRoot}/package.json`);
    if (distManifest.name !== pkg.name || distManifest.version !== version) {
      throw new Error(
        `${pkg.distRoot}/package.json must contain ${pkg.name}@${version}.`,
      );
    }

    const output = run(
      'npm',
      ['pack', pkg.distRoot, '--json', '--pack-destination', absoluteOutput],
      { capture: true },
    );
    const [artifact] = JSON.parse(output);
    if (
      !artifact ||
      artifact.name !== pkg.name ||
      artifact.version !== version
    ) {
      throw new Error(`npm pack returned invalid metadata for ${pkg.name}.`);
    }
    artifacts.push({
      key: pkg.key,
      name: pkg.name,
      project: pkg.project,
      filename: artifact.filename,
      shasum: artifact.shasum,
      integrity: artifact.integrity,
    });
  }

  writeFileSync(
    `${absoluteOutput}/manifest.json`,
    JSON.stringify({ version, artifacts }, null, 2) + '\n',
  );
}

function registryPlan(version, manifestPath) {
  const manifest = readJson(manifestPath);
  if (manifest.version !== version || !Array.isArray(manifest.artifacts)) {
    throw new Error(`Invalid artifact manifest for ${version}.`);
  }

  for (const artifact of manifest.artifacts) {
    const registryShasum = npmViewJson(
      `${artifact.name}@${version}`,
      'dist.shasum',
    );
    if (registryShasum === null) {
      process.stdout.write(`${artifact.key}=publish\n`);
      continue;
    }
    if (registryShasum !== artifact.shasum) {
      throw new Error(
        `${artifact.name}@${version} already exists with shasum ${registryShasum}, but the local artifact is ${artifact.shasum}.`,
      );
    }
    process.stdout.write(`${artifact.key}=skip\n`);
  }
}

function metadata(version) {
  const info = parseReleaseVersion(version);
  for (const [key, value] of Object.entries(info)) {
    if (
      ['major', 'minor', 'patch', 'preid', 'prereleaseNumber'].includes(key)
    ) {
      continue;
    }
    process.stdout.write(`${key}=${value}\n`);
  }
}

function resolveReleaseRequest(version, bump) {
  const publishedVersions = bump ? publishedReleaseVersions() : [];
  metadata(resolveReleaseVersion(version ?? '', bump ?? '', publishedVersions));
}

function main([command, ...args]) {
  switch (command) {
    case 'resolve':
      resolveReleaseRequest(args[0], args[1]);
      break;
    case 'metadata':
      metadata(args[0]);
      break;
    case 'assert-target':
      assertTargetVersion(args[0], args[1] === '--allow-existing');
      break;
    case 'assert-manifests':
      assertManifests(args[0]);
      break;
    case 'assert-changes':
      assertChangedFiles(args[0], args[1]);
      break;
    case 'assert-file-list':
      assertFileList(args[0]);
      break;
    case 'pack':
      packRelease(args[0], args[1]);
      break;
    case 'registry-plan':
      registryPlan(args[0], args[1]);
      break;
    case 'extract-changelog':
      writeFileSync(
        args[1],
        extractChangelogEntry(readFileSync('CHANGELOG.md', 'utf8'), args[0]),
      );
      break;
    default:
      throw new Error(
        'Usage: release.mjs <resolve|metadata|assert-target|assert-manifests|assert-changes|assert-file-list|pack|registry-plan|extract-changelog> ...',
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
