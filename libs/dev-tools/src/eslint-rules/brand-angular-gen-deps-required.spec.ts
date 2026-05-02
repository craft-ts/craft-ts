import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const brandAngularGenDepsRequiredRule = require('./brand-angular-gen-deps-required.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-gen-deps-required', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports and autofixes missing GenDeps aliases for components', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component, inject } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicComponentProperties,
        } from '@craft-ng/core';

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
    } satisfies Record<string, string>;

    const { messages } = await lintFixture(fixture);

    expect(messages).toEqual([
      'GenDeps_DemoComponent is missing. Run ESLint --fix on this file or craft-brand --root <source-root> to generate it.',
    ]);

    const { output } = await lintFixture(fixture, { fix: true });

    expect(output).toContain('export type GenDeps_DemoComponent = GetDeps<{');
    expect(output).toContain('CommonModule: CommonModule;');
    expect(output).toContain('ApiService: ApiService;');
    expect(output).toContain('propertiesDeps: {');
    expect(output).toContain(
      'publicProperties: GetPublicComponentProperties<DemoComponent>;',
    );
  });

  it('reports and autofixes missing GenDeps aliases for directives', async () => {
    const fixture = {
      'src/app/demo.directive.ts': `
        import { Directive, inject } from '@angular/core';
        import {
          type GetDeps,
          type GetPublicDirectiveProperties,
        } from '@craft-ng/core';

        class ApiService {}

        @Directive({
          selector: '[appDemo]',
          standalone: true,
        })
        export class DemoDirective {
          private readonly api = inject(ApiService);
        }
      `,
    } satisfies Record<string, string>;

    const { messages } = await lintFixture(fixture);

    expect(messages).toEqual([
      'GenDeps_DemoDirective is missing. Run ESLint --fix on this file or craft-brand --root <source-root> to generate it.',
    ]);

    const { output } = await lintFixture(fixture, {
      filePath: 'src/app/demo.directive.ts',
      fix: true,
    });

    expect(output).toContain('export type GenDeps_DemoDirective = GetDeps<{');
    expect(output).toContain('ApiService: ApiService;');
  });

  it('ignores files without Angular component metadata', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        export class DemoComponent {}
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: {
    filePath?: string;
    fix?: boolean;
  } = {},
): Promise<{
  messages: string[];
  output: string | undefined;
}> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'brand-angular-gen-deps-required-rule-'),
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
              'gen-deps-required': brandAngularGenDepsRequiredRule as never,
            },
          },
        },
        rules: {
          'local/gen-deps-required': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  if (options.fix) {
    await ESLint.outputFixes(results);
  }

  const outputPath = options.filePath ?? 'src/app/demo.ts';
  const output = files[outputPath]
    ? await readFile(join(tempDirectory, outputPath), 'utf8')
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
        export type ExtractDeps<T> = T;
        export type GetDeps<T> = T;
        export type GetPublicComponentProperties<T> = T;
        export type GetPublicDirectiveProperties<T> = T;
        export type GetPublicPipeProperties<T> = T;
      }
    `,
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
