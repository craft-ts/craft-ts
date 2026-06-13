import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftStateRule = require('./prefer-craft-state.cjs');

const MESSAGE =
  'Angular signal() is forbidden. Use state() from @craft-ng/core instead for observability and host name tracking.';

const tempDirectories: string[] = [];

describe('prefer-craft-state', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports both the signal import and its usage', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signal } from '@angular/core';

        const counter = signal(0);
      `,
    });

    // One report on the forbidden import specifier, one on the call usage.
    expect(messages).toEqual([MESSAGE, MESSAGE]);
  });

  it('does not report signal() from other libraries', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signal } from 'some-other-lib';

        const counter = signal(0);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report state()', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { state } from '@craft-ng/core';

        const counter = state(0);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('autofixes signal() to state() and rewrites the import (no name needed)', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
        import { signal } from '@angular/core';

        const counter = signal(0);
      `,
      },
      { fix: true },
    );

    expect(output).toContain("import { state } from '@craft-ng/core';");
    expect(output).not.toContain('@angular/core');
    expect(output).toContain('const counter = state(0);');
  });

  it('preserves other named imports from @angular/core on autofix', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
        import { Component, signal } from '@angular/core';

        const counter = signal(0);
      `,
      },
      { fix: true },
    );

    expect(output).toContain("import { Component } from '@angular/core';");
    expect(output).toContain("import { state } from '@craft-ng/core';");
    expect(output).toContain('const counter = state(0);');
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'prefer-craft-state-rule-'));
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
    fix: options.fix,
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
              'prefer-craft-state': preferCraftStateRule as never,
            },
          },
        },
        rules: {
          'local/prefer-craft-state': 'warn',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: results
      .map((result) => result.output ?? result.source ?? '')
      .join('\n'),
  };
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
