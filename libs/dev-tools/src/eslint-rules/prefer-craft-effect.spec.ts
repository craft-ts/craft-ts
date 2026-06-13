import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftEffectRule = require('./prefer-craft-effect.cjs');

const MESSAGE =
  "Angular effect() is forbidden. Use craftEffect('name', ...) from @craft-ng/core instead for observability and host name tracking.";

const tempDirectories: string[] = [];

describe('prefer-craft-effect', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports both the effect import and its usage', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { effect } from '@angular/core';

        export class DemoComponent {
          readonly log = effect(() => console.log('tick'));
        }
      `,
    });

    // One report on the forbidden import specifier, one on the call usage.
    expect(messages).toEqual([MESSAGE, MESSAGE]);
  });

  it('does not report effect() from other libraries', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { effect } from 'some-other-lib';

        const log = effect(() => {});
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report craftEffect()', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftEffect } from '@craft-ng/core';

        const log = craftEffect('log', () => {});
      `,
    });

    expect(messages).toEqual([]);
  });

  it('autofixes effect() to craftEffect() with the derived name and rewrites the import', async () => {
    const { output } = await lintFixture(
      {
        'src/app/demo.ts': `
        import { effect } from '@angular/core';

        export class DemoComponent {
          readonly log = effect(() => console.log('tick'));
        }
      `,
      },
      { fix: true },
    );

    expect(output).toContain("import { craftEffect } from '@craft-ng/core';");
    expect(output).not.toContain('@angular/core');
    expect(output).toContain(
      "readonly log = craftEffect('log', () => console.log('tick'));",
    );
  });

  it('does not autofix effect() used as a bare statement (no derivable name)', async () => {
    const { output, messages } = await lintFixture(
      {
        'src/app/demo.ts': `
        import { effect } from '@angular/core';

        export function setup() {
          effect(() => console.log('tick'));
        }
      `,
      },
      { fix: true },
    );

    // Import report (still autofixed) + usage report (no name to derive).
    expect(messages).toEqual([MESSAGE, MESSAGE]);
    expect(output).toContain("effect(() => console.log('tick'));");
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-effect-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
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
              'prefer-craft-effect': preferCraftEffectRule as never,
            },
          },
        },
        rules: {
          'local/prefer-craft-effect': 'warn',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: results
      .map((result) => result.output ?? result.source ?? '')
      .join('\n'),
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
