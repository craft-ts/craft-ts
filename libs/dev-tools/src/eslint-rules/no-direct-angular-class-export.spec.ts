import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noDirectAngularClassExportRule = require('./no-direct-angular-class-export.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/no-direct-angular-class-export', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
    );
  });

  it('accepts local Angular classes with branded default export', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        @Component({})
        class DemoComponent {}

        export default brandAngularSymbol(DemoComponent, deps({
          injected: [],
          importDeps: [],
          providers: [],
        }));
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports export class on components', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';

        @Component({})
        export class DemoComponent {}
      `,
    });

    expect(messages).toEqual([
      'Do not export @Component classes directly. Keep the class local and export default brandAngularSymbol(...).',
    ]);
  });

  it('reports export default class on directives', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Directive } from '@angular/core';

        @Directive({})
        export default class DemoDirective {}
      `,
    });

    expect(messages).toEqual([
      'Do not export @Directive classes directly. Keep the class local and export default brandAngularSymbol(...).',
    ]);
  });

  it('reports export default identifier on pipes', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Pipe } from '@angular/core';

        @Pipe({ name: 'demo' })
        class DemoPipe {}

        export default DemoPipe;
      `,
    });

    expect(messages).toEqual([
      'Do not export @Pipe classes directly. Use export default brandAngularSymbol(DemoPipe, deps(...)).',
    ]);
  });

  it('reports named exports on injectables', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Injectable } from '@angular/core';

        @Injectable()
        class DemoService {}

        export { DemoService };
      `,
    });

    expect(messages).toEqual([
      'Do not export @Injectable classes directly. Keep DemoService local and export the branded symbol instead.',
    ]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'no-direct-angular-export-rule-'));
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
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    ...files,
  });

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
              'no-direct-angular-class-export': noDirectAngularClassExportRule as never,
            },
          },
        },
        rules: {
          'local/no-direct-angular-class-export': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) => result.messages.map((message) => message.message));
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
