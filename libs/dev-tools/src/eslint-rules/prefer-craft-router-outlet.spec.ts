import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const preferCraftRouterOutletRule = require('./prefer-craft-router-outlet.cjs');

describe('prefer-craft-router-outlet', () => {
  it('accepts the functional CraftRouterOutlet()', async () => {
    const messages = await lint(`
      import {
        component,
        CraftRouterOutlet,
        main,
      } from '@craft-ng/component';

      export const App = component(
        {},
        () => ({}),
        () => main(CraftRouterOutlet()),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('reports the RouterOutlet import from @angular/router', async () => {
    const messages = await lint(`
      import { Component } from '@angular/core';
      import { RouterOutlet } from '@angular/router';

      @Component({
        selector: 'app-root',
        imports: [RouterOutlet],
        template: '<router-outlet></router-outlet>',
      })
      export class App {}
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(
      'CraftRouterOutlet() from @craft-ng/component',
    );
  });

  it('reports an inline router-outlet tag without an import', async () => {
    const messages = await lint(`
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-root',
        template: '<router-outlet></router-outlet>',
      })
      export class App {}
    `);

    expect(messages).toHaveLength(1);
  });

  it('ignores files unrelated to routing outlets', async () => {
    expect(await lint('export const value = 1;')).toEqual([]);
  });
});

async function lint(source: string): Promise<string[]> {
  const eslint = new ESLint({
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

  const [result] = await eslint.lintText(source, { filePath: 'src/app/app.ts' });
  return result.messages.map((message) => message.message);
}
