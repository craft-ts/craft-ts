import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftComputedRule = require('./prefer-craft-computed.cjs');

const tempDirectories: string[] = [];

describe('prefer-craft-computed', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports computed() from @angular/core assigned to a class property', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';

        export class DemoComponent {
          readonly total = computed(() => 42);
        }
      `,
    });

    expect(messages).toEqual([
      "Use craftComputed('total', ...) instead of computed() for better observability. craftComputed adds HostName tracking to the computed signal.",
    ]);
  });

  it('reports computed() from @angular/core assigned to a const', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';

        const myValue = computed(() => 42);
      `,
    });

    expect(messages).toEqual([
      "Use craftComputed('myValue', ...) instead of computed() for better observability. craftComputed adds HostName tracking to the computed signal.",
    ]);
  });

  it('does not report computed() from other libraries', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from 'some-other-lib';

        export class DemoComponent {
          readonly total = computed(() => 42);
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report craftComputed()', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftComputed } from '@craft-ng/core';

        export class DemoComponent {
          readonly total = craftComputed('total', () => 42);
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports computed() with unnamed parent with generic message', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';

        function getComputed() {
          return computed(() => 42);
        }
      `,
    });

    expect(messages).toEqual([
      "Use craftComputed('name', ...) instead of computed() for better observability. craftComputed adds HostName tracking to the computed signal.",
    ]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[] }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-computed-rule-'),
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
              'prefer-craft-computed': preferCraftComputedRule as never,
            },
          },
        },
        rules: {
          'local/prefer-craft-computed': 'warn',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
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
