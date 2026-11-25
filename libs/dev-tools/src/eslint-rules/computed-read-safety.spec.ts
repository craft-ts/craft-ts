import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noCraftComputedSideEffects = require('./no-craft-computed-side-effects.cjs');
const preferComputedLocalDependency = require('./prefer-computed-local-dependency.cjs');

// The two rules share one predicate: prefer-computed-local-dependency may only
// ask to move a dependency into a computed when no-craft-computed-side-effects
// would accept it there. These fixtures run both rules together on the real
// `@craft-ts/core` and `@craft-ts/i18n` types — a fixture under the OS tmpdir
// would type every import as `any` and prove nothing.
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const tempDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const SIDE_EFFECTS = 'craft-ts/no-craft-computed-side-effects';
const LOCAL_DEPENDENCY = 'craft-ts/prefer-computed-local-dependency';

describe('computed read safety (prefer-computed-local-dependency + no-craft-computed-side-effects)', () => {
  describe('issue #44 — a service resolved for one computed', () => {
    it('accepts an abstract service resolved in the service body and read by the computed', async () => {
      const messages = await lintFixture(`
        import { abstract, craftComputed, craftService, state } from '@craft-ts/core';

        export const { HostLocale, provideHostLocale } = craftService(
          { name: 'HostLocale', providedIn: 'abstract' },
          abstract<string>(),
        );

        export const { Greeting, provideGreeting } = craftService(
          { name: 'Greeting', providedIn: 'toProvide' },
          function* () {
            const name = yield* state('name', 'Ada');
            const locale = yield* HostLocale();
            yield* craftComputed('greeting', function* () {
              return \`\${locale}: \${yield* name()}\`;
            });
          },
        );
      `);

      expect(messages).toEqual([]);
    });

    it('rejects resolving the abstract service inside the computed and names the missing proof', async () => {
      const messages = await lintFixture(`
        import { abstract, craftComputed, craftService, state } from '@craft-ts/core';

        export const { HostLocale2, provideHostLocale2 } = craftService(
          { name: 'HostLocale2', providedIn: 'abstract' },
          abstract<string>(),
        );

        export const { Greeting2, provideGreeting2 } = craftService(
          { name: 'Greeting2', providedIn: 'toProvide' },
          function* () {
            const name = yield* state('name', 'Ada');
            yield* craftComputed('greeting', function* () {
              const locale = yield* HostLocale2();
              return \`\${locale}: \${yield* name()}\`;
            });
          },
        );
      `);

      expect(messages).toEqual([
        {
          ruleId: SIDE_EFFECTS,
          message: expect.stringContaining(
            '`HostLocale2()` resolves a service',
          ),
        },
      ]);
      expect(messages[0].message).toContain('craftEffect');
      expect(messages[0].message).toContain(
        'Resolve it in the enclosing service body',
      );
    });

    it('keeps a concrete service whose dependencies include a craftEffect out of the computed', async () => {
      const messages = await lintFixture(`
        import { craftComputed, craftEffect, craftPrivate, craftService, state } from '@craft-ts/core';

        export const { Clock, provideClock } = craftService(
          { name: 'Clock', providedIn: 'toProvide' },
          function* () {
            const now = yield* state('now', 0);
            yield* craftPrivate(craftEffect('tick', () => { void now; }));
          },
        );

        export const { Dashboard, provideDashboard } = craftService(
          { name: 'Dashboard', providedIn: 'toProvide' },
          function* () {
            const clock = yield* Clock();
            yield* craftComputed('label', function* () {
              return \`\${yield* clock.now()}\`;
            });
            yield* craftComputed('resolvedInside', function* () {
              const inside = yield* Clock();
              return yield* inside.now();
            });
          },
        );
      `);

      expect(messages).toEqual([
        {
          ruleId: SIDE_EFFECTS,
          message: expect.stringContaining('`Clock()` resolves a service'),
        },
      ]);
    });

    it('still asks to move a core synchronous capability into its computed', async () => {
      const messages = await lintFixture(`
        import { CraftRouter, craftComputed, craftService } from '@craft-ts/core';

        export const { Links, provideLinks } = craftService(
          { name: 'Links', providedIn: 'toProvide' },
          function* () {
            const router = yield* CraftRouter();
            yield* craftComputed('home', function* () {
              return router.serializeUrl(router.createUrlTree(['/']));
            });
          },
        );
      `);

      expect(messages).toEqual([
        {
          ruleId: LOCAL_DEPENDENCY,
          message: expect.stringContaining('Yield it in a generator callback'),
        },
      ]);
    });
  });

  describe('issue #46 — a bound i18n translator read in a computed', () => {
    const I18N_PRELUDE = `
      import { craftComputed, craftExpose, craftService, state } from '@craft-ts/core';
      import { createI18nRuntime, defineLocale, integer, msg, plural } from '@craft-ts/i18n';

      const count = integer('count');
      const en = defineLocale('en', {
        items: plural(count, { one: msg\`\${count} item\`, other: msg\`\${count} items\` }),
      });
    `;

    it('accepts a translator bound to a reactive Craft read', async () => {
      const messages = await lintFixture(`
        ${I18N_PRELUDE}
        export const { Cart } = craftService({ name: 'Cart', providedIn: 'global' }, function* () {
          const runtime = createI18nRuntime({ locales: [en] });
          const language = yield* state('language', 'en');
          const t = runtime.bind(language);
          const lines = yield* state('lines', [1, 2, 3]);
          yield* craftComputed('summary', function* () {
            return yield* t('items', { count: (yield* lines()).length })();
          });
          yield* craftExpose('t', t);
        });
      `);

      expect(messages).toEqual([]);
    });

    it('rejects a translator bound to a generator that is not a reactive read', async () => {
      const messages = await lintFixture(`
        ${I18N_PRELUDE}
        import { craftSleep } from '@craft-ts/core';

        export const { SlowCart } = craftService({ name: 'SlowCart', providedIn: 'global' }, function* () {
          const runtime = createI18nRuntime({ locales: [en] });
          const t = runtime.bind(function* () {
            yield* craftSleep(10);
          });
          const lines = yield* state('lines', [1, 2, 3]);
          yield* craftComputed('summary', function* () {
            return yield* t('items', { count: (yield* lines()).length })();
          });
        });
      `);

      expect(messages).toEqual([
        {
          ruleId: SIDE_EFFECTS,
          message: expect.stringContaining(
            'is bound to a dependency that is not a reactive Craft read',
          ),
        },
      ]);
    });

    it('rejects a message whose DI-aware token resolves a service inside the computed', async () => {
      const messages = await lintFixture(`
        import { abstract, craftComputed, craftService, state } from '@craft-ts/core';
        import { createI18nRuntime, defineLocale, money, msg } from '@craft-ts/i18n';

        export const { ClientCurrency, provideClientCurrency } = craftService(
          { name: 'ClientCurrency', providedIn: 'abstract' },
          abstract<{ readonly code: string }>(),
        );

        const amount = money('amount', function* () {
          const currency = yield* ClientCurrency();
          return { currency: currency.code };
        });
        const en = defineLocale('en', { total: msg\`Total \${amount}\` });

        export const { Order } = craftService({ name: 'Order', providedIn: 'global' }, function* () {
          const runtime = createI18nRuntime({ locales: [en] });
          const language = yield* state('language', 'en');
          const t = runtime.bind(language);
          const total = yield* state('total', 12);
          yield* craftComputed('label', function* () {
            return yield* t('total', { amount: yield* total() })();
          });
        });
      `);

      expect(messages).toEqual([
        {
          ruleId: SIDE_EFFECTS,
          message: expect.stringContaining('ClientCurrency'),
        },
      ]);
    });
  });
});

async function lintFixture(source: string) {
  const directory = await mkdtemp(join(repoRoot, '.tmp-computed-read-safety-'));
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
          '@craft-ts/i18n': [join(repoRoot, 'libs/i18n/src/index.ts')],
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
        plugins: {
          'craft-ts': {
            rules: {
              'no-craft-computed-side-effects': noCraftComputedSideEffects,
              'prefer-computed-local-dependency': preferComputedLocalDependency,
            },
          },
        },
        rules: {
          [SIDE_EFFECTS]: 'error',
          [LOCAL_DEPENDENCY]: 'error',
        },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return result.messages.map(({ ruleId, message }) => ({ ruleId, message }));
}
