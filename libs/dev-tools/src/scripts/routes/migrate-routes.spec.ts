import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project, ScriptTarget, ts } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateRoutesSourceFile, runRoutesMigration } from './migrate-routes';
import { RouteMigrationDiagnostic } from './migration-diagnostic';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function createProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ScriptTarget.ES2022,
    },
  });
  for (const [filePath, text] of Object.entries(files)) {
    project.createSourceFile(filePath, text);
  }
  return project;
}

describe('routes migration', () => {
  it('migrates static component routes, preserves the export name, and is idempotent', () => {
    const project = createProject({
      '/src/profile-page.ts': `
        export class ProfilePage {}
        export type GenDeps_ProfilePage = {};
      `,
      '/src/profile.routes.ts': `
        import type { Routes } from '@angular/router';

        export const routes: Routes = [
          {
            path: '',
            loadComponent: () => import('./profile-page').then((m) => m.ProfilePage),
            title: 'Profile',
          },
        ];
      `,
    });
    const sourceFile = project.getSourceFileOrThrow('/src/profile.routes.ts');

    expect(migrateRoutesSourceFile(sourceFile)).toEqual(['routes']);
    const output = sourceFile.getFullText();

    expect(output).toMatch(
      /export const \{ profileRoutes: routes \} = craftRoutes\(["']profile["'], \[/,
    );
    expect(output).toMatch(/craftRoute\(["']["'], \{/);
    expect(output).toMatch(
      /componentDeps: \{\} as import\(["']\.\/profile-page["']\)\.GenDeps_ProfilePage/,
    );
    expect(output).toContain(
      'type _CheckProfileDI = ValidateCascadeRoutesFile<never, Router, typeof routes>;',
    );
    expect(output).not.toContain('Routes }');

    expect(migrateRoutesSourceFile(sourceFile)).toEqual([]);
    expect(sourceFile.getFullText()).toBe(output);
  });

  it('generates the component GenDeps type through the angular brand codemod', () => {
    const project = createProject({
      '/src/angular.d.ts': `
        declare module '@angular/core' {
          export declare function Component(metadata: unknown): ClassDecorator;
        }
      `,
      '/src/detail.ts': `
        import { Component } from '@angular/core';
        @Component({ standalone: true, template: '' })
        export class DetailPage {}
      `,
      '/src/detail.routes.ts': `
        import { Routes } from '@angular/router';
        import { DetailPage } from './detail';
        export const detailRoutes: Routes = [{ path: ':id', component: DetailPage }];
      `,
    });
    const sourceFile = project.getSourceFileOrThrow('/src/detail.routes.ts');

    migrateRoutesSourceFile(sourceFile);

    expect(
      project.getSourceFileOrThrow('/src/detail.ts').getFullText(),
    ).toContain('export type GenDeps_DetailPage');
    expect(sourceFile.getFullText()).toMatch(
      /componentDeps: \{\} as import\(["']\.\/detail["']\)\.GenDeps_DetailPage/,
    );
  });

  it('emits actionable diagnostics and does not rewrite Angular guards', () => {
    const project = createProject({
      '/src/page.ts': `
        export class Page {}
        export type GenDeps_Page = {};
      `,
      '/src/app.routes.ts': `
        import type { Routes } from '@angular/router';
        export const appRoutes: Routes = [{
          path: 'checkout',
          loadComponent: () => import('./page').then((m) => m.Page),
          canMatch: [authGuard, cartNotEmptyGuard],
        }];
      `,
    });
    const sourceFile = project.getSourceFileOrThrow('/src/app.routes.ts');
    const diagnostics: RouteMigrationDiagnostic[] = [];

    migrateRoutesSourceFile(sourceFile, { diagnostics });

    expect(diagnostics).toMatchObject([
      {
        code: 'MULTIPLE_GUARDS_REQUIRE_COMPOSITION',
        routePath: 'checkout',
      },
    ]);
    expect(sourceFile.getFullText()).toContain(
      'canMatch: [authGuard, cartNotEmptyGuard]',
    );
    expect(sourceFile.getFullText()).not.toContain(`craftRoute('checkout'`);
    expect(sourceFile.getFullText()).toContain('appRoutes: Routes');
  });

  it('supports satisfies Routes, inherited names, and a pinned parent mount', () => {
    const project = createProject({
      '/src/admin.ts': `
        export default class AdminPage {}
        export type GenDeps_AdminPage = {};
      `,
      '/src/admin.routes.ts': `
        import type { Routes } from '@angular/router';
        export const adminRoutes = [
          { path: '', loadComponent: () => import('./admin') },
        ] satisfies Routes;
      `,
    });
    const sourceFile = project.getSourceFileOrThrow('/src/admin.routes.ts');

    migrateRoutesSourceFile(sourceFile, {
      parentMount: 'profile',
      parentNames: ['AuthenticatedUser'],
    });
    const output = sourceFile.getFullText();

    expect(output).toMatch(/\.withParent<ParentRoutes<["']profile["']>>\(\)/);
    expect(output).toMatch(
      /ValidateCascadeRoutesFile<["']AuthenticatedUser["'], Router, typeof adminRoutes>/,
    );
  });

  it('keeps nested Angular routes intact and recommends a lazy split', () => {
    const project = createProject({
      '/src/nested.routes.ts': `
        import type { Routes } from '@angular/router';
        export const nestedRoutes: Routes = [{
          path: 'parent',
          children: [{ path: 'child', loadComponent: () => import('./child') }],
        }];
      `,
    });
    const sourceFile = project.getSourceFileOrThrow('/src/nested.routes.ts');
    const diagnostics: RouteMigrationDiagnostic[] = [];

    migrateRoutesSourceFile(sourceFile, { diagnostics });

    expect(diagnostics).toMatchObject([
      { code: 'ROUTE_SPLIT_RECOMMENDED', routePath: 'parent' },
    ]);
    expect(sourceFile.getFullText()).toContain("children: [{ path: 'child'");
    expect(sourceFile.getFullText()).not.toMatch(/craftRoute\(/);
    expect(sourceFile.getFullText()).toContain('nestedRoutes: Routes');
  });

  it('supports check-only CI runs and writes on explicit request', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'craft-routes-'));
    temporaryDirectories.push(rootDir);
    const routesFile = join(rootDir, 'app.routes.ts');
    await writeFile(
      join(rootDir, 'page.ts'),
      'export class Page {}\nexport type GenDeps_Page = {};\n',
      'utf8',
    );
    await writeFile(
      routesFile,
      `import type { Routes } from '@angular/router';\nexport const routes: Routes = [{ path: '', loadComponent: () => import('./page').then((m) => m.Page) }];\n`,
      'utf8',
    );

    const checked = await runRoutesMigration({
      rootDir,
      check: true,
      log: () => undefined,
    });
    expect(checked.exitCode).toBe(1);
    expect(checked.remainingLegacyCollections).toBe(1);
    expect(await readFile(routesFile, 'utf8')).toContain(': Routes =');

    const written = await runRoutesMigration({
      rootDir,
      check: true,
      write: true,
      log: () => undefined,
    });
    expect(written.exitCode).toBe(0);
    expect(written.remainingLegacyCollections).toBe(0);
    expect(await readFile(routesFile, 'utf8')).toContain('craftRoutes');
  });

  it('migrates app config, bootstrap, and disables explicit return types', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'craft-routes-app-'));
    temporaryDirectories.push(rootDir);
    await writeFile(
      join(rootDir, 'app.routes.ts'),
      `import type { Routes } from '@angular/router';\nexport const routes: Routes = [];\n`,
      'utf8',
    );
    await writeFile(
      join(rootDir, 'app.config.ts'),
      `import { ApplicationConfig } from '@angular/core';\nimport { provideRouter } from '@angular/router';\nimport { routes } from './app.routes';\nexport const appConfig: ApplicationConfig = { providers: [provideRouter(routes)] };\n`,
      'utf8',
    );
    await writeFile(
      join(rootDir, 'main.ts'),
      `import { bootstrapApplication } from '@angular/platform-browser';\nimport { App } from './app';\nimport { appConfig } from './app.config';\nbootstrapApplication(App, appConfig);\n`,
      'utf8',
    );
    await writeFile(
      join(rootDir, 'eslint.config.js'),
      `export default [{ files: ['**/*.ts'], rules: { 'no-console': 'error' } }];\n`,
      'utf8',
    );

    await runRoutesMigration({
      rootDir,
      write: true,
      log: () => undefined,
    });

    const config = await readFile(join(rootDir, 'app.config.ts'), 'utf8');
    const main = await readFile(join(rootDir, 'main.ts'), 'utf8');
    const eslint = await readFile(join(rootDir, 'eslint.config.js'), 'utf8');
    expect(config).toContain('craftAppConfig({');
    expect(config).toContain('routingDeps: routes.META_DATA');
    expect(config).toContain('provideCraftRouter(routes.toRoutes())');
    expect(main).toContain('toApplicationConfig(appConfig)');
    expect(eslint).toContain(
      "'@typescript-eslint/explicit-function-return-type': 'off'",
    );
  }, 30_000);
});
