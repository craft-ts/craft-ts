import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  gitSynchronizationError,
  npmPublishArguments,
  parseReleaseArgument,
  releaseAffectedTestArguments,
  releasePeerDependencyRange,
  syncBuiltDocumentation,
  syncDemoWorkspace,
  syncEffectDemoWorkspace,
  untrackGeneratedReleaseFiles,
} from './release-local.mjs';

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

test('accepts automatic bumps and exact versions', () => {
  assert.deepEqual(parseReleaseArgument('patch'), {
    bump: 'patch',
    version: '',
  });
  assert.deepEqual(parseReleaseArgument('minor'), {
    bump: 'minor',
    version: '',
  });
  assert.deepEqual(parseReleaseArgument('1.0.0-rc.0'), {
    bump: '',
    version: '1.0.0-rc.0',
  });
  assert.throws(() => parseReleaseArgument(''), /Missing release argument/);
});

test('publishes fixed-group packages directly from their dist directories', () => {
  assert.deepEqual(npmPublishArguments('dist/libs/core', 'beta'), [
    'publish',
    'dist/libs/core',
    '--tag',
    'beta',
    '--access',
    'public',
  ]);
  assert.deepEqual(npmPublishArguments('dist/libs/core', 'beta', '123456'), [
    'publish',
    'dist/libs/core',
    '--tag',
    'beta',
    '--access',
    'public',
    '--otp=123456',
  ]);
});

test('runs release tests only for projects affected since the release tag', () => {
  assert.deepEqual(releaseAffectedTestArguments('v0.7.0-beta.11'), [
    'nx',
    'affected',
    '--target=test',
    '--base=v0.7.0-beta.11',
    '--head=HEAD',
    '--exclude=docs',
    '--skipSync',
  ]);
  assert.throws(
    () => releaseAffectedTestArguments(''),
    /Missing affected base/,
  );
});

test('keeps internal peer dependencies on the release line', () => {
  assert.equal(releasePeerDependencyRange('0.7.0-beta.1'), '^0.7.0-beta.0');
  assert.equal(releasePeerDependencyRange('0.7.0-rc.1'), '^0.7.0-rc.0');
  assert.equal(releasePeerDependencyRange('0.7.0'), '^0.7.0');
});

test('explains how to synchronize a repository with its remote', () => {
  const repository = '/tmp/craft docs';

  assert.equal(
    gitSynchronizationError({
      path: repository,
      branch: 'main',
      label: 'documentation',
      ahead: 1,
      behind: 0,
    }).message,
    [
      'documentation has 1 local commit not pushed to origin/main.',
      'Push it before retrying:',
      "  git -C '/tmp/craft docs' push origin main",
    ].join('\n'),
  );

  assert.equal(
    gitSynchronizationError({
      path: repository,
      branch: 'main',
      label: 'documentation',
      ahead: 0,
      behind: 2,
    }).message,
    [
      'documentation is 2 remote commits behind origin/main.',
      'Update it before retrying:',
      "  git -C '/tmp/craft docs' pull --ff-only origin main",
    ].join('\n'),
  );

  assert.equal(
    gitSynchronizationError({
      path: repository,
      branch: 'main',
      label: 'documentation',
      ahead: 1,
      behind: 2,
    }).message,
    [
      'documentation has diverged from origin/main (1 local commit, 2 remote commits).',
      'Inspect and reconcile both histories before retrying:',
      "  git -C '/tmp/craft docs' log --oneline --left-right HEAD...origin/main",
    ].join('\n'),
  );
});

test('untracks generated release files without deleting their local copies', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'craft-release-git-'));

  try {
    write(join(temporaryRoot, '.gitignore'), 'generated/\n');
    write(join(temporaryRoot, 'generated/cache.json'), '{"local":true}\n');
    execFileSync('git', ['init', '--quiet', temporaryRoot]);
    execFileSync('git', ['-C', temporaryRoot, 'add', '--all', '--force']);
    execFileSync('git', [
      '-C',
      temporaryRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.test',
      'commit',
      '--quiet',
      '--message',
      'initial',
    ]);

    assert.equal(
      untrackGeneratedReleaseFiles(temporaryRoot, ['generated']),
      true,
    );
    assert.equal(existsSync(join(temporaryRoot, 'generated/cache.json')), true);
    assert.match(
      execFileSync('git', ['-C', temporaryRoot, 'status', '--porcelain'], {
        encoding: 'utf8',
      }),
      /D  generated\/cache\.json/,
    );
    assert.equal(
      untrackGeneratedReleaseFiles(temporaryRoot, ['generated']),
      false,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('mirrors the complete demo source and pins CraftTS dependencies', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'craft-demo-sync-'));
  const source = join(temporaryRoot, 'source');
  const target = join(temporaryRoot, 'target');

  try {
    write(
      join(source, 'src/app/examples/new.ts'),
      'export const fresh = true;\n',
    );
    write(
      join(source, 'src/app/app.config.ts'),
      [
        'import {',
        '  provideCorrelationIdTracking,',
        "} from '@craft-ts/core';",
        "import { provideLogForwarding } from './log-forwarder';",
        'export const appConfig = {',
        '  providers: [',
        '    provideLogForwarding(),',
        '    provideCorrelationIdTracking(),',
        '  ],',
        '};',
        '',
      ].join('\n'),
    );
    write(join(source, 'src/app/app.routes.ts'), 'export const routes = [];\n');
    write(join(source, 'public/favicon.ico'), 'new-icon');
    write(
      join(source, 'eslint.config.standalone.mjs'),
      "export default ['standalone'];\n",
    );
    write(
      join(source, 'craft-eslint-rules.mjs'),
      'export const craftDemoRules = {};\n',
    );
    write(
      join(source, 'vite.config.standalone.ts'),
      "export default { plugins: ['craft-style'] };\n",
    );
    write(
      join(source, 'tsconfig.standalone.json'),
      '{"compilerOptions":{"strict":true}}\n',
    );
    write(join(target, 'src/app/examples/old.ts'), 'obsolete\n');
    write(join(target, 'public/old.txt'), 'obsolete\n');
    write(join(target, 'angular.json'), '{"preserved":true}\n');
    write(join(target, 'eslint.config.js'), 'module.exports = [];\n');
    write(join(target, '.gitignore'), 'dist\n\n# generated files\n');
    write(join(target, 'package-lock.json'), '{}\n');
    write(
      join(target, 'package.json'),
      JSON.stringify({
        name: 'craft-ts-demo',
        dependencies: {
          '@craft-ts/core': '^0.5.0-beta.1',
          '@craft-ts/component': '^0.5.0-beta.1',
          '@craft-ts/dev-tools': '^0.5.0-beta.1',
        },
      }),
    );

    syncDemoWorkspace(source, target, '0.6.0');
    syncDemoWorkspace(source, target, '0.6.0');

    assert.equal(
      readFileSync(join(target, 'src/app/examples/new.ts'), 'utf8'),
      'export const fresh = true;\n',
    );
    assert.equal(existsSync(join(target, 'src/app/examples/old.ts')), false);
    assert.equal(existsSync(join(target, 'public/old.txt')), false);
    assert.equal(
      readFileSync(join(target, 'eslint.config.mjs'), 'utf8'),
      "export default ['standalone'];\n",
    );
    assert.equal(
      readFileSync(join(target, 'craft-eslint-rules.mjs'), 'utf8'),
      'export const craftDemoRules = {};\n',
    );
    assert.equal(
      readFileSync(join(target, 'vite.config.ts'), 'utf8'),
      "export default { plugins: ['craft-style'] };\n",
    );
    assert.equal(
      readFileSync(join(target, 'tsconfig.json'), 'utf8'),
      '{"compilerOptions":{"strict":true}}\n',
    );
    assert.match(
      readFileSync(join(target, 'src/app/app.config.ts'), 'utf8'),
      /\/\/ Log forwarding imports disabled for the target demo\./,
    );
    assert.match(
      readFileSync(join(target, 'src/app/app.config.ts'), 'utf8'),
      /\/\/ provideLogForwarding\(\),/,
    );
    assert.match(
      readFileSync(join(target, 'src/app/app.config.ts'), 'utf8'),
      /provideCorrelationIdTracking,/,
    );
    assert.match(
      readFileSync(join(target, 'src/app/app.config.ts'), 'utf8'),
      /provideCorrelationIdTracking\(\),/,
    );
    assert.equal(existsSync(join(target, 'eslint.config.js')), false);
    assert.equal(
      readFileSync(join(target, 'angular.json'), 'utf8'),
      '{"preserved":true}\n',
    );
    assert.equal(existsSync(join(target, 'package-lock.json')), false);

    const manifest = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.dependencies['@craft-ts/core'], '0.6.0');
    assert.equal(manifest.dependencies['@craft-ts/component'], '0.6.0');
    assert.equal(manifest.dependencies['@craft-ts/dev-tools'], '0.6.0');
    assert.equal(manifest.dependencies['@craft-ts/i18n'], '0.6.0');
    assert.equal(manifest.dependencies['@craft-ts/style'], '0.6.0');
    assert.equal(manifest.devDependencies['@craft-ts/style-testing'], '0.6.0');
    for (const dependency of ['@eslint/js', 'eslint', 'typescript-eslint']) {
      assert.equal(typeof manifest.devDependencies?.[dependency], 'string');
    }
    assert.equal(manifest.scripts.lint, 'eslint . --fix');
    assert.equal(manifest.scripts['lint:check'], 'eslint .');
    assert.equal(
      readFileSync(join(target, '.gitignore'), 'utf8')
        .split('\n')
        .filter((line) => line === '/package-lock.json').length,
      1,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('mirrors the frontend Effect demo and pins CraftTS plus Effect dependencies', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'craft-effect-demo-sync-'));
  const source = join(temporaryRoot, 'source');
  const target = join(temporaryRoot, 'target');

  try {
    write(join(source, 'src/app/app.ts'), 'export const effectDemo = true;\n');
    write(join(target, 'src/app/old.ts'), 'obsolete\n');
    write(join(target, '.gitignore'), 'dist\n');
    write(join(target, 'package-lock.json'), '{}\n');
    write(
      join(target, 'package.json'),
      JSON.stringify({
        name: 'craft-ts-demo-effect',
        dependencies: {
          '@craft-ng/core': '^0.6.0',
          '@craft-ng/effect': '^0.6.0',
          effect: '^4.0.0-rc.100',
        },
        devDependencies: {
          '@craft-ng/dev-tools': '^0.6.0',
        },
      }),
    );

    syncEffectDemoWorkspace(source, target, '0.7.0-beta.11');

    assert.equal(
      readFileSync(join(target, 'src/app/app.ts'), 'utf8'),
      'export const effectDemo = true;\n',
    );
    assert.equal(existsSync(join(target, 'src/app/old.ts')), false);
    assert.equal(existsSync(join(target, 'package-lock.json')), false);

    const manifest = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.dependencies['@craft-ts/core'], '0.7.0-beta.11');
    assert.equal(manifest.dependencies['@craft-ts/component'], '0.7.0-beta.11');
    assert.equal(manifest.dependencies['@craft-ts/effect'], '0.7.0-beta.11');
    assert.equal(manifest.dependencies.effect, '^4.0.0-rc.110');
    assert.equal(
      manifest.devDependencies['@craft-ts/dev-tools'],
      '0.7.0-beta.11',
    );
    assert.equal(
      readFileSync(join(target, '.gitignore'), 'utf8')
        .split('\n')
        .filter((line) => line === '/package-lock.json').length,
      1,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('replaces published documentation while preserving repository metadata', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'craft-docs-sync-'));
  const build = join(temporaryRoot, 'build');
  const target = join(temporaryRoot, 'target');

  try {
    write(join(build, 'index.html'), '<h1>new</h1>\n');
    write(join(build, 'assets/app.js'), 'new-app\n');
    write(join(target, 'old.html'), 'obsolete\n');
    write(join(target, '.git/HEAD'), 'ref: refs/heads/main\n');
    write(join(target, '.github/workflows/pages.yml'), 'name: Pages\n');
    write(join(target, 'CNAME'), 'docs.example.test\n');

    syncBuiltDocumentation(build, target);

    assert.equal(existsSync(join(target, 'old.html')), false);
    assert.equal(
      readFileSync(join(target, 'index.html'), 'utf8'),
      '<h1>new</h1>\n',
    );
    assert.equal(
      readFileSync(join(target, '.git/HEAD'), 'utf8'),
      'ref: refs/heads/main\n',
    );
    assert.equal(
      readFileSync(join(target, '.github/workflows/pages.yml'), 'utf8'),
      'name: Pages\n',
    );
    assert.equal(
      readFileSync(join(target, 'CNAME'), 'utf8'),
      'docs.example.test\n',
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
