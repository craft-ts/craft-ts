import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-reactivity.cjs');

const SIGNAL_MESSAGE =
  'Angular signal() is forbidden in authored Craft code. Use state() from @craft-ng/core for observable, named state and type-safe dependencies.';
const COMPUTED_MESSAGE =
  'Angular computed() is forbidden in authored Craft code. Use craftComputed() from @craft-ng/core for observability and host tracking.';
const EFFECT_MESSAGE =
  "Angular effect() is forbidden in authored Craft code. Use craftEffect('name', ...) from @craft-ng/core for observability and host tracking.";
const RESOURCE_MESSAGE =
  'Angular resource APIs are forbidden in authored Craft code. Use query() (or mutation()/asyncProcess() when appropriate) from @craft-ng/core.';
const SUBSCRIBE_MESSAGE =
  'Explicit .subscribe() is forbidden in authored Craft code. Prefer a declarative query/mutation/asyncProcess flow or source$ with on$ so dependencies and cleanup remain observable.';

describe('prefer-craft-reactivity', () => {
  it('reports Angular signal APIs and resource APIs', async () => {
    const messages = await lintText(`
      import { signal, computed, effect, resource } from '@angular/core';

      const count = signal(0);
      const doubled = computed(() => count());
      const log = effect(() => doubled());
      const data = resource({ loader: () => Promise.resolve(1) });
    `);

    expect(messages).toEqual([
      SIGNAL_MESSAGE,
      EFFECT_MESSAGE,
      RESOURCE_MESSAGE,
      SIGNAL_MESSAGE,
      COMPUTED_MESSAGE,
      EFFECT_MESSAGE,
      RESOURCE_MESSAGE,
    ]);
  });

  it('reports Angular HTTP/RxJS resources, explicit subscriptions, and subjects', async () => {
    const messages = await lintText(`
      import { httpResource } from '@angular/common/http';
      import { rxResource } from '@angular/core/rxjs-interop';
      import { BehaviorSubject, ReplaySubject, Subject } from 'rxjs';

      const data = httpResource(() => ({ url: '/data' }));
      const other = rxResource({ stream: () => EMPTY });
      const subject = new Subject<number>();
      const current = new BehaviorSubject(0);
      const replay = new ReplaySubject<number>(1);
      subject.subscribe(() => current.next(1));
      replay['subscribe'](() => undefined);
    `);

    expect(messages).toEqual([
      RESOURCE_MESSAGE,
      RESOURCE_MESSAGE,
      'RxJS BehaviorSubject is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      'RxJS ReplaySubject is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      'RxJS Subject is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      RESOURCE_MESSAGE,
      RESOURCE_MESSAGE,
      'RxJS Subject is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      'RxJS BehaviorSubject is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      'RxJS ReplaySubject is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      SUBSCRIBE_MESSAGE,
      SUBSCRIBE_MESSAGE,
    ]);
  });

  it('allows Craft primitives and unrelated libraries', async () => {
    const messages = await lintText(`
      import { state, craftComputed, craftEffect, query, source$, on$ } from '@craft-ng/core';
      import { signal } from 'some-other-library';

      const count = state('count', 0);
      const doubled = craftComputed('doubled', () => count() * 2);
      const data = query('data', {});
      const reset$ = source$('reset$');
      const insertion = { reset: on$(reset$, () => count.set(0)) };
      void [doubled, data, insertion, signal];
    `);

    expect(messages).toEqual([]);
  });

  it('allows Angular computed inside Craft primitive configuration', async () => {
    const messages = await lintText(`
      import { computed } from '@angular/core';
      import { asyncProcess, insertSelect, mutation, query, state } from '@craft-ng/core';

      const count = state('count', computed(() => 1));
      const data = query('data', { selector: computed(() => count()) });
      const save = mutation('save', { result: computed(() => count()) });
      const process = asyncProcess('process', { value: computed(() => count()) });
      const selected = insertSelect({ value: computed(() => count()) });
      void [count, data, save, process, selected];
    `);

    expect(messages).toEqual([]);
  });

  it('still reports Angular computed outside Craft primitive configuration', async () => {
    const messages = await lintText(`
      import { computed } from '@angular/core';

      const value = computed(() => 1);
      void value;
    `);

    expect(messages).toEqual([COMPUTED_MESSAGE]);
  });
});

async function lintText(source: string): Promise<string[]> {
  const eslint = new ESLint({
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

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}
