import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noAsyncAwaitRule = require('./no-async-await.cjs');

describe('no-async-await', () => {
  it('reports async functions, await expressions, and for await loops', async () => {
    const messages = await lint(`
      async function load() {
        await Promise.resolve(1);
      }

      const refresh = async () => await load();

      class Demo {
        async method() {
          for await (const item of stream()) {
            console.log(item);
          }
        }
      }
    `);

    expect(messages).toEqual([
      'Async functions are forbidden in Craft code because their native Promise is opaque to Craft: dependencies and suspension cannot be recorded or tied to resource cancellation. Use function* and yield* Craft utilities such as craftSleep, query, mutation, asyncProcess, or CraftHttpClient.',
      'await is forbidden in Craft code because it hides the suspension from the Craft driver and can lose dependency, cancellation, and exception tracking. Use yield* with a Craft generator or primitive instead.',
      'Async functions are forbidden in Craft code because their native Promise is opaque to Craft: dependencies and suspension cannot be recorded or tied to resource cancellation. Use function* and yield* Craft utilities such as craftSleep, query, mutation, asyncProcess, or CraftHttpClient.',
      'await is forbidden in Craft code because it hides the suspension from the Craft driver and can lose dependency, cancellation, and exception tracking. Use yield* with a Craft generator or primitive instead.',
      'Async functions are forbidden in Craft code because their native Promise is opaque to Craft: dependencies and suspension cannot be recorded or tied to resource cancellation. Use function* and yield* Craft utilities such as craftSleep, query, mutation, asyncProcess, or CraftHttpClient.',
      'for await...of is forbidden in Craft code because it hides asynchronous iteration from the Craft driver. Use a yield-based Craft flow so each suspension remains tracked.',
    ]);
  });

  it('allows generators and ordinary synchronous functions', async () => {
    const messages = await lint(`
      function* load() {
        yield* craftSleep(100);
      }

      const refresh = () => Promise.resolve(load());
    `);

    expect(messages).toEqual([]);
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
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: {
          local: { rules: { 'no-async-await': noAsyncAwaitRule as never } },
        },
        rules: { 'local/no-async-await': 'error' },
      },
    ],
  });

  const results = await eslint.lintText(source, { filePath: 'demo.ts' });
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}
