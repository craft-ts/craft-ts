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
      "import { craftRoutes } from '@craft-ng/core';\nexport const { usersRoutes } = craftRoutes('users', []);\n",
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
    expect(feature).toContain('GenDeps_UserDetailComponent');
    expect(feature).toContain("withRetry(import('./user-detail'))");
    expect(feature).toContain('({ withRetry }: CraftRouteLazyLoadHelpers)');
    expect(feature).toContain("withParent<ParentRoutes<'users'>>()");
    expect(feature).toContain('ValidateCascadeRoutesFile<never, Router');
  });

  it('delegates component creation to the local Angular CLI', async () => {
    const root = await fixture({ 'src/app/app.routes.ts': rootRoutes() });
    await write(root, 'angular.json', '{}');
    const ng = join(root, 'node_modules/.bin/ng');
    await mkdir(dirname(ng), { recursive: true });
    await writeFile(
      ng,
      `#!/bin/sh
target="$3.ts"
mkdir -p "$(dirname "$target")"
printf "%s\\n" "import { Component } from '@angular/core';" "@Component({ template: '' })" "export class Generated {}" > "$target"
`,
      'utf8',
    );
    await chmod(ng, 0o755);

    const result = await runRouteAdd({
      rootDir: root,
      path: '/users/generated',
      createComponent: 'src/app/users/generated',
      yes: true,
      validate: false,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(
      await readFile(join(root, 'src/app/users/generated.ts'), 'utf8'),
    ).toContain('GenDeps_Generated');
    expect(
      await readFile(join(root, 'src/app/users/users.routes.ts'), 'utf8'),
    ).toContain("componentDeps: {} as import('./generated').GenDeps_Generated");
  });

  it('delegates through Nx when the Angular project has no angular.json workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-route-nx-workspace-'));
    temporaryDirectories.push(root);
    await write(root, 'nx.json', '{}');
    await write(
      root,
      'apps/demo/project.json',
      JSON.stringify({ name: 'demo', sourceRoot: 'apps/demo/src' }),
    );
    await write(
      root,
      'apps/demo/tsconfig.app.json',
      JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
          module: 'preserve',
          moduleResolution: 'bundler',
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      }),
    );
    await write(
      root,
      'apps/demo/src/craft.d.ts',
      `
        declare module '@craft-ng/core' {
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
    await write(
      root,
      'apps/demo/src/app/app.routes.ts',
      rootRoutes().trimStart(),
    );
    const binDirectory = join(root, 'node_modules/.bin');
    await mkdir(binDirectory, { recursive: true });
    await writeFile(
      join(binDirectory, 'ng'),
      '#!/bin/sh\necho "Angular CLI outside a workspace" >&2\nexit 1\n',
      'utf8',
    );
    await writeFile(
      join(binDirectory, 'nx'),
      `#!/bin/sh
target="apps/demo/src/app/$3/$3.ts"
mkdir -p "$(dirname "$target")"
printf "%s\\n" "import { Component } from '@angular/core';" "@Component({ template: '' })" "export class TestGenerated {}" > "$target"
`,
      'utf8',
    );
    await writeFile(
      join(binDirectory, 'eslint'),
      `#!/bin/sh
expected="$(cd "${join(root, 'apps/demo')}" && pwd -P)"
if [ "$(pwd -P)" != "$expected" ]; then
  echo "wrong eslint cwd: $PWD" >&2
  exit 1
fi
echo '[{"filePath":"${join(root, 'apps/demo/src/app/app.routes.ts')}","messages":[{"ruleId":"@typescript-eslint/no-unused-vars","message":"Existing unrelated lint error","line":1,"column":1}]}]'
exit 1
`,
      'utf8',
    );
    await writeFile(
      join(binDirectory, 'ngc'),
      `#!/bin/sh
touch "${join(root, 'ngc-called')}"
exit 0
`,
      'utf8',
    );
    await chmod(join(binDirectory, 'ng'), 0o755);
    await chmod(join(binDirectory, 'nx'), 0o755);
    await chmod(join(binDirectory, 'eslint'), 0o755);
    await chmod(join(binDirectory, 'ngc'), 0o755);

    const result = await runRouteAdd({
      rootDir: root,
      path: '/test',
      createComponent: 'test-generated',
      yes: true,
      log: () => undefined,
    });

    expect(result.exitCode, JSON.stringify(result.diagnostics)).toBe(0);
    expect(
      await readFile(
        join(root, 'apps/demo/src/app/test-generated/test-generated.ts'),
        'utf8',
      ),
    ).toContain('GenDeps_TestGenerated');
    expect(await readFile(join(root, 'ngc-called'), 'utf8')).toBe('');
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
        import { injectAppIdParams } from './app.routes';
        export const readUser = () => injectAppIdParams();
      `,
      'src/app/app.routes.ts': `
        import { assertExhaustiveRouteExceptions, craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
        import type { Router } from '@angular/router';
        export const { appRoutes, injectAppIdParams } = craftRoutes('app', [
          craftRoute('home', { componentDeps: {} as import('./page').GenDeps_PageComponent, loadComponent: ({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent) }),
          craftRoute('users', { componentDeps: {} as import('./page').GenDeps_PageComponent, loadComponent: ({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent) }),
          craftRoute('users/:id', { componentDeps: {} as import('./page').GenDeps_PageComponent, loadComponent: ({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent) }),
          craftRoute('about', { componentDeps: {} as import('./page').GenDeps_PageComponent, loadComponent: ({ withRetry }) => withRetry(import('./page')).then(m => m.PageComponent) }),
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
    expect(child).toContain("import('../page').GenDeps_PageComponent");
    expect(child).toContain('injectUsersIdParams');
    expect(parent).not.toContain('injectAppIdParams');
    expect(consumer).toContain(
      "import { injectUsersIdParams as injectAppIdParams } from './users/users.routes';",
    );
  });

  it('diagnoses a split that captures a local declaration without mutating files', async () => {
    const source = `
      import { craftRoute, craftRoutes } from '@craft-ng/core';
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
    declare module '@craft-ng/core' {
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
    import { assertExhaustiveRouteExceptions, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
    import type { Router } from '@angular/router';
    export const { appRoutes } = craftRoutes('app', []);
    assertExhaustiveRouteExceptions(appRoutes);
    type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;
    type _CanRunApp = CanRun<_CheckAppDI>;
  `;
}

function component(name: string): string {
  return `
    export class ${name} {}
    export type GenDeps_${name} = {};
  `;
}
