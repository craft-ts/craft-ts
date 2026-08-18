import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateNamedPrimitives } from './migrate-named-primitives';
import { runPrimitivesMigration } from './migrate-primitives';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-primitives-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}

describe('primitives migration', () => {
  it('yields reactive reads in insertion methods instead of introducing __craftRead', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'api.service.ts': `
        import {
          craftService,
          state,
          craftUse as __craftRead,
        } from '@craft-ts/core';

        export const { ApiService } = craftService(
          { name: 'ApiService', scope: 'global' },
          function* () {
            const dataList = yield* state('dataList', [], ({ state }) => ({
              deleteItem: (itemId: string) => {
                const deletedItem = __craftRead(state()).find(
                  (item) => item.id === itemId,
                );
                return deletedItem;
              },
            }));

            return { dataList };
          },
        );
      `,
    });

    await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'api.service.ts'), 'utf8');
    expect(output).toContain(
      'deleteItem: function* (itemId: string) {',
    );
    expect(output).toContain('const _state = yield* state();');
    expect(output).toContain('const deletedItem = _state.find(');
    expect(output).not.toContain('__craftRead');
    expect(output).not.toContain('craftUse as');
  });

  it('keeps craftUse at non-generator boundaries and is idempotent', async () => {
    const root = await fixture({
      'readers.ts': `
        import { craftUse as __craftRead, state } from '@craft-ts/core';

        export const readOutsideGenerator = () => __craftRead(state());
        export function* readNested(queryRef: { value: () => unknown }) {
          return __craftRead(queryRef.value());
        }
      `,
    });

    await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const first = await readFile(join(root, 'readers.ts'), 'utf8');

    await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const second = await readFile(join(root, 'readers.ts'), 'utf8');

    expect(first).toContain('export const readOutsideGenerator = () => craftUse(state());');
    expect(first).toContain('const _queryRefvalue = yield* queryRef.value();');
    expect(first).toContain('return _queryRefvalue;');
    expect(first).not.toContain('__craftRead');
    expect(second).toBe(first);
  });

  it('converts Angular signal calls to craft state', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { computed, signal } from '@angular/core';
        export class Wizard {
          readonly activeStep = signal('delivery');
          readonly total = computed(() => this.activeStep());
        }
      `,
    });

    const result = await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(result.diagnostics).toEqual([]);
    expect(output).toContain("import { computed } from '@angular/core'");
    expect(output).toContain("import { craftUse, state } from '@craft-ts/core'");
    expect(output).toContain(
      "activeStep = craftUse(state('activeStep', 'delivery', ({ set, update }) => ({ set, update })))",
    );
    expect(output).toContain(
      '// CRAFT_IMPERATIVE_CODE_DETECTED: imperative code detected, prefer a declarative approach.',
    );
    expect(output).not.toContain('signal(');
  });

  it('replaces explicit signal generics with satisfies on the state value', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'wizard.ts': `
        import { signal } from '@angular/core';
        type WizardStep = 'delivery' | 'schedule' | 'review';
        export const activeStep = signal<WizardStep>('delivery');
        export const stepStatus = signal<Record<WizardStep, 'success' | 'error' | null>>({
          delivery: null,
          schedule: null,
          review: null,
        });
      `,
    });

    await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(output).toContain(
      "state('activeStep', 'delivery' as WizardStep satisfies WizardStep, ({ set, update }) => ({ set, update }))",
    );
    expect(output).toContain("state('stepStatus', {");
    expect(output).toContain(
      "as Record<WizardStep, 'success' | 'error' | null> satisfies Record<WizardStep, 'success' | 'error' | null>",
    );
    expect(output).not.toContain('state<WizardStep>');
    expect(output).not.toContain('state<Record<');
    expect(output.match(/CRAFT_IMPERATIVE_CODE_DETECTED/g)).toHaveLength(2);
  });

  it('annotates an imperative workflow in an already migrated craftService', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'wizard.ts': `
        import { craftService, state } from '@craft-ts/core';
        export const { injectWizard } = craftService(
          { name: 'Wizard', scope: 'function' },
          () => {
            const activeStep = state('delivery');
            const stepStatus = state({ delivery: null });
            const checkoutForm = { form: { delivery: { submit: async () => true } } };
            const router = { navigate: async (_commands: unknown[]) => true };

            async function validateStep(step: 'delivery') {
              const success = await checkoutForm.form[step].submit();
              if (!success) return;
              stepStatus.update((status) => ({ ...status, [step]: 'success' }));
              activeStep.set(step);
              await router.navigate(['/checkout', step]);
            }
            return { validateStep };
          },
        );
      `,
    });

    const first = await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(output).toContain(
      '// CRAFT_REACTIVE_WORKFLOW_RECOMMENDED: workflow impératif détecté...',
    );
    expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'IMPERATIVE_WORKFLOW_REQUIRES_REVIEW',
    );

    await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const secondOutput = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(
      secondOutput.match(/CRAFT_REACTIVE_WORKFLOW_RECOMMENDED/g),
    ).toHaveLength(1);
  });

  it('reports signal forms and rxResource async validators for insertForm rewrite', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'checkout-wizard.ts': `
        import { signal } from '@angular/core';
        import { rxResource } from '@angular/core/rxjs-interop';
        import { form, required, validateAsync } from '@angular/forms/signals';
        export class CheckoutWizard {
          private readonly discount = signal(0);
          readonly checkoutForm = form(signal({ coupon: { code: '' } }), (schema) => {
            required(schema.coupon.code);
            validateAsync(schema.coupon.code, {
              params: ({ fieldTreeOf }) => ({ fieldTreeOf }),
              factory: (params) => rxResource({
                params,
                stream: ({ params }) => params.fieldTreeOf(schema.coupon.code)().value(),
              }),
            });
          });
        }
      `,
    });

    const result = await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'checkout-wizard.ts'), 'utf8');
    expect(output).toContain(
      "craftUse(state('discount', 0, ({ set, update }) => ({ set, update })))",
    );
    expect(output).toContain("craftUse(state('checkoutForm', { coupon: { code:");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'SIGNAL_FORM_REQUIRES_INSERT_FORM',
      'ASYNC_VALIDATOR_REQUIRES_QUERY',
      'RX_RESOURCE_REQUIRES_QUERY',
    ]);
  });

  it('converts a debounced single-emission rxResource to query', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'location-field.ts': `
        import { signal } from '@angular/core';
        import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
        import { debounceTime, distinctUntilChanged, from, map, of } from 'rxjs';
        import { switchMap } from 'rxjs/operators';

        export class LocationField {
          private readonly api = Promise.resolve({
            search: (params: { q: string }) => of([{ label: params.q }]),
          });
          private readonly searchInput = signal('');
          private readonly debouncedSearch = toSignal(
            toObservable(this.searchInput).pipe(
              debounceTime(280),
              map((value) => value.trim()),
              distinctUntilChanged(),
            ),
            { initialValue: '' },
          );
          readonly suggestions = rxResource({
            params: () => {
              const query = this.debouncedSearch();
              return query.length < 2 ? undefined : { q: query };
            },
            stream: ({ params }) => {
              if (!params) return of([]);
              return from(this.api).pipe(switchMap((service) => service.search(params)));
            },
            defaultValue: [],
          });
        }
      `,
    });

    const result = await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'location-field.ts'), 'utf8');
    expect(output).toContain('readonly suggestions = craftUse(query({');
    expect(output).toContain('loader: async ({ params }) =>');
    expect(output).toContain('return [];');
    expect(output).toContain(
      '// CRAFT_FIRST_VALUE_FROM_REVIEW: firstValueFrom bridges an Observable temporarily; prefer a Promise-native Craft API when possible.',
    );
    expect(output).toContain(
      'return firstValueFrom((await this.api).search(params));',
    );
    expect(output).not.toContain('rxResource');
    expect(output).not.toContain("from 'rxjs/operators'");
    expect(result.diagnostics).toEqual([]);
  });

  it('supports check mode for remaining signal forms', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'form.ts': `
        import { form } from '@angular/forms/signals';
        export const x = form;
      `,
    });

    const result = await runPrimitivesMigration({
      rootDir: root,
      write: false,
      check: true,
      eslint: false,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(1);
    expect(result.remainingSignalForms).toBe(1);
  });

  it('suggests inlining a local makeFormTreeInsert into insertForm', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'checkout.ts': `
        import { formTreeNeed, insertForm, insertSelectFormTree, makeFormTreeInsert, state } from '@craft-ts/core';
        type CheckoutForm = { coupon: { code: string } };
        const { insertCouponTree } = makeFormTreeInsert(
          'Coupon',
          formTreeNeed<CheckoutForm['coupon']>(),
          () => ({}),
        );
        export const checkout = state(
          { coupon: { code: '' } },
          insertForm(insertSelectFormTree('coupon', insertCouponTree())),
        );
      `,
    });

    const first = await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    await runPrimitivesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'checkout.ts'), 'utf8');
    expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'FORM_TREE_INSERT_EXTRACTION_REQUIRES_REVIEW',
    );
    expect(output).toContain(
      '// CRAFT_FORM_TREE_INSERT_EXTRACTION_REVIEW: makeFormTreeInsert sert surtout à extraire et découper une logique de formulaire; si cet insert n’est utilisé qu’ici, envisager de le placer directement dans insertForm.',
    );
    expect(
      output.match(/CRAFT_FORM_TREE_INSERT_EXTRACTION_REVIEW/g),
    ).toHaveLength(1);
  });
});

describe('named primitives migration', () => {
  it('names a primitive after the variable it is bound to', async () => {
    const root = await fixture({
      'users.ts': `
        import { craftService, query } from '@craft-ts/core';
        export const { injectUsers } = craftService({ name: 'Users' }, function* () {
          const users = yield* query({ loader: () => Promise.resolve([]) });
          return { users };
        });
      `,
    });

    const result = await migrateNamedPrimitives({
      paths: [join(root, '**/*.ts')],
      log: () => undefined,
    });

    const output = await readFile(join(root, 'users.ts'), 'utf8');
    expect(result.unmigrated).toEqual([]);
    expect(output).toContain(
      "const users = yield* query('users', { loader: () => Promise.resolve([]) })",
    );
  });

  it("names a route's queryParams field after the field itself", async () => {
    const root = await fixture({
      'app.routes.ts': `
        import { queryParams } from '@craft-ts/core';
        export const routes = [
          {
            path: 'list',
            queryParams: () => queryParams({ state: { page: { fallbackValue: 1 } } }),
          },
        ];
      `,
    });

    const result = await migrateNamedPrimitives({
      paths: [join(root, '**/*.ts')],
      log: () => undefined,
    });

    const output = await readFile(join(root, 'app.routes.ts'), 'utf8');
    expect(result.unmigrated).toEqual([]);
    expect(output).toContain(
      "queryParams: () => queryParams('queryParams', { state: { page: { fallbackValue: 1 } } }),",
    );
  });

  it('names an undriven craftService arrow factory directly', async () => {
    const root = await fixture({
      'counter.ts': `
        import { craftService, state } from '@craft-ts/core';
        export const { injectCounter } = craftService({ name: 'Counter' }, () => state(0));
      `,
    });

    const result = await migrateNamedPrimitives({
      paths: [join(root, '**/*.ts')],
      log: () => undefined,
    });

    const output = await readFile(join(root, 'counter.ts'), 'utf8');
    expect(result.unmigrated).toEqual([]);
    expect(output).toContain(
      "export const { injectCounter } = craftService({ name: 'Counter' }, () => state('counter', 0));",
    );
  });

  it('reports an inline call with no binding to derive a name from', async () => {
    const root = await fixture({
      'inline.ts': `
        import { craftUse, state } from '@craft-ts/core';
        export class Counter {
          constructor() {
            craftUse(state(0));
          }
        }
      `,
    });

    const result = await migrateNamedPrimitives({
      paths: [join(root, '**/*.ts')],
      log: () => undefined,
    });

    expect(result.changedFiles).toEqual([]);
    expect(result.unmigrated).toHaveLength(1);
    expect(result.unmigrated[0]).toMatchObject({
      primitive: 'state',
      reason: 'no binding to derive a name from — name it by hand',
    });
  });

  it('leaves an already named primitive untouched', async () => {
    const root = await fixture({
      'users.ts': `
        import { craftService, query } from '@craft-ts/core';
        export const { injectUsers } = craftService({ name: 'Users' }, function* () {
          const users = yield* query('users', { loader: () => Promise.resolve([]) });
          return { users };
        });
      `,
    });

    const result = await migrateNamedPrimitives({
      paths: [join(root, '**/*.ts')],
      log: () => undefined,
    });

    expect(result.changedFiles).toEqual([]);
    expect(result.unmigrated).toMatchObject([
      { primitive: 'query', reason: 'already takes a name argument' },
    ]);
  });

  it('removes the legacy property wrapper from an already named primitive', async () => {
    const root = await fixture({
      'users.ts': `
        import { craftUse, query } from '@craft-ts/core';
        const user = craftUse(query('user', { loader: () => Promise.resolve({}) })).user;
      `,
    });

    const result = await migrateNamedPrimitives({
      paths: [join(root, '**/*.ts')],
      log: () => undefined,
    });

    const output = await readFile(join(root, 'users.ts'), 'utf8');
    expect(result.unmigrated).toEqual([]);
    expect(output).toContain(
      "const user = craftUse(query('user', { loader: () => Promise.resolve({}) }));",
    );
  });
});
