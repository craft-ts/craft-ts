import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const provideHostNameMatchComponentRule = require('./provide-host-name-match-component.cjs');

const tempDirectories: string[] = [];

describe('provide-host-name-match-component', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts classes already providing matching host names', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { Component, Directive } from '@angular/core';
        import { provideHostName } from '@craft-ts/core';

        @Component({
          standalone: true,
          providers: [provideHostName('component:DemoComponent')],
          template: '',
        })
        export class DemoComponent {}

        @Directive({
          selector: '[demoDirective]',
          standalone: true,
          providers: [provideHostName('directive:DemoDirective')],
        })
        export class DemoDirective {}
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports and autofixes missing providers on a component', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { Component } from '@angular/core';

        @Component({
          standalone: true,
          template: '',
        })
        export class DemoComponent {}
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "DemoComponent must include provideHostName('component:DemoComponent') in providers.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "import { provideHostName } from '@craft-ts/core';",
    );
    expect(output).toContain(
      "providers: [provideHostName('component:DemoComponent')]",
    );
  });

  it('reports and autofixes mismatched host name', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { provideHostName } from '@craft-ts/core';

        @Component({
          standalone: true,
          providers: [provideHostName('WrongName')],
          template: '',
        })
        export class DemoComponent {}
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "DemoComponent must include provideHostName('component:DemoComponent') in providers.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "providers: [provideHostName('component:DemoComponent')],",
    );
    expect(output).not.toContain("provideHostName('WrongName')");
  });

  it('reports and autofixes a directive without providers', async () => {
    const fixture = {
      'src/app/demo.directive.ts': `
        import { Directive } from '@angular/core';

        @Directive({
          selector: '[demoDirective]',
          standalone: true,
        })
        export class DemoDirective {}
      `,
    };

    const { messages } = await lintFixture(fixture, {
      filePath: 'src/app/demo.directive.ts',
    });
    expect(messages).toEqual([
      "DemoDirective must include provideHostName('directive:DemoDirective') in providers.",
    ]);

    const { output } = await lintFixture(fixture, {
      filePath: 'src/app/demo.directive.ts',
      fix: true,
    });
    expect(output).toContain(
      "import { provideHostName } from '@craft-ts/core';",
    );
    expect(output).toContain(
      "providers: [provideHostName('directive:DemoDirective')]",
    );
  });

  it('appends provideHostName when providers already exist', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { Component } from '@angular/core';
        import { provideApi } from '@craft-ts/core';

        @Component({
          standalone: true,
          providers: [provideApi()],
          template: '',
        })
        export class DemoComponent {}
      `,
    };

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "import { provideApi, provideHostName } from '@craft-ts/core';",
    );
    expect(output).toContain(
      "providers: [provideApi(), provideHostName('component:DemoComponent')],",
    );
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { filePath?: string; fix?: boolean } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'provide-host-name-match-component-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const outputPath = options.filePath ?? 'src/app/demo.ts';

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
    'src/angular-core.d.ts': `
      declare module '@angular/core' {
        export declare function Component(options: unknown): ClassDecorator;
        export declare function Directive(options: unknown): ClassDecorator;
      }
    `,
    'src/craft-core.d.ts': `
      declare module '@craft-ts/core' {
        export declare function provideHostName(name: string): unknown;
        export declare function provideApi(): unknown;
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
              'provide-host-name-match-component':
                provideHostNameMatchComponentRule as never,
            },
          },
        },
        rules: {
          'local/provide-host-name-match-component': 'error',
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
    output: await readFile(join(tempDirectory, outputPath), 'utf8'),
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
