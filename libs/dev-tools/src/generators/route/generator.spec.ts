import { addProjectConfiguration, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readFileSync, statSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  resolveRouteParentOption,
  resolveRouteTargetOptions,
  routeGenerator,
  routeSplitGenerator,
} from './generator';

describe('Craft route generators', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write(
      'package.json',
      JSON.stringify({
        dependencies: { '@angular/core': '21.2.0' },
        devDependencies: { '@nx/angular': '22.3.1' },
      }),
    );
    addProjectConfiguration(tree, 'demo', {
      root: 'apps/demo',
      sourceRoot: 'apps/demo/src',
      projectType: 'application',
      targets: {
        build: {
          executor: '@angular/build:application',
          options: { tsConfig: 'apps/demo/tsconfig.app.json' },
        },
      },
    });
    tree.write(
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
    tree.write('apps/demo/src/app/app.routes.ts', rootRoutes());
    tree.write(
      'apps/demo/src/app/users/user-detail.ts',
      component('UserDetail'),
    );
  });

  it('adds a route to the selected Nx project through the virtual Tree', async () => {
    const diskRoutePath = '/virtual/apps/demo/src/app/users/users.routes.ts';

    await routeGenerator(tree, {
      path: '/users/:userId',
      project: 'demo',
      component: 'apps/demo/src/app/users/user-detail.ts#UserDetail',
      skipValidation: true,
      yes: true,
    });

    expect(tree.exists('apps/demo/src/app/users/users.routes.ts')).toBe(true);
    expect(
      tree.read('apps/demo/src/app/users/users.routes.ts', 'utf8'),
    ).toContain("craftRoute(':userId'");
    expect(tree.read('apps/demo/src/app/app.routes.ts', 'utf8')).toContain(
      "withRetry(import('./users/users.routes'))",
    );
    expect(tree.listChanges()).toContainEqual(
      expect.objectContaining({
        path: 'apps/demo/src/app/users/users.routes.ts',
        type: 'CREATE',
      }),
    );
    expect(() => statSync(diskRoutePath)).toThrow();
  });

  it('fails clearly when a workspace has several applications and no project', async () => {
    addProjectConfiguration(tree, 'admin', {
      root: 'apps/admin',
      sourceRoot: 'apps/admin/src',
      projectType: 'application',
      targets: {
        build: {
          executor: '@angular/build:application',
          options: { tsConfig: 'apps/admin/tsconfig.app.json' },
        },
      },
    });
    tree.write('apps/admin/tsconfig.app.json', '{}');

    await expect(
      routeGenerator(tree, {
        path: '/users',
        component: 'apps/demo/src/app/users/user-detail.ts#UserDetail',
        skipValidation: true,
        yes: true,
      }),
    ).rejects.toThrow('Choose a project with --project');
  });

  it('auto-selects the only Angular application among other application projects', async () => {
    addProjectConfiguration(tree, 'docs', {
      root: 'apps/docs',
      projectType: 'application',
      targets: {
        build: {
          executor: 'nx:run-commands',
          options: { command: 'vitepress build apps/docs' },
        },
      },
    });

    await routeGenerator(tree, {
      path: '/users',
      component: 'apps/demo/src/app/users/user-detail.ts#UserDetail',
      skipValidation: true,
      yes: true,
    });

    expect(tree.exists('apps/demo/src/app/users/users.routes.ts')).toBe(true);
  });

  it('composes the native Nx Angular component generator', async () => {
    await routeGenerator(tree, {
      path: '/created',
      project: 'demo',
      createComponent: 'created-page/DemoPage',
      skipValidation: true,
      yes: true,
    });

    expect(
      tree.read('apps/demo/src/app/created-page/demo-page.ts', 'utf8'),
    ).toContain('export class DemoPage');
    expect(tree.exists('apps/demo/src/app/created-page/DemoPage.ts')).toBe(
      false,
    );
    expect(tree.exists('apps/demo/src/app/created-page/demo-page.html')).toBe(
      false,
    );
    expect(tree.exists('apps/demo/src/app/created-page/demo-page.css')).toBe(
      false,
    );
    expect(
      tree.read('apps/demo/src/app/created/created.routes.ts', 'utf8'),
    ).toContain('GenDeps_DemoPage');
  });

  it('keeps the separate component path and name with the Angular schematic', async () => {
    tree.delete('nx.json');
    tree.write(
      'angular.json',
      JSON.stringify({
        version: 1,
        projects: {
          demo: {
            root: 'apps/demo',
            sourceRoot: 'apps/demo/src',
            projectType: 'application',
            architect: {
              build: {
                builder: '@angular/build:application',
                options: { tsConfig: 'apps/demo/tsconfig.app.json' },
              },
            },
          },
        },
      }),
    );

    await routeGenerator(tree, {
      path: '/angular-created',
      project: 'demo',
      createComponent: 'test-cli/TestCli',
      skipValidation: true,
      yes: true,
    });

    const generatedComponent = tree
      .listChanges()
      .find(
        (change) =>
          change.path.includes('/test-cli/') && change.path.endsWith('.ts'),
      );
    expect(generatedComponent?.path).toBe(
      'apps/demo/src/app/test-cli/test-cli.ts',
    );
    expect(generatedComponent?.content?.toString()).toContain(
      'export class TestCli',
    );
    expect(tree.exists('apps/demo/src/app/test-cli/test-cli.html')).toBe(false);
    expect(tree.exists('apps/demo/src/app/test-cli/test-cli.css')).toBe(false);
  });

  it('splits routes through the same virtual Tree', async () => {
    tree.write(
      'apps/demo/src/app/app.routes.ts',
      rootRoutes("{ path: 'users' }, { path: 'users/:userId' },"),
    );

    await routeSplitGenerator(tree, {
      project: 'demo',
      parent: 'apps/demo/src/app/app.routes.ts#appRoutes',
      prefix: 'users',
      target: 'apps/demo/src/app/users/users.routes.ts',
      skipValidation: true,
    });

    expect(
      tree.read('apps/demo/src/app/users/users.routes.ts', 'utf8'),
    ).toContain("craftRoutes('users'");
    expect(tree.read('apps/demo/src/app/app.routes.ts', 'utf8')).toContain(
      'loadChildren: ({ withRetry })',
    );
  });

  it('publishes the same operations as Nx generators and Angular schematics', () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL('../../../generators.json', import.meta.url),
        'utf8',
      ),
    ) as {
      generators: Record<string, unknown>;
      schematics: Record<string, unknown>;
    };

    expect(Object.keys(manifest.generators)).toEqual(['route', 'route-split']);
    expect(Object.keys(manifest.schematics)).toEqual(['route', 'route-split']);
  });

  it('asks Nx for the required route path when no positional argument is provided', () => {
    const schema = JSON.parse(
      readFileSync(new URL('./schema.json', import.meta.url), 'utf8'),
    ) as {
      properties: {
        path: { 'x-prompt'?: unknown };
        project: { $default?: unknown };
        yes: { default?: unknown };
      };
      required: string[];
    };

    expect(schema.required).toContain('path');
    expect(schema.properties.path['x-prompt']).toBe('Route path:');
    expect(schema.properties.project.$default).toBeUndefined();
    expect(schema.properties.yes.default).toBe(false);
  });

  it('asks only for the missing route target in interactive mode', async () => {
    const answers = ['c', 'test-cli', 'TestCli'];
    const prompts: string[] = [];

    const result = await resolveRouteTargetOptions(
      { path: '/created' },
      {
        componentBase: 'apps/demo/src/app',
        ask: async (prompt) => {
          prompts.push(prompt);
          return answers.shift() ?? '';
        },
      },
    );

    expect(result).toEqual({
      createComponent: { path: 'test-cli', name: 'TestCli' },
    });
    expect(prompts).toEqual([
      'Target: [e]xisting component, [c]reate component, [r]edirect? ',
      'Angular component path (relative to apps/demo/src/app): ',
      'Angular component name: ',
    ]);
  });

  it('lets interactive users select one of the discovered route parents', async () => {
    const prompts: string[] = [];
    const parent = await resolveRouteParentOption(
      [
        {
          collectionName: 'app',
          filePath: '/virtual/apps/demo/src/app/app.routes.ts',
          routesName: 'appRoutes',
        },
        {
          collectionName: 'users',
          filePath: '/virtual/apps/demo/src/app/users/users.routes.ts',
          routesName: 'usersRoutes',
        },
      ],
      {
        rootDir: '/virtual',
        routePath: '/users/:userId',
        ask: async (prompt) => {
          prompts.push(prompt);
          return '2';
        },
      },
    );

    expect(parent).toBe('apps/demo/src/app/users/users.routes.ts#usersRoutes');
    expect(prompts).toEqual(['Parent number [0]: ']);
  });
});

function rootRoutes(routes = ''): string {
  return `
import {
  assertExhaustiveRouteExceptions,
  craftRoutes,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

export const { appRoutes } = craftRoutes('app', [${routes}]);
assertExhaustiveRouteExceptions(appRoutes);
type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;
type _CanRunApp = CanRun<_CheckAppDI>;
`;
}

function component(className: string): string {
  return `
import { Component } from '@angular/core';
import { type GetDeps, type GetPublicComponentProperties } from '@craft-ng/core';

@Component({ selector: 'app-user-detail', template: '' })
export class ${className} {}

export type GenDeps_${className} = GetDeps<{
  deps: {};
  propertiesDeps: {};
  provided: {};
  publicProperties: GetPublicComponentProperties<${className}>;
}>;
`;
}
