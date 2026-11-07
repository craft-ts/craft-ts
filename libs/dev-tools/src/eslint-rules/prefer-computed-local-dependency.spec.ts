import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-computed-local-dependency.cjs');

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.ts'],
      languageOptions: { parser: tsParser },
      plugins: { 'craft-ts': { rules: { 'prefer-computed-local-dependency': rule } } },
      rules: { 'craft-ts/prefer-computed-local-dependency': 'error' },
    }],
  });
  const [result] = await eslint.lintText(code, { filePath: 'src/page.ts' });
  return result.messages;
}

describe('prefer-computed-local-dependency', () => {
  it('reports a service yielded outside and only passed into a computed', async () => {
    const messages = await lint(`
      function* Page() {
        const router = yield* CraftRouter();
        const frames = yield* craftComputed('frames', () => replayFramesOf(report(), router));
        return frames;
      }
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('Yield it in a generator callback');
  });

  it('allows a dependency yielded within its computed callback', async () => {
    expect(await lint(`
      function* Page() {
        const frames = yield* craftComputed('frames', function* () {
          const router = yield* CraftRouter();
          return replayFramesOf(report(), router);
        });
        return frames;
      }
    `)).toEqual([]);
  });

  it('allows a dependency also used outside the computed', async () => {
    expect(await lint(`
      function* Page() {
        const router = yield* CraftRouter();
        logRouter(router);
        return yield* craftComputed('frames', () => replayFramesOf(report(), router));
      }
    `)).toEqual([]);
  });

  it('allows a private query only read by one computed', async () => {
    expect(await lint(`
      import { craftComputed, craftPrivate, query } from '@craft-ts/core';
      function* Page() {
        const currentUserQuery = yield* craftPrivate(query('currentUserQuery', {}));
        return yield* craftComputed('currentUser', function* () {
          return yield* currentUserQuery.value();
        });
      }
    `)).toEqual([]);
  });

  it('allows a named state only read by one computed', async () => {
    expect(await lint(`
      function* Page() {
        const category = yield* state('category', 'all', ({ set }) => ({ choose: set }));
        return yield* craftComputed('visible', function* () {
          return yield* category();
        });
      }
    `)).toEqual([]);
  });
});
