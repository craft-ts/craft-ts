// @vitest-environment jsdom
import { craftSignal as signal } from '@craft-ts/core';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  abstract,
  craftException,
  craftService,
  createDeepYieldableReactiveValue,
} from '@craft-ts/core';
import {
  catchNode,
  CraftUnhandledExceptionError,
  craftComponent,
  craftDirective,
  matchNode,
  p,
  resolveCatchHandler,
  section,
  withProviders,
} from '../index';
import type { CraftNodeChildrenExceptions } from './render/vnode';
import { renderCraftComponent } from './testing';

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('template exception blocks', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('allows a handler to explicitly choose source visibility', async () => {
    const denied = craftException({ _tag: 'DENIED' });
    const fallback = p('fallback');

    expect(
      resolveCatchHandler(
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
      resolveCatchHandler(
        { render: () => fallback, showSource: true },
        denied,
        false,
        'after',
      ),
    ).toMatchObject({ children: fallback, showSource: true });
  });

  it('catches a component exception and removes the fallback when the source recovers', async () => {
    const state = signal<'ready' | 'denied'>('ready');
    const denied = craftException({ _tag: 'DENIED' }, { reason: 'private' });
    const { BlockData, provideBlockData } = craftService(
      { name: 'blockData', providedIn: 'abstract' },
      abstract<string | typeof denied>(),
    );
    const { BlockSourceView, provideBlockSourceView } = craftService(
      { name: 'blockSourceView', providedIn: 'toProvide' },
      function* () {
        return yield* BlockData();
      },
    );

    const source = craftComponent(
      'blockSource',
      { providers: [provideBlockSourceView()] },
      function* () {
        yield* BlockSourceView();
        return p('source');
      },
    ).pipe(
      withProviders([
        provideBlockData(() => (state() === 'ready' ? 'value' : denied)),
      ]),
    );
    const caughtBefore = source({}).pipe(
      catchNode.exhaustive(
        { DENIED: () => p('before fallback') },
        { position: 'before' },
      ),
    );
    const caughtAfter = source({}).pipe(
      catchNode.exhaustive(
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
    const { BlockRootView, provideBlockRootView } = craftService(
      { name: 'blockRootView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'blockRoot',
      { providers: [provideBlockRootView()] },
      function* () {
        yield* BlockRootView();
        return section([
          source({}).pipe(
            catchNode.exhaustive(
              {
                DENIED: () => p('before fallback'),
              },
              { position: 'before' },
            ),
          ),
          source({}).pipe(
            catchNode.exhaustive(
              {
                DENIED: (exception) => {
                  return p('fallback');
                },
              },
              { position: 'after' },
            ),
          ),
        ]);
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.textContent).toContain('source');

    state.set('denied');
    await flush();
    expect(element.textContent).toContain('fallback');
    expect(element.textContent).toContain('before fallback');

    state.set('ready');
    await flush();
    expect(element.textContent).toContain('source');
    expect(element.textContent).not.toContain('fallback');
    expect(element.textContent).not.toContain('before fallback');
    destroy();
  });

  it.each(['before', 'after'] as const)(
    'renders a matchNode fallback (%s)',
    async (position) => {
      const denied = craftException({ _tag: 'DENIED' }, { reason: 'private' });
      const exception = signal<typeof denied | undefined>(undefined);
      const root = craftComponent(
        `matchRoot${position}`,
        {},
        () =>
          section([
            p('source'),
            matchNode.exhaustive(exception, '_tag', {
              DENIED: (value) => {
                expectTypeOf(value.payload).toEqualTypeOf<{ reason: string }>();
                return p(
                  position === 'before' ? 'before fallback' : 'after fallback',
                );
              },
            }),
          ]),
      );
      const {
        nativeElement: element,
        flush,
        destroy,
      } = await renderCraftComponent(root);
      expect(element.textContent).toBe('source');

      exception.set(denied);
      await flush();
      expect(element.textContent).toContain('source');
      expect(element.textContent).toContain('fallback');

      exception.set(undefined);
      await flush();
      expect(element.textContent).toBe('source');
      destroy();
    },
  );

  it('matches a property of a deeply projected exception collection', async () => {
    const denied = craftException({ _tag: 'DENIED' }, { reason: 'private' });
    const source = signal({
      list: [denied],
      params: undefined,
      loader: denied as typeof denied | undefined,
    });
    const exceptions = createDeepYieldableReactiveValue(source, 'exceptions', {
      primitive: 'query',
      path: 'query.exceptions',
    });
    const { DeepExceptionMatchRootView, provideDeepExceptionMatchRootView } =
      craftService(
        { name: 'deepExceptionMatchRootView', providedIn: 'toProvide' },
        () => ({ exceptions }),
      );

    const root = craftComponent(
      'deepExceptionMatchRoot',
      { providers: [provideDeepExceptionMatchRootView()] },
      function* () {
        const { exceptions } = yield* DeepExceptionMatchRootView();
        return matchNode.exhaustive(exceptions.loader, '_tag', {
          DENIED: (value) => {
            expectTypeOf(value.payload).toEqualTypeOf<{ reason: string }>();
            return p('deep fallback');
          },
        });
      },
    );

    const { nativeElement: element, destroy } =
      await renderCraftComponent(root);
    expect(element.textContent).toContain('deep fallback');
    destroy();
  });

  it('raises the dedicated runtime error when no boundary handles an exception', async () => {
    const denied = craftException({ _tag: 'DENIED' });
    const { UnhandledData, provideUnhandledData } = craftService(
      { name: 'unhandledData', providedIn: 'abstract' },
      abstract<string | typeof denied>(),
    );
    const unhandledProvider = craftDirective(
      'unhandledProvider',
      {},
      {},
      { providers: [provideUnhandledData(() => denied)] },
    );
    const { UnhandledSourceView, provideUnhandledSourceView } = craftService(
      { name: 'unhandledSourceView', providedIn: 'toProvide' },
      function* () {
        return yield* UnhandledData();
      },
    );

    const source = craftComponent(
      'unhandledSource',
      { providers: [provideUnhandledSourceView()] },
      function* () {
        yield* UnhandledSourceView();
        return p('never');
      },
    ).pipe(unhandledProvider);

    await expect(renderCraftComponent(source)).rejects.toThrow(
      CraftUnhandledExceptionError,
    );
  });

  it('matches a reactive scalar literal union directly', async () => {
    const { ScalarMatchRootView, provideScalarMatchRootView } = craftService(
      { name: 'scalarMatchRootView', providedIn: 'toProvide' },
      () => ({ step }),
    );

    const step = signal<'reading' | 'editing'>('reading');
    const root = craftComponent(
      'scalarMatchRoot',
      { providers: [provideScalarMatchRootView()] },
      function* () {
        const { step } = yield* ScalarMatchRootView();
        return matchNode.exhaustive(step, {
          reading: () => p('reading'),
          editing: () => p('editing'),
        });
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);

    expect(element.textContent).toBe('reading');

    step.set('editing');
    await flush();

    expect(element.textContent).toBe('editing');
    destroy();
  });
});
