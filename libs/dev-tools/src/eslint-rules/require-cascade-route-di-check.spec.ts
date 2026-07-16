import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-cascade-route-di-check.cjs');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('require-cascade-route-di-check', () => {
  it('accepts a collection paired with ValidateCascadeRoutesFile and CanRun', async () => {
    const { messages } = await lint(`
      import { craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
      import type { Router } from '@angular/router';
      export const { demoRoutes } = craftRoutes('demo', []);
      type _CheckDemoDI = ValidateCascadeRoutesFile<never, Router, typeof demoRoutes>;
      type _CanRunDemo = CanRun<_CheckDemoDI>;
    `);
    expect(messages).toEqual([]);
  });

  it('reports a collection when CanRun does not consume its cascade check', async () => {
    const { messages } = await lint(`
      import { craftRoutes, type ValidateCascadeRoutesFile } from '@craft-ng/core';
      import type { Router } from '@angular/router';
      export const { demoRoutes } = craftRoutes('demo', []);
      type _CheckDemoDI = ValidateCascadeRoutesFile<never, Router, typeof demoRoutes>;
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('demoRoutes');
  });

  it('auto-fixes a missing check with the conservative app context', async () => {
    const { output } = await lint(
      `import { craftRoutes } from '@craft-ng/core';\nexport const { demoRoutes } = craftRoutes('demo', []);\n`,
      true,
    );
    expect(output).toContain(
      'type _CheckDemoDI = ValidateCascadeRoutesFile<never, Router, typeof demoRoutes>;',
    );
    expect(output).toContain('type _CanRunDemo = CanRun<_CheckDemoDI>;');
  });

  it('checks every collection independently', async () => {
    const { messages } = await lint(`
      import { craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
      import type { Router } from '@angular/router';
      export const { aRoutes } = craftRoutes('a', []);
      export const { bRoutes: renamed } = craftRoutes('b', []);
      type _CheckA = ValidateCascadeRoutesFile<never, Router, typeof aRoutes>;
      type _CanRunA = CanRun<_CheckA>;
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('renamed');
  });
});

async function lint(source: string, fix = false) {
  const root = await mkdtemp(join(tmpdir(), 'cascade-route-check-'));
  temporaryDirectories.push(root);
  const filePath = join(root, 'src/app.routes.ts');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, source.trimStart(), 'utf8');
  const eslint = new ESLint({
    cwd: root,
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });
  const results = await eslint.lintFiles(['src/**/*.ts']);
  if (fix) await ESLint.outputFixes(results);
  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: await readFile(filePath, 'utf8'),
  };
}
