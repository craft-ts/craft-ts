// @vitest-environment jsdom
import '@angular/compiler';
import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
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
  catchBlock,
  CraftUnhandledExceptionError,
  craftComponent,
  craftDirective,
  matchBlock,
  mountCraftComponent,
  p,
  resolveCatchBlockHandler,
  section,
  withProviders,
} from '../index';
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

describe('template exception blocks', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('allows a handler to explicitly choose source visibility', () => {
    const denied = craftException({ code: 'DENIED' });
    const fallback = p('fallback');

    expect(
      resolveCatchBlockHandler(
        { render: () => fallback, showSource: false, position: 'before' },
        denied,
        true,
        'after',
      ),
    ).toMatchObject({
      children: fallback,
      showSource: false,
      position: 'before',
    });
    expect(
      resolveCatchBlockHandler(
        { render: () => fallback, showSource: true },
        denied,
        false,
        'after',
      ),
    ).toMatchObject({ children: fallback, showSource: true });
  });

  it('catches a component exception and removes the fallback when the source recovers', () => {
    const state = signal<'ready' | 'denied'>('ready');
    const denied = craftException({ code: 'DENIED' }, { reason: 'private' });
    const { BlockData, provideBlockData } = craftService(
      { name: 'blockData', scope: 'abstract' },
      abstract<string | typeof denied>(),
    );
    const source = craftComponent(
      'blockSource',
      {},
      function* () {
        return yield* BlockData();
      },
      () => p('source'),
    ).pipe(
      withProviders([
        provideBlockData(() => (state() === 'ready' ? 'value' : denied)),
      ]),
    );
    const caughtBefore = source({}).pipe(
      catchBlock.exhaustive(
        { DENIED: () => p('before fallback') },
        { position: 'before' },
      ),
    );
    const caughtAfter = source({}).pipe(
      catchBlock.exhaustive(
        { DENIED: () => p('after fallback') },
        { position: 'after' },
      ),
    );
    expectTypeOf<
      CraftNodeChildrenExceptions<typeof caughtBefore>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      CraftNodeChildrenExceptions<typeof caughtAfter>
    >().toEqualTypeOf<never>();
    const root = craftComponent(
      'blockRoot',
      {},
      () => ({}),
      () =>
        section([
          source({}).pipe(
            catchBlock.exhaustive(
              {
                DENIED: () => p('before fallback'),
              },
              { position: 'before' },
            ),
          ),
          source({}).pipe(
            catchBlock.exhaustive(
              {
                DENIED: (exception) => {
                  return p('fallback');
                },
              },
              { position: 'after' },
            ),
          ),
        ]),
    );

    const element = host();
    const mounted = mountCraftComponent(
      root,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    expect(element.textContent).toContain('source');

    state.set('denied');
    TestBed.tick();
    expect(element.textContent).toContain('fallback');
    expect(element.textContent).toContain('before fallback');

    state.set('ready');
    TestBed.tick();
    expect(element.textContent).toContain('source');
    expect(element.textContent).not.toContain('fallback');
    expect(element.textContent).not.toContain('before fallback');
    mounted.destroy();
  });

  it.each(['before', 'after'] as const)(
    'renders a matchBlock fallback (%s)',
    (position) => {
      const denied = craftException({ code: 'DENIED' }, { reason: 'private' });
      const exception = signal<typeof denied | undefined>(undefined);
      const root = craftComponent(
        `matchRoot${position}`,
        {},
        () => ({ exception }),
        ({ exception }) =>
          section([
            p('source'),
            matchBlock.exhaustive(exception, 'code', {
              DENIED: (value) => {
                expectTypeOf(value.payload).toEqualTypeOf<{ reason: string }>();
                return p(
                  position === 'before' ? 'before fallback' : 'after fallback',
                );
              },
            }),
          ]),
      );
      const element = host();
      const mounted = mountCraftComponent(
        root,
        element,
        TestBed.inject(Injector),
      );
      TestBed.tick();
      expect(element.textContent).toBe('source');

      exception.set(denied);
      TestBed.tick();
      expect(element.textContent).toContain('source');
      expect(element.textContent).toContain('fallback');

      exception.set(undefined);
      TestBed.tick();
      expect(element.textContent).toBe('source');
      mounted.destroy();
    },
  );

  it('raises the dedicated runtime error when no boundary handles an exception', () => {
    const denied = craftException({ code: 'DENIED' });
    const { UnhandledData, provideUnhandledData } = craftService(
      { name: 'unhandledData', scope: 'abstract' },
      abstract<string | typeof denied>(),
    );
    const unhandledProvider = craftDirective(
      'unhandledProvider',
      {},
      (baseLogic) => baseLogic,
      (baseTemplate) => baseTemplate,
      { providers: [provideUnhandledData(() => denied)] },
    );
    const source = craftComponent(
      'unhandledSource',
      {},
      function* () {
        return yield* UnhandledData();
      },
      () => p('never'),
    ).pipe(unhandledProvider);

    let mounted: ReturnType<typeof mountCraftComponent> | undefined;
    expect(() => {
      mounted = mountCraftComponent(source, host(), TestBed.inject(Injector));
      TestBed.tick();
    }).toThrow(CraftUnhandledExceptionError);
    mounted?.destroy();
  });
});
