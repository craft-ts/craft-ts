import { InsertionsStateFactory } from './query.core';
import { insertSelectItem } from './insert-select-item';
import { insertSelectProperty } from './insert-select-property';

type SelectItemMethodName<Name extends string> = `select${Capitalize<Name>}`;

type SelectedTarget<
  StateType,
  Name extends string,
> = StateType extends readonly (infer Item)[]
  ? Extract<Item, object>
  : StateType extends Record<string, unknown>
    ? Name extends keyof StateType
      ? Extract<StateType[Name], object>
      : never
    : never;

type RenameSelectItemMethod<Name extends string, Factory> =
  Factory extends InsertionsStateFactory<
    infer StateType,
    infer InsertionsOutput,
    infer PreviousInsertionsOutput
  >
    ? InsertionsStateFactory<
        StateType,
        InsertionsOutput extends { selectItem: infer SelectItemFn }
          ? Omit<InsertionsOutput, 'selectItem'> & {
              [K in SelectItemMethodName<Name>]: SelectItemFn;
            }
          : InsertionsOutput,
        PreviousInsertionsOutput
      >
    : never;

type ExtractInsertionsOutput<Factory> =
  Factory extends InsertionsStateFactory<any, infer InsertionsOutput, any>
    ? InsertionsOutput
    : never;

type InsertSelectReturn1<
  StateType,
  Name extends string,
  Insertions1,
  PreviousInsertionsOutputs,
> = InsertionsStateFactory<
  StateType,
  StateType extends readonly object[]
    ? ExtractInsertionsOutput<
        RenameSelectItemMethod<
          Name,
          ReturnType<
            typeof insertSelectItem<
              StateType,
              number,
              Insertions1,
              PreviousInsertionsOutputs
            >
          >
        >
      >
    : StateType extends Record<string, unknown>
      ? Name extends keyof StateType & string
        ? ExtractInsertionsOutput<
            ReturnType<
              typeof insertSelectProperty<
                StateType,
                Name,
                Insertions1,
                PreviousInsertionsOutputs
              >
            >
          >
        : never
      : never,
  PreviousInsertionsOutputs
>;

type InsertSelectReturn2<
  StateType,
  Name extends string,
  Insertions1,
  Insertions2,
  PreviousInsertionsOutputs,
> = InsertionsStateFactory<
  StateType,
  StateType extends readonly object[]
    ? ExtractInsertionsOutput<
        RenameSelectItemMethod<
          Name,
          ReturnType<
            typeof insertSelectItem<
              StateType,
              number,
              Insertions1,
              Insertions2,
              PreviousInsertionsOutputs
            >
          >
        >
      >
    : StateType extends Record<string, unknown>
      ? Name extends keyof StateType & string
        ? ExtractInsertionsOutput<
            ReturnType<
              typeof insertSelectProperty<
                StateType,
                Name,
                Insertions1,
                Insertions2,
                PreviousInsertionsOutputs
              >
            >
          >
        : never
      : never,
  PreviousInsertionsOutputs
>;

type InsertSelectReturn3<
  StateType,
  Name extends string,
  Insertions1,
  Insertions2,
  Insertions3,
  PreviousInsertionsOutputs,
> = StateType extends readonly object[]
  ? InsertionsStateFactory<
      StateType,
      ExtractInsertionsOutput<
        RenameSelectItemMethod<
          Name,
          ReturnType<
            typeof insertSelectItem<
              StateType,
              number,
              Insertions1,
              Insertions2,
              Insertions3,
              PreviousInsertionsOutputs
            >
          >
        >
      >,
      PreviousInsertionsOutputs
    >
  : never;

type InsertSelectReturn4<
  StateType,
  Name extends string,
  Insertions1,
  Insertions2,
  Insertions3,
  Insertions4,
  PreviousInsertionsOutputs,
> = StateType extends readonly object[]
  ? InsertionsStateFactory<
      StateType,
      ExtractInsertionsOutput<
        RenameSelectItemMethod<
          Name,
          ReturnType<
            typeof insertSelectItem<
              StateType,
              number,
              Insertions1,
              Insertions2,
              Insertions3,
              Insertions4,
              PreviousInsertionsOutputs
            >
          >
        >
      >,
      PreviousInsertionsOutputs
    >
  : never;

type InsertSelectReturn5<
  StateType,
  Name extends string,
  Insertions1,
  Insertions2,
  Insertions3,
  Insertions4,
  Insertions5,
  PreviousInsertionsOutputs,
> = StateType extends readonly object[]
  ? InsertionsStateFactory<
      StateType,
      ExtractInsertionsOutput<
        RenameSelectItemMethod<
          Name,
          ReturnType<
            typeof insertSelectItem<
              StateType,
              number,
              Insertions1,
              Insertions2,
              Insertions3,
              Insertions4,
              Insertions5,
              PreviousInsertionsOutputs
            >
          >
        >
      >,
      PreviousInsertionsOutputs
    >
  : never;

export function insertSelect<
  StateType,
  const Name extends string,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  insertion1: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
): InsertSelectReturn1<StateType, Name, Insertions1, PreviousInsertionsOutputs>;
export function insertSelect<
  StateType,
  const Name extends string,
  Insertions1 = {},
  Insertions2 = {},
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  insertion1: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
): InsertSelectReturn2<
  StateType,
  Name,
  Insertions1,
  Insertions2,
  PreviousInsertionsOutputs
>;
export function insertSelect<
  StateType,
  const Name extends string,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  insertion1: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
  insertion3: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions3,
    PreviousInsertionsOutputs & Insertions1 & Insertions2
  >,
): InsertSelectReturn3<
  StateType,
  Name,
  Insertions1,
  Insertions2,
  Insertions3,
  PreviousInsertionsOutputs
>;
export function insertSelect<
  StateType,
  const Name extends string,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  Insertions4 = {},
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  insertion1: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
  insertion3: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions3,
    PreviousInsertionsOutputs & Insertions1 & Insertions2
  >,
  insertion4: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions4,
    PreviousInsertionsOutputs & Insertions1 & Insertions2 & Insertions3
  >,
): InsertSelectReturn4<
  StateType,
  Name,
  Insertions1,
  Insertions2,
  Insertions3,
  Insertions4,
  PreviousInsertionsOutputs
>;
export function insertSelect<
  StateType,
  const Name extends string,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  Insertions4 = {},
  Insertions5 = {},
  PreviousInsertionsOutputs = {},
>(
  name: Name,
  insertion1: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
  insertion3: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions3,
    PreviousInsertionsOutputs & Insertions1 & Insertions2
  >,
  insertion4: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions4,
    PreviousInsertionsOutputs & Insertions1 & Insertions2 & Insertions3
  >,
  insertion5: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions5,
    PreviousInsertionsOutputs &
      Insertions1 &
      Insertions2 &
      Insertions3 &
      Insertions4
  >,
): InsertSelectReturn5<
  StateType,
  Name,
  Insertions1,
  Insertions2,
  Insertions3,
  Insertions4,
  Insertions5,
  PreviousInsertionsOutputs
>;

export function insertSelect(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertionsStateFactory<any, any, any>[]
): any {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ) => {
    const currentState = context.state();

    if (Array.isArray(currentState)) {
      const selectItemMethodName =
        `select${name[0].toUpperCase()}${name.slice(1)}` as SelectItemMethodName<string>;
      const itemFactory = insertSelectItem as unknown as (
        itemName: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...itemInsertions: InsertionsStateFactory<any, any, any>[]
      ) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (nextContext: any) => Record<string, unknown>;

      const itemInsertionsOutput = itemFactory(name, ...insertions)(context);
      const { selectItem, ...restItemInsertionsOutput } = itemInsertionsOutput;
      return {
        ...restItemInsertionsOutput,
        [selectItemMethodName]: selectItem,
      };
    }

    const propertyFactory = insertSelectProperty as unknown as (
      propertyKey: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...propertyInsertions: InsertionsStateFactory<any, any, any>[]
    ) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nextContext: any) => Record<string, unknown>;

    return propertyFactory(name, ...insertions)(context);
  };
}
