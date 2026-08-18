import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertNpmPackExcludesTests,
  bumpReleaseVersion,
  compareReleaseVersions,
  extractChangelogEntry,
  parseReleaseVersion,
  releaseTrackedFiles,
  resolveReleaseVersion,
  unpublishedNpmPackPaths,
} from './release.mjs';

test('maps supported versions to their release channel', () => {
  assert.deepEqual(parseReleaseVersion('0.5.8-beta.1'), {
    version: '0.5.8-beta.1',
    major: 0,
    minor: 5,
    patch: 8,
    preid: 'beta',
    prereleaseNumber: 1,
    prerelease: true,
    channel: 'beta',
    branch: 'release/v0.5.8-beta.1',
    tag: 'v0.5.8-beta.1',
  });
  assert.equal(parseReleaseVersion('1.0.0-rc.0').channel, 'next');
  assert.equal(parseReleaseVersion('1.0.0').channel, 'latest');
});

test('rejects unsupported or ambiguous versions', () => {
  for (const version of [
    'v1.0.0',
    '1.0',
    '01.0.0',
    '1.0.0-alpha.0',
    '1.0.0-beta',
    '1.0.0+build.1',
  ]) {
    assert.throws(
      () => parseReleaseVersion(version),
      /Invalid release version/,
    );
  }
});

test('compares stable, beta, and rc versions using semver order', () => {
  const versions = [
    '1.0.0',
    '0.5.8-rc.0',
    '0.5.8-beta.10',
    '0.5.8-beta.2',
    '0.5.7',
  ];
  assert.deepEqual(versions.sort(compareReleaseVersions), [
    '0.5.7',
    '0.5.8-beta.2',
    '0.5.8-beta.10',
    '0.5.8-rc.0',
    '1.0.0',
  ]);
});

test('calculates patch, minor, and major versions from the latest release', () => {
  assert.equal(bumpReleaseVersion('0.5.8', 'patch'), '0.5.9');
  assert.equal(bumpReleaseVersion('0.5.8', 'minor'), '0.6.0');
  assert.equal(bumpReleaseVersion('0.5.8', 'major'), '1.0.0');

  assert.equal(bumpReleaseVersion('0.5.8-beta.1', 'patch'), '0.5.8');
  assert.equal(bumpReleaseVersion('0.5.8-beta.1', 'minor'), '0.6.0');
  assert.equal(bumpReleaseVersion('0.5.8-rc.0', 'major'), '1.0.0');
});

test('resolves either an exact version or a bump from npm history', () => {
  assert.equal(resolveReleaseVersion('0.6.0-beta.3', '', []), '0.6.0-beta.3');
  assert.equal(
    resolveReleaseVersion('', 'minor', [
      '0.5.1-beta.0',
      '0.5.7-beta.0',
      'invalid',
    ]),
    '0.6.0',
  );
});

test('rejects ambiguous or unsupported automatic release requests', () => {
  assert.throws(
    () => resolveReleaseVersion('', '', []),
    /Provide exactly one of version or bump/,
  );
  assert.throws(
    () => resolveReleaseVersion('0.6.0', 'minor', ['0.5.8']),
    /Provide exactly one of version or bump/,
  );
  assert.throws(
    () => bumpReleaseVersion('0.5.8', 'prerelease'),
    /Unsupported release bump/,
  );
  assert.throws(
    () => resolveReleaseVersion('', 'minor', ['not-semver']),
    /No supported published versions/,
  );
});

test('extracts exactly one changelog entry', () => {
  const changelog = `# Changelog

## 1.0.0 (2026-07-18)

### Features

- stable

## 1.0.0-rc.0 (2026-07-10)

- candidate
`;

  assert.equal(
    extractChangelogEntry(changelog, '1.0.0'),
    `## 1.0.0 (2026-07-18)

### Features

- stable
`,
  );
  assert.throws(
    () => extractChangelogEntry(changelog, '2.0.0'),
    /does not contain/,
  );
});

test('release PRs are limited to manifests and changelog', () => {
  assert.deepEqual(releaseTrackedFiles, [
    'CHANGELOG.md',
    'libs/component/package.json',
    'libs/core/package.json',
    'libs/dev-tools/package.json',
    'package-lock.json',
    'packages/mcp/package.json',
  ]);
});

test('npm packs must not include the internal DevTools tests', () => {
  assert.deepEqual(
    unpublishedNpmPackPaths([
      'package.json',
      'src/index.js',
      'src/scripts/architecture-graph.js',
    ]),
    [],
  );
  assert.deepEqual(
    unpublishedNpmPackPaths([
      'src/index.js',
      'tests/architecture/architecture.spec.ts',
      'tests/architecture/fixtures/app/routes.ts',
      'src/scripts/architecture-graph.spec.js',
    ]),
    [
      'tests/architecture/architecture.spec.ts',
      'tests/architecture/fixtures/app/routes.ts',
      'src/scripts/architecture-graph.spec.js',
    ],
  );
  assert.throws(
    () =>
      assertNpmPackExcludesTests('@craft-ts/dev-tools', [
        'tests/architecture/architecture.spec.ts',
      ]),
    /must not include tests/,
  );

  const manifest = JSON.parse(
    readFileSync(new URL('../libs/dev-tools/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.files.includes('!tests/**'), true);
  assert.equal(manifest.files.includes('!src/**/*.spec.ts'), true);
});
