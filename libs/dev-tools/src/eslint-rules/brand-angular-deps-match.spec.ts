import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const brandAngularDepsMatchRule = require('./brand-angular-deps-match.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/match-component-deps', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
    );
  });

  it('accepts matching deps groups', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component, inject } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        class ApiService {}

        function provideDemo() {
          return [];
        }

        @Component({
          imports: [CommonModule],
          providers: [provideDemo()],
        })
        class DemoComponent {
          private api = inject(ApiService);
        }

        export default brandAngularSymbol(DemoComponent, deps({
          injected: [ApiService],
          importDeps: [CommonModule],
          providers: [provideDemo],
        }));
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports injected mismatches', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component, inject } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        class ApiService {}

        @Component({
          imports: [CommonModule],
        })
        class DemoComponent {
          private api = inject(ApiService);
        }

        export default brandAngularSymbol(DemoComponent, deps({
          injected: [],
          importDeps: [CommonModule],
          providers: [],
        }));
      `,
    });

    expect(messages).toEqual([
      'deps.injected does not match the Angular symbol. Expected [ApiService] but found [].',
    ]);
  });

  it('reports importDeps mismatches for inject-prefixed helpers', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { CommonModule } from '@angular/common';
        import { Component } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        @Component({
          imports: [CommonModule],
        })
        class DemoComponent {
          private api = injectApiService();
        }

        export default brandAngularSymbol(DemoComponent, deps({
          injected: [injectApiService],
          importDeps: [],
          providers: [],
        }));
      `,
    });

    expect(messages).toEqual([
      'deps.importDeps does not match the Angular symbol. Expected [CommonModule] but found [].',
    ]);
  });

  it('reports provider mismatches', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        function provideDemo() {
          return [];
        }

        @Component({
          providers: [provideDemo()],
        })
        class DemoComponent {}

        export default brandAngularSymbol(DemoComponent, deps({
          injected: [],
          importDeps: [],
          providers: [],
        }));
      `,
    });

    expect(messages).toEqual([
      'deps.providers does not match the Angular symbol. Expected [provideDemo] but found [].',
    ]);
  });

  it('reports invalid deps shapes', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { brandAngularSymbol, deps } from '@craft-ng/core';

        @Component({})
        class DemoComponent {}

        export default brandAngularSymbol(DemoComponent, deps([]));
      `,
    });

    expect(messages).toEqual([
      'deps(...) must be called with an object literal.',
    ]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'brand-angular-deps-rule-'));
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
