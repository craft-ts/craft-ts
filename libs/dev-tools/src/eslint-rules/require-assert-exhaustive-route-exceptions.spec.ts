import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireAssertRule = require('./require-assert-exhaustive-route-exceptions.cjs');

const tempDirectories: string[] = [];

describe('require-assert-exhaustive-route-exceptions', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a craftRoutes collection already checked', async () => {
    const { messages } = await lintFixture({
      'src/app/app.routes.ts': `
        import { assertExhaustiveRouteExceptions, craftRoutes } from '@craft-ts/core';

        export const { demoRoutes } = craftRoutes('demo', []);

        assertExhaustiveRouteExceptions(demoRoutes);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports a craftRoutes collection missing the assert', async () => {
    const { messages } = await lintFixture({
      'src/app/app.routes.ts': `
        import { craftRoutes } from '@craft-ts/core';

        export const { demoRoutes } = craftRoutes('demo', []);
      `,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('demoRoutes');
  });

  it('honours a renamed routes binding', async () => {
    const { messages } = await lintFixture({
      'src/app/app.routes.ts': `
        import { craftRoutes } from '@craft-ts/core';

        export const { demoRoutes: routes } = craftRoutes('demo', []);
      `,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('routes');
  });

  it('ignores files without craftRoutes', async () => {
    const { messages } = await lintFixture({
      'src/app/helper.ts': `
        export const value = 1;
      `,
    });

    expect(messages).toEqual([]);
  });

  it('auto-fixes by inserting the assert call after the declaration', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.routes.ts': `
          import { craftRoutes } from '@craft-ts/core';

          export const { demoRoutes } = craftRoutes('demo', []);
        `,
      },
      { fix: true },
    );

    expect(output).toContain('assertExhaustiveRouteExceptions(demoRoutes);');
  });

  it('auto-fix adds the assert import to the existing @craft-ts/core import', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.routes.ts': `
          import { craftRoutes } from '@craft-ts/core';

          export const { demoRoutes } = craftRoutes('demo', []);
        `,
      },
      { fix: true },
    );

    expect(output).toContain('assertExhaustiveRouteExceptions');
    const importCount = (output?.match(/@craft-ts\/core/g) ?? []).length;
    expect(importCount).toBe(1);
  });

  it('auto-fixes multiple collections in one file', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.routes.ts': `
          import { craftRoutes } from '@craft-ts/core';

          export const { aRoutes } = craftRoutes('a', []);
          export const { bRoutes } = craftRoutes('b', []);
        `,
      },
      { fix: true },
    );

    expect(output).toContain('assertExhaustiveRouteExceptions(aRoutes);');
    expect(output).toContain('assertExhaustiveRouteExceptions(bRoutes);');
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean; filePath?: string } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'require-assert-exhaustive-route-exceptions-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const outputPath = options.filePath ?? Object.keys(files)[0];

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          module: 'preserve',
          strict: true,
          target: 'ES2022',
          experimentalDecorators: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    'src/craft-core.d.ts': `
      declare module '@craft-ts/core' {
        export declare function craftRoutes(...args: unknown[]): any;
        export declare function assertExhaustiveRouteExceptions(
          ...args: unknown[]
        ): void;
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
              'require-assert-exhaustive-route-exceptions':
                requireAssertRule as never,
            },
          },
        },
        rules: {
          'local/require-assert-exhaustive-route-exceptions': 'error',
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
    output: await readFile(join(tempDirectory, outputPath), 'utf8').catch(
      () => undefined,
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
