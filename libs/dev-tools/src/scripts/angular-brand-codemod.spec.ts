import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import {
  discoverAngularBrandConfigFilePath,
  loadAngularBrandConfigFromFile,
  transformSourceFile,
} from './angular-brand-codemod';

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
    expect(output).toContain('propertiesDeps: {');
    expect(output).toContain('api: {');
    expect(output).toContain('ApiService: ApiService;');
    expect(output).toContain('http: {');
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
    expect(output).toContain('propertiesDeps: {};');
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

    expect(output).toContain('propertiesDeps: {');
    expect(output).toContain('store: {');
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
          export type ExtractDeps<T> = T;
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

    expect(output).toContain('propertiesDeps: {');
    expect(output).toContain('userId: ExtractDeps<DemoComponent["userId"]>;');
    expect(output).toContain('apiService: {');
    expect(output).toContain(
      'ApiService: ExtractDeps<typeof injectApiService>["ApiService"];',
    );
    expect(output).toContain(
      'publicProperties: GetPublicComponentProperties<DemoComponent>;',
    );
    expect(output).toContain(
      'Router: DerivedService<ExtractDeps<typeof injectRouter>["Router"], {',
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

  it('emits a lint-safe FormField type when FormField is imported in metadata imports', async () => {
    const project = await createSignalFormsMetadataProjectFixture({
      'src/app/status.component.ts': `
        import { Component } from '@angular/core';

        @Component({
          standalone: true,
          template: '',
        })
        export class StatusComponent {}
      `,
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component } from '@angular/core';
        import { FormField } from '@angular/forms/signals';
        import { StatusComponent } from './status.component';

        @Component({
          standalone: true,
          imports: [CommonModule, StatusComponent, FormField],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    transformSourceFile(
      getFixtureSourceFile(project, 'src/app/status.component.ts'),
    );
    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();
    const depsSection = extractGeneratedSection(output, 'deps');

    expect(depsSection).toContain('CommonModule: CommonModule;');
    expect(depsSection).toContain(
      'GenDeps_StatusComponent: GenDeps_StatusComponent;',
    );
    expect(depsSection).toContain('FormField: FormField<never>;');
    expect(depsSection).toMatch(
      /CommonModule: CommonModule;[\s\S]*GenDeps_StatusComponent: GenDeps_StatusComponent;[\s\S]*FormField: FormField<never>;/,
    );
    expect(output).not.toContain('type FormField');
  });

  it('emits CraftFieldDirective<unknown> and suppresses GenDeps_CraftFieldDirective when CraftFieldDirective is imported in metadata imports', async () => {
    const project = await createCraftFieldDirectiveMetadataProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { CraftFieldDirective } from '@craft-ng/core';

        @Component({
          standalone: true,
          imports: [CraftFieldDirective],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();
    const depsSection = extractGeneratedSection(output, 'deps');

    expect(depsSection).toContain(
      'CraftFieldDirective: CraftFieldDirective<unknown>;',
    );
    expect(depsSection).not.toContain('GenDeps_CraftFieldDirective');
    expect(output).not.toContain('type CraftFieldDirective');
  });

  it('applies inline project config rules for metadata imports', async () => {
    const project = await createTranslateProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile, {
      config: {
        importAugmentations: [
          {
            match: {
              module: '@ngx-translate/core',
              symbols: ['TranslatePipe'],
              metadata: ['imports'],
            },
            deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
            missingProvider: [
              { key: 'TranslateService', symbol: 'TranslateService' },
            ],
          },
        ],
      },
    });
    const output = sourceFile.getFullText();

    expect(output).toMatch(
      /import \{[^}]*TranslatePipe[^}]*type TranslateService[^}]*\} from ['"]@ngx-translate\/core['"];/,
    );
    expect(extractGeneratedSection(output, 'deps')).toContain(
      'TranslateService: TranslateService;',
    );
    expect(extractGeneratedSection(output, 'missingProvider')).toContain(
      'TranslateService: TranslateService;',
    );
  });

  it('auto-discovers craft-brand.config.ts from the source file directory', async () => {
    const project = await createTranslateProjectFixture({
      'craft-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@ngx-translate/core',
                symbols: ['TranslatePipe'],
                metadata: ['imports'],
              },
              deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
              missingProvider: [
                { key: 'TranslateService', symbol: 'TranslateService' },
              ],
            },
          ],
        });
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const rootDirectory = tempDirectories[tempDirectories.length - 1]!;
    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    const discoveredPath = discoverAngularBrandConfigFilePath(
      join(rootDirectory, 'src/app'),
    );

    expect(discoveredPath).toBe(join(rootDirectory, 'craft-brand.config.ts'));

    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(extractGeneratedSection(output, 'deps')).toContain(
      'TranslateService: TranslateService;',
    );
    expect(extractGeneratedSection(output, 'missingProvider')).toContain(
      'TranslateService: TranslateService;',
    );
  });

  it('does not trigger project config rules for plain TS imports outside metadata', async () => {
    const project = await createTranslateProjectFixture({
      'craft-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@ngx-translate/core',
                symbols: ['TranslatePipe'],
                metadata: ['imports'],
              },
              deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
              missingProvider: [
                { key: 'TranslateService', symbol: 'TranslateService' },
              ],
            },
          ],
        });
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [],
          template: '',
        })
        export class DemoComponent {
          protected readonly unused = TranslatePipe;
        }
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(extractGeneratedSection(output, 'deps')).not.toContain(
      'TranslateService: TranslateService;',
    );
    expect(output).not.toContain('type TranslateService');
    expect(extractGeneratedSection(output, 'missingProvider')).toBe('');
  });

  it('supports project config rules for hostDirectives metadata', async () => {
    const project = await createProjectFixture({
      'src/angular-core.d.ts': `
        declare module '@angular/core' {
          export declare function Component(metadata: unknown): ClassDecorator;
          export declare function Directive(metadata?: unknown): ClassDecorator;
        }
      `,
      'src/acme-host.d.ts': `
        declare module '@acme/host' {
          export declare class HostFeatureDirective {}
          export declare class HostFeatureService {}
        }
      `,
      'craft-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@acme/host',
                symbols: ['HostFeatureDirective'],
                metadata: ['hostDirectives'],
              },
              deps: [{ key: 'HostFeatureService', symbol: 'HostFeatureService' }],
              missingProvider: [
                { key: 'HostFeatureService', symbol: 'HostFeatureService' },
              ],
            },
          ],
        });
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { HostFeatureDirective } from '@acme/host';

        @Component({
          standalone: true,
          hostDirectives: [HostFeatureDirective],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(extractGeneratedSection(output, 'deps')).toContain(
      'HostFeatureService: HostFeatureService;',
    );
    expect(extractGeneratedSection(output, 'missingProvider')).toContain(
      'HostFeatureService: HostFeatureService;',
    );
  });

  it('deduplicates project config entries when several metadata symbols match the same rule', async () => {
    const project = await createTranslateProjectFixture({
      'craft-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@ngx-translate/core',
                metadata: ['imports', 'hostDirectives'],
              },
              deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
              missingProvider: [
                { key: 'TranslateService', symbol: 'TranslateService' },
              ],
            },
          ],
        });
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import {
          TranslateDirective,
          TranslatePipe,
        } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          hostDirectives: [TranslateDirective],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(
      output.match(/TranslateService: TranslateService;/g) ?? [],
    ).toHaveLength(2);
    expect(output.match(/type TranslateService/g) ?? []).toHaveLength(1);
  });

  it('removes configured missing providers when the key is already provided locally', async () => {
    const project = await createTranslateProjectFixture({
      'craft-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@ngx-translate/core',
                symbols: ['TranslatePipe'],
                metadata: ['imports'],
              },
              deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
              missingProvider: [
                { key: 'TranslateService', symbol: 'TranslateService' },
              ],
            },
          ],
        });
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe, TranslateService } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          providers: [TranslateService],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile);
    const output = sourceFile.getFullText();

    expect(extractGeneratedSection(output, 'deps')).toContain(
      'TranslateService: TranslateService;',
    );
    expect(extractGeneratedSection(output, 'provided')).toContain(
      'TranslateService: TranslateService;',
    );
    expect(extractGeneratedSection(output, 'missingProvider')).not.toContain(
      'TranslateService: TranslateService;',
    );
  });

  it('adds type imports for configured missingProvider-only entries', async () => {
    const project = await createTranslateProjectFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');
    transformSourceFile(sourceFile, {
      config: {
        importAugmentations: [
          {
            match: {
              module: '@ngx-translate/core',
              symbols: ['TranslatePipe'],
              metadata: ['imports'],
            },
            missingProvider: [
              { key: 'TranslateService', symbol: 'TranslateService' },
            ],
          },
        ],
      },
    });
    const output = sourceFile.getFullText();

    expect(output).toMatch(
      /import \{[^}]*TranslatePipe[^}]*type TranslateService[^}]*\} from ['"]@ngx-translate\/core['"];/,
    );
    expect(extractGeneratedSection(output, 'deps')).not.toContain(
      'TranslateService: TranslateService;',
    );
    expect(extractGeneratedSection(output, 'missingProvider')).toContain(
      'TranslateService: TranslateService;',
    );
  });

  it('throws a clear error for invalid project config files', async () => {
    const project = await createTranslateProjectFixture({
      'craft-brand.config.ts': `
        export default 42;
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');

    expect(() => transformSourceFile(sourceFile)).toThrow(
      /Invalid Angular brand config at ".*craft-brand\.config\.ts": Expected the default export to be an object\./,
    );
  });

  it('prefers an explicit configFilePath over auto-discovery', async () => {
    const project = await createTranslateProjectFixture({
      'craft-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@ngx-translate/core',
                symbols: ['TranslatePipe'],
                metadata: ['imports'],
              },
              deps: [{ key: 'WrongService', symbol: 'WrongService' }],
            },
          ],
        });
      `,
      'custom-brand.config.ts': `
        import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

        export default defineAngularBrandConfig({
          importAugmentations: [
            {
              match: {
                module: '@ngx-translate/core',
                symbols: ['TranslatePipe'],
                metadata: ['imports'],
              },
              deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
            },
          ],
        });
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          template: '',
        })
        export class DemoComponent {}
      `,
    });

    const rootDirectory = tempDirectories[tempDirectories.length - 1]!;
    const explicitConfig = loadAngularBrandConfigFromFile(
      join(rootDirectory, 'custom-brand.config.ts'),
    );
    const sourceFile = getFixtureSourceFile(project, 'src/app/demo.ts');

    transformSourceFile(sourceFile, {
      configFilePath: join(rootDirectory, 'custom-brand.config.ts'),
    });
    const output = sourceFile.getFullText();

    expect(explicitConfig.importAugmentations).toHaveLength(1);
    expect(extractGeneratedSection(output, 'deps')).toContain(
      'TranslateService: TranslateService;',
    );
    expect(extractGeneratedSection(output, 'deps')).not.toContain(
      'WrongService: WrongService;',
    );
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

async function createTranslateProjectFixture(
  files: Record<string, string>,
): Promise<Project> {
  return createProjectFixture({
    'src/angular-core.d.ts': `
      declare module '@angular/core' {
        export declare function Component(metadata: unknown): ClassDecorator;
        export declare function Directive(metadata?: unknown): ClassDecorator;
      }
    `,
    'src/ngx-translate.d.ts': `
      declare module '@ngx-translate/core' {
        export declare class TranslatePipe {}
        export declare class TranslateDirective {}
        export declare class TranslateService {}
        export declare class WrongService {}
      }
    `,
    ...files,
  });
}

async function createSignalFormsMetadataProjectFixture(
  files: Record<string, string>,
): Promise<Project> {
  return createProjectFixture({
    'src/angular-common.d.ts': `
      declare module '@angular/common' {
        export declare class CommonModule {}
      }
    `,
    'src/angular-core.d.ts': `
      declare module '@angular/core' {
        export declare function Component(metadata: unknown): ClassDecorator;
      }
    `,
    'src/angular-forms.d.ts': `
      declare module '@angular/forms/signals' {
        export declare class FormField<T> {}
      }
    `,
    ...files,
  });
}

async function createCraftFieldDirectiveMetadataProjectFixture(
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
          baseUrl: '.',
          paths: {
            '@craft-ng/core': ['src/craft-ng-core/index.ts'],
          },
        },
        include: ['src/**/*.ts', 'src/**/*.d.ts'],
      },
      null,
      2,
    ),
    'src/angular-core.d.ts': `
      declare module '@angular/core' {
        export declare function Component(metadata: unknown): ClassDecorator;
        export declare function Directive(metadata?: unknown): ClassDecorator;
      }
    `,
    'src/craft-ng-core/index.ts': `
      import { Directive } from '@angular/core';

      @Directive({
        selector: '[craftField]',
        standalone: true,
      })
      export class CraftFieldDirective<T> {}
    `,
    ...files,
  });

  return new Project({
    skipAddingFilesFromTsConfig: false,
    tsConfigFilePath: join(tempDirectory, 'tsconfig.json'),
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

function extractGeneratedSection(
  output: string,
  sectionName: 'deps' | 'provided' | 'missingProvider',
) {
  const match = output.match(
    new RegExp(`${sectionName}: \\{([\\s\\S]*?)\\n\\s+\\};`),
  );

  return match?.[1] ?? '';
}
