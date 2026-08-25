// @vitest-environment jsdom
import { craftSignal as signal } from '@craft-ts/core';
import {
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import {
  assertDefinedInput,
  catchNode,
  catchInput,
  craftComponent,
  CraftUnhandledExceptionError,
  section,
  span,
  type Input,
  type CraftNodeChildren,
} from '../index';
import type { CraftNodeChildrenExceptions } from './render/vnode';
import { renderCraftComponent } from './testing';

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('assertDefinedInput', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('narrows the input and adds the typed exception to the component node', async () => {
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
      catchNode.exhaustive({
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

  it('renders the fallback and recovers when the source becomes defined', async () => {
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
            catchNode.exhaustive({
              CraftUndefinedPropertyException: {
                render: (exception) => {
                  expect(exception._tag).toBe(
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

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );
    expect(element.textContent).toBe('fallback');

    value.set('ready');
    await flush();
    expect(element.textContent).toBe('ready');

    value.set(undefined);
    await flush();
    expect(element.textContent).toBe('readyfallback');

    destroy();
  });

  it('can convert the exception into an input value', async () => {
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

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );
    expect(element.textContent).toBe('idle');

    value.set('ready');
    await flush();
    expect(element.textContent).toBe('ready');

    destroy();
  });

  it('requires an exhaustive value handler', async () => {
    const value = signal<'ready' | undefined>(undefined);

    // @ts-expect-error The asserted input exception must be handled exhaustively.
    assertDefinedInput(() => value()).pipe(catchInput.exhaustive({}));
  });

  it('throws the standard unhandled error without a boundary', async () => {
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

    await expect(renderCraftComponent(root)).rejects.toThrow(
      CraftUnhandledExceptionError,
    );
  });
});
