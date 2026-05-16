import { inject, Injector, runInInjectionContext } from '@angular/core';
import { ɵcreateHostTaggedInjector } from '../craft-service';
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

// =====================================================================
//  Public API — overload signatures
// =====================================================================

export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
): MakeFormTreeInsertReturn<HostName, NeedShape, Insertion1>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
): MakeFormTreeInsertReturn<HostName, NeedShape, Insertion1 & Insertion2>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
  Insertion3,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion3,
    Insertion1 & Insertion2
  >,
): MakeFormTreeInsertReturn<
  HostName,
  NeedShape,
  Insertion1 & Insertion2 & Insertion3
>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): MakeFormTreeInsertReturn<
  HostName,
  NeedShape,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): MakeFormTreeInsertReturn<
  HostName,
  NeedShape,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): MakeFormTreeInsertReturn<
  HostName,
  NeedShape,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): MakeFormTreeInsertReturn<
  HostName,
  NeedShape,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7
>;
export function makeFormTreeInsert<
  const HostName extends string,
  NeedShape,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion8,
>(
  hostName: HostName,
  needShape: FormTreeNeed<NeedShape>,
  insertion1: InsertionsFormFactory<NeedShape, unknown, Insertion1, {}>,
  insertion2: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
  insertion8: InsertionsFormFactory<
    NeedShape,
    unknown,
    Insertion8,
    Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5 &
      Insertion6 &
      Insertion7
  >,
): MakeFormTreeInsertReturn<
  HostName,
  NeedShape,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7 &
    Insertion8
>;

// =====================================================================
//  Implementation
// =====================================================================

export function makeFormTreeInsert(
  hostName: string,
  _needShape: FormTreeNeed<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertionsFormFactory<any, any, any, any>[]
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

      let acc: Record<string, unknown> = {};
      for (const insertion of insertions) {
        const out = runInInjectionContext(taggedInjector, () =>
          insertion({
            ...parentContext,
            insertions: {
              ...(parentContext.insertions as Record<string, unknown>),
              ...acc,
            } as never,
          }),
        ) as Record<string, unknown>;
        acc = { ...acc, ...out };
      }
      return acc;
    };
  };

  return {
    [`insert${hostName}Tree`]: factory,
    [`${hostName}Tree`]: undefined,
  };
}
