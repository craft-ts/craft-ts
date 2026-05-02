import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noAngularInjectRule = require('./no-angular-inject.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/no-angular-inject', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('allows Angular imports when inject is not imported', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';

        @Component({})
        class DemoComponent {}
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports named inject imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { inject } from '@angular/core';

        const router = inject(Router);
      `,
    });

    expect(messages).toEqual([
      'Angular inject() is forbidden. Expose a craftService/toCraftService injector instead.',
    ]);
  });

  it('reports aliased inject imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { inject as angularInject } from '@angular/common';

        const router = angularInject(Router);
      `,
    });

    expect(messages).toEqual([
      'Angular inject() is forbidden. Expose a craftService/toCraftService injector instead.',
    ]);
  });

  it('reports namespace-based Angular inject calls', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngCore from '@angular/core';

        const router = ngCore.inject(Router);
      `,
    });

    expect(messages).toEqual([
      'Angular inject() is forbidden. Expose a craftService/toCraftService injector instead.',
    ]);
  });

  it('allows inject imported from non-Angular modules', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { inject } from 'custom-di';

        const router = inject(Router);
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'no-angular-inject-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          experimentalDecorators: true,
          module: 'preserve',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    ...files,
  });

  const eslint = new ESLint({
    cwd: tempDirectory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: {
          local: {
            rules: {
              'no-angular-inject': noAngularInjectRule as never,
            },
          },
        },
        rules: {
          'local/no-angular-inject': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

async function writeFixtureFiles(
  rootDirectory: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(rootDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source.trimStart(), 'utf8');
  }
}
