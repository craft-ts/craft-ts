import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireComponentMonitoringRule = require('./require-component-monitoring.cjs');

const tempDirectories: string[] = [];

describe('require-component-monitoring', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a component that has _monitoring = componentMonitoring()', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.component.ts': `
        import { Component } from '@angular/core';
        import { componentMonitoring } from '@craft-ng/core';

        @Component({ selector: 'app-demo', template: '' })
        export class DemoComponent {
          private readonly _monitoring = componentMonitoring();
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports a component missing componentMonitoring', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.component.ts': `
        import { Component } from '@angular/core';

        @Component({ selector: 'app-demo', template: '' })
        export class DemoComponent {
          readonly count = 0;
        }
      `,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('DemoComponent');
  });

  it('reports a directive missing componentMonitoring', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.directive.ts': `
        import { Directive } from '@angular/core';

        @Directive({ selector: '[appDemo]' })
        export class DemoDirective {}
      `,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('DemoDirective');
  });

  it('ignores non-Angular classes', async () => {
    const { messages } = await lintFixture({
      'src/app/helper.ts': `
        export class HelperService {
          doSomething() {}
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('auto-fixes by inserting _monitoring as first property', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.component.ts': `
          import { Component } from '@angular/core';

          @Component({ selector: 'app-demo', template: '' })
          export class DemoComponent {
            readonly count = 0;
          }
        `,
      },
      { fix: true },
    );

    expect(output).toContain('_monitoring = componentMonitoring()');
    expect(output).toContain('componentMonitoring');
  });

  it('auto-fix adds componentMonitoring import when missing', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.component.ts': `
          import { Component } from '@angular/core';

          @Component({ selector: 'app-demo', template: '' })
          export class DemoComponent {}
        `,
      },
      { fix: true },
    );

    expect(output).toContain("from '@craft-ng/core'");
    expect(output).toContain('componentMonitoring');
  });

  it('auto-fix adds componentMonitoring to existing @craft-ng/core import', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.component.ts': `
          import { Component } from '@angular/core';
          import { craftMethod } from '@craft-ng/core';

          @Component({ selector: 'app-demo', template: '' })
          export class DemoComponent {}
        `,
      },
      { fix: true },
    );

    expect(output).toContain('craftMethod');
    expect(output).toContain('componentMonitoring');
    const importCount = (output?.match(/@craft-ng\/core/g) ?? []).length;
    expect(importCount).toBe(1);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean; filePath?: string } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'require-component-monitoring-rule-'),
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
      declare module '@craft-ng/core' {
        export declare function componentMonitoring(): void;
        export declare function craftMethod(...args: unknown[]): unknown;
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
              'require-component-monitoring':
                requireComponentMonitoringRule as never,
            },
          },
        },
        rules: {
          'local/require-component-monitoring': 'error',
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
