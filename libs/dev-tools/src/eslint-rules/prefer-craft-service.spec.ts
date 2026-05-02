import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftServiceRule = require('./prefer-craft-service.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/prefer-craft-service', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('allows Angular imports when service decorators are not used', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';

        @Component({})
        class DemoComponent {}
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports Angular @Injectable decorator usage', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Injectable } from '@angular/core';

        @Injectable()
        class DemoService {}
      `,
    });

    expect(messages).toEqual([
      'Angular @Injectable is forbidden. Author services with craftService(...) and adapt Angular dependencies with toCraftService(...) instead.',
    ]);
  });

  it('offers a migration quick fix suggestion', async () => {
    const messages = await lintFixtureMessages({
      'src/app/demo.ts': `
        import { Injectable } from '@angular/core';

        @Injectable()
        class DemoService {}
      `,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.suggestions?.[0]?.desc).toBe(
      'Insert a temporary eslint-disable-next-line comment with a migration note.',
    );
    expect(messages[0]?.suggestions?.[0]?.fix?.text).toContain(
      '// eslint-disable-next-line craft-ng/prefer-craft-service -- migrate this Angular service to craftService(...) or toCraftService(...)\n',
    );
  });

  it('reports namespaced Angular @Injectable decorator usage', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngCore from '@angular/core';

        @ngCore.Injectable()
        class DemoService {}
      `,
    });

    expect(messages).toEqual([
      'Angular @Injectable is forbidden. Author services with craftService(...) and adapt Angular dependencies with toCraftService(...) instead.',
    ]);
  });

  it('allows non-Angular Injectable decorators', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Injectable } from 'custom-di';

        @Injectable()
        class DemoService {}
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports Angular @Service decorator usage', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Service } from '@angular/core';

        @Service()
        class DemoService {}
      `,
    });

    expect(messages).toEqual([
      'Angular @Service is forbidden. Author services with craftService(...) and adapt Angular dependencies with toCraftService(...) instead.',
    ]);
  });

  it('reports namespaced Angular @Service decorator usage', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngCore from '@angular/core';

        @ngCore.Service()
        class DemoService {}
      `,
    });

    expect(messages).toEqual([
      'Angular @Service is forbidden. Author services with craftService(...) and adapt Angular dependencies with toCraftService(...) instead.',
    ]);
  });

  it('allows non-Angular Service decorators', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Service } from 'custom-di';

        @Service()
        class DemoService {}
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const messages = await lintFixtureMessages(files);
  return messages.map((message) => message.message);
}

async function lintFixtureMessages(files: Record<string, string>): Promise<
  Array<{
    message: string;
    suggestions?: Array<{ desc?: string; fix?: { text?: string } }>;
  }>
> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-service-rule-'),
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
              'prefer-craft-service': preferCraftServiceRule as never,
            },
          },
        },
        rules: {
          'local/prefer-craft-service': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) => result.messages);
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
