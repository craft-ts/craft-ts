import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const appStartRegistryMatchRule = require('./app-start-registry-match.cjs');

const tempDirectories: string[] = [];

describe('app-start-registry-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports missing CraftAppStartRegistry entries and autofixes the file', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftService, onAppStart } from '@craft-ng/core';

        export const { AppStartLog } = craftService(
          {
            name: 'AppStartLog',
            scope: 'toProvide',
            appStart: true,
          },
          function* () {
            yield* onAppStart(() => undefined);
            return 1;
          },
        );
      `,
    } satisfies Record<string, string>;

    const { messages } = await lintFixture(fixture);

    expect(messages).toEqual([
      'CraftAppStartRegistry is missing AppStartLog. Run ESLint --fix on this file to register app-start services.',
    ]);

    const { output } = await lintFixture(fixture, { fix: true });

    expect(output).toContain("declare module '@craft-ng/core' {");
    expect(output).toContain('interface CraftAppStartRegistry {');
    expect(output).toContain('AppStartLog: typeof AppStartLog;');
  });

  it('adds missing entries to an existing CraftAppStartRegistry interface', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftService, onAppStart } from '@craft-ng/core';

        export const { AppStartLog } = craftService(
          {
            name: 'AppStartLog',
            scope: 'toProvide',
            appStart: true,
          },
          function* () {
            yield* onAppStart(() => undefined);
            return 1;
          },
        );

        declare module '@craft-ng/core' {
          interface CraftAppStartRegistry {
            ExistingEntry: typeof ExistingEntry;
          }
        }
      `,
    } satisfies Record<string, string>;

    const { output } = await lintFixture(fixture, { fix: true });

    expect(output).toContain('ExistingEntry: typeof ExistingEntry;');
    expect(output).toContain('AppStartLog: typeof AppStartLog;');
  });

  it('updates stale CraftAppStartRegistry bindings', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftService, onAppStart } from '@craft-ng/core';

        export const { AppStartLog } = craftService(
          {
            name: 'AppStartLog',
            scope: 'toProvide',
            appStart: true,
          },
          function* () {
            yield* onAppStart(() => undefined);
            return 1;
          },
        );

        declare module '@craft-ng/core' {
          interface CraftAppStartRegistry {
            AppStartLog: typeof LegacyAppStartLog;
          }
        }
      `,
    } satisfies Record<string, string>;

    const { messages } = await lintFixture(fixture);

    expect(messages).toEqual([
      'CraftAppStartRegistry is out of date for AppStartLog. Run ESLint --fix on this file to register app-start services.',
    ]);

    const { output } = await lintFixture(fixture, { fix: true });

    expect(output).toContain('AppStartLog: typeof AppStartLog;');
    expect(output).not.toContain('LegacyAppStartLog');
  });

  it('ignores craftService definitions without onAppStart', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftService } from '@craft-ng/core';

        export const { AppStartLog } = craftService(
          {
            name: 'AppStartLog',
            scope: 'toProvide',
          },
          () => 1,
        );
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: {
    fix?: boolean;
  } = {},
): Promise<{
  messages: string[];
  output: string | undefined;
}> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'app-start-registry-rule-'),
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
        include: ['src/**/*.ts', 'src/**/*.d.ts'],
      },
      null,
      2,
    ),
    ...baseFixtureFiles(),
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
              'app-start-registry-match': appStartRegistryMatchRule as never,
            },
          },
        },
        rules: {
          'local/app-start-registry-match': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  if (options.fix) {
    await ESLint.outputFixes(results);
  }

  const output = files['src/app/demo.ts']
    ? await readFile(join(tempDirectory, 'src/app/demo.ts'), 'utf8')
    : undefined;

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output,
  };
}

function baseFixtureFiles(): Record<string, string> {
  return {
    'src/craft-ng-core.d.ts': `
      declare module '@craft-ng/core' {
        export declare function craftService(...args: any[]): any;
        export declare function onAppStart(...args: any[]): any;
      }
    `,
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
