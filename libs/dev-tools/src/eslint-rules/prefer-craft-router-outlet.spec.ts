import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftRouterOutletRule = require('./prefer-craft-router-outlet.cjs');

const tempDirectories: string[] = [];

describe('prefer-craft-router-outlet', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts CraftRouterOutlet / <craft-router-outlet>', async () => {
    const { messages } = await lintFixture({
      'src/app/app.ts': `
        import { Component } from '@angular/core';
        import { CraftRouterOutlet } from '@craft-ng/core';

        @Component({
          selector: 'app-root',
          imports: [CraftRouterOutlet],
          template: '<craft-router-outlet></craft-router-outlet>',
        })
        export class App {}
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports the RouterOutlet import from @angular/router', async () => {
    const { messages } = await lintFixture({
      'src/app/app.ts': `
        import { Component } from '@angular/core';
        import { RouterOutlet } from '@angular/router';

        @Component({
          selector: 'app-root',
          imports: [RouterOutlet],
          template: '<router-outlet></router-outlet>',
        })
        export class App {}
      `,
    });

    expect(messages.length).toBe(1);
  });

  it('ignores files without RouterOutlet or <router-outlet>', async () => {
    const { messages } = await lintFixture({
      'src/app/helper.ts': `
        export const value = 1;
      `,
    });

    expect(messages).toEqual([]);
  });

  it('auto-fixes the import, usages and template tag', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.ts': `
          import { Component } from '@angular/core';
          import { RouterOutlet } from '@angular/router';

          @Component({
            selector: 'app-root',
            imports: [RouterOutlet],
            template: '<router-outlet></router-outlet>',
          })
          export class App {}
        `,
      },
      { fix: true },
    );

    expect(output).toContain("import { CraftRouterOutlet } from '@craft-ng/core'");
    expect(output).toContain('imports: [CraftRouterOutlet]');
    expect(output).toContain('<craft-router-outlet></craft-router-outlet>');
    expect(output).not.toContain("from '@angular/router'");
    expect(output).not.toMatch(/<router-outlet/);
  });

  it('keeps other @angular/router named imports', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.ts': `
          import { Component } from '@angular/core';
          import { RouterLink, RouterOutlet } from '@angular/router';

          @Component({
            selector: 'app-root',
            imports: [RouterLink, RouterOutlet],
            template: '<router-outlet></router-outlet>',
          })
          export class App {}
        `,
      },
      { fix: true },
    );

    expect(output).toContain('RouterLink');
    expect(output).toContain("from '@angular/router'");
    expect(output).toContain('CraftRouterOutlet');
  });

  it('adds CraftRouterOutlet to an existing @craft-ng/core import', async () => {
    const { output } = await lintFixture(
      {
        'src/app/app.ts': `
          import { Component } from '@angular/core';
          import { RouterOutlet } from '@angular/router';
          import { componentMonitoring } from '@craft-ng/core';

          @Component({
            selector: 'app-root',
            imports: [RouterOutlet],
            template: '<router-outlet></router-outlet>',
          })
          export class App {}
        `,
      },
      { fix: true },
    );

    expect(output).toContain('componentMonitoring');
    expect(output).toContain('CraftRouterOutlet');
    const craftImportCount = (output?.match(/@craft-ng\/core/g) ?? []).length;
    expect(craftImportCount).toBe(1);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean; filePath?: string } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-router-outlet-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const outputPath = options.filePath ?? Object.keys(files)[0];

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          module: 'preserve',
          strict: true,
          target: 'ES2022',
          experimentalDecorators: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    'src/craft-core.d.ts': `
      declare module '@angular/router' {
        export declare class RouterOutlet {}
        export declare class RouterLink {}
      }
      declare module '@craft-ng/core' {
        export declare class CraftRouterOutlet {}
        export declare function componentMonitoring(): void;
      }
    `,
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
              'prefer-craft-router-outlet': preferCraftRouterOutletRule as never,
            },
          },
        },
        rules: {
          'local/prefer-craft-router-outlet': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  if (options.fix) {
    await ESLint.outputFixes(results);
  }

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: await readFile(join(tempDirectory, outputPath), 'utf8').catch(
      () => undefined,
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
