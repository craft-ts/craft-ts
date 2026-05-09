import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const componentTestGenDepsMatchRule = require('./component-test-gen-deps-match.cjs');

const tempDirectories: string[] = [];

describe('component-test-gen-deps-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts Component with its matching GenDeps alias', async () => {
    const messages = await lintFixture({
      'src/app/demo.spec.ts': `
        import { setupCraftComponentTestingByRegister } from '@craft-ng/core';

        class DemoComponent {}
        type GenDeps_DemoComponent = {};

        setupCraftComponentTestingByRegister(
          DemoComponent,
          {} as GenDeps_DemoComponent,
          {},
        );
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports Component with a different GenDeps alias', async () => {
    const messages = await lintFixture({
      'src/app/demo.spec.ts': `
        import { setupCraftComponentTestingByRegister } from '@craft-ng/core';

        class DemoComponent {}
        type GenDeps_OtherComponent = {};

        setupCraftComponentTestingByRegister(
          DemoComponent,
          {} as GenDeps_OtherComponent,
          {},
        );
      `,
    });

    expect(messages).toEqual([
      'setupCraftComponentTestingByRegister(DemoComponent, ...) must use GenDeps_DemoComponent.',
    ]);
  });

  it('supports import type references for the matching GenDeps alias', async () => {
    const messages = await lintFixture({
      'src/app/demo.spec.ts': `
        import { setupCraftComponentTestingByRegister } from '@craft-ng/core';

        class DemoComponent {}

        setupCraftComponentTestingByRegister(
          DemoComponent,
          {} as import('./demo').GenDeps_DemoComponent,
          {},
        );
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'component-test-gen-deps-match-rule-'),
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
              'component-test-gen-deps-match':
                componentTestGenDepsMatchRule as never,
            },
          },
        },
        rules: {
          'local/component-test-gen-deps-match': 'error',
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
