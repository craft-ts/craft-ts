import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const craftMethodNameMatchRule = require('./craft-method-name-match.cjs');

const tempDirectories: string[] = [];

describe('craft-method-name-match', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a class property whose first arg matches its name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod('increment', this, function* () {
            return 1;
          });
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('accepts a const whose first arg matches its name (receiver-based form)', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        const increment = craftMethod('increment', function* () {
          return 1;
        });
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports and autofixes a mismatched string literal', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod('wrong', this, function* () {
            return 1;
          });
        }
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "craftMethod first argument 'wrong' must match the declared name 'increment'.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "craftMethod('increment', this, function* ()",
    );
    expect(output).not.toContain("'wrong'");
  });

  it('reports and autofixes when the name is missing (legacy receiver form)', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod(function* () {
            return 1;
          });
        }
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "craftMethod must be called with a string literal name matching 'increment' as the first argument.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "craftMethod('increment', function* ()",
    );
  });

  it('reports and autofixes when the name is missing (legacy this-binding form)', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod(this, function* () {
            return 1;
          });
        }
      `,
    };

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain(
      "craftMethod('increment', this, function* ()",
    );
  });

  it('reports and autofixes a const declarator with a mismatch', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        const increment = craftMethod('wrong', function* () {
          return 1;
        });
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "craftMethod first argument 'wrong' must match the declared name 'increment'.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain("craftMethod('increment', function* ()");
  });

  it('skips calls that are not assigned to a named declarator', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        function build() {
          return craftMethod(function* () {
            return 1;
          });
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('accepts an object-literal property whose first arg matches its key', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        const insertions = {
          increment: craftMethod('increment', function* () {
            return 1;
          }),
        };
      `,
    });

    expect(messages).toEqual([]);
  });

  it('accepts an object config whose name property matches the declared name', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod({ name: 'increment', providers: [] }, function* () {
            return 1;
          });
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports and autofixes a mismatched name in object config form', async () => {
    const fixture = {
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod({ name: 'wrong', providers: [] }, function* () {
            return 1;
          });
        }
      `,
    };

    const { messages } = await lintFixture(fixture);
    expect(messages).toEqual([
      "craftMethod first argument 'wrong' must match the declared name 'increment'.",
    ]);

    const { output } = await lintFixture(fixture, { fix: true });
    expect(output).toContain("{ name: 'increment', providers: [] }");
    expect(output).not.toContain("'wrong'");
  });

  it('reports when object config is missing the name property', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftMethod } from '@craft-ng/core';

        export class DemoComponent {
          readonly increment = craftMethod({ providers: [] }, function* () {
            return 1;
          });
        }
      `,
    });

    expect(messages).toEqual([
      "craftMethod must be called with a string literal name matching 'increment' as the first argument.",
    ]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { filePath?: string; fix?: boolean } = {},
): Promise<{ messages: string[]; output: string | undefined }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'craft-method-name-match-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const outputPath = options.filePath ?? 'src/app/demo.ts';

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
    'src/craft-core.d.ts': `
      declare module '@craft-ng/core' {
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
              'craft-method-name-match': craftMethodNameMatchRule as never,
            },
          },
        },
        rules: {
          'local/craft-method-name-match': 'error',
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
