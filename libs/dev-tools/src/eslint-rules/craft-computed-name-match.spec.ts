import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const craftComputedNameMatchRule = require('./craft-computed-name-match.cjs');

const tempDirectories: string[] = [];

describe('craft-computed-name-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a class property whose first arg matches its name', async () => {
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

  it('accepts a const whose first arg matches its name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftComputed } from '@craft-ng/core';

        const myValue = craftComputed('myValue', () => 42);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports a mismatch between property name and first arg', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftComputed } from '@craft-ng/core';

        export class DemoComponent {
          readonly total = craftComputed('wrong', () => 42);
        }
      `,
    });

    expect(messages).toEqual([
      "craftComputed first argument 'wrong' must match the declared name 'total'.",
    ]);
  });

  it('reports a missing first arg on a class property', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftComputed } from '@craft-ng/core';

        export class DemoComponent {
          readonly total = craftComputed(() => 42);
        }
      `,
    });

    expect(messages).toEqual([
      "craftComputed must be called with a string literal name matching 'total' as the first argument.",
    ]);
  });

  it('auto-fixes a mismatched first arg', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
          import { craftComputed } from '@craft-ng/core';

          export class DemoComponent {
            readonly total = craftComputed('wrong', () => 42);
          }
        `,
      },
      { fix: true },
    );

    expect(output).toContain("craftComputed('total'");
  });

  it('auto-fixes a missing first arg', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
          import { craftComputed } from '@craft-ng/core';

          export class DemoComponent {
            readonly total = craftComputed(() => 42);
          }
        `,
      },
      { fix: true },
    );

    expect(output).toContain("craftComputed('total'");
  });

  it('ignores craftComputed calls not assigned to a known name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftComputed } from '@craft-ng/core';

        export function createComputed() {
          return craftComputed('total', () => 42);
        }
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean; filePath?: string } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'craft-computed-name-match-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const outputPath = options.filePath ?? 'src/app/demo.ts';

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
    'src/craft-core.d.ts': `
      declare module '@craft-ng/core' {
        export declare function craftComputed(...args: unknown[]): unknown;
      }
    `,
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
              'craft-computed-name-match': craftComputedNameMatchRule as never,
            },
          },
        },
        rules: {
          'local/craft-computed-name-match': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  if (options.fix) {
    await ESLint.outputFixes(results);
  }

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: await readFile(join(tempDirectory, outputPath), 'utf8'),
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
