import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { transformSourceFile } from './angular-brand-codemod';

const tempDirectories: string[] = [];

describe('angular-brand-codemod', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('generates GenDeps types with child component imports and missing providers', async () => {
    const project = await createProjectFixture({
      'src/angular-core.d.ts': `
        declare module '@angular/core' {
          export declare function Component(metadata: unknown): ClassDecorator;
          export declare function Directive(metadata?: unknown): ClassDecorator;
          export declare function Pipe(metadata?: unknown): ClassDecorator;
          export declare function Injectable(metadata?: unknown): ClassDecorator;
          export declare function inject<T>(token: T): T;
        }
      `,
      'src/app/child.ts': `
        import { Component } from '@angular/core';

        @Component({
          standalone: true,
          template: '',
        })
        export class ChildComponent {}
      `,
      'src/app/api.service.ts': `
        import { Injectable } from '@angular/core';

        @Injectable({ providedIn: 'root' })
        export class ApiService {}
      `,
      'src/app/http-client.ts': `
        export class HttpClient {}
      `,
      'src/app/user.store.ts': `
        export class UserStore {}
      `,
      'src/app/parent.ts': `
        import { Component, inject } from '@angular/core';
        import { ApiService } from './api.service';
        import { ChildComponent } from './child';
        import { HttpClient } from './http-client';
        import { UserStore } from './user.store';

        @Component({
          standalone: true,
          imports: [ChildComponent],
          providers: [UserStore],
          template: '',
        })
        export class ParentComponent {
          private readonly api = inject(ApiService);
          private readonly http = inject(HttpClient);
        }
      `,
    });

    transformSourceFile(getFixtureSourceFile(project, 'src/app/child.ts'));
    const parentSourceFile = getFixtureSourceFile(project, 'src/app/parent.ts');
    const result = transformSourceFile(parentSourceFile);
    const output = parentSourceFile.getFullText();

    expect(result.changed).toBe(true);
    expect(output).toMatch(
      /import \{[^}]*type GetDeps[^}]*type GetPublicComponentProperties[^}]*\} from ['"]@craft-ng\/core['"];/,
    );
    expect(output).toMatch(
      /import \{[^}]*ChildComponent[^}]*GenDeps_ChildComponent[^}]*\} from ['"]\.\/child['"];/,
    );
    expect(output).toContain('export type GenDeps_ParentComponent = GetDeps<{');
    expect(output).toContain(
      'publicProperties: GetPublicComponentProperties<ParentComponent>;',
    );
    expect(output).toContain('GenDeps_ChildComponent: GenDeps_ChildComponent;');
    expect(output).toContain('ApiService: ApiService;');
    expect(output).toContain('HttpClient: HttpClient;');
    expect(output).toMatch(/provided: \{\s+UserStore: UserStore;\s+\};/m);
    expect(output).toMatch(
      /missingProvider: \{\s+HttpClient: HttpClient;\s+\};/m,
    );
    expect(output).not.toContain(
      'missingProvider: {\n    ApiService: ApiService;\n  };',
    );
  });

  it('migrates legacy brandAngularSymbol exports to exported classes plus GenDeps types', async () => {
    const project = await createProjectFixture({
      'src/angular-core.d.ts': `
        declare module '@angular/core' {
          export declare function Component(metadata: unknown): ClassDecorator;
        }
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        @Component({
          standalone: true,
          template: '',
        })
        class DemoComponent {}

        export default brandAngularSymbol(DemoComponent, deps({
          injected: [],
          importDeps: [],
          providers: [],
        }));
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toMatch(
      /import \{[^}]*type GetDeps[^}]*type GetPublicComponentProperties[^}]*\} from ['"]@craft-ng\/core['"];/,
    );
    expect(output).not.toContain('brandAngularSymbol');
    expect(output).not.toContain('deps({');
    expect(output).toContain('export default class DemoComponent {}');
    expect(output).toContain('export type GenDeps_DemoComponent = GetDeps<{');
    expect(output).toContain(
      'publicProperties: GetPublicComponentProperties<DemoComponent>;',
    );
  });

  it('matches injectX and provideX helpers on the same derived key', async () => {
    const project = await createProjectFixture({
      'src/angular-core.d.ts': `
        declare module '@angular/core' {
          export declare function Component(metadata: unknown): ClassDecorator;
        }
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';

        class UserStore {}

        function injectUserStore() {
          return {} as UserStore;
        }

        function provideUserStore() {
          return [] as unknown[];
        }

        @Component({
          standalone: true,
          providers: [provideUserStore()],
          template: '',
        })
        export class DemoComponent {
          protected readonly store = injectUserStore();
        }
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toContain('UserStore: ReturnType<typeof injectUserStore>;');
    expect(output).toContain('UserStore: ReturnType<typeof provideUserStore>;');
    expect(output).not.toContain('missingProvider: {};');
  });

  it('tracks craft-service helpers by source service and derived exposed properties', async () => {
    const project = await createProjectFixture({
      'src/angular-core.d.ts': `
        declare module '@angular/core' {
          export declare function Component(metadata: unknown): ClassDecorator;
          export declare function input<T>(): T;
        }
        declare module '@angular/router' {
          export declare class Router {
            navigate(commands: unknown[]): void;
          }
        }
      `,
      'src/craft-ng-core.d.ts': `
        declare module '@craft-ng/core' {
          export declare function craftService(...args: any[]): any;
          export declare function toCraftService(...args: any[]): any;
          export type DerivedService<T, U> = T & U;
          export type GetDeps<T> = T;
          export type GetInjectedServiceDependencies<T> = T;
          export type GetPublicComponentProperties<T> = T;
          export type GetServiceOutput<T> = T;
        }
      `,
      'src/app/api.service.ts': `
        import { craftService } from '@craft-ng/core';

        export const { injectApiService } = craftService(
          { name: 'ApiService', scope: 'global' },
          () => ({
            getItemById: async (userId: string) => ({ id: userId }),
          }),
        );
      `,
      'src/app/demo.ts': `
        import { Component, input } from '@angular/core';
        import { Router } from '@angular/router';
        import { injectApiService } from './api.service';
        import { toCraftService } from '@craft-ng/core';

        const { injectRouter } = toCraftService({
          name: 'Router',
          scope: 'global',
          token: Router,
        });

        @Component({
          standalone: true,
          template: '',
        })
        export class DemoComponent {
          readonly userId = input<string>();
          private readonly apiService = injectApiService();
          private readonly router = injectRouter(undefined, ({ navigate }) => ({
            navigate,
          }));
        }
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toContain(
      'ApiService: GetInjectedServiceDependencies<typeof injectApiService>;',
    );
    expect(output).toContain(
      'publicProperties: GetPublicComponentProperties<DemoComponent>;',
    );
    expect(output).toContain(
      'Router: DerivedService<GetInjectedServiceDependencies<typeof injectRouter>, {',
    );
    expect(output).toContain(
      `navigate: GetServiceOutput<typeof injectRouter>["navigate"];`,
    );
    expect(output).not.toContain('missingProvider: {};');
  });

  it('adds Router to generated deps when RouterModule is used in component imports', async () => {
    const project = await createRouterMetadataProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { RouterModule } from '@angular/router';

        @Component({
          standalone: true,
          imports: [RouterModule],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toMatch(
      /import \{[^}]*type Router[^}]*\} from ['"]@angular\/router['"];/,
    );
    expect(output).toContain('RouterModule: RouterModule;');
    expect(output).toContain('Router: Router;');
    expect(output).toMatch(/missingProvider: \{[\s\S]*Router: Router;/);
  });

  it('adds Router to generated deps when standalone router declarables are used in metadata imports', async () => {
    const project = await createRouterMetadataProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { RouterOutlet } from '@angular/router';

        @Component({
          standalone: true,
          imports: [RouterOutlet],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toContain('RouterOutlet: RouterOutlet;');
    expect(output).toContain('Router: Router;');
    expect(output).toMatch(/missingProvider: \{[\s\S]*Router: Router;/);
  });

  it('emits Router only once when multiple router metadata imports are present', async () => {
    const project = await createRouterMetadataProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { RouterModule, RouterOutlet } from '@angular/router';

        @Component({
          standalone: true,
          imports: [RouterModule, RouterOutlet],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toContain('RouterModule: RouterModule;');
    expect(output).toContain('RouterOutlet: RouterOutlet;');
    expect(output.match(/Router: Router;/g) ?? []).toHaveLength(2);
  });

  it('does not add Router for non-router metadata imports', async () => {
    const project = await createRouterMetadataProjectFixture({
      'src/app/child.ts': `
        import { Component } from '@angular/core';

        @Component({
          standalone: true,
          template: '',
        })
        export class ChildComponent {}
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { ChildComponent } from './child';

        @Component({
          standalone: true,
          imports: [ChildComponent],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    transformSourceFile(getFixtureSourceFile(project, 'src/app/child.ts'));
    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toContain('GenDeps_ChildComponent: GenDeps_ChildComponent;');
    expect(output).not.toContain('Router: Router;');
    expect(output).not.toContain('type Router');
  });

  it('suppresses missingProvider.Router when Router is already provided locally', async () => {
    const project = await createRouterMetadataProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { Router, RouterModule } from '@angular/router';

        @Component({
          standalone: true,
          imports: [RouterModule],
          providers: [Router],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(output).toMatch(
      /import \{[^}]*Router[^}]*\} from ['"]@angular\/router['"];/,
    );
    expect(output).not.toContain('type Router');
    expect(output).toContain('Router: Router;');
    expect(output).toMatch(/provided: \{[\s\S]*Router: Router;/);
    expect(output).not.toMatch(/missingProvider: \{[\s\S]*Router: Router;/);
  });
});

async function createProjectFixture(
  files: Record<string, string>,
): Promise<Project> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'angular-brand-codemod-'));
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          experimentalDecorators: true,
          module: 'preserve',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts', 'src/**/*.d.ts'],
      },
      null,
      2,
    ),
    ...files,
  });

  return new Project({
    skipAddingFilesFromTsConfig: false,
    tsConfigFilePath: join(tempDirectory, 'tsconfig.json'),
  });
}

async function createRouterMetadataProjectFixture(
  files: Record<string, string>,
): Promise<Project> {
  return createProjectFixture({
    'src/angular-core.d.ts': `
      declare module '@angular/core' {
        export declare function Component(metadata: unknown): ClassDecorator;
      }
    `,
    'src/angular-router.d.ts': `
      declare module '@angular/router' {
        export declare class Router {
          navigate(commands: unknown[]): void;
        }
        export declare class RouterModule {}
        export declare class RouterOutlet {}
      }
    `,
    ...files,
  });
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

function getFixtureSourceFile(project: Project, relativePath: string) {
  return project
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().endsWith(relativePath))!;
}
