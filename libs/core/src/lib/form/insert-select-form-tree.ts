import { inject, Injector, linkedSignal } from '@angular/core';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import { CraftFieldTree } from './craft-field';
import {
  buildSubForm,
  type FormWithInsertions,
  type InsertionFormFactoryContext,
  type InsertionsFormFactory,
} from './insert-form-internals';

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

type IsArray<T> = T extends any[] ? true : false;

type MaybeFormWithInsertions<Model, Insertions> = [Model] extends [never]
  ? never
  : undefined extends Model
    ? FormWithInsertions<NonNullable<Model>, Insertions> | undefined
    : FormWithInsertions<Model, Insertions>;

type SelectFormTreeMethodName<Name extends string> =
  `select${Capitalize<Name>}`;

type ArrayInsertSelectFormTreeOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SelectFormTreeMethodName<Name>]: (
    id: number,
  ) =>
    | FormWithInsertions<
        ExtractItemType<StateType>,
        MergeInsertions<Insertions>
      >
    | undefined;
} & {
  items: () => Array<
    FormWithInsertions<
      ExtractItemType<StateType>,
      MergeInsertions<Insertions>
    >
  >;
};

type ObjectInsertSelectFormTreeOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SelectFormTreeMethodName<Name>]: () => MaybeFormWithInsertions<
    StateType extends Record<string, unknown>
      ? Name extends keyof StateType
        ? StateType[Name]
        : never
      : never,
    MergeInsertions<Insertions>
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
  StateType extends readonly unknown[]
    ? ArrayInsertSelectFormTreeOutput<StateType, Name, Insertions>
    : ObjectInsertSelectFormTreeOutput<StateType, Name, Insertions>,
  PreviousInsertionsOutputs
>;

function createObjectRuntime(
  propertyKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertionsFormFactory<any, any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = ɵcreateHostTaggedInjector(inject(Injector), propertyKey);
    const methodName = `select${propertyKey.charAt(0).toUpperCase()}${propertyKey.slice(1)}`;

    let cachedForm: FormWithInsertions<unknown, Record<string, unknown>> | undefined;
    let cachedSubFieldKey: object | undefined;

    const buildIfNeeded = () => {
      const subField = (context.field as unknown as Record<string, unknown>)[
        propertyKey
      ] as CraftFieldTree<unknown> | undefined;
      if (!subField) return undefined;
      if (cachedSubFieldKey === (subField as unknown as object)) return cachedForm;

      const subState = () => {
        const curr = context.state();
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
      [methodName]: () => buildIfNeeded(),
    };
  };
}

function createArrayItemRuntime(
  entityName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...itemInsertions: InsertionsFormFactory<any, any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = ɵcreateHostTaggedInjector(inject(Injector), entityName);
    const methodName = `select${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`;
    const cache = new Map<number, FormWithInsertions<unknown, Record<string, unknown>>>();

    const buildItemForm = (id: number) => {
      const tree = context.field as unknown as {
        item?: (index: number) => CraftFieldTree<unknown> | undefined;
      };
      const subField = tree.item ? tree.item(id) : undefined;
      if (!subField) return undefined;

      const cached = cache.get(id);
      if (cached) return cached;

      const itemInjector = ɵcreateHostTaggedInjector(injector, String(id));
      const subState = () => {
        const curr = context.state();
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
        insertions: itemInsertions,
        injector: itemInjector,
      });
      cache.set(id, form);
      return form;
    };

    const items = () => {
      const curr = context.state();
      if (!Array.isArray(curr)) return [];
      return curr
        .map((_unused, index) => buildItemForm(index))
        .filter((f): f is FormWithInsertions<unknown, Record<string, unknown>> => !!f);
    };

    return {
      [methodName]: buildItemForm,
      items,
    };
  };
}

// =====================================================================
//  Public API — overload signatures
// =====================================================================

export function insertSelectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = NoInfer<StateType> extends readonly object[]
    ? string
    : keyof NoInfer<StateType>,
>(
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
): InsertSelectFormTreeReturn<
  [Name] extends [keyof StateType]
    ? IsArray<StateType[Name]> extends true
      ? `craft-ng error, typing limitation: insertSelectFormTree does not currently support selecting items from an array property in first insertion position. Use insertNoopTypingAnchor in the first slot.`
      : StateType
    : StateType,
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
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
>(
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
): InsertSelectFormTreeReturn<
  StateType,
  Name,
  FormIdentifier,
  [Insertion1, Insertion2],
  PreviousInsertionsOutputs
>;
export function insertSelectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
>(
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
): InsertSelectFormTreeReturn<
  StateType,
  Name,
  FormIdentifier,
  [Insertion1, Insertion2, Insertion3],
  PreviousInsertionsOutputs
>;
export function insertSelectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
>(
  name: Name,
  insertion1: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
): InsertSelectFormTreeReturn<
  StateType,
  Name,
  FormIdentifier,
  [Insertion1, Insertion2, Insertion3, Insertion4],
  PreviousInsertionsOutputs
>;

// =====================================================================
//  Implementation
// =====================================================================

export function insertSelectFormTree(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertionsFormFactory<any, any, any, any>[]
): InsertionsFormFactory<any, any, any, any> {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const currentState = context.state();
    if (Array.isArray(currentState)) {
      return createArrayItemRuntime(name, ...insertions)(context);
    }
    return createObjectRuntime(name, ...insertions)(context);
  };
}

// Reference linkedSignal so eslint doesn't complain about unused imports across overloads.
void linkedSignal;
