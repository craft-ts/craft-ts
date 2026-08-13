// @vitest-environment jsdom
import '@angular/compiler';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import {
  abstract,
  craftException,
  craftService,
  query, craftUse } from '@craft-ng/core';
import {
  catchBlock,
  catchTag,
  craftComponent,
  matchBlock,
  mountCraftComponent,
  p,
  section,
  withProviders,
} from '../index';
import type {
  ComponentInitializationExceptionsOf,
  ComponentTemplateOf,
  ProviderExceptions,
} from './types';
import type {
  CraftNodeChildrenExceptions,
  CraftNodeChildrenHandledExceptionCodes,
} from './render/vnode';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('component composition', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('narrows catchTag handler codes', () => {
    catchTag.exhaustive({
      NO_ACCESS: function* (exception) {
        expectTypeOf(exception.code).toEqualTypeOf<'NO_ACCESS'>();
      },
    });

    catchTag.exhaustive<'NO_ACCESS'>({
      NO_ACCESS: function* () {
        return;
      },
    });

    // @ts-expect-error — catchTag is a logic boundary; template children belong to catchBlock.
    catchTag.exhaustive({ NO_ACCESS: () => p('No access') });
  });

  it('reactively recreates providers and transitions success → exception → success', () => {
    const state = signal<'ready' | 'denied'>('ready');
    let factoryCalls = 0;
    const noAccess = craftException({ code: 'NO_ACCESS' });
    let handled = 0;
    const { Data, provideData } = craftService(
      { name: 'data', scope: 'abstract' },
      abstract<string | typeof noAccess>(),
    );

    const base = craftComponent(
      'restricted',
      {},
      function* () {
        factoryCalls += 1;
        return yield* Data();
      },
      () => p('Content'),
    );
    const restricted = base.pipe(
      withProviders([
        provideData(() => (state() === 'ready' ? 'Content' : noAccess)),
      ]),
      catchTag.exhaustive({
        NO_ACCESS: function* () {
          handled += 1;
        },
      }),
    );
    const element = host();

    const mounted = mountCraftComponent(
      restricted,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    expect(element.textContent).toBe('Content');
    expect(factoryCalls).toBe(1);

    state.set('denied');
    TestBed.tick();
    expect(element.textContent).toBe('');
    expect(handled).toBe(1);
    expect(factoryCalls).toBe(1);

    state.set('ready');
    TestBed.tick();
    expect(element.textContent).toBe('Content');
    expect(factoryCalls).toBe(2);

    mounted.destroy();
  });

  it('does not register a style scope for a styleless operator recreated by a template', () => {
    const renderVersion = signal(0);
    const base = craftComponent(
      'stylelessOperatorBase',
      {},
      () => ({}),
      () => p('Content'),
    );
    const page = craftComponent(
      'stylelessOperatorPage',
      {},
      () => ({}),
      () => [p(String(renderVersion())), base.pipe(withProviders([]))({})],
    );
    const element = host();

    const mounted = mountCraftComponent(
      page,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    renderVersion.set(1);
    expect(() => TestBed.tick()).not.toThrow();
    expect(element.textContent).toContain('1Content');

    mounted.destroy();
  });

  it('does not bubble a query exception already handled by matchBlock', async () => {
    const failed = craftException({ code: 'FAILED_TO_LOAD' as const });
    let factoryRuns = 0;
    const source = craftComponent(
      'queryCatchBlockRuntime',
      {},
      function* () {
        factoryRuns += 1;
        const value = yield* query('value', {
          params: () => 0,
          loader: async () => failed,
        });
        return { value };
      },
      ({ value }) =>
        section([
          p('source'),
          matchBlock.exhaustive(
            () => craftUse(value.exceptions()).loader,
            'code',
            {
              FAILED_TO_LOAD: () => p('match fallback'),
            },
          ),
        ]),
    );
    expectTypeOf<
      CraftNodeChildrenHandledExceptionCodes<
        ReturnType<ComponentTemplateOf<typeof source>>
      >
    >().toEqualTypeOf<'FAILED_TO_LOAD'>();
    const caughtWithSource = source.pipe(
      // @ts-expect-error — FAILED_TO_LOAD is already consumed by matchBlock in the template.
      catchBlock.exhaustive(
        {
          FAILED_TO_LOAD: {
            render: () => p('query fallback'),
            showSource: true,
          },
        },
        { position: 'after' },
      ),
    );
    const element = host();

    const mounted = mountCraftComponent(
      caughtWithSource,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    TestBed.tick();

    expect(element.textContent).toContain('source');
    expect(element.textContent).toContain('match fallback');
    expect(element.textContent).not.toContain('query fallback');
    expect(factoryRuns).toBe(1);
    mounted.destroy();
  });

  it('does not treat an empty query exception bucket as an exception', async () => {
    const failed = craftException({ code: 'FAILED_TO_LOAD' as const });
    const shouldFail = signal(false);
    const source = craftComponent(
      'queryMatchBlockEmptyBucket',
      {},
      function* () {
        const value = yield* query('value', {
          params: shouldFail,
          loader: async ({ params }) =>
            params ? failed : { id: 'loaded' as const },
        });
        return { value };
      },
      ({ value }) =>
        section([
          p(() => craftUse(value.value())?.id ?? ''),
          matchBlock.exhaustive(
            () => craftUse(value.exceptions()).loader,
            'code',
            {
              FAILED_TO_LOAD: () => p('fallback'),
            },
          ),
        ]),
    );
    const element = host();

    const mounted = mountCraftComponent(
      source,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    TestBed.tick();

    expect(element.textContent).toContain('loaded');
    expect(element.textContent).not.toContain('fallback');

    shouldFail.set(true);
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    TestBed.tick();
    expect(element.textContent).toContain('fallback');

    mounted.destroy();
  });

  it('requires a component exception to be caught before it is emitted into a template', () => {
    const noAccess = craftException({ code: 'NO_ACCESS' });
    const { Data, provideData } = craftService(
      { name: 'data', scope: 'abstract' },
      abstract<string | typeof noAccess>(),
    );
    const restricted = craftComponent(
      'uncaughtRestricted',
      {},
      function* () {
        return yield* Data();
      },
      () => p('Content'),
    ).pipe(withProviders([provideData(() => noAccess)]));

    const provider = provideData(() => noAccess);
    expectTypeOf<ProviderExceptions<typeof provider>>().toEqualTypeOf<
      typeof noAccess
    >();
    expectTypeOf<
      ComponentInitializationExceptionsOf<typeof restricted>
    >().toEqualTypeOf<'NO_ACCESS'>();
    expectTypeOf<
      CraftNodeChildrenExceptions<ReturnType<typeof restricted>>
    >().toEqualTypeOf<'NO_ACCESS'>();

    // @ts-expect-error — NO_ACCESS must be handled before this component is emitted into the template.
    section([restricted({})]);
  });

  it('propagates query loader exceptions through a provided service', () => {
    const failed = craftException({ code: 'FAILED_TO_LOAD' as const });
    const { provideTodoStoreWithQueryException, TodoStoreWithQueryException } =
      craftService(
        { name: 'todoStoreWithQueryException', scope: 'toProvide' },
        function* () {
          const refresh = signal(0);
          const todos = yield* query('todos', {
            params: refresh,
            loader: async () => (refresh() < 0 ? failed : []),
          });
          return { todos };
        },
      );
    const component = craftComponent(
      'queryExceptionComponent',
      { providers: [provideTodoStoreWithQueryException()] },
      function* () {
        return { store: yield* TodoStoreWithQueryException() };
      },
      () => p('Todos'),
    );

    expectTypeOf<
      ComponentInitializationExceptionsOf<typeof component>
    >().toEqualTypeOf<'FAILED_TO_LOAD'>();

    // @ts-expect-error — the component's exception union cannot be handled by an empty map.
    catchTag.exhaustive(component, {});

    // @ts-expect-error — handlers for codes outside the component union are rejected.
    component.pipe((current) =>
      catchTag.exhaustive(current, {
        FAILED_TO_LOAD: function* () {
          return;
        },
        UNRELATED: function* () {
          return;
        },
      }),
    );

    const caught = component.pipe((current) =>
      catchTag.exhaustive(current, {
        FAILED_TO_LOAD: function* () {
          return;
        },
      }),
    );
    expectTypeOf<
      ComponentInitializationExceptionsOf<typeof caught>
    >().toEqualTypeOf<never>();
  });

  it('advertises direct query loader exceptions on a component', () => {
    const failed = craftException({ code: 'FAILED_TO_LOAD' as const });
    const refresh = signal(0);
    const component = craftComponent(
      'directQueryExceptionComponent',
      {},
      function* () {
        const todos = yield* query('todos', {
          params: refresh,
          loader: async () => (refresh() < 0 ? failed : []),
        });
        return { todos };
      },
      () => p('Todos'),
    );

    expectTypeOf<
      ComponentInitializationExceptionsOf<typeof component>
    >().toEqualTypeOf<'FAILED_TO_LOAD'>();
  });
});
