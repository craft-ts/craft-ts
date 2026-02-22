import { InsertionsStateFactory } from './query.core';
import { insertSelectItem } from './insert-select-item';
import { insertSelectProperty } from './insert-select-property';

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
        ReturnType<
          typeof insertSelectItem<
            StateType,
            number,
            Name,
            Insertions1,
            PreviousInsertionsOutputs
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
        ReturnType<
          typeof insertSelectItem<
            StateType,
            number,
            Name,
            Insertions1,
            Insertions2,
            PreviousInsertionsOutputs
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
        ReturnType<
          typeof insertSelectItem<
            StateType,
            number,
            Name,
            Insertions1,
            Insertions2,
            Insertions3,
            PreviousInsertionsOutputs
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
        ReturnType<
          typeof insertSelectItem<
            StateType,
            number,
            Name,
            Insertions1,
            Insertions2,
            Insertions3,
            Insertions4,
            PreviousInsertionsOutputs
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
        ReturnType<
          typeof insertSelectItem<
            StateType,
            number,
            Name,
            Insertions1,
            Insertions2,
            Insertions3,
            Insertions4,
            Insertions5,
            PreviousInsertionsOutputs
          >
        >
      >,
      PreviousInsertionsOutputs
    >
  : never;

/**
 * Unified selector insertion for nested object properties and array/record items.
 *
 * `insertSelect` delegates to:
 * - `insertSelectItem` when the current state is an array
 * - `insertSelectProperty` when the current state is an object
 *
 * This lets you write nested insertions with the same API (`insertSelect(...)`)
 * without caring about the container shape at each level.
 *
 * @example
 * ```ts
 * const board = state(
 *   { cell: { color: 'white', paintCount: 0 } },
 *   insertSelect('cell', ({ update }) => ({
 *     paint: () =>
 *       update((cell) => ({
 *         ...cell,
 *         color: 'black',
 *         paintCount: cell.paintCount + 1,
 *       })),
 *   })),
 * );
 *
 * board.selectCell().paint();
 * ```
 *
 * @example
 * ```ts
 * const rows = state(
 *   [{ cells: [{ color: 'white' }] }],
 *   insertSelect('row', ({ state }) => ({
 *     firstCellColor: () => state().cells[0]?.color,
 *   })),
 * );
 *
 * rows.selectRow(0)?.firstCellColor();
 * ```
 */
export function insertSelect<
  StateType,
  const Name extends AutoCompleteName & string,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
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
  const Name extends AutoCompleteName & string,
  Insertions1 = {},
  Insertions2 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
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
  const Name extends AutoCompleteName & string,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
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
  const Name extends AutoCompleteName & string,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  Insertions4 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
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
  const Name extends AutoCompleteName & string,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  Insertions4 = {},
  Insertions5 = {},
  PreviousInsertionsOutputs = {},
  AutoCompleteName = StateType extends readonly object[]
    ? string
    : keyof StateType,
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
      const itemFactory = insertSelectItem as unknown as (
        itemName: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...itemInsertions: InsertionsStateFactory<any, any, any>[]
      ) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (nextContext: any) => Record<string, unknown>;

      return itemFactory(name, ...insertions)(context);
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
