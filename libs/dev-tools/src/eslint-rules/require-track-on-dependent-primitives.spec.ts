import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireTrackRule = require('./require-track-on-dependent-primitives.cjs');

const tempDirectories: string[] = [];

describe('require-track-on-dependent-primitives', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a dependent mutation that is not yielded through track', async () => {
    const { messages } = await lintFixture({
      'src/app/auth.ts': `
        import { craftService, mutation, CraftHttpClient } from '@craft-ng/core';

        export const auth = craftService({ name: 'Auth', scope: 'global' }, function* () {
          const register = mutation({
            method: (p) => p,
            loader: function* ({ params }) {
              return yield* CraftHttpClient.post(({ response }) => ({
                url: '/x', payload: params, success: response(),
              }));
            },
          });
          return { register };
        });
      `,
    });

    expect(messages).toEqual([
      "'mutation(...)' uses dependencies (it yields) and must be yielded with `yield* track(mutation(...))` so the enclosing craftService tracks them.",
    ]);
  });

  it('does not report a dependent mutation already yielded through track', async () => {
    const { messages } = await lintFixture({
      'src/app/auth.ts': `
        import { craftService, mutation, track, CraftHttpClient } from '@craft-ng/core';

        export const auth = craftService({ name: 'Auth', scope: 'global' }, function* () {
          const register = yield* track(mutation({
            method: (p) => p,
            loader: function* ({ params }) {
              return yield* CraftHttpClient.post(({ response }) => ({
                url: '/x', payload: params, success: response(),
              }));
            },
          }));
          return { register };
        });
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report a primitive without dependencies (no yield)', async () => {
    const { messages } = await lintFixture({
      'src/app/auth.ts': `
        import { craftService, state } from '@craft-ng/core';

        export const counter = craftService({ name: 'Counter', scope: 'global' }, function* () {
          const value = state({ initialValue: 0 });
          return { value };
        });
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report inside a non-generator factory (cannot yield)', async () => {
    const { messages } = await lintFixture({
      'src/app/auth.ts': `
        import { craftService, mutation, ApiServiceToYield } from '@craft-ng/core';

        export const svc = craftService(
          { name: 'Svc', scope: 'toProvide' },
          (inputs) => {
            const update = mutation({
              method: (p) => p,
              loader: function* ({ params }) {
                return yield* ApiServiceToYield.updateItem(params);
              },
            });
            return { update };
          },
        );
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report primitives outside a craftService', async () => {
    const { messages } = await lintFixture({
      'src/app/auth.ts': `
        import { mutation, CraftHttpClient } from '@craft-ng/core';

        export const register = mutation({
          method: (p) => p,
          loader: function* ({ params }) {
            return yield* CraftHttpClient.post(({ response }) => ({
              url: '/x', payload: params, success: response(),
            }));
          },
        });
      `,
    });

    expect(messages).toEqual([]);
  });

  it('autofixes by wrapping in yield* track(...) and importing track', async () => {
    const { output } = await lintFixture(
      {
        'src/app/auth.ts': `
        import { craftService, mutation, CraftHttpClient } from '@craft-ng/core';

        export const auth = craftService({ name: 'Auth', scope: 'global' }, function* () {
          const register = mutation({
            method: (p) => p,
            loader: function* ({ params }) {
              return yield* CraftHttpClient.post(({ response }) => ({
                url: '/x', payload: params, success: response(),
              }));
            },
          });
          return { register };
        });
      `,
      },
      { fix: true },
    );

    expect(output).toContain('const register = yield* track(mutation({');
    expect(output).toContain(
      'import { craftService, mutation, CraftHttpClient, track }',
    );
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'require-track-rule-'),
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
              'require-track-on-dependent-primitives': requireTrackRule as never,
            },
          },
        },
        rules: {
          'local/require-track-on-dependent-primitives': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: results.map((result) => result.output ?? '').join('\n'),
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
