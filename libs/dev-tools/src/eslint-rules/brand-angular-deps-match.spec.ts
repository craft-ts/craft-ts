import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const brandAngularDepsMatchRule = require('./brand-angular-deps-match.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts matching GenDeps aliases', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component, Injectable, inject } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';

        @Injectable({ providedIn: 'root' })
        class ApiService {}

        @Component({
          standalone: true,
          imports: [CommonModule],
          template: '',
        })
        export class DemoComponent {
          private readonly api = inject(ApiService);
        }

        export type GenDeps_DemoComponent = GetDeps<{
          deps: {
            CommonModule: CommonModule;
            ApiService: ApiService;
          };
          provided: {};
          publicProperties: GetPublicComponentProperties<DemoComponent>;
        }>;
      `,
    });

    expect(messages).toEqual([]);
  });

  it('ignores prettier-only formatting changes inside helper generic types', async () => {
    const { messages } = await lintFixture({
      'src/app/team-id.ts': `
        export class TeamId {}

        export function injectTeamId() {
          return {} as TeamId;
        }
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';
        import { injectTeamId } from './team-id';

        @Component({
          standalone: true,
          template: '',
        })
        export class DemoComponent {
          readonly teamId = injectTeamId();
        }

        export type GenDeps_DemoComponent = GetDeps<{
          deps: {};
          propertiesDeps: {
            teamId: {
              TeamId: ReturnType<
                typeof injectTeamId
              >;
            };
          };
          provided: {};
          publicProperties: GetPublicComponentProperties<DemoComponent>;
          missingProvider: {
            TeamId: ReturnType<
              typeof injectTeamId
            >;
          };
        }>;
      `,
    });

    expect(messages).toEqual([]);
  });

  it('ignores prettier-only quote changes in indexed access helper tracking', async () => {
    const { messages } = await lintFixture({
      'src/craft-ng-core.d.ts': `
        declare module '@craft-ng/core' {
          export declare function craftService(...args: any[]): any;
          export type DerivedService<T, U> = T & U;
          export type ExtractDeps<T> = T;
          export type GetDeps<T> = T;
          export type GetInjectedServiceDependencies<T> = T;
          export type GetPublicComponentProperties<T> = T;
          export type GetServiceOutput<T> = T;
        }
      `,
      'src/app/router.ts': `
        import { craftService } from '@craft-ng/core';

        export const { injectRouter } = craftService(
          { name: 'Router', scope: 'global' },
          () => ({
            navigate(commands: unknown[]) {
              return commands;
            },
          }),
        );
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import {
          type DerivedService,
          type ExtractDeps,
          type GetDeps,
          type GetPublicComponentProperties,
          type GetServiceOutput,
        } from '@craft-ng/core';
        import { injectRouter } from './router';

        @Component({
          standalone: true,
          template: '',
        })
        export class DemoComponent {
          readonly router = injectRouter(undefined, ({ navigate }) => ({
            navigate,
          }));
        }

        export type GenDeps_DemoComponent = GetDeps<{
          deps: {};
          propertiesDeps: {
            router: {
              Router: DerivedService<
                ExtractDeps<typeof injectRouter>['Router'],
                {
                  derivedPropertiesUsed: {
                    navigate: GetServiceOutput<typeof injectRouter>['navigate'];
                  };
                  derivedPropertiesExposed: {
                    navigate: GetServiceOutput<typeof injectRouter>['navigate'];
                  };
                }
              >;
            };
          };
          provided: {};
          publicProperties: GetPublicComponentProperties<DemoComponent>;
        }>;
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports stale deps, provided, and missingProvider sections and autofixes the file', async () => {
    const staleFixture = {
      'src/app/api.service.ts': `
        import { Injectable } from '@angular/core';

        @Injectable({ providedIn: 'root' })
        export class ApiService {}
      `,
      'src/app/child.ts': `
        import { Component } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';

        @Component({
          standalone: true,
          template: '',
        })
        export class ChildComponent {}

        export type GenDeps_ChildComponent = GetDeps<{
          deps: {};
          propertiesDeps: {};
          provided: {};
          publicProperties: GetPublicComponentProperties<ChildComponent>;
        }>;
      `,
      'src/app/http-client.ts': `
        export class HttpClient {}
      `,
      'src/app/user.store.ts': `
        export class UserStore {}
      `,
      'src/app/demo.ts': `
        import { Component, inject } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';
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
        export class DemoComponent {
          private readonly api = inject(ApiService);
          private readonly http = inject(HttpClient);
        }

        export type GenDeps_DemoComponent = GetDeps<{
          deps: {
            ApiService: ApiService;
          };
          propertiesDeps: {};
          provided: {};
          publicProperties: GetPublicComponentProperties<DemoComponent>;
        }>;
      `,
    } satisfies Record<string, string>;

    const { messages } = await lintFixture(staleFixture);

    expect(messages).toEqual([
      'GenDeps_DemoComponent is out of date for deps, propertiesDeps, provided, and missingProvider. Run ESLint --fix on this file or craft-brand --root <source-root> to refresh it.',
    ]);

    const { output } = await lintFixture(staleFixture, { fix: true });

    expect(output).toMatch(
      /import \{[^}]*ChildComponent[^}]*type GenDeps_ChildComponent[^}]*\} from ['"]\.\/child['"];/,
    );
    expect(output).toContain('ApiService: ApiService;');
    expect(output).toContain('GenDeps_ChildComponent: GenDeps_ChildComponent;');
    expect(output).toContain('propertiesDeps: {');
    expect(output).toContain('HttpClient: HttpClient;');
    expect(output).toContain('UserStore: UserStore;');
    expect(output).toMatch(/missingProvider: \{[\s\S]*HttpClient: HttpClient;/);
  });

  it('applies craft-brand.config.ts rules when autofixing GenDeps aliases', async () => {
    const configFixture = {
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
      'src/ngx-translate.d.ts': `
        declare module '@ngx-translate/core' {
          export declare class TranslatePipe {}
          export declare class TranslateService {}
        }
      `,
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { TranslatePipe } from '@ngx-translate/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';

        @Component({
          standalone: true,
          imports: [TranslatePipe],
          template: '',
        })
        export class DemoComponent {}

        export type GenDeps_DemoComponent = GetDeps<{
          deps: {
            TranslatePipe: TranslatePipe;
          };
          provided: {};
          publicProperties: GetPublicComponentProperties<DemoComponent>;
        }>;
      `,
    } satisfies Record<string, string>;

    const { messages: configMessages } = await lintFixture(configFixture);

    expect(configMessages).toEqual([
      'GenDeps_DemoComponent is out of date for deps, propertiesDeps, and missingProvider. Run ESLint --fix on this file or craft-brand --root <source-root> to refresh it.',
    ]);

    const { output } = await lintFixture(configFixture, { fix: true });

    expect(output).toMatch(
      /import \{[^}]*TranslatePipe[^}]*type TranslateService[^}]*\} from ['"]@ngx-translate\/core['"];/,
    );
    expect(output).toContain('TranslateService: TranslateService;');
    expect(output).toMatch(
      /missingProvider: \{[\s\S]*TranslateService: TranslateService;/,
    );
  });

  it('autofixes FormField<any> for signal forms imports', async () => {
    const staleFixture = {
      'src/angular-forms-signals.d.ts': `
        declare module '@angular/forms/signals' {
          export declare class FormField<T> {}
        }
      `,
      'src/app/status.component.ts': `
        import { Component } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';

        @Component({
          standalone: true,
          template: '',
        })
        export class StatusComponent {}

        export type GenDeps_StatusComponent = GetDeps<{
          deps: {};
          propertiesDeps: {};
          provided: {};
          publicProperties: GetPublicComponentProperties<StatusComponent>;
        }>;
      `,
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component } from '@angular/core';
        import { FormField } from '@angular/forms/signals';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';
        import { StatusComponent, type GenDeps_StatusComponent } from './status.component';

        @Component({
          standalone: true,
          imports: [CommonModule, StatusComponent, FormField],
          template: '',
        })
        export class DemoComponent {}

        export type GenDeps_DemoComponent = GetDeps<{
          deps: {
            CommonModule: CommonModule;
            GenDeps_StatusComponent: GenDeps_StatusComponent;
            FormField: FormField;
          };
          propertiesDeps: {};
          provided: {};
          publicProperties: GetPublicComponentProperties<DemoComponent>;
        }>;
      `,
    } satisfies Record<string, string>;

    const { messages } = await lintFixture(staleFixture);

    expect(messages).toEqual([
      'GenDeps_DemoComponent is out of date for deps. Run ESLint --fix on this file or craft-brand --root <source-root> to refresh it.',
    ]);

    const { output } = await lintFixture(staleFixture, { fix: true });

    expect(output).toMatch(
      /CommonModule: CommonModule;[\s\S]*GenDeps_StatusComponent: GenDeps_StatusComponent;[\s\S]*FormField: FormField<any>;/,
    );
    expect(output).toContain('FormField: FormField<any>;');
    expect(output).not.toContain('type FormField');
  });

  it('detects a desync introduced between two lint passes sharing the same project cache (ESLint server scenario)', async () => {
    const childSource = `
import { Directive } from '@angular/core';

@Directive({
  selector: '[childDirective]',
  standalone: true,
})
export class ChildDirective {}
`.trimStart();

    const syncedSource = `
import { Component } from '@angular/core';
import {
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { ChildDirective } from './child-directive';

@Component({
  standalone: true,
  imports: [ChildDirective],
  template: '',
})
export class DemoComponent {}

export type GenDeps_DemoComponent = GetDeps<{
  deps: {
    GenDeps_ChildDirective: GenDeps_ChildDirective;
  };
  propertiesDeps: {};
  provided: {};
  publicProperties: GetPublicComponentProperties<DemoComponent>;
}>;
`.trimStart();

    const tempDirectory = await setupFixtureDirectory({
      'src/app/child-directive.ts': childSource,
      'src/app/demo.ts': syncedSource,
    });

    const firstPass = await runLintInDirectory(tempDirectory);
    expect(firstPass.messages).toEqual([]);

    const desyncedSource = syncedSource.replace(
      'imports: [ChildDirective],',
      'imports: [],',
    );
    await writeFile(
      join(tempDirectory, 'src/app/demo.ts'),
      desyncedSource,
      'utf8',
    );

    const secondPass = await runLintInDirectory(tempDirectory);
    expect(secondPass.messages).toEqual([
      'GenDeps_DemoComponent is out of date for deps. Run ESLint --fix on this file or craft-brand --root <source-root> to refresh it.',
    ]);
  });

  it('ignores files without an existing GenDeps alias', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component, inject } from '@angular/core';

        class ApiService {}

        @Component({
          standalone: true,
          imports: [CommonModule],
          template: '',
        })
        export class DemoComponent {
          private readonly api = inject(ApiService);
        }
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: {
    fix?: boolean;
  } = {},
): Promise<{
  messages: string[];
  output: string | undefined;
}> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'brand-angular-deps-rule-'),
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
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: {
          local: {
            rules: {
              'match-component-deps': brandAngularDepsMatchRule as never,
            },
          },
        },
        rules: {
          'local/match-component-deps': 'error',
        },
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
    'src/angular-common.d.ts': `
      declare module '@angular/common' {
        export declare class CommonModule {}
      }
    `,
    'src/angular-core.d.ts': `
      declare module '@angular/core' {
        export declare function Component(metadata: unknown): ClassDecorator;
        export declare function Directive(metadata?: unknown): ClassDecorator;
        export declare function Pipe(metadata?: unknown): ClassDecorator;
        export declare function Injectable(metadata?: unknown): ClassDecorator;
        export declare function inject<T>(token: T): T;
      }
    `,
    'src/craft-ng-core.d.ts': `
      declare module '@craft-ng/core' {
        export type DerivedService<T, U> = T & U;
        export type ExtractDeps<T> = T;
        export type GetDeps<T> = T;
        export type GetInjectedServiceDependencies<T> = T;
        export type GetPublicComponentProperties<T> = T;
        export type GetServiceOutput<T> = T;
      }
    `,
  };
}

async function setupFixtureDirectory(
  files: Record<string, string>,
): Promise<string> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'brand-angular-deps-rule-'),
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

  return tempDirectory;
}

async function runLintInDirectory(
  tempDirectory: string,
): Promise<{ messages: string[] }> {
  const eslint = new ESLint({
    cwd: tempDirectory,
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
              'match-component-deps': brandAngularDepsMatchRule as never,
            },
          },
        },
        rules: {
          'local/match-component-deps': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
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
