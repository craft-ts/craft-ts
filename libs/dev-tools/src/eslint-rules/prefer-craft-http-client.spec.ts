import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftHttpClientRule = require('./prefer-craft-http-client.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/prefer-craft-http-client', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('allows Angular http imports when HttpClient is not imported', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { HttpHeaders } from '@angular/common/http';

        export const headers = new HttpHeaders();
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports named HttpClient imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { HttpClient } from '@angular/common/http';

        export class DemoApi {
          constructor(private readonly http: HttpClient) {}
        }
      `,
    });

    expect(messages).toEqual([
      'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
    ]);
  });

  it('offers a migration quick fix suggestion', async () => {
    const messages = await lintFixtureMessages({
      'src/app/demo.ts': `
        import { HttpClient } from '@angular/common/http';

        export class DemoApi {
          constructor(private readonly http: HttpClient) {}
        }
      `,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.suggestions?.[0]?.desc).toBe(
      'Insert a temporary eslint-disable-next-line comment with a migration note.',
    );
    expect(messages[0]?.suggestions?.[0]?.fix?.text).toContain(
      '// eslint-disable-next-line craft-ng/prefer-craft-http-client -- migrate this usage to CraftHttpClient\n',
    );
  });

  it('reports aliased HttpClient imports from Angular packages', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { HttpClient as AngularHttpClient } from '@angular/common/http';

        export class DemoApi {
          constructor(private readonly http: AngularHttpClient) {}
        }
      `,
    });

    expect(messages).toEqual([
      'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
    ]);
  });

  it('reports namespace-based Angular HttpClient type usage', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngHttp from '@angular/common/http';

        export class DemoApi {
          constructor(private readonly http: ngHttp.HttpClient) {}
        }
      `,
    });

    expect(messages).toEqual([
      'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
    ]);
  });

  it('reports namespace-based Angular HttpClient value usage', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as ngHttp from '@angular/common/http';
        import { inject } from '@angular/core';

        const http = inject(ngHttp.HttpClient);
      `,
    });

    expect(messages).toEqual([
      'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
    ]);
  });

  it('allows non-Angular HttpClient imports', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { HttpClient } from './http-client';

        export class DemoApi {
          constructor(private readonly http: HttpClient) {}
        }
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const messages = await lintFixtureMessages(files);
  return messages.map((message) => message.message);
}

async function lintFixtureMessages(
  files: Record<string, string>,
): Promise<
  Array<{
    message: string;
    suggestions?: Array<{ desc?: string; fix?: { text?: string } }>;
  }>
> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-http-client-rule-'),
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
              'prefer-craft-http-client': preferCraftHttpClientRule as never,
            },
          },
        },
        rules: {
          'local/prefer-craft-http-client': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) => result.messages);
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
