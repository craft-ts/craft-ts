import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const craftSignalSourceNameMatchRule = require('./craft-signal-source-name-match.cjs');

const tempDirectories: string[] = [];

describe('craft-signal-source-name-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a const whose first arg matches its name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signalSource } from '@craft-ng/core';

        const search = signalSource<string>('search');
      `,
    });

    expect(messages).toEqual([]);
  });

  it('accepts a class property whose first arg matches its name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signalSource } from '@craft-ng/core';

        export class DemoComponent {
          readonly search = signalSource<string>('search');
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('accepts an object property whose first arg matches its key', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signalSource } from '@craft-ng/core';

        const insertions = {
          search: signalSource<string>('search'),
        };
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports a mismatch between object property key and first arg', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signalSource } from '@craft-ng/core';

        const insertions = {
          search: signalSource<string>('wrong'),
        };
      `,
    });

    expect(messages).toEqual([
      "signalSource first argument 'wrong' must match the declared name 'search'.",
    ]);
  });

  it('reports a missing first arg on a const', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signalSource } from '@craft-ng/core';

        const search = signalSource<string>();
      `,
    });

    expect(messages).toEqual([
      "signalSource must be called with a string literal name matching 'search' as the first argument.",
    ]);
  });

  it('auto-fixes a mismatched first arg', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
          import { signalSource } from '@craft-ng/core';

          const search = signalSource<string>('wrong');
        `,
      },
      { fix: true },
    );

    expect(output).toContain("signalSource<string>('search')");
  });

  it('auto-fixes a missing first arg', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
          import { signalSource } from '@craft-ng/core';

          const search = signalSource<string>();
        `,
      },
      { fix: true },
    );

    expect(output).toContain("signalSource<string>('search'");
  });

  it('ignores signalSource calls not assigned to a known name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { signalSource } from '@craft-ng/core';

        export function createSource() {
          return signalSource<string>('search');
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
    join(tmpdir(), 'craft-signal-source-name-match-rule-'),
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
        export declare function signalSource<T>(...args: unknown[]): unknown;
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
              'craft-signal-source-name-match': craftSignalSourceNameMatchRule as never,
            },
          },
        },
        rules: {
          'local/craft-signal-source-name-match': 'error',
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
