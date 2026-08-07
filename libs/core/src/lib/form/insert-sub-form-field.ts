import { inject, Injector } from '@angular/core';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import {
  CraftFieldTree,
  ɵgetOrCreateDerivedChild,
} from './craft-field';
import type { FieldLens } from './field-lens';
import {
  buildSubForm,
  type FormWithInsertions,
  type InsertionFormFactoryContext,
  type InsertionsFormFactory,
} from './insert-form-internals';
import {
  markNonYieldableInsertionMethod,
  type NonYieldableInsertionMethod,
} from '../yieldable';

type MergeInsertions<
  Insertions extends readonly unknown[],
  Acc = {},
> = Insertions extends readonly [infer Head, ...infer Tail]
  ? MergeInsertions<Tail, Acc & Head>
  : Acc;

type SubFormFieldMethodName<Name extends string> =
  `select${Capitalize<Name>}`;

type InsertSubFormFieldOutput<
  Sub,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SubFormFieldMethodName<Name>]: NonYieldableInsertionMethod<
    [],
    FormWithInsertions<Sub, MergeInsertions<Insertions>>
  >;
};

type InsertSubFormFieldReturn<
  Source,
  Sub,
  Name extends string,
  FormIdentifier extends string | number | unknown,
  Insertions extends readonly unknown[],
  PreviousInsertionsOutputs,
> = InsertionsFormFactory<
  Source,
  FormIdentifier,
  InsertSubFormFieldOutput<Sub, Name, Insertions>,
  PreviousInsertionsOutputs
>;

// =====================================================================
//  Public API
// =====================================================================
//
// At most one insertion slot — to compose several insertions, use `craftPipe`
// inside that slot: `insertSubFormField('name', lens, (context) => craftPipe(context, m1, m2))`.

export function insertSubFormField<
  Source,
  Sub,
  const Name extends string,
  FormIdentifier extends string | number | unknown = unknown,
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  lens: FieldLens<Source, Sub>,
): InsertSubFormFieldReturn<
  Source,
  Sub,
  Name,
  FormIdentifier,
  [],
  PreviousInsertionsOutputs
>;
export function insertSubFormField<
  Source,
  Sub,
  const Name extends string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  lens: FieldLens<Source, Sub>,
  insertion1: InsertionsFormFactory<
    Sub,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
): InsertSubFormFieldReturn<
  Source,
  Sub,
  Name,
  FormIdentifier,
  [Insertion1],
  PreviousInsertionsOutputs
>;

// =====================================================================
//  Implementation
// =====================================================================

export function insertSubFormField(
  name: string,
  lens: FieldLens<unknown, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertion1?: InsertionsFormFactory<any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): InsertionsFormFactory<any, any, any, any> {
  const insertions = insertion1 ? [insertion1] : [];
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `subForm:${name}`,
    );
    const methodName = `select${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    let cachedForm:
      | FormWithInsertions<unknown, Record<string, unknown>>
      | undefined;

    const buildIfNeeded = () => {
      if (cachedForm) return cachedForm;

      const subField = ɵgetOrCreateDerivedChild(
        context.field as unknown as CraftFieldTree<unknown>,
        name,
        lens,
      ) as CraftFieldTree<unknown>;

      const subState = () => lens.read(context.state());
      const setSub = (next: unknown) =>
        context.update((curr: unknown) => lens.write(curr, next));

      cachedForm = buildSubForm({
        parentContext: context,
        subField,
        subState,
        setSub,
        insertions: insertions as never,
        injector,
      });

      return cachedForm;
    };

    return {
      [methodName]: markNonYieldableInsertionMethod(() => buildIfNeeded()),
    };
  };
}
