import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./sync-effect-body.cjs');

// The fixtures live INSIDE the repository: the rule reads types, so `effect`
// and `@craft-ts/effect` have to resolve for real. A temp dir under the OS
// tmpdir would type everything as `any` and quietly pass every test.
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const tempDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const PRELUDE = `
import { Context, Effect } from 'effect';
import { SyncOp, syncEffect } from '@craft-ts/effect';

type PricingShape = {
  readonly lineTotal: (qty: number) => Effect.Effect<number, never, SyncOp>;
};

class Pricing extends Context.Service<Pricing, PricingShape>()('spec/Pricing') {}

declare const fetchCatalog: (sku: string) => Effect.Effect<string>;
declare const declaredPure: Effect.Effect<number, never, SyncOp>;

void syncEffect;
`;

describe('sync-effect-body', () => {
  it('rejects an async constructor in a body that declares SyncOp', async () => {
    const messages = await lintFixture(`
      ${PRELUDE}
      export const badgeFor = Effect.gen(function* () {
        yield* SyncOp;
        yield* Effect.sleep('10 millis');
        return 'late';
      });
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Effect.sleep(...) always suspends');
  });

  it('rejects a member nothing declares synchronous', async () => {
    const messages = await lintFixture(`
      ${PRELUDE}
      export const badgeFor = Effect.gen(function* () {
        yield* SyncOp;
        const label = yield* fetchCatalog('sku-1');
        return label;
      });
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('nothing declares synchronous');
  });

  it('rejects it through the shape too, with no marker in the body', async () => {
    const messages = await lintFixture(`
      ${PRELUDE}
      export const live: PricingShape = {
        lineTotal: (qty: number) =>
          Effect.gen(function* () {
            yield* Effect.sleep('10 millis');
            return qty;
          }),
      };
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('always suspends');
  });

  it('allows pure constructors, service tags, and declared-sync members', async () => {
    const messages = await lintFixture(`
      ${PRELUDE}
      export const cartTotal = Effect.gen(function* () {
        yield* SyncOp;
        const pricing = yield* Pricing;
        const base = yield* Effect.succeed(10);
        const line = yield* pricing.lineTotal(2);
        const extra = yield* declaredPure;
        return base + line + extra;
      });
    `);

    expect(messages).toEqual([]);
  });

  it('leaves a body that declares nothing alone', async () => {
    const messages = await lintFixture(`
      ${PRELUDE}
      export const loadCatalog = Effect.gen(function* () {
        yield* Effect.sleep('10 millis');
        return yield* fetchCatalog('sku-1');
      });
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(source: string): Promise<string[]> {
  const directory = await mkdtemp(join(repoRoot, '.tmp-sync-effect-body-'));
  tempDirectories.push(directory);

  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'preserve',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        types: [],
        paths: {
          '@craft-ts/core': [join(repoRoot, 'libs/core/src/index.ts')],
          '@craft-ts/effect': [join(repoRoot, 'libs/effect/src/index.ts')],
        },
      },
      include: ['fixture.ts'],
    }),
  );
  await writeFile(join(directory, 'fixture.ts'), source);

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            project: './tsconfig.json',
            tsconfigRootDir: directory,
          },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return result.messages.map((message) => message.message);
}
