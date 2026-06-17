import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-child-route-mount-check.cjs');

const tempDirectories: string[] = [];

const LAZY_ROUTE = `
      {
        path: 'view-transitions',
        loadChildren: () =>
          import('./vt.routes').then((m) => m.viewTransitionsRoutes),
      },`;

describe('require-child-route-mount-check', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a lazy loadChildren collection missing the assert', async () => {
    const { messages } = await lintFixture({
      'src/app/app.routes.ts': `
        import { craftRoutes } from '@craft-ng/core';

        export const { demoRoutes } = craftRoutes('demo', [${LAZY_ROUTE}
        ]);
      `,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('assertChildRouteMounts');
    expect(messages[0]).toContain('demoRoutes');
  });

  it('auto-fixes by adding the assert and merging the import', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.routes.ts': `
          import { craftRoutes } from '@craft-ng/core';

          export const { demoRoutes } = craftRoutes('demo', [${LAZY_ROUTE}
          ]);
        `,
      },
      { fix: true },
    );

    expect(output).toContain('assertChildRouteMounts(demoRoutes);');
    // The @craft-ng/core import stays a single merged import.
    expect((output?.match(/@craft-ng\/core/g) ?? []).length).toBe(1);
    expect(output).toMatch(/import \{[\s\S]*assertChildRouteMounts[\s\S]*\} from '@craft-ng\/core'/);
  });

  it('accepts a collection already checked with assertChildRouteMounts', async () => {
    const { messages } = await lintFixture({
      'src/app/app.routes.ts': `
        import { assertChildRouteMounts, craftRoutes } from '@craft-ng/core';

        export const { demoRoutes } = craftRoutes('demo', [${LAZY_ROUTE}
        ]);

        assertChildRouteMounts(demoRoutes);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('ignores collections with no lazy loadChildren route', async () => {
    const { messages } = await lintFixture({
      'src/app/app.routes.ts': `
        import { craftRoutes } from '@craft-ng/core';

        export const { demoRoutes } = craftRoutes('demo', [
          {
            path: 'home',
            loadComponent: () => import('./home'),
            componentDeps: {} as import('./home').GenDeps_Home,
          },
        ]);
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
    join(tmpdir(), 'require-child-route-mount-check-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const outputPath = options.filePath ?? Object.keys(files)[0];

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: { module: 'preserve', strict: true, target: 'ES2022' },
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
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: {
          local: { rules: { 'require-child-route-mount-check': rule as never } },
        },
        rules: { 'local/require-child-route-mount-check': 'error' },
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
