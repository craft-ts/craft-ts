import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-pending-component-di-check.cjs');

const tempDirectories: string[] = [];

const SKELETON = `
  export default class SkeletonComponent {}
  export type GenDeps_SkeletonComponent = { deps: {} };
`;

// A collection with a view-transition pending route; `$extra` is appended after.
const ROUTES = (extra: string) => `
  import {
    craftRoutes,
    route,
    viewTransitionPayload,
    type CanRun,
    type RouteCheckedDI,
    type ValidateCascadeRoutesFile,
  } from '@craft-ng/core';
  import type { Router } from '@angular/router';

  export const { galleryRoutes } = craftRoutes('gallery', [
    route(':photoId', {
      componentDeps: {} as import('./detail').GenDeps_DetailComponent,
      loadComponent: () => import('./detail'),
      withLoaderViewTransitionImage: viewTransitionPayload<{ name: string }>(),
      pendingComponent: () => import('./skeleton'),
    }),
  ]);

  type _CheckDI = ValidateCascadeRoutesFile<never, Router, typeof galleryRoutes>;
  type _CanRun = CanRun<_CheckDI>;
${extra}`;

describe('require-pending-component-di-check', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a pending route already verified with RouteCheckedDI', async () => {
    const { messages } = await lintFixture(
      ROUTES(`
        type _CheckPending = RouteCheckedDI<
          import('./skeleton').GenDeps_SkeletonComponent,
          'GalleryPhotoIdParams' | 'GalleryPhotoIdViewTransition',
          Router,
          'pending'
        >;
        type _CanRunPending = CanRun<_CheckPending>;
      `),
    );
    expect(messages).toEqual([]);
  });

  it('reports and autofixes a missing pending check, deriving names + context', async () => {
    const source = ROUTES('');

    const { messages } = await lintFixture(source);
    expect(messages).toEqual([
      'route(s) with a pendingComponent must be verified with RouteCheckedDI(): :photoId',
    ]);

    const { output } = await lintFixture(source, { fix: true });
    expect(output).toContain(
      "import('./skeleton').GenDeps_SkeletonComponent",
    );
    // path param + view-transition payload service names, derived from the route:
    expect(output).toContain(
      "'GalleryPhotoIdParams' | 'GalleryPhotoIdViewTransition'",
    );
    // parent value borrowed from the collection's cascade check:
    expect(output).toMatch(/RouteCheckedDI<[\s\S]*?\bRouter,/);
    expect(output).toContain('_CanRunGalleryPending');
  });

  it('ignores routes without a lazy pendingComponent', async () => {
    const { messages } = await lintFixture(`
      import { craftRoutes, route } from '@craft-ng/core';
      export const { galleryRoutes } = craftRoutes('gallery', [
        route('', {
          componentDeps: {} as import('./detail').GenDeps_DetailComponent,
          loadComponent: () => import('./detail'),
        }),
      ]);
    `);
    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  source: string,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'require-pending-component-di-check-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: { module: 'preserve', strict: true, target: 'ES2022' },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    'src/app/gallery.routes.ts': source,
    'src/app/skeleton.ts': SKELETON,
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
          local: { rules: { 'require-pending-component-di-check': rule as never } },
        },
        rules: { 'local/require-pending-component-di-check': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/app/gallery.routes.ts']);
  if (options.fix) {
    await ESLint.outputFixes(results);
  }

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: await readFile(
      join(tempDirectory, 'src/app/gallery.routes.ts'),
      'utf8',
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
