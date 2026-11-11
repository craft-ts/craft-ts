import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listAngularProjects,
  listRouteCollections,
  runRouteAdd,
  runRouteSplit,
} from './route-command';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('craft route commands', () => {
  it('detects Angular application projects from the workspace root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-route-projects-'));
    temporaryDirectories.push(root);
    await write(root, 'apps/customer/tsconfig.app.json', '{}');
    await write(root, 'projects/admin/tsconfig.app.json', '{}');

    expect(listAngularProjects(root)).toEqual([
      'apps/customer',
      'projects/admin',
    ]);
  });

  it('discovers every craftRoutes parent in the selected Angular project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-route-parents-'));
    temporaryDirectories.push(root);
    await write(
      root,
      'apps/demo/tsconfig.app.json',
      JSON.stringify({
        compilerOptions: {
          module: 'preserve',
          moduleResolution: 'bundler',
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      }),
    );
    await write(root, 'apps/demo/src/app/app.routes.ts', rootRoutes());
    await write(
      root,
      'apps/demo/src/app/users/users.routes.ts',
      "import { craftRoutes } from '@craft-ts/core';\nexport const { usersRoutes } = craftRoutes('users', []);\n",
    );

    expect(listRouteCollections(root, 'apps/demo')).toEqual([
      {
        collectionName: 'app',
        filePath: join(root, 'apps/demo/src/app/app.routes.ts'),
        routesName: 'appRoutes',
      },
      {
        collectionName: 'users',
        filePath: join(root, 'apps/demo/src/app/users/users.routes.ts'),
        routesName: 'usersRoutes',
      },
    ]);
  });

  it('auto-selects the only Angular app instead of scanning the whole workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-route-workspace-'));
    temporaryDirectories.push(root);
    await write(
      root,
      'apps/demo/tsconfig.app.json',
      JSON.stringify({
        compilerOptions: {
          module: 'preserve',
          moduleResolution: 'bundler',
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      }),
    );
    await write(
      root,
      'apps/demo/src/app/app.routes.ts',
      rootRoutes().trimStart(),
    );
    await write(
      root,
      'apps/demo/src/app/users/user-detail.ts',
      component('UserDetailComponent').trimStart(),
    );
    await write(
      root,
      'libs/unrelated/src/routes.ts',
      "const nested = () => craftRoutes('unrelated', []);",
    );

    const result = await runRouteAdd({
      rootDir: root,
      path: '/users/:userId',
      component: 'apps/demo/src/app/users/user-detail.ts#UserDetailComponent',
      yes: true,
      validate: false,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(
      await readFile(
        join(root, 'apps/demo/src/app/users/users.routes.ts'),
        'utf8',
      ),
    ).toContain("craftRoute(':userId'");
  });

  it('adds an existing component through a lazy feature with full bookkeeping', async () => {
    const root = await fixture({
      'src/app/app.routes.ts': rootRoutes(),
      'src/app/users/user-detail.ts': component('UserDetailComponent'),
    });

    const result = await runRouteAdd({
      rootDir: root,
      path: '/users/:userId',
      component: 'src/app/users/user-detail.ts#UserDetailComponent',
      yes: true,
      validate: false,
    });

    expect(result.exitCode).toBe(0);
    const parent = await readFile(join(root, 'src/app/app.routes.ts'), 'utf8');
    const feature = await readFile(
      join(root, 'src/app/users/users.routes.ts'),
      'utf8',
    );
    expect(parent).toContain("path: 'users'");
    expect(parent).toContain("withRetry(import('./users/users.routes'))");
    expect(parent).toContain('assertChildRouteMounts(appRoutes)');
    expect(feature).toContain("craftRoute(':userId'");
    expect(feature).toContain('loadCraftComponent');
    expect(feature).toContain("withRetry(import('./user-detail'))");
    expect(feature).toContain('({ withRetry }: CraftRouteLazyLoadHelpers)');
    expect(feature).toContain("withParent<ParentRoutes<'users'>>()");
    expect(feature).toContain('ValidateCascadeRoutesFile<never, Router');
  });

  it('is a no-op when the exact same route is added twice', async () => {
    const root = await fixture({
      'src/app/app.routes.ts': rootRoutes(),
      'src/app/users/user-detail.ts': component('UserDetailComponent'),
    });
    const options = {
      rootDir: root,
      path: '/users/:userId',
      component: 'src/app/users/user-detail.ts#UserDetailComponent',
      yes: true,
      validate: false,
    } as const;
    await runRouteAdd(options);
    const second = await runRouteAdd(options);
    expect(second.exitCode).toBe(0);
    expect(second.changedFiles).toEqual([]);
  });

  it('keeps redirects in the selected collection and supports dry-run', async () => {
    const root = await fixture({ 'src/app/app.routes.ts': rootRoutes() });
    const dryRun = await runRouteAdd({
      rootDir: root,
      path: '/legacy',
      parent: 'src/app/app.routes.ts#appRoutes',
      redirectTo: '/home',
      dryRun: true,
      yes: true,
      validate: false,
    });
    expect(dryRun.plan?.files).toContain(join(root, 'src/app/app.routes.ts'));
    expect(
      await readFile(join(root, 'src/app/app.routes.ts'), 'utf8'),
    ).not.toContain('redirectTo');

    await runRouteAdd({
      rootDir: root,
      path: '/legacy',
      parent: 'src/app/app.routes.ts#appRoutes',
      redirectTo: '/home',
      yes: true,
      validate: false,
    });
    expect(
      await readFile(join(root, 'src/app/app.routes.ts'), 'utf8'),
    ).toContain("redirectTo: '/home'");
  });

  it('does not create a lazy feature solely for a static redirect', async () => {
    const root = await fixture({ 'src/app/app.routes.ts': rootRoutes() });
    const result = await runRouteAdd({
      rootDir: root,
      path: '/legacy-users',
      redirectTo: '/users',
      yes: true,
      validate: false,
      log: () => undefined,
    });

    expect(result.changedFiles).toEqual([join(root, 'src/app/app.routes.ts')]);
    expect(
      await readFile(join(root, 'src/app/app.routes.ts'), 'utf8'),
    ).toContain("path: 'legacy-users'");
    await expect(
      readFile(
        join(root, 'src/app/legacy-users/legacy-users.routes.ts'),
        'utf8',
      ),
    ).rejects.toThrow();
  });

  it('splits statically analyzable routes, preserves order, and rebases imports', async () => {
    const root = await fixture({
      'src/app/page.ts': component('PageComponent'),
      'src/app/user-consumer.ts': `
        import { AppIdParams } from './app.routes';
        export const readUser = () => AppIdParams();
      `,
      'src/app/app.routes.ts': `
        import { assertExhaustiveRouteExceptions, craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ts/core';
        import { loadCraftComponent } from '@craft-ts/component';
        import type { Router } from '@angular/router';
        export const { appRoutes, AppIdParams } = craftRoutes('app', [
          craftRoute('home', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent)) }),
          craftRoute('users', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent)) }),
          craftRoute('users/:id', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent)) }),
          craftRoute('about', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent)) }),
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
      `,
    });

    const result = await runRouteSplit({
      rootDir: root,
      parent: 'src/app/app.routes.ts#appRoutes',
      prefix: 'users',
      target: 'src/app/users/users.routes.ts',
      yes: true,
      validate: false,
    });
    expect(result.exitCode).toBe(0);
    const parent = await readFile(join(root, 'src/app/app.routes.ts'), 'utf8');
    const child = await readFile(
      join(root, 'src/app/users/users.routes.ts'),
      'utf8',
    );
    const consumer = await readFile(
      join(root, 'src/app/user-consumer.ts'),
      'utf8',
    );
    expect(parent.indexOf("craftRoute('home'")).toBeLessThan(
      parent.indexOf("path: 'users'"),
    );
    expect(parent.indexOf("path: 'users'")).toBeLessThan(
      parent.indexOf("craftRoute('about'"),
    );
    expect(child).toContain("craftRoute(''");
    expect(child).toContain("craftRoute(':id'");
    expect(child).toContain("import('../page')");
    expect(child).toContain('loadCraftComponent');
    expect(child).toContain('UsersIdParams');
    expect(parent).not.toContain('AppIdParams');
    expect(consumer).toContain(
      "import { UsersIdParams as AppIdParams } from './users/users.routes';",
    );
  });

  it('diagnoses a split that captures a local declaration without mutating files', async () => {
    const source = `
      import { craftRoute, craftRoutes } from '@craft-ts/core';
      const localGuard = function* () {};
      export const { appRoutes } = craftRoutes('app', [
        craftRoute('users', { canActivate: localGuard }),
      ]);
    `;
    const root = await fixture({ 'src/app/app.routes.ts': source });
    const result = await runRouteSplit({
      rootDir: root,
      parent: 'src/app/app.routes.ts#appRoutes',
      prefix: 'users',
      target: 'src/app/users/users.routes.ts',
      yes: true,
      validate: false,
    });
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics[0]?.code).toBe('LOCAL_DEPENDENCY');
    expect(await readFile(join(root, 'src/app/app.routes.ts'), 'utf8')).toBe(
      source.trimStart(),
    );
  });

  it('keeps changes and recommends a lazy split when validation reports TS2589', async () => {
    const root = await fixture({ 'src/app/app.routes.ts': rootRoutes() });
    const tsc = join(root, 'node_modules/.bin/tsc');
    await mkdir(dirname(tsc), { recursive: true });
    await writeFile(
      tsc,
      '#!/bin/sh\necho "app.routes.ts(1,1): error TS2589: Type instantiation is excessively deep" >&2\nexit 1\n',
      'utf8',
    );
    await chmod(tsc, 0o755);

    const result = await runRouteAdd({
      rootDir: root,
      path: '/legacy',
      parent: 'src/app/app.routes.ts#appRoutes',
      redirectTo: '/home',
      yes: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics[0]?.message).toContain('Keep the DI check');
    expect(result.diagnostics[0]?.message).toContain('--feature-file');
    expect(
      await readFile(join(root, 'src/app/app.routes.ts'), 'utf8'),
    ).toContain("redirectTo: '/home'");
  });
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-route-command-'));
  temporaryDirectories.push(root);
  await write(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        experimentalDecorators: true,
        module: 'preserve',
        moduleResolution: 'bundler',
        strict: true,
        target: 'ES2022',
      },
      include: ['src/**/*.ts'],
    }),
  );
  await write(
    root,
    'src/craft.d.ts',
    `
    declare module '@craft-ts/core' {
      export declare function craftRoutes(...args: any[]): any;
      export declare function craftRoute(...args: any[]): any;
      export declare function assertExhaustiveRouteExceptions(...args: any[]): void;
      export declare function assertChildRouteMounts(...args: any[]): void;
      export type CanRun<T> = T;
      export type ParentRoutes<T> = T;
      export type ValidateCascadeRoutesFile<A, B, C> = true;
    }
    declare module '@angular/router' { export class Router {} }
    declare module '@angular/core' {
      export declare function Component(metadata: unknown): ClassDecorator;
    }
  `,
  );
  for (const [filePath, source] of Object.entries(files)) {
    await write(root, filePath, source.trimStart());
  }
  return root;
}

async function write(
  root: string,
  path: string,
  source: string,
): Promise<void> {
  const filePath = join(root, path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, source, 'utf8');
}

function rootRoutes(): string {
  return `
    import { assertExhaustiveRouteExceptions, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ts/core';
    import type { Router } from '@angular/router';
    export const { appRoutes } = craftRoutes('app', []);
    assertExhaustiveRouteExceptions(appRoutes);
    type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;
    type _CanRunApp = CanRun<_CheckAppDI>;
  `;
}

function component(name: string): string {
  return `
    import { craftComponent, p } from '@craft-ts/component';
    export const ${name} = craftComponent('${name}', {}, function* () { return p('${name}'); });
  `;
}
