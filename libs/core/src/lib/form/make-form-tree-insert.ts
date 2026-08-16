import { inject, Injector, runInInjectionContext } from '../host/craft-compat';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import { isGenerator, runCraftGenerator } from '../craft-generator-runtime';
import type {
  FormWithInsertions,
  InsertionFormFactoryContext,
  InsertionsFormFactory,
} from './insert-form-internals';

declare const formTreeNeedBrand: unique symbol;

/**
 * Phantom-typed marker returned by `formTreeNeed<T>()`. Carries `T` only at
 * the type level so `makeFormTreeInsert` can extract the required parent shape
 * via inference on its branded argument, leaving the insertion-argument
 * generics free to flow contextual types in the usual way.
 */
export type FormTreeNeed<T> = { readonly [formTreeNeedBrand]: T };

export function formTreeNeed<T>(): FormTreeNeed<T> {
  return undefined as unknown as FormTreeNeed<T>;
}

type InsertTreeKey<HostName extends string> = `insert${HostName}Tree`;
type TreeKey<HostName extends string> = `${HostName}Tree`;

type MakeFormTreeInsertReturn<
  HostName extends string,
  NeedShape,
  MergedInsertions,
> = {
  [K in InsertTreeKey<HostName>]: <
    ParentState extends NeedShape,
    FormIdentifier extends string | number | unknown = unknown,
    PreviousInsertionsOutputs = {},
  >() => InsertionsFormFactory<
    ParentState,
    FormIdentifier,
    MergedInsertions,
    PreviousInsertionsOutputs
  >;
} & {
  [K in TreeKey<HostName>]: FormWithInsertions<NeedShape, MergedInsertions>;
};

const FORM_TREE_INSERTION_INVALID_YIELD_ERROR_MESSAGE =
  'makeFormTreeInsert generators can only yield craftService dependencies or exposed dependency helpers.';
const FORM_TREE_INSERTION_APP_START_ERROR_MESSAGE =
  'makeFormTreeInsert generators do not support onAppStart(...).';

// =====================================================================
//  Public API
// =====================================================================
//
// Single insertion slot only — to compose several insertions, use `craftPipe`
// inside that slot: `makeFormTreeInsert('Host', needShape, (context) => craftPipe(context, m1, m2))`.

export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion1Yielded = never,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): MakeFormTreeInsertReturn<HostName, NeedShape, Insertion1>;

// =====================================================================
//  Implementation
// =====================================================================

export function makeFormTreeInsert(
  hostName: string,
  _needShape: FormTreeNeed<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertion1: InsertionsFormFactory<any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const factory = () => {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parentContext: InsertionFormFactoryContext<any, any, any>,
    ) => {
      const taggedInjector = ɵcreateHostTaggedInjector(
        inject(Injector),
        `formTree:${hostName}`,
      );

      const result = runInInjectionContext(taggedInjector, () =>
        insertion1({
          ...parentContext,
          insertions: {
            ...(parentContext.insertions as Record<string, unknown>),
          } as never,
        }),
      );

      return (
        isGenerator(result)
          ? runInInjectionContext(taggedInjector, () =>
              runCraftGenerator({
                iterator: result,
                injector: taggedInjector,
                hostScope: 'function',
                invalidYieldErrorMessage:
                  FORM_TREE_INSERTION_INVALID_YIELD_ERROR_MESSAGE,
                multipleAppStartErrorMessage:
                  FORM_TREE_INSERTION_APP_START_ERROR_MESSAGE,
                onAppStartNotSupportedErrorMessage:
                  FORM_TREE_INSERTION_APP_START_ERROR_MESSAGE,
              }).value,
            )
          : result
      ) as Record<string, unknown>;
    };
  };

  return {
    [`insert${hostName}Tree`]: factory,
    [`${hostName}Tree`]: undefined,
  };
}
