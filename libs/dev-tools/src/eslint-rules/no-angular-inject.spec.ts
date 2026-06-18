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
      'Angular inject(Router) is forbidden. Use injectRouter from a craftService/toCraftService adapter instead.',
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
      'Angular inject(Router) is forbidden. Use injectRouter from a craftService/toCraftService adapter instead.',
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
      'Angular inject(Router) is forbidden. Use injectRouter from a craftService/toCraftService adapter instead.',
    ]);
  });

  it('reports unused named inject imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { inject } from '@angular/core';

        const router = injectRouter();
      `,
    });

    expect(messages).toEqual([
      'Angular inject() is forbidden. Import and use the injectX helper exposed by a craftService/toCraftService adapter instead.',
    ]);
  });

  it('recommends inject helpers from injection token constants', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { inject } from '@angular/core';

        const route = inject(CURRENT_ROUTE);
      `,
    });

    expect(messages).toEqual([
      'Angular inject(CURRENT_ROUTE) is forbidden. Use injectCurrentRoute from a craftService/toCraftService adapter instead.',
    ]);
  });

  it('recommends inject helpers from member expression tokens', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngCore from '@angular/core';

        const router = ngCore.inject(AppTokens.Router);
      `,
    });

    expect(messages).toEqual([
      'Angular inject(AppTokens.Router) is forbidden. Use injectRouter from a craftService/toCraftService adapter instead.',
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

  it('offers a migration quick fix suggestion on Angular inject calls', async () => {
    const messages = await lintFixtureMessages({
      'src/app/demo.ts': `
        import { inject } from '@angular/core';

        const router = inject(Router);
      `,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.suggestions?.[0]?.desc).toBe(
      'Insert a temporary eslint-disable-next-line comment with a migration note.',
    );
    expect(messages[0]?.suggestions?.[0]?.fix?.text).toContain(
      '// eslint-disable-next-line craft-ng/no-angular-inject -- replace this Angular inject(Router) call with injectRouter from a craftService/toCraftService adapter\n',
    );
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
    result.messages.map((message) => ({
      message: message.message,
      suggestions: message.suggestions?.map((suggestion) => ({
        desc: suggestion.desc,
        fix: suggestion.fix ? { text: suggestion.fix.text } : undefined,
      })),
    })),
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
