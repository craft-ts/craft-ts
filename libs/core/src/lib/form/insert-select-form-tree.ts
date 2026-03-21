import { inject, Injector, linkedSignal } from '@angular/core';
import { FieldTree, ReadonlyArrayLike } from '@angular/forms/signals';
import {
  decorateFormTreeWithInsertions,
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

type MaybeFormWithInsertions<Model, Insertions> = [
  Extract<Model, object>,
] extends [never]
  ? never
  : undefined extends Model
    ? FormWithInsertions<Extract<Model, object>, Insertions> | undefined
    : FormWithInsertions<Extract<Model, object>, Insertions>;

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
        Extract<ExtractItemType<StateType>, object>,
        MergeInsertions<Insertions>
      >
    | undefined;
} & {
  items: () => Array<
    FormWithInsertions<
      Extract<ExtractItemType<StateType>, object>,
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

function isSelectableFormValue(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isFieldTree(
  value: unknown,
): value is FieldTree<unknown, string | number> {
  return typeof value === 'function';
}

function createInsertSelectFormTreeItemRuntime(
  entityName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...itemInsertions: InsertionsFormFactory<any, any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = inject(Injector);
    const selectItemMethodName = `select${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`;
    const decoratedForms = new WeakSet<FieldTree<unknown, string | number>>();
    const inheritedInsertions =
      (context.insertions as Record<string, unknown> | undefined) ?? {};

    const selectItemState = (id: number) => {
      const currentState = context.state();
      if (!Array.isArray(currentState)) {
        return undefined;
      }

      return currentState[id];
    };

    const setItemState = (id: number, nextItem: unknown) => {
      context.update((currentState: unknown) => {
        if (!Array.isArray(currentState)) {
          return currentState;
        }

        if (id < 0 || id >= currentState.length || !Number.isInteger(id)) {
          return currentState;
        }

        const nextState = [...currentState];
        nextState[id] = nextItem;
        return nextState;
      });

      return nextItem;
    };

    const updateItemState = (
      id: number,
      updateFn: (currentItem: unknown) => unknown,
    ) => {
      const currentItem = selectItemState(id);
      if (currentItem === undefined) {
        return undefined;
      }

      const nextItem = updateFn(currentItem);
      setItemState(id, nextItem);
      return nextItem;
    };

    const selectItemForm = (id: number) => {
      const currentItem = selectItemState(id);
      if (!isSelectableFormValue(currentItem)) {
        return undefined;
      }

      const itemForm = (context.form as unknown as ReadonlyArrayLike<unknown>)[
        id
      ];
      if (!isFieldTree(itemForm)) {
        return undefined;
      }

      if (!decoratedForms.has(itemForm)) {
        const itemState = linkedSignal(() => selectItemState(id));
        decorateFormTreeWithInsertions({
          formRef: itemForm as FieldTree<unknown, string | number>,
          formInsertions: itemInsertions,
          state: itemState,
          set: (newState: unknown) => setItemState(id, newState),
          update: (updateFn: (currentState: unknown) => unknown) =>
            updateItemState(id, updateFn),
          patch: (patchFn: (currentState: unknown) => Partial<unknown>) =>
            updateItemState(id, (current) => ({
              ...(current as object),
              ...patchFn(current),
            })),
          setSubmitting: context.setSubmitting,
          inheritedInsertions,
          injector,
          formIdentifier: context.formIdentifier,
        });
        decoratedForms.add(itemForm);
      }

      return itemForm;
    };

    const items = () => {
      const currentState = context.state();
      if (!Array.isArray(currentState)) {
        return [];
      }

      return currentState.reduce<FieldTree<unknown, string | number>[]>(
        (acc, _unused, index) => {
          const itemForm = selectItemForm(index);
          if (itemForm) {
            acc.push(itemForm);
          }
          return acc;
        },
        [],
      );
    };

    return {
      [selectItemMethodName]: selectItemForm,
      items,
    };
  };
}

function createInsertSelectFormTreePropertyRuntime(
  propertyKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...propertyInsertions: InsertionsFormFactory<any, any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const injector = inject(Injector);
    const selectPropertyMethodName = `select${propertyKey.charAt(0).toUpperCase()}${propertyKey.slice(1)}`;
    const decoratedForms = new WeakSet<FieldTree<unknown, string | number>>();
    const inheritedInsertions =
      (context.insertions as Record<string, unknown> | undefined) ?? {};

    const selectPropertyState = () => {
      const currentState = context.state();
      if (!currentState || typeof currentState !== 'object') {
        return undefined;
      }

      return (currentState as Record<string, unknown>)[propertyKey];
    };

    const setPropertyState = (nextProperty: unknown) => {
      context.update((currentState: unknown) => {
        if (!currentState || typeof currentState !== 'object') {
          return currentState;
        }

        return {
          ...(currentState as Record<string, unknown>),
          [propertyKey]: nextProperty,
        };
      });

      return nextProperty;
    };

    const updatePropertyState = (
      updateFn: (currentProperty: unknown) => unknown,
    ) => {
      const nextProperty = updateFn(selectPropertyState());
      setPropertyState(nextProperty);
      return nextProperty;
    };

    const selectPropertyForm = () => {
      const currentProperty = selectPropertyState();
      if (!isSelectableFormValue(currentProperty)) {
        return undefined;
      }

      const propertyForm = (context.form as Record<string, unknown>)[
        propertyKey
      ];
      if (!isFieldTree(propertyForm)) {
        return undefined;
      }

      if (!decoratedForms.has(propertyForm)) {
        const propertyState = linkedSignal(() => selectPropertyState());
        decorateFormTreeWithInsertions({
          formRef: propertyForm as FieldTree<unknown, string | number>,
          formInsertions: propertyInsertions,
          state: propertyState,
          set: (newState: unknown) => setPropertyState(newState),
          update: (updateFn: (currentState: unknown) => unknown) =>
            updatePropertyState(updateFn),
          patch: (patchFn: (currentState: unknown) => Partial<unknown>) =>
            updatePropertyState((current) => ({
              ...(current as object),
              ...patchFn(current),
            })),
          setSubmitting: context.setSubmitting,
          inheritedInsertions,
          injector,
          formIdentifier: context.formIdentifier,
        });
        decoratedForms.add(propertyForm);
      }

      return propertyForm;
    };

    return {
      [selectPropertyMethodName]: selectPropertyForm,
    };
  };
}

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
      ? `craft-ng error, typing limitation: insertSelectFormTree does not currently support selecting items from an array property in first insertion position (e.g. insertSelectFormTree('addresses', insertSelectFormTree('address', ...))). Consider using insertNoopTypingAnchor:
    insertSelectFormTree('${Name}', insertNoopTypingAnchor, insertSelectFormTree(...)) `
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
export function insertSelectFormTree<
  StateType,
  const Name extends AutoCompleteName & string,
  FormIdentifier extends string | number | unknown = unknown,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
  Insertion5 = {},
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
  insertion5: InsertionsFormFactory<
    SelectedFormTreeTarget<StateType, Name>,
    FormIdentifier,
    Insertion5,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4
  >,
): InsertSelectFormTreeReturn<
  StateType,
  Name,
  FormIdentifier,
  [Insertion1, Insertion2, Insertion3, Insertion4, Insertion5],
  PreviousInsertionsOutputs
>;
export function insertSelectFormTree(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertionsFormFactory<any, any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: InsertionFormFactoryContext<any, any, any>,
  ) => {
    const currentState = context.state();

    if (Array.isArray(currentState)) {
      return createInsertSelectFormTreeItemRuntime(
        name,
        ...insertions,
      )(context);
    }

    return createInsertSelectFormTreePropertyRuntime(
      name,
      ...insertions,
    )(context);
  };
}
