import { inject, Injector } from '@angular/core';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import { markNonYieldableInsertionMethod } from '../yieldable';
import { CraftFieldTree } from './craft-field';
import {
  buildSubForm,
  type FormWithInsertions,
  type InsertionFormFactoryContext,
  type InsertionsFormFactory,
} from './insert-form-internals';
import type { NonYieldableInsertionMethod } from '../yieldable';
import { rawReactiveValue } from '../reactive-read';

type ExtractItemType<T> = T extends readonly (infer Item)[] ? Item : never;

type MergeInsertions<
  Insertions extends readonly unknown[],
  Acc = {},
> = Insertions extends readonly [infer Head, ...infer Tail]
  ? MergeInsertions<Tail, Acc & Head>
  : Acc;

type SelectedFormTreeTarget<
  StateType,
  Name extends string,
> = StateType extends readonly (infer Item)[]
  ? Extract<Item, object>
  : StateType extends Record<string, unknown>
    ? Name extends keyof StateType
      ? StateType[Name]
      : never
    : never;

type MaybeFormWithInsertions<Model, Insertions, Path extends string> = [
  Model,
] extends [never]
  ? never
  : undefined extends Model
    ? FormWithInsertions<NonNullable<Model>, Insertions, Path> | undefined
    : FormWithInsertions<Model, Insertions, Path>;

type SelectFormTreeMethodName<Name extends string> =
  `select${Capitalize<Name>}`;

type ArrayInsertSelectFormTreeOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SelectFormTreeMethodName<Name>]: NonYieldableInsertionMethod<
    [id: number],
    | FormWithInsertions<
        ExtractItemType<StateType>,
        MergeInsertions<Insertions>,
        '[]'
      >
    | undefined
  >;
} & {
  items: NonYieldableInsertionMethod<
    [],
    Array<
      FormWithInsertions<
        ExtractItemType<StateType>,
        MergeInsertions<Insertions>,
        '[]'
      >
    >
  >;
};

type ObjectInsertSelectFormTreeOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SelectFormTreeMethodName<Name>]: NonYieldableInsertionMethod<
    [],
    MaybeFormWithInsertions<
      StateType extends Record<string, unknown>
        ? Name extends keyof StateType
          ? StateType[Name]
          : never
        : never,
      MergeInsertions<Insertions>,
      Name
    >
  >;
};

type InsertSelectFormTreeReturn<
  StateType,
  Name extends string,
  FormIdentifier extends string | number | unknown,
  Insertions extends readonly unknown[],
  PreviousInsertionsOutputs,
> = InsertionsFormFactory<
  StateType,
  FormIdentifier,
  SelectFormTreeOutput<StateType, Name, Insertions>,
  PreviousInsertionsOutputs
>;

type SelectFormTreeOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = StateType extends readonly unknown[]
  ? ArrayInsertSelectFormTreeOutput<StateType, Name, Insertions>
  : ObjectInsertSelectFormTreeOutput<StateType, Name, Insertions>;

function createObjectRuntime(
  propertyKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertions: InsertionsFormFactory<any, any, any, any>[],
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `selectProperty:${propertyKey}`,
    );
    const methodName = `select${propertyKey.charAt(0).toUpperCase()}${propertyKey.slice(1)}`;

    let cachedForm:
      | FormWithInsertions<unknown, Record<string, unknown>>
      | undefined;
    let cachedSubFieldKey: object | undefined;

    const buildIfNeeded = () => {
      const subField = (context.field as unknown as Record<string, unknown>)[
        propertyKey
      ] as CraftFieldTree<unknown> | undefined;
      if (!subField) return undefined;
      if (cachedSubFieldKey === (subField as unknown as object))
        return cachedForm;

      const subState = () => {
        const curr = rawReactiveValue(context.state)();
        return curr && typeof curr === 'object'
          ? (curr as Record<string, unknown>)[propertyKey]
          : undefined;
      };
      const setSub = (next: unknown) => {
        context.update((curr: unknown) => {
          if (!curr || typeof curr !== 'object') return curr;
          return { ...(curr as Record<string, unknown>), [propertyKey]: next };
        });
      };

      cachedForm = buildSubForm({
        parentContext: context,
        subField,
        subState,
        setSub,
        insertions,
        injector,
      });
      cachedSubFieldKey = subField as unknown as object;
      return cachedForm;
    };

    return {
      [methodName]: markNonYieldableInsertionMethod(() => buildIfNeeded()),
    };
  };
}

function createArrayItemRuntime(
  entityName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertions: InsertionsFormFactory<any, any, any, any>[],
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `selectEntity:${entityName}`,
    );
    const methodName = `select${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`;
    const cache = new Map<
      number,
      FormWithInsertions<unknown, Record<string, unknown>>
    >();

    const buildItemForm = (id: number) => {
      const tree = context.field as unknown as {
        item?: (index: number) => CraftFieldTree<unknown> | undefined;
      };
      const subField = tree.item ? tree.item(id) : undefined;
      if (!subField) return undefined;

      const cached = cache.get(id);
      if (cached) return cached;

      const itemInjector = ɵcreateHostTaggedInjector(
        injector,
        `selectItem:${id}`,
      );
      const subState = () => {
        const curr = rawReactiveValue(context.state)();
        if (!Array.isArray(curr)) return undefined;
        return curr[id];
      };
      const setSub = (next: unknown) => {
        context.update((curr: unknown) => {
          if (!Array.isArray(curr)) return curr;
          if (id < 0 || id >= curr.length || !Number.isInteger(id)) return curr;
          const nextArr = [...curr];
          nextArr[id] = next;
          return nextArr;
        });
      };

      const form = buildSubForm({
        parentContext: context,
        subField,
        subState,
        setSub,
        insertions,
        injector: itemInjector,
      });
      cache.set(id, form);
      return form;
    };

    const items = () => {
      const curr = rawReactiveValue(context.state)();
      if (!Array.isArray(curr)) return [];
      return curr
        .map((_unused, index) => buildItemForm(index))
        .filter(
          (f): f is FormWithInsertions<unknown, Record<string, unknown>> => !!f,
        );
    };

    return {
      [methodName]: markNonYieldableInsertionMethod(buildItemForm),
      items: markNonYieldableInsertionMethod(items),
    };
  };
}

// =====================================================================
//  Public API
// =====================================================================
//
// Supports one or two insertion slots. The second slot receives the output of
// the first, just like consecutive insertions passed to `insertForm`.

export function insertSelectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  PreviousInsertionsOutputs = {},
  Insertion1Yielded = never,
  AutoCompleteName = NoInfer<StateType> extends readonly object[]
    ? string
    : keyof NoInfer<StateType>,
>(
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs,
    Insertion1Yielded
  >,
): InsertSelectFormTreeReturn<
  StateType,
  Name,
  FormIdentifier,
  [Insertion1],
  PreviousInsertionsOutputs
>;

export function insertSelectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  Insertion2 = {},
  PreviousInsertionsOutputs = {},
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  AutoCompleteName = NoInfer<StateType> extends readonly object[]
    ? string
    : keyof NoInfer<StateType>,
>(
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs,
    Insertion1Yielded
  >,
  insertion2: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1,
    Insertion2Yielded
  >,
): InsertSelectFormTreeReturn<
  StateType,
  Name,
  FormIdentifier,
  [Insertion1, Insertion2],
  PreviousInsertionsOutputs
>;

// =====================================================================
//  Implementation
// =====================================================================

export function insertSelectFormTree(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertion1: InsertionsFormFactory<any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertion2?: InsertionsFormFactory<any, any, any, any>,
): InsertionsFormFactory<any, any, any, any> {
  const insertions = insertion2 ? [insertion1, insertion2] : [insertion1];
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const currentState = rawReactiveValue(context.state)();
    if (Array.isArray(currentState)) {
      return createArrayItemRuntime(name, insertions)(context);
    }
    return createObjectRuntime(name, insertions)(context);
  };
}

// =====================================================================
//  Public API — `selectFormTree` (context-first variant)
// =====================================================================
//
// Single insertion slot only — to compose several insertions, use `craftPipe`
// inside that slot: `selectFormTree(context, 'name', (c) => craftPipe(c, m1, m2))`.

export function selectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = NoInfer<StateType> extends readonly object[]
    ? string
    : keyof NoInfer<StateType>,
>(
  context: InsertionFormFactoryContext<
    StateType,
    PreviousInsertionsOutputs,
    FormIdentifier
  >,
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
): SelectFormTreeOutput<StateType, Name, [Insertion1]>;

// =====================================================================
//  Implementation
// =====================================================================

export function selectFormTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: InsertionFormFactoryContext<any, any, any>,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertion1: InsertionsFormFactory<any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const currentState = rawReactiveValue(context.state)();
  if (Array.isArray(currentState)) {
    return createArrayItemRuntime(name, [insertion1])(context);
  }
  return createObjectRuntime(name, [insertion1])(context);
}
