import assert from 'node:assert/strict';
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
  parseReleaseArgument,
  syncBuiltDocumentation,
  syncDemoWorkspace,
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

test('mirrors the complete demo source and pins Craft NG dependencies', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'craft-demo-sync-'));
  const source = join(temporaryRoot, 'source');
  const target = join(temporaryRoot, 'target');

  try {
    write(
      join(source, 'src/app/examples/new.ts'),
      'export const fresh = true;\n',
    );
    write(join(source, 'src/app/app.routes.ts'), 'export const routes = [];\n');
    write(join(source, 'public/favicon.ico'), 'new-icon');
    write(join(target, 'src/app/examples/old.ts'), 'obsolete\n');
    write(join(target, 'public/old.txt'), 'obsolete\n');
    write(join(target, 'angular.json'), '{"preserved":true}\n');
    write(join(target, '.gitignore'), 'dist\n\n# generated files\n');
    write(join(target, 'package-lock.json'), '{}\n');
    write(
      join(target, 'package.json'),
      JSON.stringify({
        name: 'ng-craft-demo',
        dependencies: {
          '@craft-ng/core': '^0.5.0-beta.1',
          '@craft-ng/dev-tools': '^0.5.0-beta.1',
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
      readFileSync(join(target, 'angular.json'), 'utf8'),
      '{"preserved":true}\n',
    );
    assert.equal(existsSync(join(target, 'package-lock.json')), false);

    const manifest = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.dependencies['@craft-ng/core'], '0.6.0');
    assert.equal(manifest.dependencies['@craft-ng/dev-tools'], '0.6.0');
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
