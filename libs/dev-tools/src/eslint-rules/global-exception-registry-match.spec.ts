import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const globalExceptionRegistryMatchRule = require('./global-exception-registry-match.cjs');

const tempDirectories: string[] = [];

const ROUTE_FILE = (registryBlock = '') => `
  import { craftRoutes, craftRoute, craftException } from '@craft-ts/core';

  export const { demoRoutes } = craftRoutes('demo', [
    craftRoute('query/:userId', {
      loadComponent: () => import('./query'),
      componentDeps: {},
      canActivate: function* () {
        return craftException({ code: 'NOT_AUTHENTICATED' });
      },
    }, {
      NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
      USER_DISABLED: ({ globalError }) => globalError(),
    }),
  ]);
${registryBlock}`;

describe('global-exception-registry-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a missing registry entry for a globalError() code and autofixes it', async () => {
    const fixture = { 'src/app/demo.ts': ROUTE_FILE() };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "CraftGlobalExceptionRegistry is missing 'query/:userId'. Run ESLint --fix on this file to register globalError() route exceptions.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain("declare module '@craft-ts/core' {");
    expect(output).toContain('interface CraftGlobalExceptionRegistry {');
    expect(output).toContain(
      "'query/:userId': { USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'query/:userId', 'USER_DISABLED'> };",
    );
    // Only globalError() codes are registered — the redirect handler's code is
    // not added to the registry (it appears only as the original handler).
    expect(output).not.toContain('NOT_AUTHENTICATED: CraftRouteExceptionType');
  });

  it('does not report when the registry entry is already up to date', async () => {
    const upToDate = `
        declare module '@craft-ts/core' {
          interface CraftGlobalExceptionRegistry {
            'query/:userId': { USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'query/:userId', 'USER_DISABLED'> };
          }
        }
      `;
    const { messages } = await lintFixture({
      'src/app/demo.ts': ROUTE_FILE(upToDate),
    });
    expect(messages).toEqual([]);
  });

  it('accepts the Prettier-wrapped (multi-line) form of an up-to-date entry', async () => {
    // The rule writes the entry on one line, but Prettier re-wraps long generics
    // across lines. That form must still read as up to date — otherwise --fix and
    // format-on-save fight each other forever.
    const prettierWrapped = `
        declare module '@craft-ts/core' {
          interface CraftGlobalExceptionRegistry {
            'query/:userId': {
              USER_DISABLED: CraftRouteExceptionType<
                typeof demoRoutes,
                'query/:userId',
                'USER_DISABLED'
              >;
            };
          }
        }
      `;
    const { messages } = await lintFixture({
      'src/app/demo.ts': ROUTE_FILE(prettierWrapped),
    });
    expect(messages).toEqual([]);
  });

  it('updates a stale registry entry', async () => {
    const stale = `
        declare module '@craft-ts/core' {
          interface CraftGlobalExceptionRegistry {
            'query/:userId': { LEGACY_CODE: never };
          }
        }
      `;
    const fixture = { 'src/app/demo.ts': ROUTE_FILE(stale) };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "CraftGlobalExceptionRegistry is out of date for 'query/:userId'. Run ESLint --fix on this file to register globalError() route exceptions.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "'query/:userId': { USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'query/:userId', 'USER_DISABLED'> };",
    );
    expect(output).not.toContain('LEGACY_CODE');
  });

  it('reports and purges an orphaned entry when no route delegates to globalError()', async () => {
    // The globalError() handler was refactored away (here: only a redirect
    // remains), but the registry still carries the obsolete entry — which would
    // resolve to `never` and collapse CraftGlobalHandledException downstream.
    const orphanRegistry = `
        declare module '@craft-ts/core' {
          interface CraftGlobalExceptionRegistry {
            'query/:userId': { USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'query/:userId', 'USER_DISABLED'> };
          }
        }
      `;
    const fixture = {
      'src/app/demo.ts': `
        import { craftRoutes, craftRoute, craftException } from '@craft-ts/core';

        export const { demoRoutes } = craftRoutes('demo', [
          craftRoute('query/:userId', {
            loadComponent: () => import('./query'),
            componentDeps: {},
            canActivate: function* () {
              return craftException({ code: 'NOT_AUTHENTICATED' });
            },
          }, {
            NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          }),
        ]);
        ${orphanRegistry}
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "CraftGlobalExceptionRegistry is orphaned for 'query/:userId'. Run ESLint --fix on this file to register globalError() route exceptions.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).not.toContain('USER_DISABLED');
    // The (now empty) interface is kept rather than deleting the module block.
    expect(output).toContain('interface CraftGlobalExceptionRegistry {');
  });

  it('purges an orphaned entry while keeping a still-valid one', async () => {
    const mixedRegistry = `
        declare module '@craft-ts/core' {
          interface CraftGlobalExceptionRegistry {
            'query/:userId': { USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'query/:userId', 'USER_DISABLED'> };
            'old-route': { GONE: CraftRouteExceptionType<typeof demoRoutes, 'old-route', 'GONE'> };
          }
        }
      `;
    const fixture = { 'src/app/demo.ts': ROUTE_FILE(mixedRegistry) };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "CraftGlobalExceptionRegistry is orphaned for 'old-route'. Run ESLint --fix on this file to register globalError() route exceptions.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "'query/:userId': { USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'query/:userId', 'USER_DISABLED'> };",
    );
    expect(output).not.toContain('old-route');
    expect(output).not.toContain('GONE');
  });

  it('ignores a route whose handlers never call globalError()', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftRoutes, craftRoute, craftException } from '@craft-ts/core';

        export const { demoRoutes } = craftRoutes('demo', [
          craftRoute('query/:userId', {
            loadComponent: () => import('./query'),
            componentDeps: {},
            canActivate: function* () {
              return craftException({ code: 'NOT_AUTHENTICATED' });
            },
          }, {
            NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          }),
        ]);
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'global-exception-registry-rule-'),
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
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: {
          local: {
            rules: {
              'global-exception-registry-match':
                globalExceptionRegistryMatchRule as never,
            },
          },
        },
        rules: { 'local/global-exception-registry-match': 'error' },
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
    'src/craft-ts-core.d.ts': `
      declare module '@craft-ts/core' {
        export declare function craftRoutes(...args: any[]): any;
        export declare function craftRoute(...args: any[]): any;
        export declare function craftException(...args: any[]): any;
        export type CraftRouteExceptionType<R, P, C> = unknown;
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
