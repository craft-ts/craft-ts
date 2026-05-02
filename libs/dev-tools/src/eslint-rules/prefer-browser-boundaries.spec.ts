import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferBrowserBoundariesRule = require('./prefer-browser-boundaries.cjs');

const tempDirectories: string[] = [];

describe('brand-angular-deps/prefer-browser-boundaries', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports direct browser globals covered by @craft-ng boundaries', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        window.location.href;
        document.title = 'Demo';
        localStorage.getItem('token');
        console.log('hello');
      `,
    });

    expect(messages).toEqual([
      'Use the @craft-ng browser boundary BrowserWindow instead of direct window access.',
      'Use the @craft-ng browser boundary BrowserDocument instead of direct document access.',
      'Use the @craft-ng browser boundary LocalStorage instead of direct localStorage access.',
      'Use the @craft-ng browser boundary Console instead of direct console access.',
    ]);
  });

  it('reports globalThis aliases and direct window methods', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        globalThis.crypto.randomUUID();
        alert('warning');
        confirm('continue?');
        scrollTo(0, 0);
      `,
    });

    expect(messages).toEqual([
      'Use the @craft-ng browser boundary BrowserCrypto instead of direct crypto access.',
      'Use the @craft-ng browser boundary BrowserWindow.alert instead of direct alert access.',
      'Use the @craft-ng browser boundary BrowserWindow.confirm instead of direct confirm access.',
      'Use the @craft-ng browser boundary BrowserWindow.scrollTo instead of direct scrollTo access.',
    ]);
  });

  it('allows @craft-ng boundaries', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { BrowserWindow, Console, LocalStorage } from '@craft-ng/core';

        function* demo() {
          yield* Console.log('hello');
          yield* BrowserWindow.confirm('continue?');
          yield* LocalStorage.getItem('token');
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('ignores shadowed identifiers', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        const localStorage = createStorage();

        function alert(message: string) {
          return Boolean(message);
        }

        const globalThis = {
          crypto: {
            randomUUID() {
              return 'uuid';
            },
          },
        };

        localStorage.getItem('token');
        alert('continue?');
        globalThis.crypto.randomUUID();
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'prefer-browser-boundaries-rule-'),
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
              'prefer-browser-boundaries': preferBrowserBoundariesRule as never,
            },
          },
        },
        rules: {
          'local/prefer-browser-boundaries': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
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
