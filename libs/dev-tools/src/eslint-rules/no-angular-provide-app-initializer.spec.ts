import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noAngularProvideAppInitializerRule = require('./no-angular-provide-app-initializer.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/no-angular-provide-app-initializer', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('allows Angular imports when provideAppInitializer is not imported', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { inject } from '@angular/core';

        const router = inject(Router);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports named provideAppInitializer imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { provideAppInitializer } from '@angular/core';

        export const providers = [provideAppInitializer(() => undefined)];
      `,
    });

    expect(messages).toEqual([
      'Angular provideAppInitializer() is forbidden. Model startup work with onAppStart(...) through craftService({ appStart: true }, ...).',
    ]);
  });

  it('reports aliased provideAppInitializer imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { provideAppInitializer as angularProvideAppInitializer } from '@angular/core';

        export const providers = [angularProvideAppInitializer(() => undefined)];
      `,
    });

    expect(messages).toEqual([
      'Angular provideAppInitializer() is forbidden. Model startup work with onAppStart(...) through craftService({ appStart: true }, ...).',
    ]);
  });

  it('reports namespace-based provideAppInitializer calls', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngCore from '@angular/core';

        export const providers = [ngCore.provideAppInitializer(() => undefined)];
      `,
    });

    expect(messages).toEqual([
      'Angular provideAppInitializer() is forbidden. Model startup work with onAppStart(...) through craftService({ appStart: true }, ...).',
    ]);
  });

  it('allows non-Angular provideAppInitializer helpers', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { provideAppInitializer } from './startup';

        export const providers = [provideAppInitializer(() => undefined)];
      `,
    });

    expect(messages).toEqual([]);
  });

  it('allows the internal craft-app-config bridge', async () => {
    const messages = await lintFixture({
      'src/app/craft-app-config.ts': `
        import { provideAppInitializer } from '@angular/core';

        export const providers = [provideAppInitializer(() => undefined)];
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'no-angular-provide-app-initializer-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
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
              'no-angular-provide-app-initializer':
                noAngularProvideAppInitializerRule as never,
            },
          },
        },
        rules: {
          'local/no-angular-provide-app-initializer': 'error',
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
