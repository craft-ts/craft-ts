/* eslint-disable playwright/no-standalone-expect */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./require-primitive-context.cjs');

describe('require-primitive-context', () => {
  it('reports a consumed primitive created at module scope', async () => {
    const result = await lint(`
      import { craftUse, state } from '@craft-ts/core';

      const records = craftUse(state('records', []));
    `);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain(
      "'state(...)' must be created inside",
    );
  });

  it('allows primitives inside Craft hosts', async () => {
    const result = await lint(`
      import { craftComponent } from '@craft-ts/component';
      import {
        craftGen,
        craftRoute,
        craftRoutes,
        craftService,
        mutation,
        query,
        state,
      } from '@craft-ts/core';

      const component = craftComponent('Component', {}, () => state('value', 0), () => []);
      const service = craftService({ name: 'Service', scope: 'global' }, function* () {
        const value = yield* state('value', 0);
        const users = yield* query('users', { params: value, loader: async () => [] });
        const save = yield* mutation('save', { method: (input) => input, loader: async () => true });
        return { value, users, save };
      });
      const generator = craftGen(function* () {
        return yield* state('value', 0);
      });
      const routes = craftRoutes('demo', [{
        path: 'value',
        ...craftRoute({ loadComponent: () => state('value', 0) }),
      }]);
    `);

    expect(result.messages).toEqual([]);
  });

  it('does not report readers, local functions, or nested primitive configuration', async () => {
    const result = await lint(`
      import { query, state } from '@craft-ts/core';

      const local = (value) => value;
      const read = ({ state }) => state().value;
      const config = { loader: () => state().value };
      const localResult = local(state(1));
    `);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain("'state(...)'");
  });
});

async function lint(code: string) {
  const root = await mkdtemp(join(tmpdir(), 'require-primitive-context-'));
  try {
    await writeFile(join(root, 'input.ts'), code);
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({
      cwd: root,
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
          plugins: { local: { rules: { required: rule as never } } },
          rules: { 'local/required': 'error' },
        },
      ],
    });
    const [result] = await eslint.lintFiles(['input.ts']);
    return result;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
