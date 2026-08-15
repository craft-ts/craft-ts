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
import {
  assertDefinedInput,
  catchBlock,
  catchInput,
  craftComponent,
  CraftUnhandledExceptionError,
  mountCraftComponent,
  section,
  span,
  type Input,
  type CraftNodeChildren,
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

describe('assertDefinedInput', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('narrows the input and adds the typed exception to the component node', () => {
    const value = signal<'ready' | undefined>('ready');
    const child = craftComponent(
      'assertDefinedInputTypeChild',
      {},
      (sourceValue: Input<'ready'>) => ({ sourceValue }),
      ({ sourceValue }) => span(function* () {
        return yield* sourceValue();
      }),
    );
    const source = child({
      sourceValue: assertDefinedInput(function* () {
        return value();
      }, {
        property: 'child.input',
      }),
    });

    expectTypeOf<
      CraftNodeChildrenExceptions<typeof source>
    >().toEqualTypeOf<'CraftUndefinedPropertyException'>();

    const caught = source.pipe(
      catchBlock.exhaustive({
        CraftUndefinedPropertyException: {
          render: () => span('fallback'),
          showSource: true,
        },
      }),
    );
    expectTypeOf<
      CraftNodeChildrenExceptions<typeof caught>
    >().toEqualTypeOf<never>();
    void caught;

    // @ts-expect-error An asserted input must be handled before it is rendered.
    section([source]);
  });

  it('renders the fallback and recovers when the source becomes defined', () => {
    const value = signal<'ready' | undefined>(undefined);
    const child = craftComponent(
      'assertDefinedInputRuntimeChild',
      {},
      (sourceValue: Input<'ready'>) => ({ sourceValue }),
      ({ sourceValue }) => span(function* () {
        return yield* sourceValue();
      }),
    );
    const root = craftComponent(
      'assertDefinedInputRuntimeRoot',
      {},
      () => ({}),
      () =>
        section([
          child({
            sourceValue: assertDefinedInput(function* () {
              return value();
            }),
          }).pipe(
            catchBlock.exhaustive({
              CraftUndefinedPropertyException: {
                render: (exception) => {
                  expect(exception.code).toBe(
                    'CraftUndefinedPropertyException',
                  );
                  return span('fallback');
                },
                showSource: true,
              },
            }),
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
    expect(element.textContent).toBe('fallback');

    value.set('ready');
    TestBed.tick();
    expect(element.textContent).toBe('ready');

    value.set(undefined);
    TestBed.tick();
    expect(element.textContent).toBe('readyfallback');

    mounted.destroy();
  });

  it('can convert the exception into an input value', () => {
    const value = signal<'ready' | undefined>(undefined);
    const child = craftComponent(
      'assertDefinedInputValueCatchChild',
      {},
      (sourceValue: Input<'ready' | 'idle'>) => ({ sourceValue }),
      ({ sourceValue }) => span(function* () {
        return yield* sourceValue();
      }),
    );
    const status = assertDefinedInput(function* () {
      return value();
    }).pipe(
      catchInput.exhaustive({
        CraftUndefinedPropertyException: () => 'idle' as const,
      }),
    );
    const root = craftComponent(
      'assertDefinedInputValueCatchRoot',
      {},
      () => ({}),
      () => section([child({ sourceValue: status })]),
    );

    const element = host();
    const mounted = mountCraftComponent(
      root,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    expect(element.textContent).toBe('idle');

    value.set('ready');
    TestBed.tick();
    expect(element.textContent).toBe('ready');

    mounted.destroy();
  });

  it('requires an exhaustive value handler', () => {
    const value = signal<'ready' | undefined>(undefined);

    // @ts-expect-error The asserted input exception must be handled exhaustively.
    assertDefinedInput(() => value()).pipe(catchInput.exhaustive({}));
  });

  it('throws the standard unhandled error without a boundary', () => {
    const value = signal<'ready' | undefined>(undefined);
    const child = craftComponent(
      'assertDefinedInputUnhandledChild',
      {},
      (sourceValue: Input<'ready'>) => ({ sourceValue }),
      ({ sourceValue }) => span(function* () {
        return yield* sourceValue();
      }),
    );
    const root = craftComponent(
      'assertDefinedInputUnhandledRoot',
      {},
      () => ({}),
      () => {
        const unhandled = child({
          sourceValue: assertDefinedInput(function* () {
            return value();
          }),
        });
        return section(unhandled as unknown as CraftNodeChildren);
      },
    );

    expect(() => {
      mountCraftComponent(root, host(), TestBed.inject(Injector));
      TestBed.tick();
    }).toThrow(CraftUnhandledExceptionError);
  });
});
