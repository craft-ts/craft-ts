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
import { abstract, craftException, craftService } from '@craft-ng/core';
import {
  catchTag,
  craftComponent,
  mountCraftComponent,
  p,
  section,
  withProviders,
} from '../index';
import type {
  ComponentInitializationExceptionsOf,
  ProviderExceptions,
} from './types';
import type { CraftNodeChildrenExceptions } from './render/vnode';

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

  it('reactively recreates providers and transitions success → exception → success', () => {
    const state = signal<'ready' | 'denied'>('ready');
    let factoryCalls = 0;
    const noAccess = craftException({ code: 'NO_ACCESS' });
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
        NO_ACCESS: () => p('No access'),
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
    expect(element.textContent).toBe('No access');
    expect(factoryCalls).toBe(1);

    state.set('ready');
    TestBed.tick();
    expect(element.textContent).toBe('Content');
    expect(factoryCalls).toBe(2);

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
});
